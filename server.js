const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// -------------------- SETTINGS --------------------
const MAX_HISTORY = 100;
const STAFF_LIST = [
    { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
    { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
    { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

let chatHistory = [];
let socketsMap = new Map();    // socket.id → username
let usernamesMap = new Map();  // username.toLowerCase() → socket.id
let bannedUsers = new Set();   // Lowercase username bans

// -------------------- STATIC FILES --------------------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------- HELPERS --------------------
function pushHistory(msg) {
    chatHistory.push(msg);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function getStaffInfo(name) {
    return STAFF_LIST.find(s => s.loginName.toLowerCase() === name.toLowerCase());
}

function getUserList() {
    return Array.from(usernamesMap.values()).sort();
}

// -------------------- SOCKET.IO --------------------
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send existing chat history
    socket.emit('chat message', chatHistory);
    
    // -------------------- NAME CHECK --------------------
    socket.on('check_name', (name) => {
        const trimmed = name.trim();
        const lower = trimmed.toLowerCase();

        if (!trimmed) {
            socket.emit('name_rejected', 'Please enter a name.');
            return;
        }

        if (bannedUsers.has(lower)) {
            socket.emit('name_rejected', 'You are banned.');
            return;
        }

        if (usernamesMap.has(lower)) {
            socket.emit('name_rejected', 'That username is already in use.');
            return;
        }

        const staff = getStaffInfo(trimmed);
        if (staff && !trimmed.startsWith('STAFF_CONTROLS-')) {
            socket.emit('name_rejected', `The name "${trimmed}" is reserved for staff.`);
            return;
        }

        // All good
        socketsMap.set(socket.id, trimmed);
        usernamesMap.set(lower, socket.id);

        if (staff) {
            socket.emit('name_accepted', staff.displayName);
        } else {
            socket.emit('name_accepted', trimmed);
        }

        const joinMsg = {
            sender: 'System',
            content: `${trimmed} has joined the chat.`,
            timestamp: new Date(),
            isSystem: true
        };
        pushHistory(joinMsg);
        io.emit('chat message', joinMsg);
    });

    // -------------------- PUBLIC MESSAGE --------------------
    socket.on('chat message', (msg) => {
        const sender = socketsMap.get(socket.id);
        if (!sender) return;

        const messageData = {
            sender: sender,
            content: msg.content,
            timestamp: new Date(),
            isAdmin: STAFF_LIST.some(s => s.displayName === sender),
        };

        pushHistory(messageData);
        io.emit('chat message', messageData);
    });

    // -------------------- PRIVATE MESSAGE --------------------
    socket.on('private message', (msg) => {
        const sender = socketsMap.get(socket.id);
        if (!sender) return;

        const recipient = msg.recipient.trim();
        const recipientSocketId = usernamesMap.get(recipient.toLowerCase());

        if (!recipientSocketId) {
            socket.emit('chat message', {
                sender: 'System',
                content: `User '${recipient}' not found or offline.`,
                timestamp: new Date(),
                isSystem: true
            });
            return;
        }

        const messageData = {
            sender: sender,
            recipient: recipient,
            content: msg.content,
            timestamp: new Date(),
            isPrivate: true
        };

        socket.to(recipientSocketId).emit('private message', messageData);
        socket.emit('private message', messageData);
    });

    // -------------------- REQUEST USER LIST --------------------
    socket.on('request_user_list', () => {
        const users = getUserList();
        socket.emit('user list', users);
    });

    socket.on('request_user_list_admin', () => {
        const users = getUserList();
        socket.emit('user list', users);
    });

    // -------------------- ADMIN CLEAR HISTORY --------------------
    socket.on('admin:clear_history', (data) => {
        const sender = socketsMap.get(socket.id);
        const staff = getStaffInfo(sender);

        if (!staff) {
            socket.emit('chat message', { sender: 'System', content: 'Unauthorized', timestamp: new Date(), isSystem: true });
            return;
        }

        chatHistory = [];
        io.emit('chat message', { sender: 'System', content: 'Chat history cleared by admin.', timestamp: new Date(), isSystem: true });
    });

    // -------------------- DISCONNECT --------------------
    socket.on('disconnect', () => {
        const user = socketsMap.get(socket.id);
        if (!user) return;

        socketsMap.delete(socket.id);
        usernamesMap.delete(user.toLowerCase());

        const leaveMsg = {
            sender: 'System',
            content: `${user} has left the chat.`,
            timestamp: new Date(),
            isSystem: true
        };
        pushHistory(leaveMsg);
        io.emit('chat message', leaveMsg);
    });
});

// -------------------- SERVER --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
