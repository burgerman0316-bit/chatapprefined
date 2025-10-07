// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
// IMPORTANT: Tell Express it is behind a proxy (like Railway) so it trusts the 'x-forwarded-for' header
app.set('trust proxy', 1); 

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --- SETTINGS ---
const NORMAL_ROOM = 'normal_chat'; // Everyone joins this room
const ADMIN_ROOM = 'admin_chat';   // Only admins join this room
const MAX_HISTORY = 100;
const MAX_MESSAGE_LENGTH = 256;
const BANNED_WORDS = ['hitler', 'nazi', 'swearword', 'bomb', 'kill'];
const STAFF_LIST = [
  { loginName: 'hfdskLshkdgdibIdsjfkbdAshfjhsfdshfjMdjsbfhd', displayName: 'Liam Stern' },
  { loginName: 'hfsdjDfhukdshjfkdIsjfhdsjEkfhdjSjkshjEdkfLh', displayName: 'Diesel Carter' },
  { loginName: 'hbjrhfjRnjkfdvjkIfhdCnjfkdnjKjndksdjkfjdkdy', displayName: 'Ricky Martinez' },
  { loginName: 'hdufAhudsAifhudiRsfOuidsuNfdsmklfdskfdndsjk', displayName: 'Aaron Ortega' },
  { loginName: 'dnjsDkfjdsOfjdNsfjdOksfjVkdAsnfNjdsnfjkdkfd', displayName: 'Donovan Powell' }
];

// --- STATE ---
const users = new Map();         // socket.id -> user object
const namesInUse = new Set();    // Lowercased display names
const chatHistory = {
    [NORMAL_ROOM]: [],
    [ADMIN_ROOM]: []
};
const ipBans = new Map();        // IP Address -> { until: Date, reason: string }


/**
 * Helper to determine the client IP address from the handshake headers.
 * This is crucial for environments like Railway, where a proxy is used.
 */
function getClientIp(handshake) {
    const forwarded = handshake.headers['x-forwarded-for'];

    if (forwarded) {
        // x-forwarded-for can be a comma-separated list. We want the first (client) IP.
        const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
        return ips[0].trim();
    }
    // Fallback for direct connections or environments without proxy headers
    return handshake.address;
}

// --- IP BAN MIDDLEWARE (FINAL FIX) ---
io.use((socket, next) => {
    socket.clientIp = getClientIp(socket.handshake);
    
    const ban = ipBans.get(socket.clientIp);
    if (ban && ban.until > new Date()) {
        console.log(`[BAN BLOCK] Connection blocked for IP: ${socket.clientIp} until ${ban.until.toLocaleString()}.`);
        // Terminate connection with error message
        return next(new Error(`Banned: You are banned until ${ban.until.toLocaleString()}`));
    }
    
    // Cleanup expired bans (optional, but good practice)
    if (ban && ban.until <= new Date()) {
        ipBans.delete(socket.clientIp);
    }
    
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- HELPER FUNCTIONS ---
function isNameBanned(name) {
    if (!name || name.length < 3 || name.length > 20) return true;
    const lower = name.trim().toLowerCase();
    
    if (STAFF_LIST.some(s => s.displayName.toLowerCase() === lower)) return true;
    if (BANNED_WORDS.some(b => lower.includes(b.toLowerCase()))) return true;
    
    return false;
}

function getStaffInfoByLogin(loginName) {
    return STAFF_LIST.find(s => s.loginName === loginName);
}

function getActiveUsersList(room = NORMAL_ROOM) {
    const socketsInRoom = io.sockets.adapter.rooms.get(room) || new Set();
    
    const list = Array.from(socketsInRoom)
        .map(socketId => users.get(socketId))
        .filter(user => user)
        .map(user => ({
            id: user.id,
            socketId: user.socketId,
            displayName: user.displayName,
            isAdmin: user.isAdmin,
            isAnon: user.isAnon
        }));
    
    list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return list;
}

function pushHistory(msg, room) {
  chatHistory[room].push(msg);
  if (chatHistory[room].length > MAX_HISTORY) {
    chatHistory[room].shift();
  }
}

function broadcastUserList() {
    io.to(NORMAL_ROOM).emit('user list update', getActiveUsersList(NORMAL_ROOM));
    io.to(ADMIN_ROOM).emit('admin user list update', getActiveUsersList(NORMAL_ROOM));
}

// --- SOCKET LOGIC ---
io.on('connection', socket => {
  console.log('Client connected:', socket.id, `(IP: ${socket.clientIp})`);
    
    socket.join(NORMAL_ROOM);
  socket.emit('chat history', chatHistory[NORMAL_ROOM], NORMAL_ROOM);
  broadcastUserList();

  // --- 1. NAME CHECK/LOGIN ---
  socket.on('check_staff_status', (enteredName, callback) => {
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();
    
    if (isNameBanned(name)) {
      return callback({ success: false, reason: 'banned_word_or_length' });
    }

    if (namesInUse.has(lower)) {
        const existingUser = getActiveUsersList().find(u => u.displayName.toLowerCase() === lower);
        if (existingUser && existingUser.socketId !== socket.id) {
            return callback({ success: false, reason: 'name_in_use' });
        }
    }
    
    const oldUser = users.get(socket.id);
    if (oldUser) {
        namesInUse.delete(oldUser.displayName.toLowerCase());
        users.delete(socket.id);
    }

    const staffInfo = getStaffInfoByLogin(name);
    let displayName = name;
    let isAdmin = false;

    if (staffInfo) {
      displayName = staffInfo.displayName;
      isAdmin = true;
      socket.join(ADMIN_ROOM); 
      socket.emit('chat history', chatHistory[ADMIN_ROOM], ADMIN_ROOM);
    }

    const newUser = {
        id: uuidv4(),
        socketId: socket.id,
        displayName: displayName,
        isAdmin: isAdmin,
        isAnon: false,
        currentRoom: NORMAL_ROOM
    };
    
    namesInUse.add(displayName.toLowerCase());
    users.set(socket.id, newUser);
    socket.user = newUser;

    callback({ 
        success: true, 
        displayName: newUser.displayName, 
        isAdmin: newUser.isAdmin,
        isAnon: newUser.isAnon
    });

    const joinMsg = {
        username: 'System',
        content: isAdmin ? `A moderator has entered the chat.` : `${displayName} has joined the chat.`,
        timestamp: new Date(),
        isAdmin: isAdmin,
        isSystem: true
    };
    pushHistory(joinMsg, NORMAL_ROOM);
    io.to(NORMAL_ROOM).emit('chat message', joinMsg);
    broadcastUserList();
  });

  // --- 2. CHAT MESSAGE ---
  socket.on('chat message', (msg, room) => {
    if (!socket.user || !msg.content || msg.content.length > MAX_MESSAGE_LENGTH) return;
    if (room !== NORMAL_ROOM && room !== ADMIN_ROOM) return;

    const senderName = socket.user.isAnon && socket.user.isAdmin ? 'Anonymous' : socket.user.displayName;

    const messageData = {
      username: senderName,
      content: msg.content,
      timestamp: new Date(),
      isAdmin: socket.user.isAdmin,
      isAnon: socket.user.isAnon,
      room: room
    };
    pushHistory(messageData, room);
    io.to(room).emit('chat message', messageData);
  });

  // --- 3. PRIVATE MESSAGE ---
  socket.on('private message', msg => {
    if (!socket.user || !msg.content || msg.content.length > MAX_MESSAGE_LENGTH) {
      return socket.emit('system_error', 'Invalid /msg command or message too long.');
    }
    
    const sender = socket.user.displayName;
    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();

    const targetUser = getActiveUsersList(NORMAL_ROOM).find(u => u.displayName.toLowerCase() === recipient.toLowerCase());

    if (targetUser) {
      const messageData = {
        sender: sender,
        recipient: recipient,
        content: content,
        timestamp: new Date(),
        isPrivate: true
      };
      io.to(targetUser.socketId).emit('private message', messageData);
      socket.emit('private message', messageData);
    } else {
      socket.emit('system_error', `User '${recipient}' not found or offline.`);
    }
  });
    
    // --- 4. ROOM CHANGE ---
    socket.on('change room', (newRoom) => {
        if (!socket.user || !socket.user.isAdmin || (newRoom !== NORMAL_ROOM && newRoom !== ADMIN_ROOM)) return;
        
        socket.leave(socket.user.currentRoom);
        socket.join(newRoom);
        socket.user.currentRoom = newRoom;
        
        socket.emit('room changed', newRoom);
        socket.emit('chat history', chatHistory[newRoom], newRoom);
    });

    // --- 5. RENAME (Normal and Admin) ---
    socket.on('rename', (newName, isAnon, callback) => {
        if (!socket.user) return callback({ success: false, message: 'Not logged in.' });

        const oldName = socket.user.displayName;
        const isStaffChange = socket.user.isAdmin;
        const newNameTrimmed = newName.trim();
        const newNameLower = newNameTrimmed.toLowerCase();
        
        if (newNameTrimmed.length < 3 || newNameTrimmed.length > 20) {
            return callback({ success: false, message: 'Name must be 3-20 characters.' });
        }
        if (isNameBanned(newNameTrimmed)) {
            return callback({ success: false, message: 'Name contains a banned word.' });
        }
        
        if (oldName.toLowerCase() !== newNameLower) {
            if (namesInUse.has(newNameLower)) {
                return callback({ success: false, message: 'Name is already taken.' });
            }
        }
        
        if (oldName.toLowerCase() !== newNameLower) {
            namesInUse.delete(oldName.toLowerCase());
            namesInUse.add(newNameLower);
            socket.user.displayName = newNameTrimmed;
        }
        if (isStaffChange) {
            socket.user.isAnon = isAnon;
        }
        
        callback({ success: true, newName: socket.user.displayName, isAnon: socket.user.isAnon });

        const publicMsgContent = `${oldName} has changed their name.`;
        const adminMsgContent = `[ADMIN ONLY] ${oldName} is now ${socket.user.displayName} (Anon: ${socket.user.isAnon ? 'ON' : 'OFF'}).`;

        const publicMsg = {
            username: 'System', content: publicMsgContent, timestamp: new Date(), isSystem: true, isAdmin: false, room: NORMAL_ROOM
        };
        const adminMsg = {
            username: 'System', content: adminMsgContent, timestamp: new Date(), isSystem: true, isAdmin: true, room: NORMAL_ROOM
        };
        
        io.to(NORMAL_ROOM).emit('chat message', publicMsg);
        pushHistory(publicMsg, NORMAL_ROOM);
        
        if (isStaffChange) {
            io.to(ADMIN_ROOM).emit('chat message', adminMsg);
        }

        broadcastUserList();
    });

    // --- 6. ADMIN COMMANDS ---

    // Kick User (admin only)
    socket.on('admin:kick_user', (targetDisplayName, room) => {
        if (!socket.user || !socket.user.isAdmin) return socket.emit('system_error', 'Unauthorized.');
        
        const targetLower = targetDisplayName.toLowerCase();
        const targetUser = Array.from(users.values()).find(u => u.displayName.toLowerCase() === targetLower);
        
        if (!targetUser) return socket.emit('system_error', `Kick failed: User '${targetDisplayName}' not found.`);
        if (targetUser.isAdmin) return socket.emit('system_error', `Kick failed: Cannot kick another admin.`);
        
        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (targetSocket) {
            io.to(targetUser.socketId).emit('system_error', `You have been KICKED by Moderator ${socket.user.displayName}.`);
            
            const kickMsg = {
                username: 'System',
                content: `Moderator ${socket.user.displayName} has kicked ${targetUser.displayName}.`,
                timestamp: new Date(),
                isAdmin: true,
                isSystem: true,
                room: room
            };
            pushHistory(kickMsg, room);
            io.to(room).emit('chat message', kickMsg);
            
            targetSocket.disconnect(true);
        }
    });

    // Clear history (admin only)
    socket.on('admin:clear_history', (room) => {
        if (!socket.user || !socket.user.isAdmin || (room !== NORMAL_ROOM && room !== ADMIN_ROOM)) return socket.emit('system_error', 'Unauthorized.');

        chatHistory[room].length = 0;
        
        const clearMsg = {
            username: 'System',
            content: `Moderator ${socket.user.displayName} cleared chat history in ${room === NORMAL_ROOM ? 'Normal Chat' : 'Admin Chat'}.`,
            timestamp: new Date(),
            isAdmin: true,
            isSystem: true,
            room: room
        };
        pushHistory(clearMsg, room);
        
        io.to(room).emit('admin:history_cleared', clearMsg);
    });
    
    // IP Ban User (admin only)
    socket.on('admin:ban_ip', (targetDisplayName, days, hours, minutes) => {
        if (!socket.user || !socket.user.isAdmin) return socket.emit('system_error', 'Unauthorized.');

        const targetLower = targetDisplayName.toLowerCase();
        const targetUser = Array.from(users.values()).find(u => u.displayName.toLowerCase() === targetLower);
        
        if (!targetUser) return socket.emit('system_error', `Ban failed: User '${targetDisplayName}' not found.`);
        if (targetUser.isAdmin) return socket.emit('system_error', `Ban failed: Cannot ban an admin's IP.`);

        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (!targetSocket) return socket.emit('system_error', 'Ban failed: User is already disconnected.');
        
        const targetIp = targetSocket.clientIp;
        
        const durationMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
        const banUntil = new Date(Date.now() + durationMs);
        
        if (durationMs <= 0) return socket.emit('system_error', 'Ban duration must be greater than zero.');

        ipBans.set(targetIp, { until: banUntil, reason: 'Manual Admin Ban' });
        
        io.to(targetUser.socketId).emit('system_error', `Your IP has been BANNED by Moderator ${socket.user.displayName}.`);
        targetSocket.disconnect(true);

        const banMsg = {
            username: 'System',
            content: `[ADMIN ACTION] IP Ban issued for ${targetUser.displayName} until ${banUntil.toLocaleString()}.`,
            timestamp: new Date(),
            isAdmin: true,
            isSystem: true,
            room: NORMAL_ROOM
        };
        
        io.to(ADMIN_ROOM).emit('chat message', banMsg);
        socket.emit('system_alert', `Successfully banned IP ${targetIp} until ${banUntil.toLocaleString()}.`);
    });
    
    // --- 7. DISCONNECT ---
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;

    const lower = user.displayName.toLowerCase();
    namesInUse.delete(lower);
    users.delete(socket.id);

    const leaveMsg = {
      username: 'System',
      content: `${user.displayName} has left the chat.`,
      timestamp: new Date(),
      isAdmin: user.isAdmin,
      isSystem: true,
      room: NORMAL_ROOM
    };
    pushHistory(leaveMsg, NORMAL_ROOM);
    io.to(NORMAL_ROOM).emit('chat message', leaveMsg);
    broadcastUserList();
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
