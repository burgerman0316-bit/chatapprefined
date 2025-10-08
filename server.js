const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// --- Global Data Stores ---
let userList = {}; // Stores { socketId: { username: 'Name', isStaff: true } }
let messageHistory = [];
const STAFF_CODES = ['mod1', 'admin'];

// NEW: Ban lists for short-term and device bans
let bannedUsers = {}; // Stores { 'username': { expiry: timestamp, reason: 'Name Ban', admin: 'Name' } }
let bannedFingerprints = {}; // Stores { 'fingerprint_hash': { expiry: timestamp, reason: 'Device Ban', admin: 'Name' } }

// Serve static files (index.html, chat.js, style.css)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// --- Middleware to Check Bans (Crucial for short bans and device bans) ---
io.use((socket, next) => {
    const attemptingName = socket.handshake.query.name;
    const deviceFingerprint = socket.handshake.query.fingerprint;

    // --- 1. Check for Name Ban ---
    if (attemptingName && bannedUsers[attemptingName]) {
        const banExpiry = bannedUsers[attemptingName].expiry;

        if (Date.now() < banExpiry) {
            const remainingTimeSec = Math.ceil((banExpiry - Date.now()) / 1000);
            console.log(`[SERVER] Blocked banned user ${attemptingName}. ${remainingTimeSec}s remaining.`);
            return next(new Error(`Your username is banned for ${remainingTimeSec} more seconds.`));
        } else {
            // Ban expired, clear the entry
            delete bannedUsers[attemptingName];
            io.emit('system_alert', `${attemptingName}'s username ban has expired. They may now reconnect.`);
        }
    }

    // --- 2. Check for Device (Fingerprint) Ban ---
    if (deviceFingerprint && bannedFingerprints[deviceFingerprint]) {
        const banEntry = bannedFingerprints[deviceFingerprint];
        const banExpiry = banEntry.expiry;

        if (Date.now() < banExpiry) {
            const remainingTimeSec = Math.ceil((banExpiry - Date.now()) / 1000);
            console.log(`[SERVER] Blocked banned device ${deviceFingerprint}. ${remainingTimeSec}s remaining.`);
            return next(new Error(`Your device is banned for ${remainingTimeSec} more seconds.`));
        } else {
            // Ban expired, remove it
            delete bannedFingerprints[deviceFingerprint];
            io.emit('system_alert', `A device ban has expired. Affected users may now reconnect.`);
        }
    }

    // Attach the fingerprint and name to the socket for easy access later and initial name check
    socket.deviceFingerprint = deviceFingerprint;
    
    next();
});

// --- Utility Functions ---

function updateOnlineUsers() {
    const users = Object.values(userList).map(u => u.username).filter(name => name);
    // Use Set to ensure unique usernames are counted
    const uniqueUsers = Array.from(new Set(users)); 

    io.emit('user count', {
        count: uniqueUsers.length,
        userList: uniqueUsers
    });
}

function staffLogin(socket, name) {
    // Check if the name is already in use
    const existingUser = Object.values(userList).find(u => u.username === name);
    if (existingUser) {
        return socket.emit('name_in_use_modal', 'That name is already in use.');
    }
    
    // Check for staff code
    const isStaff = STAFF_CODES.includes(name.toLowerCase());

    if (isStaff) {
        socket.isStaff = true;
        const displayName = name.charAt(0).toUpperCase() + name.slice(1);
        userList[socket.id] = { username: displayName, isStaff: true };
        
        socket.emit('staff_status_update', { displayName: displayName, isAdmin: true });
        socket.broadcast.emit('system_alert', `${displayName} (STAFF) has joined the chat.`);
        console.log(`Staff ${displayName} connected.`);
    } else {
        // This case should not be reached if client logic works, but kept for safety
        socket.emit('staff_name_reserved_modal', 'Staff code invalid.');
    }
    updateOnlineUsers();
}

function handleNameAcceptance(socket, name) {
    if (Object.values(userList).some(u => u.username === name)) {
        return socket.emit('name_in_use_modal', 'That name is already in use.');
    }

    // Check if the name is a reserved staff code
    if (STAFF_CODES.includes(name.toLowerCase())) {
        return socket.emit('staff_name_reserved_modal', 'That name is reserved for staff login. Use the staff code to login.');
    }

    // Add user to list
    socket.isStaff = false;
    userList[socket.id] = { username: name, isStaff: false };
    
    // Send success
    socket.emit('name_accepted', name);
    socket.emit('chat history', messageHistory);
    socket.broadcast.emit('system_alert', `${name} has joined the chat.`);
    
    console.log(`User ${name} connected.`);
    updateOnlineUsers();
}

// --- Socket.IO Connection Handler ---
io.on('connection', (socket) => {
    // 1. Initial name check (used by staff login flow)
    socket.on('check_staff_status', (name) => {
        const isStaffAttempt = STAFF_CODES.includes(name.toLowerCase());
        
        if (isStaffAttempt) {
            staffLogin(socket, name);
        } else {
            handleNameAcceptance(socket, name);
        }
    });

    // 2. Chat Messages
    socket.on('chat message', (msg) => {
        const user = userList[socket.id];
        if (!user) return; // User not registered, ignore message

        // --- COMMANDS ---
        if (user.isStaff) {
            const content = msg.content;

            // Helper function to find the target socket by username
            const findTargetSocket = (targetName) => {
                const targetSocketId = Object.keys(userList).find(id => userList[id].username === targetName);
                return targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;
            };

            // /kick [username] command
            if (content.startsWith('/kick ')) {
                const targetName = content.split(' ')[1];
                const targetSocket = findTargetSocket(targetName);

                if (targetSocket) {
                    const kickMessage = `${targetName} was kicked by ${user.username}.`;
                    io.emit('system_alert', kickMessage);
                    targetSocket.disconnect(true);
                    console.log(kickMessage);
                } else {
                    socket.emit('system_error', `User ${targetName} not found or not currently online.`);
                }
                return;
            } 
            
            // /ban [username] [seconds] command
            if (content.startsWith('/ban ')) {
                const parts = content.split(' ');
                const targetName = parts[1];
                const durationSeconds = parseInt(parts[2], 10);
                
                if (targetName && durationSeconds && !isNaN(durationSeconds)) {
                    const targetSocket = findTargetSocket(targetName);

                    if (targetSocket) {
                        const banDurationMs = durationSeconds * 1000;
                        const banExpiry = Date.now() + banDurationMs;

                        bannedUsers[targetName] = { 
                            expiry: banExpiry, 
                            reason: 'Username Ban', 
                            admin: user.username 
                        };

                        const banMessage = `${targetName} has been banned for ${durationSeconds} seconds by ${user.username}.`;
                        io.emit('system_alert', banMessage);
                        targetSocket.emit('system_error', `You have been banned for ${durationSeconds} seconds.`);
                        targetSocket.disconnect(true);
                        
                        console.log(`User ${targetName} banned until ${new Date(banExpiry)}`);

                        setTimeout(() => {
                            if (bannedUsers[targetName]) {
                                delete bannedUsers[targetName];
                                io.emit('system_alert', `${targetName}'s username ban has expired. They may now reconnect.`);
                                console.log(`User ${targetName} unbanned.`);
                            }
                        }, banDurationMs);

                    } else {
                        socket.emit('system_error', `User ${targetName} not found or not currently online.`);
                    }
                } else {
                    socket.emit('system_error', 'Invalid /ban command. Usage: /ban [username] [seconds]');
                }
                return; 
            }

            // /deviceban [username] [seconds] command
            if (content.startsWith('/deviceban ')) {
                const parts = content.split(' ');
                const targetName = parts[1];
                const durationSeconds = parseInt(parts[2], 10);
                
                if (targetName && durationSeconds && !isNaN(durationSeconds)) {
                    const targetSocket = findTargetSocket(targetName);

                    if (targetSocket && targetSocket.deviceFingerprint) {
                        const fingerprint = targetSocket.deviceFingerprint;
                        const banDurationMs = durationSeconds * 1000;
                        const banExpiry = Date.now() + banDurationMs;

                        bannedFingerprints[fingerprint] = { 
                            expiry: banExpiry, 
                            reason: 'Device Ban', 
                            admin: user.username 
                        };

                        const banMessage = `${targetName}'s device has been banned for ${durationSeconds} seconds by ${user.username}.`;
                        io.emit('system_alert', banMessage);
                        targetSocket.emit('system_error', `Your device has been banned for ${durationSeconds} seconds.`);
                        targetSocket.disconnect(true);
                        
                        console.log(`Device ${fingerprint} banned until ${new Date(banExpiry)}`);

                        setTimeout(() => {
                            if (bannedFingerprints[fingerprint]) {
                                 delete bannedFingerprints[fingerprint];
                                 io.emit('system_alert', `A device ban has expired. Affected users may now reconnect.`);
                            }
                        }, banDurationMs);

                    } else {
                        socket.emit('system_error', `User ${targetName} not found or their device ID is missing.`);
                    }
                } else {
                    socket.emit('system_error', 'Invalid /deviceban command. Usage: /deviceban [username] [seconds]');
                }
                return; 
            }

            // Admin command was used, and none of the above matched, ignore the message.
            if (content.startsWith('/')) {
                return;
            }
        }
        
        // --- REGULAR MESSAGE LOGIC ---
        
        const timestamp = new Date().getTime();
        const fullMsg = {
            username: user.username,
            content: msg.content,
            timestamp: timestamp
        };
        
        messageHistory.push(fullMsg);
        if (messageHistory.length > 50) messageHistory.shift(); 
        
        io.emit('chat message', fullMsg);
        console.log(`${user.username}: ${msg.content}`);
    });

    // 3. Private Messages
    socket.on('private message', (msg) => {
        const sender = userList[socket.id];
        if (!sender) return;

        // Find the socket ID of the recipient
        const recipientSocketId = Object.keys(userList).find(id => userList[id].username === msg.recipient);

        const timestamp = new Date().getTime();
        const fullMsg = {
            sender: sender.username,
            recipient: msg.recipient,
            content: msg.content,
            isPrivate: true,
            timestamp: timestamp
        };

        // Send to recipient
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private message', fullMsg);
        } else {
            socket.emit('system_error', `User ${msg.recipient} not found or not online.`);
        }
        
        // Send a copy back to the sender
        socket.emit('private message', fullMsg);
    });

    // 4. Admin Clear History
    socket.on('admin:clear_history', (data) => {
        if (!userList[socket.id] || !userList[socket.id].isStaff) {
            return socket.emit('system_error', 'Permission denied.');
        }
        
        messageHistory = [];
        const clearMsg = {
            username: 'System', 
            content: `Chat history cleared by ${data.username}.`, 
            timestamp: new Date().getTime()
        };
        messageHistory.push(clearMsg);
        
        io.emit('admin:history_cleared', clearMsg);
        console.log(`Chat history cleared by ${data.username}.`);
    });

    // 5. Disconnect
    socket.on('disconnect', () => {
        const user = userList[socket.id];
        if (user) {
            delete userList[socket.id];
            
            if (user.isStaff) {
                io.emit('system_alert', `${user.username} (STAFF) has left the chat.`);
                console.log(`Staff ${user.username} disconnected.`);
            } else {
                io.emit('system_alert', `${user.username} has left the chat.`);
                console.log(`User ${user.username} disconnected.`);
            }
            updateOnlineUsers();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Chat server running on http://localhost:${PORT}`);
});
