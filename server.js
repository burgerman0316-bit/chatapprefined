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
const CONTENT_MAX_CHARS = 500; 
const BANNED_WORDS = ['hitler', 'swear', 'badword', 'bannedword', 'spam', 'adminchat'];

// Staff accounts - NOTE: LoginName is the SECURE password/key
const STAFF_LIST = [
  { loginName: 'hfdskLshkdgdibIdsjfkbdAshfjhsfdshfjMdjsbfhd', displayName: 'Liam Stern' },
  { loginName: 'hfsdjDfhukdshjfkdIsjfhdsjEkfhdjSjkshjEdkfLh', displayName: 'Diesel Carter' },
  { loginName: 'hbjrhfjRnjkfdvjkIfhdCnjfkdnjKjndksdjkfjdkdy', displayName: 'Ricky Martinez' },
  { loginName: 'hdufAhudsAifhudiRsfOuidsuNfdsmklfdskfdndsjk', displayName: 'Aaron Ortega' },
  { loginName: 'dnjsDkfjdsOfjdNsfjdOksfjVkdAsnfNjdsnfjkdkfd', displayName: 'Donovan Powell' }
];

const chatHistory = [];
const adminChatHistory = []; 

const users = new Map(); // socket.id -> { displayName, secureName, isAdmin, fingerprintId, chatContext }
const usernamesMap = new Map(); // lowercasedDisplayName -> socket.id
// CHANGED: Use a map for fingerprint bans
const fpBanList = new Map(); // fingerprintId -> { banUntil: Date, reason: string } 

// --- STATIC FILE SERVING ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- HELPER FUNCTIONS ---
function cleanUpUser(socketId) {
    const user = users.get(socketId);
    if (!user || user.displayName === 'Connecting...') return; 

    const lower = user.displayName.toLowerCase();
    
    if (usernamesMap.has(lower) && usernamesMap.get(lower) === socketId) {
        usernamesMap.delete(lower);
    }
    
    users.delete(socketId);
}

function isNameReservedOrBanned(name) { 
    if (!name) return true;
    const lower = name.trim().toLowerCase();
    
    // 1. Check for banned words
    if (BANNED_WORDS.some(banned => lower.includes(banned.toLowerCase()))) {
        return true;
    }
    
    // 2. Check for staff display names
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
    // Only count/show users who have successfully logged in
    if (user.displayName !== 'Connecting...' && (user.chatContext === 'public' || user.isAdmin)) {
        userMap[user.displayName] = { 
            isAdmin: user.isAdmin
        };
    }
  });

  io.emit('user count', { userList: Object.keys(userMap).sort(), usersMap: userMap });
  
  // This event remains for admin-only tools (it includes fingerprintId and secureName)
  io.to(STAFF_ROOM).emit('admin_user_map', Object.fromEntries(users));
}

// --- SOCKET LOGIC ---
io.on('connection', socket => {
  const tempUserIp = socket.handshake.address; 
  console.log('Client connected (Waiting for Fingerprint ID):', socket.id, 'IP:', tempUserIp);

  // Temporarily store the initial socket data.
  users.set(socket.id, { 
      displayName: 'Connecting...', 
      secureName: '', 
      isAdmin: false,
      fingerprintId: null, // Will be set by client
      chatContext: 'public',
      socketId: socket.id 
  });

  // Client sends the Fingerprint ID
  socket.on('client:send_fingerprint_id', fingerprintId => {
      // 0. Fingerprint Ban Check
      const fp = (fingerprintId || '').trim();
      
      const banEntry = fpBanList.get(fp); 
      if (banEntry && banEntry.banUntil > new Date()) {
          const banDurationMs = banEntry.banUntil.getTime() - new Date().getTime();
          socket.emit('banned_modal', { 
              reason: banEntry.reason, 
              banDurationMs: banDurationMs 
          });
          // Clean up the temporary user entry
          users.delete(socket.id); 
          return; 
      }
      
      // Update the user entry with the Fingerprint ID
      const user = users.get(socket.id);
      if (user) {
          user.fingerprintId = fp || 'UNKNOWN_FP';
          users.set(socket.id, user); 
          console.log(`Client ${socket.id} now identified with FP: ${user.fingerprintId}`);
      }

      // Initial setup (only send once the FP is known and not banned)
      socket.emit('chat history', chatHistory);
      broadcastUserCount();
  });
  
  // 1. Name check & Login
  socket.on('check_staff_status', enteredName => {
    const user = users.get(socket.id);
    if (!user || !user.fingerprintId || user.displayName !== 'Connecting...') { 
        socket.emit('system_error', 'Connection error: Device fingerprint not established or already logged in.');
        return;
    }
    
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();

    // Clean up temporary user entry
    users.delete(socket.id); 

    if (!name) { 
      socket.emit('name_rejected', `Please provide a name.`);
      // Restore the temporary entry if name is missing
      users.set(socket.id, { 
          displayName: 'Connecting...', 
          secureName: '', 
          isAdmin: false,
          fingerprintId: user.fingerprintId,
          chatContext: 'public',
          socketId: socket.id
      });
      return;
    }
    
    // --- ADMIN LOGIN ATTEMPT ---
    const staffLoginAttempt = STAFF_LIST.find(s => s.loginName === name);
    if (staffLoginAttempt) {
        const staffName = staffLoginAttempt.displayName;
        const staffLower = staffName.toLowerCase();

        if (usernamesMap.has(staffLower)) {
            socket.emit('name_rejected', `The staff display name '${staffName}' is already in use.`);
            return;
        }

        // SUCCESSFUL ADMIN LOGIN
        users.set(socket.id, { 
            displayName: staffName, 
            secureName: staffLoginAttempt.loginName, 
            isAdmin: true,
            fingerprintId: user.fingerprintId, 
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
        fingerprintId: user.fingerprintId, 
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
    if (!user || user.displayName === 'Connecting...') { 
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
    if (!user || user.displayName === 'Connecting...') {
        socket.emit('system_error', 'You must set a name first.');
        return;
    }
    const trimmedNewName = (newName || '').trim();
    const newLower = trimmedNewName.toLowerCase();
    if (trimmedNewName === user.displayName || !trimmedNewName) return;
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
    if (!sender || sender.chatContext !== 'public' || sender.displayName === 'Connecting...') {
        socket.emit('system_error', 'Private messages only allowed in public chat and after login.');
        return;
    }
    
    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();
    if (!recipient || !content || content.length > CONTENT_MAX_CHARS) return;
    if (isContentBanned(content)) {
        socket.emit('system_alert', 'Your private message contains banned language and was not sent.');
        return;
    }
    
    const recipientSocketId = usernamesMap.get(recipient.toLowerCase());
    
    if (!recipientSocketId) {
        socket.emit('system_error', `User '${recipient}' not found or is not active.`);
        return;
    }
    
    const recipientUser = users.get(recipientSocketId);
    if (recipientUser.chatContext !== 'public') {
        socket.emit('system_error', `User '${recipient}' is not currently in public chat.`);
        return;
    }

    const messageData = {
      senderName: sender.displayName,
      content: content,
      timestamp: new Date(),
    };

    // Send to recipient
    io.to(recipientSocketId).emit('private message', messageData);
    
    // Send copy to sender (as if from "You")
    socket.emit('private message', { 
        senderName: 'You', 
        content: `(to ${recipient}) ${content}`,
        timestamp: messageData.timestamp
    });
  });

  // 7. Admin: Clear Chat History
  socket.on('admin:clear_history', targetContext => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;
      
      const isPublic = targetContext !== ADMIN_CHAT_ID;
      
      if (isPublic) {
          chatHistory.length = 0;
          io.emit('chat history', chatHistory);
      } else {
          adminChatHistory.length = 0;
          io.to(STAFF_ROOM).emit('chat history', adminChatHistory);
      }
      
      const targetName = isPublic ? 'Public Chat' : 'Admin Chat';
      const msg = {
        username: 'System',
        content: `${targetName} history cleared by Moderator ${admin.displayName}.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      
      pushHistory(msg, 'public');
      pushHistory(msg, 'admin');

      io.emit('chat message', msg);
      io.to(STAFF_ROOM).emit('admin chat message', msg);
      
      socket.emit('system_alert', `${targetName} history has been cleared.`);
  });

  // 8. Admin: Kick User
  socket.on('admin:kick_user', ({ targetName, adminName }) => {
    const admin = users.get(socket.id);
    if (!admin || !admin.isAdmin) return;
    
    const targetSocketId = usernamesMap.get(targetName.toLowerCase());
    const targetUser = users.get(targetSocketId);
    
    if (!targetUser) {
         socket.emit('system_error', `User ${targetName} not found.`);
         return;
    }
    if (targetUser.isAdmin) {
         socket.emit('system_error', `Cannot kick other administrators.`);
         return;
    }
    
    // Server-side kick message
    const kickMsg = {
        username: 'System',
        content: `${targetName} was KICKED by Moderator ${admin.displayName}.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
    };
    pushHistory(kickMsg, targetUser.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
    io.emit('chat message', kickMsg);
    io.to(STAFF_ROOM).emit('admin chat message', kickMsg);
    
    // Client-side kick
    io.to(targetSocketId).emit('system_error', `You have been KICKED by Moderator ${admin.displayName}.`);
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) targetSocket.disconnect(true);
    
    broadcastUserCount();
  });


  // 9. Admin: Fingerprint Ban User
  socket.on('admin:fp_ban_user', ({ targetName, targetFingerprintId, days, hours, minutes, reason, adminName }) => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;

      if (!targetFingerprintId || (days === 0 && hours === 0 && minutes === 0)) {
          socket.emit('system_error', 'Invalid ban duration or missing target Fingerprint ID.');
          return;
      }
      
      // Find the socket ID of the user to ban (if currently connected)
      const targetSocketId = [...users.entries()].find(([, user]) => user.displayName === targetName)?.[0];
      
      const banDurationMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
      const banUntil = new Date(new Date().getTime() + banDurationMs);

      // CRITICAL: Use fpBanList to store the fingerprint ban
      fpBanList.set(targetFingerprintId, { banUntil, reason });

      if (targetSocketId) {
          io.to(targetSocketId).emit('system_error', `You have been Fingerprint BANNED by Moderator ${admin.displayName} for ${days}d ${hours}h ${minutes}m (${reason}).`);
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) targetSocket.disconnect(true);
      }
      
      const banMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has Fingerprint BANNED ${targetName || targetFingerprintId} for ${days}d ${hours}h ${minutes}m.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(banMsg, admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', banMsg);
      
      broadcastUserCount();
  });


  // 10. Admin: Fingerprint Unban User
  socket.on('admin:unban_fp', fpIdToUnban => { 
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;

      if (!fpIdToUnban) {
          socket.emit('system_error', 'Missing Fingerprint ID to unban.'); 
          return;
      }

      if (fpBanList.has(fpIdToUnban)) { 
          fpBanList.delete(fpIdToUnban);
          socket.emit('system_alert', `Successfully unbanned Fingerprint ID: ${fpIdToUnban}.`); 
          
          const unbanMsg = {
            username: 'System',
            content: `Moderator ${admin.displayName} has UNBANNED Fingerprint ID ${fpIdToUnban}.`, 
            timestamp: new Date(),
            isAdmin: true,
            type: 'system'
          };
          io.to(STAFF_ROOM).emit('admin chat message', unbanMsg);
      } else {
          socket.emit('system_error', `Fingerprint ID ${fpIdToUnban} not found in ban list.`); 
      }
  });


  // 11. Disconnect 
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
    
    // Only broadcast leave message if user was logged in with a name
    if (user.displayName !== 'Connecting...') {
        if (user.isAdmin) {
            io.to(STAFF_ROOM).emit('admin chat message', { ...leaveMsg, content: `**[Admin]** ${user.displayName} has left the chat.` });
            io.emit('chat message', { ...leaveMsg, content: `A moderator has left the chat.` });
        } else {
            pushHistory(leaveMsg, 'public');
            io.emit('chat message', leaveMsg);
        }
    }
    
    broadcastUserCount();
  });
});

// FIX: Listen on the dynamically assigned PORT environment variable,
// or fall back to 3000 for local development.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
