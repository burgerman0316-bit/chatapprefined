// server.js
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// *** FIX 1: Add CORS to handle cross-origin deployment ***
const io = new Server(server, {
    cors: {
        origin: "*", // Allows all origins to connect (necessary for Railway/external deployment)
        methods: ["GET", "POST"]
    }
});

// =========================================================================
// GLOBAL STATE MANAGEMENT
// =========================================================================

const activeUsers = {};
const reservedNames = ['System', 'Admin', 'Mod'];
const initialModName = 'AdminUser'; 

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

function getClientUserList() {
    return Object.keys(activeUsers).map(id => ({
        id: id,
        username: activeUsers[id].username,
        isMod: activeUsers[id].isMod
    }));
}

function validateUsername(name) {
    if (!name || name.length < 3 || name.length > 20) {
        return { success: false, message: 'Name must be 3-20 characters.' };
    }
    if (reservedNames.includes(name)) {
        return { success: false, message: 'That name is reserved.' };
    }
    const isTaken = Object.values(activeUsers).some(user => user.username.toLowerCase() === name.toLowerCase());
    if (isTaken) {
        return { success: false, message: 'That name is already taken.' };
    }
    return { success: true };
}

function broadcastUserList() {
    io.emit('user list update', getClientUserList());
}

function broadcastSystemMessage(msg) {
    io.emit('system message', msg);
}

// =========================================================================
// EXPRESS/STATIC FILES SETUP
// =========================================================================

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// =========================================================================
// SOCKET.IO CONNECTION HANDLER
// =========================================================================

io.on('connection', (socket) => {
    
    // --- 1. NEW USER LOGIN ---
    socket.on('new user', (requestedName, callback) => {
        const validation = validateUsername(requestedName);

        if (!validation.success) {
            return callback({ success: false, message: validation.message });
        }

        const isInitialMod = requestedName === initialModName;
        
        socket.username = requestedName;
        socket.isMod = isInitialMod;

        activeUsers[socket.id] = {
            username: requestedName,
            isMod: isInitialMod
        };

        callback({ 
            success: true, 
            username: requestedName, 
            isMod: isInitialMod 
        });

        broadcastSystemMessage(`${socket.username} has joined the chat!`);
        broadcastUserList();
    });

    // --- 2. CHAT MESSAGE ---
    socket.on('chat message', (msg) => {
        if (socket.username) {
            io.emit('chat message', {
                username: socket.username,
                msg: msg,
                time: new Date().toLocaleTimeString() 
            });
        }
    });

    // --- 3. RENAME FEATURE ---
    socket.on('rename', (newName, callback) => {
        const oldName = socket.username;
        const validation = validateUsername(newName);

        if (!validation.success) {
            return callback({ success: false, message: validation.message });
        }
        
        socket.username = newName;
        activeUsers[socket.id].username = newName;

        broadcastSystemMessage(`${oldName} is now known as ${newName}.`);
        broadcastUserList();

        callback({ success: true, username: newName });
    });

    // --- 4. ADMIN: KICK USER ---
    socket.on('kick user', (targetSocketId, callback) => {
        if (!socket.isMod) return callback(false);

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket || !targetSocket.username || targetSocket.isMod) {
            return callback(false);
        }
        
        broadcastSystemMessage(`${socket.username} (Mod) kicked ${targetSocket.username}.`);
        targetSocket.emit('kicked');
        targetSocket.disconnect(true);
        
        callback(true);
    });

    // --- 5. ADMIN: CLEAR HISTORY ---
    socket.on('clear history', () => {
        if (!socket.isMod) return;
        
        io.emit('clear messages');
        broadcastSystemMessage(`${socket.username} (Mod) cleared the chat history.`);
    });

    // --- 6. USER DISCONNECT ---
    socket.on('disconnect', () => {
        if (socket.username) {
            delete activeUsers[socket.id];
            broadcastSystemMessage(`${socket.username} has left the chat.`);
            broadcastUserList();
        }
    });
});

// =========================================================================
// START SERVER
// =========================================================================

// *** FIX 2: Use the PORT environment variable for deployment ***
const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => {
    console.log(`Chat server running at http://localhost:${PORT}`);
    console.log(`Initial Mod Name: ${initialModName}`);
});
