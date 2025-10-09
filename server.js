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
  { loginName: 'dnjs' } // Example staff entry
];

// Map to store connected users: Map<socketId, {displayName, secureName, isAdmin, chatContext, fingerprintId}>
const users = new Map(); 
const staffKeys = new Map(STAFF_LIST.map(staff => [staff.loginName, staff]));

// Chat history: { public: [], admin: [] }
const chatHistory = {
  public: [],
  admin: []
};

// Fingerprint Ban list: Map<fingerprintId, { banUntil: Date, reason: string }>
const fpBans = new Map();

// --- HELPER FUNCTIONS ---

function pushHistory(msg, context = 'public') {
  if (!chatHistory[context]) return;

  chatHistory[context].push(msg);
  if (chatHistory[context].length > MAX_HISTORY) {
    chatHistory[context].shift();
  }
}

function broadcastUserCount() {
  const userList = Array.from(users.values()).map(user => user.displayName);
  const usersMap = {};

  // Build a map containing all user details (safe data only)
  for (const user of users.values()) {
    usersMap[user.displayName] = {
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      fingerprintId: user.fingerprintId // Include FP ID for admin use (via admin_user_map)
    };
  }

  // Send the full user map to all connected clients
  io.emit('user count', { userList, usersMap });
}

function cleanUpUser(socketId) {
  const user = users.get(socketId);
  if (user && user.isAdmin) {
    io.to(STAFF_ROOM).emit('system_alert', `${user.displayName} (Staff) disconnected.`);
  }
  users.delete(socketId);
}

function checkBanned(fingerprintId) {
  if (!fingerprintId) return false;

  const banEntry = fpBans.get(fingerprintId);
  if (!banEntry) return false;

  const now = new Date();
  if (banEntry.banUntil.getTime() > now.getTime()) {
    return banEntry; // Ban is still active
  } else {
    fpBans.delete(fingerprintId); // Ban expired
    return false;
  }
}

// --- SETUP ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// --- SOCKET.IO CONNECTION ---
io.on('connection', (socket) => {
  let userFingerprintId = null;
  const clientIp = socket.handshake.address;

  // 1. Initial Fingerprint Check
  socket.on('client:send_fingerprint_id', (fpId) => {
    userFingerprintId = fpId;
    const ban = checkBanned(fpId);

    if (ban) {
      const banDurationMs = ban.banUntil.getTime() - new Date().getTime();
      socket.emit('banned_modal', { reason: ban.reason, banDurationMs });
      socket.disconnect(true);
      return;
    }
  });

  // 2. Name/Staff Key Submission
  socket.on('check_staff_status', (input) => {
    if (!userFingerprintId) {
      socket.emit('system_error', 'Fingerprint ID not received. Please refresh.');
      return;
    }

    if (users.has(socket.id)) {
      socket.emit('system_error', 'You are already logged in.');
      return;
    }

    // Check for staff key
    const staffMatch = staffKeys.get(input);
    if (staffMatch) {
      // Staff login
      const displayName = staffMatch.displayName;

      if (Array.from(users.values()).some(u => u.displayName === displayName)) {
          socket.emit('name_rejected', 'That staff member is already logged in.');
          return;
      }

      users.set(socket.id, { 
        id: socket.id, 
        displayName: displayName, 
        secureName: input, 
        isAdmin: true, 
        chatContext: ADMIN_CHAT_ID, 
        fingerprintId: userFingerprintId 
      });

      socket.join(STAFF_ROOM);
      
      // Send history and update UI for staff
      socket.emit('chat history', chatHistory[ADMIN_CHAT_ID]);
      socket.emit('staff_status_update', { 
        isAdmin: true, 
        displayName: displayName, 
        currentContext: ADMIN_CHAT_ID 
      });
      io.to(STAFF_ROOM).emit('system_alert', `${displayName} (Staff) joined.`);

    } else {
      // Regular user login (name)
      const displayName = input.trim();
      if (displayName.length < 3 || displayName.length > 20 || /[^a-zA-Z0-9 ]/.test(displayName)) {
        socket.emit('name_rejected', 'Name must be 3-20 characters (letters, numbers, spaces only).');
        return;
      }
      if (Array.from(users.values()).some(u => u.displayName === displayName)) {
        socket.emit('name_rejected', 'Name is already taken.');
        return;
      }

      users.set(socket.id, { 
        id: socket.id, 
        displayName: displayName, 
        secureName: null, 
        isAdmin: false, 
        chatContext: 'public', 
        fingerprintId: userFingerprintId 
      });
      
      // Send history and update UI for user
      socket.emit('chat history', chatHistory.public);
      socket.emit('name_accepted', displayName);
      
      const joinMsg = {
        username: 'System',
        content: `${displayName} has joined the chat.`,
        timestamp: new Date(),
        type: 'system'
      };
      pushHistory(joinMsg, 'public');
      io.emit('chat message', joinMsg);
    }
    broadcastUserCount();
  });

  // 3. Chat Messages
  socket.on('chat message', (msg) => {
    const user = users.get(socket.id);
    if (!user) return socket.emit('system_error', 'Please log in first.');

    let content = msg.content.trim();

    if (content.length === 0 || content.length > CONTENT_MAX_CHARS) return;

    // Word filter (simplified)
    if (BANNED_WORDS.some(word => content.toLowerCase().includes(word))) {
      socket.emit('system_error', 'Your message contained a banned word.');
      return;
    }
    
    const chatMsg = {
      username: user.displayName,
      content: content,
      timestamp: new Date(),
      isAdmin: user.isAdmin
    };

    if (user.chatContext === ADMIN_CHAT_ID) {
      pushHistory(chatMsg, 'admin');
      io.to(STAFF_ROOM).emit('admin chat message', chatMsg);
    } else {
      pushHistory(chatMsg, 'public');
      io.emit('chat message', chatMsg);
    }
  });

  // 4. Private Messages
  socket.on('private message', ({ recipient, content }) => {
    const sender = users.get(socket.id);
    if (!sender) return socket.emit('system_error', 'Please log in first.');

    const recipientUser = Array.from(users.values()).find(u => u.displayName === recipient);
    if (!recipientUser) {
      return socket.emit('system_error', `User "${recipient}" not found.`);
    }

    if (content.length === 0 || content.length > CONTENT_MAX_CHARS) return;

    const senderMsg = {
      username: 'PM',
      senderName: `To ${recipient}`,
      content: content,
      timestamp: new Date(),
      isAdmin: sender.isAdmin
    };
    socket.emit('private message', senderMsg); // Echo back to sender

    const recipientMsg = {
      username: 'PM',
      senderName: `From ${sender.displayName}`,
      content: content,
      timestamp: new Date(),
      isAdmin: sender.isAdmin
    };
    io.to(recipientUser.id).emit('private message', recipientMsg);
  });

  // 5. Name Change
  socket.on('name_change', (newName) => {
    const user = users.get(socket.id);
    if (!user) return;

    newName = newName.trim();
    if (newName.length < 3 || newName.length > 20 || /[^a-zA-Z0-9 ]/.test(newName)) {
      socket.emit('system_error', 'Name must be 3-20 characters (letters, numbers, spaces only).');
      return;
    }
    if (Array.from(users.values()).some(u => u.displayName === newName)) {
      socket.emit('system_error', 'Name is already taken.');
      return;
    }
    
    if (user.isAdmin) {
        // Staff cannot change their display name once logged in with key (secureName is fixed)
        socket.emit('system_error', 'Staff must log out and log in with a different key to change identity.');
        return;
    }

    const oldName = user.displayName;
    user.displayName = newName;
    users.set(socket.id, user);

    socket.emit('name_updated_ui', newName);

    const renameMsg = {
      username: 'System',
      content: `${oldName} changed their name to ${newName}.`,
      timestamp: new Date(),
      type: 'system'
    };
    pushHistory(renameMsg, 'public');
    io.emit('chat message', renameMsg);
    broadcastUserCount();
  });

  // 6. Admin: Change Context (Staff only)
  socket.on('admin:set_context', (context) => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) return;

    user.chatContext = context === 'admin_chat' ? ADMIN_CHAT_ID : 'public';
    users.set(socket.id, user);

    // Send the correct chat history based on context
    const history = user.chatContext === ADMIN_CHAT_ID ? chatHistory[ADMIN_CHAT_ID] : chatHistory.public;
    socket.emit('chat history', history);
    socket.emit('admin_context_switched', user.chatContext);
  });

  // 7. Admin: Clear History (Staff only)
  socket.on('admin:clear_history', (context) => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) return;

    const targetContext = context === 'admin' ? ADMIN_CHAT_ID : 'public';
    chatHistory[targetContext].length = 0;

    const clearMsg = {
      username: 'System',
      content: `Chat history for ${targetContext} cleared by Moderator ${user.displayName}.`,
      timestamp: new Date(),
      isAdmin: true,
      type: 'system'
    };

    const targetSocket = targetContext === ADMIN_CHAT_ID ? io.to(STAFF_ROOM) : io;

    pushHistory(clearMsg, targetContext);
    targetSocket.emit('chat message', clearMsg);
    targetSocket.emit('chat history', chatHistory[targetContext]); // Send empty history or one clear message
    io.to(STAFF_ROOM).emit('system_alert', `Moderator ${user.displayName} cleared ${targetContext} history.`);
  });

  // 8. Admin: Kick User (Staff only)
  socket.on('admin:kick_user', (targetName) => {
    const admin = users.get(socket.id);
    if (!admin || !admin.isAdmin) return;

    const targetUser = Array.from(users.values()).find(u => u.displayName === targetName);
    if (!targetUser) return socket.emit('system_error', `User ${targetName} not found.`);
    if (targetUser.isAdmin) return socket.emit('system_error', `Cannot kick a staff member.`);
    if (targetUser.id === admin.id) return socket.emit('system_error', `Cannot kick yourself.`);
    
    const targetSocket = io.sockets.sockets.get(targetUser.id);
    if (targetSocket) {
      io.to(targetUser.id).emit('system_error', `You have been kicked by Moderator ${admin.displayName}.`);
      targetSocket.disconnect(true);
    }
    
    const kickMsg = {
      username: 'System',
      content: `Moderator ${admin.displayName} has kicked ${targetName} from the chat.`,
      timestamp: new Date(),
      isAdmin: true,
      type: 'system'
    };
    pushHistory(kickMsg, 'public');
    io.emit('chat message', kickMsg);
    
    broadcastUserCount();
  });

  // 9. Admin: Fingerprint Ban User (Staff only)
  socket.on('admin:fp_ban_user', ({ targetName, targetFP, days, hours, minutes, reason }) => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;

      const targetUser = Array.from(users.values()).find(u => u.fingerprintId === targetFP);
      const targetSocketId = targetUser ? targetUser.id : null;
      
      const durationMs = (days * 86400000) + (hours * 3600000) + (minutes * 60000);
      const banUntil = new Date(new Date().getTime() + durationMs);

      // Save the ban
      fpBans.set(targetFP, { banUntil, reason });

      // Disconnect the target user if they are currently online
      if (targetSocketId) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
             io.to(targetSocketId).emit('system_error', `You have been BANNED by Moderator ${admin.displayName} for ${days}d ${hours}h ${minutes}m (${reason}).`);
             targetSocket.disconnect(true);
          }
      }
      
      // Confirmation alert to the executing admin, showing full FP ID
      socket.emit('system_alert', `SUCCESS: You BANNED ${targetName || 'N/A'} (FP: ${targetFP}) for ${days}d ${hours}h ${minutes}m.`);
      
      const banMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has BANNED ${targetName} for ${days}d ${hours}h ${minutes}m.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(banMsg, 'public');
      io.emit('chat message', banMsg);
      
      io.to(STAFF_ROOM).emit('system_alert', `Moderator ${admin.displayName} BANNED FP ID ${targetFP.substring(0, 8)}...`);

      broadcastUserCount();
  });
  
  // 10. Admin: Unban Fingerprint (Staff only)
  socket.on('admin:unban_fp', (fpId) => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;

      if (fpBans.has(fpId)) {
          fpBans.delete(fpId);
          io.to(STAFF_ROOM).emit('system_alert', `Moderator ${admin.displayName} UNBANNED FP ID ${fpId.substring(0, 8)}...`);
          // Confirmation alert to the executing admin, showing full FP ID
          socket.emit('system_alert', `SUCCESS: You UNBANNED FP ID ${fpId}.`);
      } else {
          socket.emit('system_error', `Fingerprint ID ${fpId} is not currently banned.`);
      }
  });
  
  // 11. Admin: Go Anonymous (Staff only)
  socket.on('admin:go_anonymous', () => {
    const admin = users.get(socket.id);
    if (!admin || !admin.isAdmin) return;

    // Simulate disconnection, but keep FP ID
    const fpId = admin.fingerprintId;
    const oldName = admin.displayName;
    
    users.delete(socket.id);
    socket.leave(STAFF_ROOM);
    
    // Auto-login as a regular user with a generic name
    const newName = `Anon${Math.floor(Math.random() * 9000) + 1000}`;
    
    users.set(socket.id, { 
      id: socket.id, 
      displayName: newName, 
      secureName: null, 
      isAdmin: false, 
      chatContext: 'public', 
      fingerprintId: fpId 
    });

    // Notify staff
    io.to(STAFF_ROOM).emit('system_alert', `${oldName} went anonymous.`);

    // Send history and update UI for the newly anonymous user
    socket.emit('chat history', chatHistory.public);
    socket.emit('name_accepted', newName);
    
    const anonMsg = {
      username: 'System',
      content: `${oldName} has gone anonymous.`,
      timestamp: new Date(),
      type: 'system'
    };
    pushHistory(anonMsg, 'public');
    io.emit('chat message', anonMsg);
    broadcastUserCount();
  });

  // 12. Admin Request User Map (Fixed)
  socket.on('admin:request_user_map', () => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;

      const userMapForAdmin = {};
      
      // Filter out staff members
      for (const user of users.values()) {
          // Only send non-staff users
          if (!user.isAdmin) { 
              userMapForAdmin[user.displayName] = {
                  displayName: user.displayName,
                  fingerprintId: user.fingerprintId,
                  isAdmin: user.isAdmin,
                  socketId: user.id
              };
          }
      }
      // Emit the filtered map back to the requesting client
      socket.emit('admin_user_map', userMapForAdmin);
  });


  // 13. Disconnect (Original)
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
    
    if (user.isAdmin) {
      io.to(STAFF_ROOM).emit('admin chat message', leaveMsg);
    } else {
      pushHistory(leaveMsg, 'public');
      io.emit('chat message', leaveMsg);
    }
    broadcastUserCount();
  });

});


// --- START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
