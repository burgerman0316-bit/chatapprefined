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
const CONTENT_MAX_CHARS = 10000; 
const BANNED_WORDS = ['hitler', 'swear', 'badword', 'bannedword', 'adminchat', '67'];

// Staff accounts - NOTE: LoginName is the SECURE password/key
const STAFF_LIST = [
  { loginName: 'Liam Stern', displayName: 'Liam Stern' },
  { loginName: 'Diesel Carter', displayName: 'Diesel Carter' },
  { loginName: 'Ricardo Martinez', displayName: 'Ricky Martinez' },
  { loginName: 'Aaron Ortega', displayName: 'Aaron Ortega' },
  { loginName: 'Donovan Powell', displayName: 'Donovan Powell' },
  { loginName: 'Blake Stanley', displayName: 'Blake Stanley' },
  { loginName: 'Ashaz Adil', displayName: 'Ashaz Adil' }
];

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
      profilePic: user.profilePic,
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

  // 11. Admin: Unban User
  socket.on('admin:google_unban_user', data => {
      const admin = users.get(socket.id);
      const targetGoogleId = (data.targetGoogleId || '').trim();
      
      if (!admin || !admin.isAdmin || !targetGoogleId) {
          socket.emit('system_error', 'Unban failed: Unauthorized or missing Google ID.');
          return;
      }
      
      if (googleBanList.has(targetGoogleId)) {
          const bannedUser = googleBanList.get(targetGoogleId);
          googleBanList.delete(targetGoogleId);
          
          const unbanMsg = {
            username: 'System',
            content: `Moderator ${admin.displayName} has UNBANNED ${bannedUser.bannedName || 'a user'}.`,
            timestamp: new Date(),
            isAdmin: true,
            type: 'system'
          };
          
          io.emit('chat message', unbanMsg);
          socket.emit('system_alert', 'User successfully unbanned.');
          
          io.to(STAFF_ROOM).emit('ban_list_update', getBanList());
      } else {
          socket.emit('system_error', 'User is not currently banned.');
      }
  });

  // 11. Admin: Unban User (Fix)
  socket.on('admingoogleunbanuser', (data) => {
    const admin = users.get(socket.id);
    const targetGoogleId = (data.targetGoogleId || '').trim();
  
    // Safety checks
    if (!admin || !admin.isAdmin || !targetGoogleId) {
        socket.emit('system_error', 'Unban failed: unauthorized or missing Google ID.');
        return;
    }
  
    // Check if the user is actually banned
    if (googleBanList.has(targetGoogleId)) {
        const bannedUser = googleBanList.get(targetGoogleId);
  
        // Remove user from ban list
        googleBanList.delete(targetGoogleId);
  
        // Notify chat and staff room
        const unbanMsg = {
            username: 'System',
            content: `Moderator ${admin.displayName} has UNBANNED ${bannedUser.bannedName || 'a user'}.`,
            timestamp: new Date(),
            isAdmin: true,
            type: 'system'
        };
  
        io.emit('chat message', unbanMsg);
  
        // Send a confirmation popup to admin
        socket.emit('system_alert', `User '${bannedUser.bannedName || targetGoogleId}' has been successfully unbanned.`);
  
        // Refresh the admin ban list for all moderators
        io.to(STAFF_ROOM).emit('ban_list_update', getBanList());
    } else {
        socket.emit('system_error', 'Unban failed: user is not currently banned.');
    }
  });

  // 11. Admin: Google Unban User (Fixed)
  socket.on("admin:google_unban_user", (data) => {
    const admin = users.get(socket.id);
    const targetGoogleId = (data.targetGoogleId || "").trim();
  
    if (!admin || !admin.isAdmin || !targetGoogleId) {
      socket.emit("system_error", "Unban failed: Unauthorized or missing Google ID.");
      return;
    }
  
    if (googleBanList.has(targetGoogleId)) {
      const bannedUser = googleBanList.get(targetGoogleId);
      googleBanList.delete(targetGoogleId);
  
      const unbanMsg = {
        username: "System",
        content: `Moderator ${admin.displayName} has UNBANNED ${bannedUser.bannedName || "a user"}.`,
        timestamp: new Date(),
        isAdmin: true,
        type: "system"
      };
  
      io.emit("chat message", unbanMsg);
      socket.emit("system_alert", "User successfully unbanned.");
  
      // Send updated banlist to all admins
      io.to(STAFF_ROOM).emit("ban_list_update", getBanList());
    } else {
      socket.emit("system_error", "User is not currently banned.");
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
    
    // Check if user is Liam Stern or Diesel Carter
    if (admin.displayName !== 'Liam Stern' && admin.displayName !== 'Diesel Carter') {
        socket.emit('system_error', 'Unauthorized: Only Liam or Diesel can use this command.');
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
    
    // Check if user is Liam Stern or Diesel Carter
    if (user.displayName !== 'Liam Stern' && user.displayName !== 'Diesel Carter') {
        socket.emit('system_error', 'Unauthorized: Only Liam or Diesel can use this command.');
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






