const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --- SETTINGS & DATA STRUCTURES ---
const STAFF_ROOM = 'staff_room';
const ADMIN_CHAT_ID = 'admin_chat'; 
const MAX_HISTORY = 100;
// Character limit for NAME is now removed.
const CONTENT_MAX_CHARS = 256; // Message content limit remains
// Banned words for name AND content (case-insensitive)
const BANNED_WORDS = ['hitler', 'swear', 'badword', 'bannedword', 'spam', 'adminchat'];

// Staff accounts - NOTE: LoginName is the SECURE password/key
const STAFF_LIST = [
  { loginName: 'hfdskLshkdgdibIdsjfkbdAshfjhsfdshfjMdjsbfhd', displayName: 'Liam Stern' },
  { loginName: 'efsdjDfhukdshjfkdIsjfhdsjEkfhdjSjkshjEdkfLh', displayName: 'Diesel Carter' },
  { loginName: 'lbjrhfjRnjkfdvjkIfhdCnjfkdnjKjndksdjkfjdkdy', displayName: 'Ricky Martinez' },
  { loginName: 'ljdkAsanfjdAksanfRdjksanOjkdsanfjNdksalnfjd', displayName: 'Aaron Ortega' },
  { loginName: 'odDhsfjdkOsahfNjdahOfkjsVdahjAskagNfdhgdjsa', displayName: 'Donovan Powell' }
];

const chatHistory = [];
const adminChatHistory = []; 

// Use socket.id to store user data for easier lookup and persistence
const users = new Map(); // socket.id -> { displayName, secureName, isAdmin, ip, chatContext }
const usernamesMap = new Map(); // lowercasedDisplayName -> socket.id
const ipBanList = new Map(); // ipAddress -> { banUntil: Date, reason: string }

// --- STATIC FILE SERVING ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- HELPER FUNCTIONS ---
function cleanUpUser(socketId) {
    const user = users.get(socketId);
    if (!user) return;

    const lower = user.displayName.toLowerCase();
    
    // Check if this socket is the one currently registered for this name
    if (usernamesMap.has(lower) && usernamesMap.get(lower) === socketId) {
        usernamesMap.delete(lower);
    }
    
    users.delete(socketId);
}

function isNameBanned(name) {
    if (!name) return true;
    const lower = name.trim().toLowerCase();
    // Check for banned names
    return BANNED_WORDS.some(banned => lower.includes(banned.toLowerCase()));
}

function isContentBanned(content) {
    if (!content) return false; // Empty content is handled elsewhere
    const lower = content.trim().toLowerCase();
    // Check for banned words in message content
    return BANNED_WORDS.some(banned => lower.includes(banned.toLowerCase()));
}

function getStaffInfo(secureNameOrDisplayName) {
    const secure = (secureNameOrDisplayName || '').trim();
    const staff = STAFF_LIST.find(s => 
        s.loginName === secure || s.displayName.toLowerCase() === secure.toLowerCase()
    );
    if (staff) {
        return { isAdmin: true, displayName: staff.displayName, secureName: staff.loginName };
    }
    return { isAdmin: false, displayName: secure, secureName: secure };
}

function pushHistory(msg, target = 'public') {
  const history = target === 'public' ? chatHistory : adminChatHistory;
  history.push(msg);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function broadcastUserCount() {
  const userMap = {};
  users.forEach(user => {
    // Only track users in the public chat for the kick list (unless they are a logged-in admin)
    if (user.chatContext === 'public' || user.isAdmin) {
        userMap[user.displayName] = { 
            isAdmin: user.isAdmin,
            ip: user.ip // Only for admin-side listing
        };
    }
  });

  io.emit('user count', { userList: Object.keys(userMap).sort(), usersMap: userMap });
  // Emit full user map to staff room for IP banning and admin tools
  io.to(STAFF_ROOM).emit('admin_user_map', Object.fromEntries(users));
}

// --- SOCKET LOGIC ---
io.on('connection', socket => {
  const userIp = socket.handshake.address;
  console.log('Client connected:', socket.id, 'IP:', userIp);

  // 0. IP Ban Check
  const banEntry = ipBanList.get(userIp);
  if (banEntry && banEntry.banUntil > new Date()) {
      const banDurationMs = banEntry.banUntil.getTime() - new Date().getTime();
      socket.emit('banned_modal', { 
          reason: banEntry.reason, 
          banDurationMs: banDurationMs 
      });
      return; 
  }

  // --- Initial setup, sent BEFORE name is set ---
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // 1. Name check & Login
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();

    // Cleanup any stale data for this socket before proceeding
    cleanUpUser(socket.id); 

    // Basic checks
    if (!name) { // Only check for empty name
      socket.emit('name_rejected', `Please provide a name.`);
      return;
    }
    if (isNameBanned(name)) {
        socket.emit('name_rejected', 'That name is not allowed.');
        return;
    }

    // Name uniqueness
    if (usernamesMap.has(lower)) {
        socket.emit('name_rejected', 'That name is already in use (Name collision).');
        return;
    }

    // Staff Login Logic (Secure Name or Display Name)
    let staffInfo = getStaffInfo(name);
    
    // 1a. Successful Staff Login (using secureName)
    if (STAFF_LIST.some(s => s.loginName === name)) {
      const staffName = staffInfo.displayName;
      const staffLower = staffName.toLowerCase();

      // Check for display name conflict
      if (usernamesMap.has(staffLower)) {
          socket.emit('name_rejected', `The staff display name '${staffName}' is already in use.`);
          return;
      }

      users.set(socket.id, { 
          displayName: staffName, 
          secureName: staffInfo.secureName, 
          isAdmin: true,
          ip: userIp,
          chatContext: 'public' // Default to public chat upon login
      });
      usernamesMap.set(staffLower, socket.id);
      socket.join(STAFF_ROOM); // Join admin room

      socket.emit('staff_status_update', { isAdmin: true, displayName: staffName, secureName: staffInfo.secureName, currentContext: 'public' });
      const publicMsg = {
        username: 'System',
        content: `A moderator has entered the chat.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(publicMsg, 'public');
      io.emit('chat message', publicMsg);
      broadcastUserCount();
      return;
    } 

    // 1b. Normal User Login Logic
    users.set(socket.id, { 
        displayName: name, 
        secureName: name, 
        isAdmin: false,
        ip: userIp,
        chatContext: 'public'
    });
    usernamesMap.set(lower, socket.id);
    socket.emit('name_accepted', name);

    const joinMsg = {
      username: 'System',
      content: `${name} has joined the chat.`,
      timestamp: new Date(),
      isAdmin: false,
      type: 'system'
    };
    pushHistory(joinMsg, 'public');
    io.emit('chat message', joinMsg);
    broadcastUserCount();
  });

  // 2. Change Chat Context (Admin only)
  socket.on('admin:set_context', newContext => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin || (newContext !== 'public' && newContext !== ADMIN_CHAT_ID)) {
          return;
      }
      user.chatContext = newContext;
      users.set(socket.id, user);

      // Send the appropriate history for the new context
      const history = newContext === ADMIN_CHAT_ID ? adminChatHistory : chatHistory;
      socket.emit('chat history', history);
      socket.emit('admin_context_switched', newContext);
      broadcastUserCount();
  });

  // 3. Normal Chat Messages
  socket.on('chat message', msg => {
    const user = users.get(socket.id);
    if (!user) {
        socket.emit('system_error', 'You must set a name first.');
        return;
    }
    const content = (msg.content || '').trim();
    if (!content || content.length > CONTENT_MAX_CHARS) return;
    if (isContentBanned(content)) {
        socket.emit('system_alert', 'Your message contains banned language and was not sent.');
        return;
    }
    
    const messageData = {
      username: user.displayName,
      content: content,
      timestamp: new Date(),
      isAdmin: user.isAdmin,
      type: 'public'
    };
    
    const targetHistory = user.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public';
    const targetRoom = user.chatContext === ADMIN_CHAT_ID ? STAFF_ROOM : 'public'; // 'public' is all sockets

    pushHistory(messageData, targetHistory);
    
    if (targetRoom === STAFF_ROOM) {
        // Only send to staff room (used for admin chat)
        io.to(STAFF_ROOM).emit('admin chat message', messageData);
    } else {
        // Send to all clients (used for public chat)
        io.emit('chat message', messageData);
    }
    
    // Ensure user name is in the list, though this is primarily handled by the broadcastUserCount on join/disconnect
    broadcastUserCount();
  });
  
  // 4. Name Change (All Users)
  socket.on('name_change', newName => {
    const user = users.get(socket.id);
    if (!user) {
        socket.emit('system_error', 'You must set a name first.');
        return;
    }
    const trimmedNewName = (newName || '').trim();
    const newLower = trimmedNewName.toLowerCase();
    
    // Checks
    if (trimmedNewName === user.displayName || !trimmedNewName) return; // Removed length check
    if (isNameBanned(trimmedNewName)) {
        socket.emit('system_error', 'That name is not allowed.');
        return;
    }
    if (usernamesMap.has(newLower)) {
         socket.emit('system_error', 'That name is already in use.');
         return;
    }

    // Update
    const oldName = user.displayName;
    usernamesMap.delete(oldName.toLowerCase());
    usernamesMap.set(newLower, socket.id);
    user.displayName = trimmedNewName;
    user.secureName = user.isAdmin ? user.secureName : trimmedNewName; // Non-admins update secureName
    users.set(socket.id, user); 
    
    // Broadcast notification only to admins (Anonymous change)
    const adminChangeMsg = {
        username: 'System',
        content: `**[Admin]** ${oldName} has changed their name to ${trimmedNewName}.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
    };
    io.to(STAFF_ROOM).emit('admin chat message', adminChangeMsg);
    
    // Public notification (Everyone can change name, but only admins see the change notification)
    const publicMsg = {
        username: 'System',
        content: `${oldName} has changed their name to ${trimmedNewName}.`,
        timestamp: new Date(),
        type: 'system'
    };
    pushHistory(publicMsg, 'public');
    io.emit('chat message', publicMsg);
    
    // Alert the user only
    socket.emit('system_alert', `Your display name has been changed to ${trimmedNewName}.`);
    socket.emit('name_updated_ui', trimmedNewName);
    
    broadcastUserCount();
  });

  // 5. Admin: Go Anonymous (New Feature)
  socket.on('admin:go_anonymous', () => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin) return;

      const oldAdminName = user.displayName;
      cleanUpUser(socket.id); // Remove current admin name mapping
      
      const newAnonName = `Anon_${Math.floor(Math.random() * 1000)}`;

      // Re-map as a normal user with a new name
      user.isAdmin = false;
      user.displayName = newAnonName;
      user.secureName = newAnonName; // Secure name is now the display name
      user.chatContext = 'public'; // Move back to public chat
      users.set(socket.id, user); 
      usernamesMap.set(newAnonName.toLowerCase(), socket.id);
      socket.leave(STAFF_ROOM);
      
      socket.emit('staff_status_update', { isAdmin: false, displayName: newAnonName, secureName: newAnonName, currentContext: 'public' });
      socket.emit('system_alert', `You have gone anonymous. Your new name is ${newAnonName}.`);
      
      // Admin notification (Only other admins see the real name change)
      const adminChangeMsg = {
        username: 'System',
        content: `**[Admin]** ${oldAdminName} has gone anonymous.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      io.to(STAFF_ROOM).emit('admin chat message', adminChangeMsg);
      
      // Public notification (as if a non-admin left)
      const publicMsg = {
        username: 'System',
        content: `A moderator has left the chat.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(publicMsg, 'public');
      io.emit('chat message', publicMsg);
      broadcastUserCount();
  });

  // 6. Private Message
  socket.on('private message', msg => {
    const sender = users.get(socket.id);
    if (!sender || sender.chatContext !== 'public') {
      socket.emit('system_error', 'Private messages only allowed in public chat.');
      return;
    }

    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();
    if (!recipient || !content || content.length > CONTENT_MAX_CHARS) {
      socket.emit('system_error', 'Invalid /msg command. Usage: /msg [username] [message]');
      return;
    }
    if (isContentBanned(content)) {
        socket.emit('system_alert', 'Your message contains banned language and was not sent.');
        return;
    }

    if (recipient.toLowerCase() === sender.displayName.toLowerCase()) {
      socket.emit('system_alert', 'You cannot send a private message to yourself.');
      return;
    }

    const recLower = recipient.toLowerCase();
    const recSocketId = usernamesMap.get(recLower);

    if (recSocketId) {
      const messageData = {
        username: sender.displayName,
        content: content,
        timestamp: new Date(),
        isPrivate: true,
        recipient: recipient,
        type: 'private'
      };
      // Send to recipient
      io.to(recSocketId).emit('chat message', messageData); 
      // Send copy to sender
      socket.emit('chat message', {
        ...messageData,
        username: 'You', 
      }); 
    } else {
      socket.emit('system_error', `User '${recipient}' not found or offline.`);
    }
  });

  // 7. Admin: Clear History
  socket.on('admin:clear_history', targetChatId => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) {
      socket.emit('system_error', 'Unauthorized: Admin privileges required.');
      return;
    }
    if (targetChatId !== 'public' && targetChatId !== ADMIN_CHAT_ID) return;

    const history = targetChatId === 'public' ? chatHistory : adminChatHistory;
    history.length = 0; 
    
    const clearMsg = {
      username: 'System',
      content: `Moderator ${user.displayName} cleared ${targetChatId} chat history.`,
      timestamp: new Date(),
      isAdmin: true,
      type: 'system'
    };
    
    pushHistory(clearMsg, targetChatId === 'public' ? 'public' : 'admin');
    
    if (targetChatId === 'public') {
        io.emit('admin:history_cleared', { clearMsg, targetChatId });
    } else {
        io.to(STAFF_ROOM).emit('admin:history_cleared', { clearMsg, targetChatId });
    }
  });

  // 8. Admin: Kick User (/kick, Button)
  socket.on('admin:kick_user', data => {
      const admin = users.get(socket.id);
      const targetName = (data.targetName || '').trim();
      
      if (!admin || !admin.isAdmin) {
          socket.emit('system_error', 'Unauthorized: Admin privileges required.');
          return;
      }
      
      const targetLower = targetName.toLowerCase();
      const targetSocketId = usernamesMap.get(targetLower);
      const targetUser = users.get(targetSocketId);
      
      if (!targetSocketId || !targetUser) {
          socket.emit('system_error', `Kick failed: User '${targetName}' not found or offline.`);
          return;
      }
      if (targetUser.isAdmin) {
          socket.emit('system_error', `Cannot kick Admin '${targetName}'.`);
          return;
      }
      
      io.to(targetSocketId).emit('system_error', `You have been KICKED by Moderator ${admin.displayName}.`);
      
      const kickMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has kicked ${targetName} from the chat.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(kickMsg, targetUser.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', kickMsg);
      
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
          targetSocket.disconnect(true); 
      }
  });
  
  // 9. Admin: IP Ban User
  socket.on('admin:ip_ban_user', data => {
      const admin = users.get(socket.id);
      const targetName = (data.targetName || '').trim();
      const targetIp = (data.targetIp || '').trim();
      const days = parseInt(data.days) || 0;
      const hours = parseInt(data.hours) || 0;
      const minutes = parseInt(data.minutes) || 0;
      const reason = data.reason || 'No reason provided';
      
      if (!admin || !admin.isAdmin || !targetIp) {
          socket.emit('system_error', 'Ban failed: Unauthorized or missing IP.');
          return;
      }
      if (days === 0 && hours === 0 && minutes === 0) {
          socket.emit('system_error', 'Ban duration must be greater than zero.');
          return;
      }
      
      const targetLower = targetName.toLowerCase();
      const targetSocketId = usernamesMap.get(targetLower);
      const targetUser = users.get(targetSocketId);

      // Check if target is an admin before banning
      if (targetUser && targetUser.isAdmin) {
          socket.emit('system_error', `Cannot ban Admin '${targetName}'.`);
          return;
      }
      
      // Calculate ban end time
      const banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + days);
      banUntil.setHours(banUntil.getHours() + hours);
      banUntil.setMinutes(banUntil.getMinutes() + minutes);

      // Add to ban list
      ipBanList.set(targetIp, { banUntil, reason });

      // Notify and kick the target if they are currently connected
      if (targetSocketId) {
          io.to(targetSocketId).emit('system_error', `You have been IP BANNED by Moderator ${admin.displayName} for ${days}d ${hours}h ${minutes}m (${reason}).`);
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) targetSocket.disconnect(true);
      }
      
      const banMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has IP BANNED ${targetName || targetIp} for ${days}d ${hours}h ${minutes}m.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      // Log the ban in the appropriate chat history (usually public, unless the ban was triggered from admin chat)
      pushHistory(banMsg, admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', banMsg);
      
      broadcastUserCount();
  });


  // 10. Disconnect 
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;

    // Remove user mapping
    cleanUpUser(socket.id);

    const leaveMsg = {
      username: 'System',
      content: `${user.displayName} has left the chat.`,
      timestamp: new Date(),
      isAdmin: user.isAdmin,
      type: 'system'
    };
    
    // Announce leave in public chat only if they were a public user or an admin who wasn't anonymous
    if (user.chatContext === 'public' && !user.isAdmin) {
        pushHistory(leaveMsg, 'public');
        io.emit('chat message', leaveMsg);
    }
    
    broadcastUserCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

