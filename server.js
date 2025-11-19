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
const CONTENT_MAX_CHARS = 2000; 
const BANNED_WORDS = ['hitler', 'Albert'];

// Staff accounts - NOTE: LoginName is the SECURE password/key
const STAFF_LIST = [
  { loginName: 'Liam Stern', displayName: 'Liam Stern' },
  { loginName: 'Diesel Carter', displayName: 'Diesel Carter' },
  { loginName: 'Ricardo Martinez', displayName: 'Ricky Martinez' },
  { loginName: 'Aaron Ortega', displayName: 'Aaron Ortega' },
  { loginName: 'Donovan Powell', displayName: 'Donovan Powell' }
];

// Add a special property to track which users can only ban one person
const LIMITED_BAN_USERS = {
  
};

const chatHistory = [];
const adminChatHistory = []; 

const users = new Map(); // socket.id -> { displayName, secureName, isAdmin, ip, chatContext, googleId }
const usernamesMap = new Map(); // lowercasedDisplayName -> socket.id
const googleBanList = new Map(); // googleId -> { banUntil: Date, reason: string }

// Anonymous name generator
const FIRST_NAMES = [
  "Ethan", "Olivia", "Noah", "Sophia", "Liam",
  "Ava", "Mason", "Isabella", "Lucas", "Mia",
  "Logan", "Harper", "Jackson", "Amelia", "Aiden",
  "Evelyn", "Caleb", "Abigail", "Henry", "Ella"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Brown", "Garcia", "Martinez",
  "Davis", "Lopez", "Wilson", "Anderson", "Clark",
  "Taylor", "Lewis", "Walker", "Allen", "Young",
  "King", "Wright", "Scott", "Torres", "Hill"
];

function generateAnonName() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}


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
        // FIX: Include isAdmin status for all clients to see who is a moderator
        userMap[user.displayName] = { 
            isAdmin: user.isAdmin,
            googleId: user.googleId,
            profilePic: user.profilePic
        };
    }
  });

  io.emit('user count', { userList: Object.keys(userMap).sort(), usersMap: userMap });
  
  // This event remains for admin-only tools (it includes IP and secureName)
  io.to(STAFF_ROOM).emit('admin_user_map', Object.fromEntries(users));
}

function getBanList() {
  const banArray = [];
  googleBanList.forEach((value, key) => {
    if (value.banUntil > new Date()) {
      banArray.push({
        googleId: key,
        bannedName: value.bannedName || 'Unknown',
        reason: value.reason,
        banUntil: value.banUntil.toISOString()
      });
    }
  });
  return banArray;
}

// --- SOCKET LOGIC ---
io.on('connection', socket => {
  const userIp = socket.handshake.address;
  console.log('Client connected:', socket.id, 'IP:', userIp);

  // 0. Google Ban Check
  const user = users.get(socket.id);
  if (user && user.googleId) {
    const banEntry = googleBanList.get(user.googleId);
    if (banEntry && banEntry.banUntil > new Date()) {
        const banDurationMs = banEntry.banUntil.getTime() - new Date().getTime();
        socket.emit('banned_modal', { 
            reason: banEntry.reason, 
            banDurationMs: banDurationMs 
        });
        return; 
    }
  }

  // Initial setup
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // 1. Google Login
  socket.on('google_login', userData => {
    const { name, email, googleId, profilePic } = userData;
    const lower = name.toLowerCase();
    
    cleanUpUser(socket.id);
    
    // Check if user is admin
    const staffMember = STAFF_LIST.find(s => s.displayName.toLowerCase() === lower);
    
    if (staffMember) {
      // Admin login
      if (usernamesMap.has(lower)) {
        socket.emit('name_rejected', `The staff display name '${staffMember.displayName}' is already in use.`);
        return;
      }
      
      // SUCCESSFUL ADMIN LOGIN - Removed the restriction that blocked Blake and Ashaz
      users.set(socket.id, {
        displayName: staffMember.displayName,
        secureName: staffMember.loginName,
        isAdmin: true,
        ip: userIp,
        chatContext: 'public',
        googleId: googleId,
        profilePic: profilePic
      });
      usernamesMap.set(lower, socket.id);
      socket.join(STAFF_ROOM);
      
      socket.emit('staff_status_update', {
        isAdmin: true,
        displayName: staffMember.displayName,
        secureName: staffMember.loginName,
        currentContext: 'public'
      });
      
      const publicMsg = {
        username: 'System',
        content: `A moderator has entered the chat.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(publicMsg, 'public');
      io.emit('chat message', publicMsg);
      socket.emit('ban_list_update', getBanList());
      broadcastUserCount();
    } else {
      // Regular user login
      if (usernamesMap.has(lower)) {
        socket.emit('name_rejected', 'That name is already in use.');
        return;
      }
      
      if (isNameReservedOrBanned(name)) {
        socket.emit('name_rejected', 'That name is either reserved for staff or not allowed.');
        return;
      }
      
      // Check if user is banned by Google ID
      const banEntry = googleBanList.get(googleId);
      if (banEntry && banEntry.banUntil > new Date()) {
        const banDurationMs = banEntry.banUntil.getTime() - new Date().getTime();
        socket.emit('banned_modal', { 
            reason: banEntry.reason, 
            banDurationMs: banDurationMs 
        });
        return;
      }
      
      users.set(socket.id, {
        displayName: name,
        secureName: name,
        isAdmin: false,
        ip: userIp,
        chatContext: 'public',
        googleId: googleId,
        profilePic: profilePic
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
    }
  });

  // 2. Name check & Login
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

        // SUCCESSFUL ADMIN LOGIN - Removed the restriction that blocked Blake and Ashaz
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
            chatContext: 'public',
            googleId: null,
            profilePic: null
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
        socket.emit('ban_list_update', getBanList());
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
        chatContext: 'public',
        googleId: null,
        profilePic: null
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

  // 3. Change Chat Context (Admin only)
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

  // 4. Normal Chat Messages
socket.on('chat message', msg => {
    const user = users.get(socket.id);
    if (!user) {
        socket.emit('system_error', 'You must set a name first.');
        return;
    }
    
    const content = (msg.content || '').trim();
    if (!content && !msg.image) return;
    if (content.length > CONTENT_MAX_CHARS) return;
    if (isContentBanned(content)) {
        socket.emit('system_alert', 'Your message contains banned language and was not sent.');
        return;
    }
    
    const messageData = {
      username: user.displayName,
      content: content,
      timestamp: new Date(),
      isAdmin: user.isAdmin,
      profilePic: user.profilePic,
      googleId: user.googleId,  // ADD THIS LINE
      type: 'public'
    };
    
    // If there's an image, include it in the message
    if (msg.image) {
      messageData.image = msg.image;
    }
    
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
  
  // 5. Name Change (All Users)
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

  // 6. Admin: Go Anonymous 
  socket.on('admin:go_anonymous', () => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin) return;

      const oldAdminName = user.displayName;
      cleanUpUser(socket.id); 
      
      const newAnonName = generateAnonName();

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

  // 7. Private Message
  socket.on('private message', msg => {
    const sender = users.get(socket.id);
    if (!sender || sender.chatContext !== 'public') {
      socket.emit('system_error', 'Private messages only allowed in public chat.');
      return;
    }

    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();
    if (!recipient || !content || content.length > CONTENT_MAX_CHARS) {
      socket.emit('system_error', 'Invalid /msg command. Usage: /msg "username" message');
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
        profilePic: sender.profilePic,
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

  // 8. Admin: Clear History
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

  // 9. Admin: Kick User (/kick, Button)
  socket.on('admin:kick_user', data => {
      const admin = users.get(socket.id); 
      const targetName = (data.targetName || '').trim();
      
      if (!admin || !admin.isAdmin) {
          socket.emit('system_error', 'Unauthorized: Admin privileges required.');
          return;
      }
      
      // Check if user has limited ban permissions
      if (LIMITED_BAN_USERS[admin.displayName]) {
          const allowedTarget = LIMITED_BAN_USERS[admin.displayName];
          if (targetName !== allowedTarget) {
              socket.emit('system_error', `${admin.displayName} can only ban ${allowedTarget}.`);
              return;
          }
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
  
  // 10. Admin: Google Ban User
  socket.on('admin:google_ban_user', data => {
      const admin = users.get(socket.id);
      const targetName = (data.targetName || '').trim();
      const targetGoogleId = (data.targetGoogleId || '').trim();
      const days = parseInt(data.days) || 0;
      const hours = parseInt(data.hours) || 0;
      const minutes = parseInt(data.minutes) || 0;
      const reason = data.reason || 'No reason provided';
      
      if (!admin || !admin.isAdmin || !targetGoogleId) {
          socket.emit('system_error', 'Ban failed: Unauthorized or missing Google ID.');
          return;
      }
      
      // Check if user has limited ban permissions
      if (LIMITED_BAN_USERS[admin.displayName]) {
          const allowedTarget = LIMITED_BAN_USERS[admin.displayName];
          if (targetName !== allowedTarget) {
              socket.emit('system_error', `${admin.displayName} can only ban ${allowedTarget}.`);
              return;
          }
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

      googleBanList.set(targetGoogleId, { banUntil, reason, bannedName: targetName });

      if (targetSocketId) {
          io.to(targetSocketId).emit('system_error', `You have been BANNED by Moderator ${admin.displayName} for ${days}d ${hours}h ${minutes}m (${reason}).`);
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) targetSocket.disconnect(true);
      }
      
      const banMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has BANNED ${targetName} for ${days}d ${hours}h ${minutes}m.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(banMsg, admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', banMsg);
      
      io.to(STAFF_ROOM).emit('ban_list_update', getBanList());
      broadcastUserCount();
  });

  // 11. Admin: Unban User (FIXED - Better lookup)
  socket.on("admin:google_unban_user", (data) => {
      const admin = users.get(socket.id);
      const targetName = (data.targetName || "").trim();
      const targetGoogleId = (data.targetGoogleId || "").trim();
      
      if (!admin || !admin.isAdmin) {
          socket.emit("system_error", "Unban failed: Unauthorized.");
          return;
      }
      
      let finalGoogleId = targetGoogleId;
      let foundBannedName = null;
      
      // If no Google ID provided, try to find it by name in ban list
      if (!finalGoogleId && targetName) {
          const targetLower = targetName.toLowerCase();
          
          // Search through ban list for matching name
          for (const [googleId, banInfo] of googleBanList.entries()) {
              if (banInfo.bannedName && banInfo.bannedName.toLowerCase() === targetLower) {
                  finalGoogleId = googleId;
                  foundBannedName = banInfo.bannedName;
                  break;
              }
          }
          
          // If still not found, check currently connected users
          if (!finalGoogleId) {
              for (const [socketId, user] of users.entries()) {
                  if (user.displayName.toLowerCase() === targetLower && user.googleId) {
                      finalGoogleId = user.googleId;
                      foundBannedName = user.displayName;
                      break;
                  }
              }
          }
      }
      
      if (!finalGoogleId) {
          socket.emit("system_error", `Unban failed: Could not find banned user '${targetName}'. Make sure the name matches exactly.`);
          return;
      }
      
      if (googleBanList.has(finalGoogleId)) {
          const bannedUser = googleBanList.get(finalGoogleId);
          const unbannedName = bannedUser.bannedName || foundBannedName || "unknown user";
          googleBanList.delete(finalGoogleId);
          
          const unbanMsg = {
              username: "System",
              content: `Moderator ${admin.displayName} has UNBANNED ${unbannedName}.`,
              timestamp: new Date(),
              isAdmin: true,
              type: "system"
          };
          
          pushHistory(unbanMsg, 'public');
          io.emit("chat message", unbanMsg);
          socket.emit("system_alert", `Successfully unbanned ${unbannedName}.`);
          
          // Send updated banlist to all admins
          io.to(STAFF_ROOM).emit("ban_list_update", getBanList());
      } else {
          socket.emit("system_error", `User '${targetName}' is not currently banned.`);
      }
  });

  // 11B. Admin: Rename User (with auto-save)
  socket.on('admin:rename_user', (data) => {
    const admin = users.get(socket.id);
    const oldName = (data.oldName || '').trim();
    const newName = (data.newName || '').trim();
  
    if (!admin || !admin.isAdmin) {
      socket.emit('system_error', 'Unauthorized: Admin privileges required.');
      return;
    }
    if (!oldName || !newName) {
      socket.emit('system_error', 'Rename failed: Invalid parameters.');
      return;
    }
  
    // Find the target user
    const targetSocketId = [...users.entries()]
      .find(([_, user]) => user.displayName.toLowerCase() === oldName.toLowerCase())?.[0];
  
    if (!targetSocketId) {
      socket.emit('system_error', `Rename failed: User '${oldName}' not found.`);
      return;
    }
  
    const targetUser = users.get(targetSocketId);
    const newLower = newName.toLowerCase();
  
    if (isNameReservedOrBanned(newName)) {
      socket.emit('system_error', `Rename failed: '${newName}' is reserved or not allowed.`);
      return;
    }
  
    if (usernamesMap.has(newLower)) {
      socket.emit('system_error', `Rename failed: '${newName}' is already in use.`);
      return;
    }
  
    // Perform rename
    usernamesMap.delete(oldName.toLowerCase());
    usernamesMap.set(newLower, targetSocketId);
    targetUser.displayName = newName;
    users.set(targetSocketId, targetUser);
  
    // Notify everyone
    const renameMsg = {
      username: 'System',
      content: `Moderator ${admin.displayName} renamed '${oldName}' to '${newName}'.`,
      timestamp: new Date(),
      isAdmin: true,
      type: 'system'
    };
    io.emit('chat message', renameMsg);
  
    io.to(targetSocketId).emit('system_alert', `Your name has been changed to '${newName}' by a moderator.`);
    io.to(targetSocketId).emit('name_updated_ui', newName);
  
    broadcastUserCount();
  });

  // 12. Admin: Machine Gun Sound
  socket.on('admin:machinegun', () => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) {
        socket.emit('system_error', 'Unauthorized: Admin privileges required.');
        return;
    }
    
    const sounds = [
        'BRRRRRR'
    ];
    
    let delay = 0;
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const sound = sounds[Math.floor(Math.random() * sounds.length)];
            const messageData = {
                username: "Machine Gun",
                content: sound,
                timestamp: new Date(),
                isAdmin: false,
                type: "public"
            };
            io.emit('chat message', messageData);
        }, delay);
        delay += 200;
    }
  });

  // 13. Admin: Request Full Ban List (Diesel Carter only)
  socket.on('admin:request_full_ban_list', () => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin || user.displayName !== 'Diesel Carter') {
          socket.emit('system_error', 'Unauthorized: This feature is restricted.');
          return;
      }
      
      const banListArray = [];
      googleBanList.forEach((value, key) => {
          banListArray.push({
              googleId: key,
              bannedName: value.bannedName || 'Unknown',
              reason: value.reason,
              banUntil: value.banUntil.toISOString()
          });
      });
      
      socket.emit('admin:ban_list_json', banListArray);
  });

  // 14. Admin: Request Full Chat History (Diesel Carter only)
  socket.on('admin:request_full_chat_history', () => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin || user.displayName !== 'Diesel Carter') {
          socket.emit('system_error', 'Unauthorized: This feature is restricted.');
          return;
      }
      
      // Sanitize chat history - Convert dates but KEEP images and profile pics
      const sanitizedPublicChat = chatHistory.map(msg => {
          const sanitized = {
              username: msg.username,
              content: msg.content,
              timestamp: msg.timestamp ? msg.timestamp.toISOString() : new Date().toISOString(),
              isAdmin: msg.isAdmin || false,
              type: msg.type || 'public',
              isPrivate: msg.isPrivate || false
          };
          
          // Keep the actual image data
          if (msg.image) {
              sanitized.image = msg.image;
          }
          
          // Keep the actual profile pic URL
          if (msg.profilePic) {
              sanitized.profilePic = msg.profilePic;
          }
          
          return sanitized;
      });
      
      const sanitizedAdminChat = adminChatHistory.map(msg => {
          const sanitized = {
              username: msg.username,
              content: msg.content,
              timestamp: msg.timestamp ? msg.timestamp.toISOString() : new Date().toISOString(),
              isAdmin: msg.isAdmin || false,
              type: msg.type || 'admin',
              isPrivate: msg.isPrivate || false
          };
          
          // Keep the actual image data
          if (msg.image) {
              sanitized.image = msg.image;
          }
          
          // Keep the actual profile pic URL
          if (msg.profilePic) {
              sanitized.profilePic = msg.profilePic;
          }
          
          return sanitized;
      });
      
      const fullHistory = {
          publicChat: sanitizedPublicChat,
          adminChat: sanitizedAdminChat,
          exportedAt: new Date().toISOString()
      };
      
      socket.emit('admin:chat_history_json', fullHistory);
  });

  // 15. Admin: Request Ban List
  socket.on('admin:request_ban_list', () => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin) return;
      
      socket.emit('ban_list_update', getBanList());
  });

  // 16. Admin: Restore Ban List (Diesel Carter only)
  socket.on('admin:restore_ban_list', (banListData) => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin || user.displayName !== 'Diesel Carter') {
          socket.emit('system_error', 'Unauthorized: This feature is restricted.');
          return;
      }

      if (!Array.isArray(banListData)) {
          socket.emit('system_error', 'Restore Ban List failed: Invalid data format. Expected an array.');
          return;
      }

      googleBanList.clear(); // Clear existing bans
      let restoredCount = 0;
      banListData.forEach(ban => {
          if (ban.googleId && ban.banUntil && ban.reason) {
              const banUntilDate = new Date(ban.banUntil);
              if (!isNaN(banUntilDate.getTime())) { // Check if date is valid
                  googleBanList.set(ban.googleId, {
                      banUntil: banUntilDate,
                      reason: ban.reason,
                      bannedName: ban.bannedName || 'Unknown'
                  });
                  restoredCount++;
              }
          }
      });

      socket.emit('system_alert', `Successfully restored ${restoredCount} ban entries.`);
      io.to(STAFF_ROOM).emit('ban_list_update', getBanList()); // Update all admins
      broadcastUserCount(); // User count might change if banned users were online
  });

  // 17. Admin: Restore Chat History (Diesel Carter only)
  socket.on('admin:restore_chat_history', (historyData) => {
      const user = users.get(socket.id);
      if (!user || !user.isAdmin || user.displayName !== 'Diesel Carter') {
          socket.emit('system_error', 'Unauthorized: This feature is restricted.');
          return;
      }

      console.log('Restore chat history received');

      if (!historyData || typeof historyData !== 'object') {
          socket.emit('system_error', 'Restore Chat History failed: Invalid data format.');
          return;
      }

      let publicChatData = historyData.publicChat;
      let adminChatData = historyData.adminChat;

      if (!publicChatData || !Array.isArray(publicChatData)) {
          socket.emit('system_error', 'Restore Chat History failed: publicChat must be an array.');
          return;
      }

      if (!adminChatData || !Array.isArray(adminChatData)) {
          socket.emit('system_error', 'Restore Chat History failed: adminChat must be an array.');
          return;
      }

      chatHistory.length = 0;
      let publicCount = 0;
      publicChatData.forEach(msg => {
          if (msg.username && msg.timestamp) {
              const restoredMsg = {
                  username: msg.username,
                  content: msg.content || '',
                  timestamp: new Date(msg.timestamp),
                  isAdmin: msg.isAdmin || false,
                  type: msg.type || 'public',
                  isPrivate: msg.isPrivate || false
              };
              
              // Restore profile pic if it exists
              if (msg.profilePic) {
                  restoredMsg.profilePic = msg.profilePic;
              }
              
              // Restore image if it exists (keep the full image object)
              if (msg.image && msg.image.type === 'image') {
                  restoredMsg.image = msg.image;
              }
              
              chatHistory.push(restoredMsg);
              publicCount++;
          }
      });

      adminChatHistory.length = 0;
      let adminCount = 0;
      adminChatData.forEach(msg => {
          if (msg.username && msg.timestamp) {
              const restoredMsg = {
                  username: msg.username,
                  content: msg.content || '',
                  timestamp: new Date(msg.timestamp),
                  isAdmin: msg.isAdmin || false,
                  type: msg.type || 'admin',
                  isPrivate: msg.isPrivate || false
              };
              
              // Restore profile pic if it exists
              if (msg.profilePic) {
                  restoredMsg.profilePic = msg.profilePic;
              }
              
              // Restore image if it exists (keep the full image object)
              if (msg.image && msg.image.type === 'image') {
                  restoredMsg.image = msg.image;
              }
              
              adminChatHistory.push(restoredMsg);
              adminCount++;
          }
      });

      console.log(`Restored ${publicCount} public and ${adminCount} admin messages`);

      // Send system message FIRST
      const restoreMsg = {
          username: 'System',
          content: `Chat history was restored by Moderator ${user.displayName}.`,
          timestamp: new Date(),
          isAdmin: true,
          type: 'system'
      };
      
      // Broadcast the restored history to ALL users
      users.forEach((userData, socketId) => {
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket) {
              if (userData.chatContext === 'public') {
                  targetSocket.emit('chat history', chatHistory);
              } else if (userData.chatContext === ADMIN_CHAT_ID && userData.isAdmin) {
                  targetSocket.emit('chat history', adminChatHistory);
              }
          }
      });
      
      // Send confirmation
      socket.emit('system_alert', `Successfully restored chat history (${publicCount} public, ${adminCount} admin messages).`);
      
      // Add restore message to history and broadcast it
      pushHistory(restoreMsg, 'public');
      io.emit('chat message', restoreMsg);
      io.to(STAFF_ROOM).emit('admin chat message', restoreMsg);
  });

  // 18. Disconnect 
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







