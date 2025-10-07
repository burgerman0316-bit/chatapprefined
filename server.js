// server.js (Simplified Stable Base)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Still required for user IDs

const app = express();
// CRITICAL: Keep proxy trust for deployment environments
app.set('trust proxy', 1); 

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
    // Connection stability settings
    pingTimeout: 5000, 
    pingInterval: 15000,
});

// --- SETTINGS ---
const NORMAL_ROOM = 'normal_chat'; 
const MAX_HISTORY = 100;
const MAX_MESSAGE_LENGTH = 256;
// Only banned words for names (no staff list needed)
const BANNED_WORDS = ['hitler', 'nazi', 'swearword', 'bomb', 'kill']; 

// --- STATE ---
const users = new Map();         
const namesInUse = new Set();    
const chatHistory = {
    [NORMAL_ROOM]: []
};
// IP Bans and related middleware removed

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- HELPER FUNCTIONS ---
function isNameBanned(name) {
    if (!name || name.length < 3 || name.length > 20) return true;
    const lower = name.trim().toLowerCase();
    if (BANNED_WORDS.some(b => lower.includes(b.toLowerCase()))) return true;
    return false;
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
        }));
    
    list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return list;
}

function pushHistory(msg) {
  chatHistory[NORMAL_ROOM].push(msg);
  if (chatHistory[NORMAL_ROOM].length > MAX_HISTORY) {
    chatHistory[NORMAL_ROOM].shift();
  }
}

function broadcastUserList() {
    io.to(NORMAL_ROOM).emit('user list update', getActiveUsersList(NORMAL_ROOM));
}

// --- SOCKET LOGIC ---
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
    
    socket.join(NORMAL_ROOM);
  socket.emit('chat history', chatHistory[NORMAL_ROOM]);
  broadcastUserList();

  // --- 1. NAME CHECK/LOGIN (No staff check) ---
  socket.on('check_name_status', (enteredName, callback) => {
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

    const newUser = {
        id: uuidv4(),
        socketId: socket.id,
        displayName: name,
        isAdmin: false, // Always false
        currentRoom: NORMAL_ROOM
    };
    
    namesInUse.add(name.toLowerCase());
    users.set(socket.id, newUser);
    socket.user = newUser;

    callback({ 
        success: true, 
        displayName: newUser.displayName
    });

    const joinMsg = {
        username: 'System',
        content: `${name} has joined the chat.`,
        timestamp: new Date(),
        isSystem: true
    };
    pushHistory(joinMsg);
    io.to(NORMAL_ROOM).emit('chat message', joinMsg);
    broadcastUserList();
  });

  // --- 2. CHAT MESSAGE ---
  socket.on('chat message', msg => {
    if (!socket.user || !msg.content || msg.content.length > MAX_MESSAGE_LENGTH) return;

    const messageData = {
      username: socket.user.displayName,
      content: msg.content,
      timestamp: new Date(),
    };
    pushHistory(messageData);
    io.to(NORMAL_ROOM).emit('chat message', messageData);
  });

  // Private Message functionality retained but simplified
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
    
    // Rename functionality retained
    socket.on('rename', (newName, callback) => {
        if (!socket.user) return callback({ success: false, message: 'Not logged in.' });

        const oldName = socket.user.displayName;
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
        
        callback({ success: true, newName: socket.user.displayName });

        const renameMsg = {
            username: 'System', 
            content: `${oldName} has changed their name to ${socket.user.displayName}.`, 
            timestamp: new Date(), 
            isSystem: true
        };
        
        io.to(NORMAL_ROOM).emit('chat message', renameMsg);
        pushHistory(renameMsg);
        broadcastUserList();
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
      isSystem: true
    };
    pushHistory(leaveMsg);
    io.to(NORMAL_ROOM).emit('chat message', leaveMsg);
    broadcastUserList();
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
