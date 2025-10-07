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
const CONTENT_MAX_CHARS = 256; 
// Banned words for name AND content (case-insensitive)
const BANNED_WORDS = ['hitler', 'swear', 'badword', 'bannedword', 'spam', 'adminchat'];

// Staff accounts - NOTE: LoginName is the SECURE password/key
// RESTORED THE FULL 5-USER LIST
const STAFF_LIST = [
  { loginName: 'hfdskLshkdgdibIdsjfkbdAshfjhsfdshfjMdjsbfhd', displayName: 'Liam Stern' },
  { loginName: 'hfsdjDfhukdshjfkdIsjfhdsjEkfhdjSjkshjEdkfLh', displayName: 'Diesel Carter' },
  { loginName: 'hbjrhfjRnjkfdvjkIfhdCnjfkdnjKjndksdjkfjdkdy', displayName: 'Ricky Martinez' },
  { loginName: 'hdufAhudsAifhudiRsfOuidsuNfdsmklfdskfdndsjk', displayName: 'Aaron Ortega' },
  { loginName: 'dnjsDkfjdsOfjdNsfjdOksfjVkdAsnfNjdsnfjkdkfd', displayName: 'Donovan Powell' }
];

const chatHistory = [];
const adminChatHistory = []; 

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

// FIX: Combined check for banned words AND reserved staff display names
function isNameReservedOrBanned(name) { 
    if (!name) return true;
    const lower = name.trim().toLowerCase();
    
    // 1. Check for banned words
    if (BANNED_WORDS.some(banned => lower.includes(banned.toLowerCase()))) {
        return true;
    }
    
    // 2. Check for staff display names (Prevents regular users from taking 'Liam Stern')
    if (STAFF_LIST.some(s => s.displayName.toLowerCase() === lower)) {
        return true;
    }
    
    return false;
}

function isContentBanned(content) {
    if (!content) return false; 
    const lower = content.trim().toLowerCase();
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
    if (user.chatContext === 'public' || user.isAdmin) {
        userMap[user.displayName] = { 
            isAdmin: user.isAdmin,
            ip: user.ip 
        };
    }
  });

  io.emit('user count', { userList: Object.keys(userMap).sort(), usersMap: userMap });
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

  // Initial setup
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // 1. Name check & Login
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();

    cleanUpUser(socket.id); 

    // Basic checks
    if (!name) { 
      socket.emit('name_rejected', `Please provide a name.`);
      return;
    }
    
    // --- ADMIN LOGIN ATTEMPT (Requires secure key) ---
    const staffLoginAttempt = STAFF_LIST.find(s => s.loginName === name);
    if (staffLoginAttempt) {
        const staffName = staffLoginAttempt.displayName;
        const staffLower = staffName.toLowerCase();

        // Check for display name conflict
        if (usernamesMap.has(staffLower)) {
            socket.emit('name_rejected', `The staff display name '${staffName}' is already in use.`);
            return;
        }

        // SUCCESSFUL ADMIN LOGIN
        users.set(socket.id, { 
            displayName: staffName, 
            secureName: staffLoginAttempt.loginName, 
            isAdmin: true,
            ip: userIp,
            chatContext: 'public' 
        });
        usernamesMap.set(staffLower, socket.id);
        socket.join(STAFF_ROOM); 

        socket.emit('staff_status_update', { isAdmin: true, displayName: staffName, secureName: staffLoginAttempt.loginName, currentContext: 'public' });
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
    // --- END ADMIN LOGIN ATTEMPT ---

    // Name uniqueness check (after admin attempt fails)
    if (usernamesMap.has(lower)) {
        socket.emit('name_rejected', 'That name is already in use (Name collision).');
        return;
    }

    // Reserved/Banned name check (Non-admin name)
    if (isNameReservedOrBanned(name)) {
        socket.emit('name_rejected', 'That name is either reserved for staff or not allowed.');
        return;
    }

    // Normal User Login Logic
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
    const targetRoom = user.chatContext === ADMIN_CHAT_ID ? STAFF_ROOM : 'public'; 

    pushHistory(messageData, targetHistory);
    
    if (targetRoom === STAFF_ROOM) {
        io.to(STAFF_ROOM).emit('admin chat message', messageData);
    } else {
        io.emit('chat message', messageData);
    }
    
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
    
    if (trimmedNewName === user.displayName || !trimmedNewName) return; 
    
    // FIX: Use the new reserved/banned name check
    if (isNameReservedOrBanned(trimmedNewName)) {
        socket.emit('system_error', 'That name is either reserved for staff or not allowed.');
        return;
    }
    
    if (usernamesMap.has(newLower)) {
         socket.emit('system_error', 'That name is already in use.');
         return;
    }

    const oldName = user.displayName;
    usernamesMap.delete(oldName.toLowerCase());
    usernamesMap.set(newLower, socket.id);
    user.displayName = trimmedNewName;
    user.secureName = user.isAdmin ? user.secureName : trimmedNewName; 
    users.set(socket.id, user); 
    
    const adminChangeMsg = {
        username: 'System',
        content: `**[Admin]** ${oldName} has changed their name to ${trimmedNewName}.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
    };
    io.to(STAFF_ROOM).emit('admin chat message', adminChangeMsg);
    
    const publicMsg = {
        username: 'System',
        content: `${oldName} has changed their name to ${trimmedNewName}.`,
        timestamp: new Date(),
        type: 'system'
    };
    pushHistory(publicMsg, 'public');
    io.emit('chat message', publicMsg);
    
    socket.emit('system_alert', `Your display name has been changed to ${trimmedNewName}.`);
    socket.emit('name_updated_ui', trimmedNewName);
    
    broadcastUserCount();
  });

  // 5. Admin: Go Anonymous 
  socket.on('admin:go_anonymous', () => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin) return;

      const oldAdminName = user.displayName;
      cleanUpUser(socket.id); 
      
      const newAnonName = `Anon_${Math.floor(Math.random() * 1000)}`;

      user.isAdmin = false;
      user.displayName = newAnonName;
      user.secureName = newAnonName; 
      user.chatContext = 'public'; 
      users.set(socket.id, user); 
      usernamesMap.set(newAnonName.toLowerCase(), socket.id);
      socket.leave(STAFF_ROOM);
      
      socket.emit('staff_status_update', { isAdmin: false, displayName: newAnonName, secureName: newAnonName, currentContext: 'public' });
      socket.emit('system_alert', `You have gone anonymous. Your new name is ${newAnonName}.`);
      
      const adminChangeMsg = {
        username: 'System',
        content: `**[Admin]** ${oldAdminName} has gone anonymous.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      io.to(STAFF_ROOM).emit('admin chat message', adminChangeMsg);
      
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
      io.to(recSocketId).emit('chat message', messageData); 
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

      if (targetUser && targetUser.isAdmin) {
          socket.emit('system_error', `Cannot ban Admin '${targetName}'.`);
          return;
      }
      
      const banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + days);
      banUntil.setHours(banUntil.getHours() + hours);
      banUntil.setMinutes(banUntil.getMinutes() + minutes);

      ipBanList.set(targetIp, { banUntil, reason });

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
      pushHistory(banMsg, admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', banMsg);
      
      broadcastUserCount();
  });


  // 10. Disconnect 
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;

    cleanUpUser(socket.id);

    const leaveMsg = {
      username: 'System',
      content: `${user.displayName} has left the chat.`,
      timestamp: new Date(),
      isAdmin: user.isAdmin,
      type: 'system'
    };
    
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
