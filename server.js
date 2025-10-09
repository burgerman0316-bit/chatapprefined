const express = require('express');
const http = require('http');
// ADD: Required for making external HTTPS requests (like to Google Sheets Webhook)
const https = require('https'); 
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --- GOOGLE SHEETS WEBHOOK CONFIGURATION ---
// IMPORTANT: REPLACE THIS URL with the one you got from Step 1: Deploy the Script.
const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycby2mYeRv5DMZzVlexGk3NzcKsu7_jM1CsN9ev2sjjOVowqHFXHhzj12myCSqOHGwHVE/exec';
// -------------------------------------------


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

const users = new Map(); // socket.id -> { displayName, secureName, isAdmin, ip, chatContext }
const usernamesMap = new Map(); // lowercasedDisplayName -> socket.id
const ipBanList = new Map(); // ipAddress -> { banUntil: Date, reason: string }
// NEW: FPID Ban List
const fpBanList = new Map(); // fingerprintId -> { banUntil: Date, reason: string } 


// --- STATIC FILE SERVING ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- HELPER FUNCTIONS ---

/**
 * Logs ban data to the configured Google Sheet Webhook.
 * @param {object} data - Ban data including bannedName, fingerprintId, reason, etc.
 */
function logBanToSheet(data) {
    if (GOOGLE_SHEET_WEBHOOK_URL === 'YOUR_APPS_SCRIPT_WEBHOOK_URL_HERE') {
        console.warn("WARNING: Google Sheet Webhook URL not configured. Skipping ban log.");
        return;
    }

    const jsonPayload = JSON.stringify(data);
    const url = new URL(GOOGLE_SHEET_WEBHOOK_URL);

    const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': jsonPayload.length,
        },
    };

    const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
            responseData += chunk;
        });
        res.on('end', () => {
            console.log(`Google Sheet Log Status: ${res.statusCode}`);
            // console.log(`Google Sheet Log Response: ${responseData}`);
        });
    });

    req.on('error', (e) => {
        console.error(`Google Sheet Log Error: ${e.message}`);
    });

    req.write(jsonPayload);
    req.end();
}


function cleanUpUser(socketId) {
    const user = users.get(socketId);
    if (!user) return;

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
            isAdmin: user.isAdmin
        };
    }
  });

  io.emit('user count', { userList: Object.keys(userMap).sort(), usersMap: userMap });
  
  // This event remains for admin-only tools (it includes IP and secureName)
  io.to(STAFF_ROOM).emit('admin_user_map', Object.fromEntries(users));
}

// --- SOCKET LOGIC ---
io.on('connection', socket => {
  const userIp = socket.handshake.address;
  let userFingerprintId = ''; // Initialize FPID for the connection

  console.log('Client connected:', socket.id, 'IP:', userIp);

  // 0. Initial FPID submission
  socket.on('client:send_fingerprint_id', fpId => {
      userFingerprintId = fpId;

      // FPID Ban Check
      const fpBanEntry = fpBanList.get(userFingerprintId);
      if (fpBanEntry && fpBanEntry.banUntil > new Date()) {
          const banDurationMs = fpBanEntry.banUntil.getTime() - new Date().getTime();
          socket.emit('banned_modal', { 
              reason: `Fingerprint ID banned: ${fpBanEntry.reason}`, 
              banDurationMs: banDurationMs 
          });
          // Note: Cannot disconnect here as client is still waiting for name check/login
          return; 
      }
      
      // IP Ban Check (Secondary)
      const ipBanEntry = ipBanList.get(userIp);
      if (ipBanEntry && ipBanEntry.banUntil > new Date()) {
          const banDurationMs = ipBanEntry.banUntil.getTime() - new Date().getTime();
          socket.emit('banned_modal', { 
              reason: `IP banned: ${ipBanEntry.reason}`, 
              banDurationMs: banDurationMs 
          });
          return; 
      }
  });


  // Initial setup
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // 1. Name check & Login
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();

    cleanUpUser(socket.id); 

    if (!name) { 
      socket.emit('name_rejected', `Please provide a name.`);
      return;
    }
    
    // --- ADMIN LOGIN ATTEMPT (Requires secure key) ---
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
            ip: userIp,
            fingerprintId: userFingerprintId, // Store FPID
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
        fingerprintId: userFingerprintId, // Store FPID
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
    cleanUpUser(socket.id); // removes from usernamesMap & users
    
    const newAnonName = `Anon_${Math.floor(Math.random() * 1000)}`;
    
    // Re-add user as anonymous
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
      isAdmin: true, // Keep 'isAdmin: true' in system message for consistency
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

    const recipientName = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();

    if (!recipientName || !content) return;

    const recipientSocketId = usernamesMap.get(recipientName.toLowerCase());
    const recipientSocket = io.sockets.sockets.get(recipientSocketId);
    
    if (!recipientSocket) {
        socket.emit('system_error', `User '${recipientName}' is not currently online.`);
        return;
    }

    const messageData = {
        username: recipientName, // Target user will see their name as the message target
        senderName: sender.displayName,
        content: content,
        timestamp: new Date(),
        isAdmin: sender.isAdmin,
        type: 'private'
    };

    // Send to sender
    socket.emit('private message', { ...messageData, username: sender.displayName, senderName: sender.displayName });
    
    // Send to recipient
    recipientSocket.emit('private message', messageData);
  });
  
  // 7. Admin: Request User Map (Used by admin panel on open)
  socket.on('admin:request_user_map', () => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;
      
      // The user map includes IP and secureName, only sent to admin room
      socket.emit('admin_user_map', Object.fromEntries(users));
  });

  // 8. Admin: Kick User
  socket.on('admin:kick_user', targetName => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;
      
      const targetSocketId = usernamesMap.get(targetName.toLowerCase());
      const targetUser = users.get(targetSocketId);

      if (targetUser && !targetUser.isAdmin) { // Cannot kick another admin
          io.to(targetSocketId).emit('system_error', `You have been KICKED by Moderator ${admin.displayName}.`);
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) targetSocket.disconnect(true);
      }
      
      const kickMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has KICKED ${targetName}.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(kickMsg, admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', kickMsg);
      
      // No need to call broadcastUserCount here, it's called on disconnect.
  });

  // 9. Admin: Clear History
  socket.on('admin:clear_history', targetContext => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;

      if (targetContext === 'admin') {
          adminChatHistory.length = 0; // Clears the array
          io.to(STAFF_ROOM).emit('chat history', adminChatHistory); // Send empty history to admins
          socket.emit('system_alert', 'Admin chat history cleared.');
      } else { // public
          chatHistory.length = 0; // Clears the array
          io.emit('chat history', chatHistory); // Send empty history to everyone
          io.emit('chat message', {
              username: 'System',
              content: `Moderator ${admin.displayName} has cleared the public chat history.`,
              timestamp: new Date(),
              isAdmin: true,
              type: 'system'
          });
          socket.emit('system_alert', 'Public chat history cleared.');
      }
  });


  // 10. Admin: IP Ban User (Keeping this for completeness, but using FPID ban below)
  socket.on('admin:ip_ban_user', data => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;
      
      const { targetName, targetIp, days = 0, hours = 0, minutes = 0, reason } = data;
      
      const durationMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
      const banUntil = new Date(Date.now() + durationMs);
      
      const targetSocketId = usernamesMap.get(targetName.toLowerCase());
      const targetUser = users.get(targetSocketId);
      
      if (targetUser && targetUser.isAdmin) {
          socket.emit('system_error', "Cannot IP ban an admin.");
          return;
      }
      
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


  // 11. Admin: Fingerprint Ban User (The request from the user)
  socket.on('admin:fp_ban_user', data => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;
      
      const { targetName, targetFP, days = 0, hours = 0, minutes = 0, reason } = data;
      
      const durationMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
      const banUntil = new Date(Date.now() + durationMs);
      const durationString = `${days}d ${hours}h ${minutes}m`;
      
      const targetSocketId = usernamesMap.get(targetName.toLowerCase());
      const targetUser = users.get(targetSocketId);

      if (targetUser && targetUser.isAdmin) {
          socket.emit('system_error', "Cannot FPID ban an admin.");
          return;
      }

      // ADD FPID to the ban list
      fpBanList.set(targetFP, { banUntil, reason });

      // LOG BAN TO GOOGLE SHEET
      logBanToSheet({
          moderatorName: admin.displayName,
          bannedName: targetName,
          fingerprintId: targetFP,
          duration: durationString,
          reason: reason
      });
      // END LOG

      if (targetSocketId) {
          io.to(targetSocketId).emit('banned_modal', { 
              reason: `You have been BANNED by Moderator ${admin.displayName} for ${reason}.`, 
              banDurationMs: durationMs 
          });
          // Disconnect the user immediately
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) targetSocket.disconnect(true);
      }
      
      const banMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has FPID BANNED ${targetName} for ${durationString}.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(banMsg, admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', banMsg);
      
      broadcastUserCount();
  });
  
  // 12. Admin: Unban FPID
  socket.on('admin:unban_fp', fpId => {
      const admin = users.get(socket.id);
      if (!admin || !admin.isAdmin) return;
      
      if (fpBanList.has(fpId)) {
          fpBanList.delete(fpId);
          socket.emit('system_alert', `Fingerprint ID ${fpId.substring(0, 8)}... UNBANNED.`);
          // Broadcast to admin chat
          io.to(STAFF_ROOM).emit('admin chat message', {
            username: 'System',
            content: `**[Admin]** Moderator ${admin.displayName} has UNBANNED Fingerprint ID ${fpId.substring(0, 8)}...`,
            timestamp: new Date(),
            isAdmin: true,
            type: 'system'
          });
      } else {
          socket.emit('system_error', `Fingerprint ID ${fpId.substring(0, 8)}... not found in ban list.`);
      }
  });


  // 13. Disconnect 
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
    
    // Only announce non-admin users leaving or if admin hasn't gone anonymous
    if (!user.isAdmin || user.chatContext === 'public') {
        pushHistory(leaveMsg, 'public');
        io.emit('chat message', leaveMsg);
    }

    // Always announce to admin chat
    io.to(STAFF_ROOM).emit('admin chat message', { ...leaveMsg, content: `**[Admin]** ${leaveMsg.content}` });
    
    broadcastUserCount();
  });
});

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000');
});
