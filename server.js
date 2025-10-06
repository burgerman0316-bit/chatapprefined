const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Settings
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler', 'admin', 'mod'];
const STAFF_LIST = [
    { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
    { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
    { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();    // socket.id → displayName
const usernamesMap = new Map();  // displayName.toLowerCase() → socket.id
const bannedUsers = new Set();
const hwBannedUsers = new Set();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Helper
function isNameReserved(name) {
    const lower = name.trim().toLowerCase();
    return BANNED_NAMES.some(b => lower.includes(b.toLowerCase())) ||
           STAFF_LIST.some(s => s.loginName.toLowerCase() === lower || s.displayName.toLowerCase() === lower);
}

function getStaffDisplayInfo(name) {
    const secure = name.trim();
    const staff = STAFF_LIST.find(s => s.loginName === secure || s.displayName.toLowerCase() === secure.toLowerCase());
    if (staff) return { isAdmin: true, username: staff.displayName, secureName: staff.loginName };
    return { isAdmin: false, username: secure, secureName: secure };
}

function pushHistory(msg) {
    chatHistory.push(msg);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount() {
    const list = Array.from(socketsMap.values()).sort();
    io.emit('user count', { count: namesInUse.size, userList: list });
}

// Socket logic
io.on('connection', socket => {
    console.log('Client connected:', socket.id);
    socket.emit('chat history', chatHistory);
    broadcastUserCount();

    // Request user list for DM modal
    socket.on('request_user_list', () => {
        socket.emit('user_list', Array.from(usernamesMap.values()));
    });

    // Name check
    socket.on('check_staff_status', enteredName => {
        const name = (enteredName || '').trim();
        const lower = name.toLowerCase();
        if (!name) {
            socket.emit('name_rejected', 'Please enter a name.');
            return;
        }
        if (namesInUse.has(lower)) {
            socket.emit('name_rejected', 'Someone is already using that name.');
            return;
        }
        if (isNameReserved(name)) {
            socket.emit('name_rejected', 'This name is reserved for staff.');
            return;
        }
        if (bannedUsers.has(lower)) {
            socket.emit('name_rejected', 'You are banned from this chat.');
            return;
        }

        // Accept normal user
        namesInUse.add(lower);
        socketsMap.set(socket.id, name);
        usernamesMap.set(lower, socket.id);
        socket.emit('name_accepted', name);

        const joinMsg = { username: name, content: `${name} has joined the chat.`, timestamp: new Date(), isSystem: true };
        pushHistory(joinMsg);
        io.emit('chat message', joinMsg);
        broadcastUserCount();
    });

    // Public chat
    socket.on('chat message', msg => {
        if (!msg.content) return;
        const info = getStaffDisplayInfo(msg.username);
        const messageData = { username: info.username, content: msg.content, timestamp: new Date(), isAdmin: info.isAdmin };
        pushHistory(messageData);
        io.emit('chat message', messageData);
    });

    // Private chat
    socket.on('private message', msg => {
        const sender = socketsMap.get(socket.id);
        if (!sender) return socket.emit('system_error', 'Set a name first.');
        const recipient = (msg.recipient || '').trim();
        const content = (msg.content || '').trim();
        if (!recipient || !content) return socket.emit('system_error', 'Invalid /msg command.');

        const recSocketId = usernamesMap.get(recipient.toLowerCase());
        if (recSocketId) {
            const messageData = { sender, recipient, content, timestamp: new Date(), isPrivate: true };
            io.to(recSocketId).emit('private message', messageData);
            socket.emit('private message', messageData); // copy to sender
        } else {
            socket.emit('system_error', `User '${recipient}' not found.`);
        }
    });

    // Admin clear history
    socket.on('admin:clear_history', data => {
        const info = getStaffDisplayInfo(data.username);
        if (!info.isAdmin) return socket.emit('system_error', 'Admin privileges required.');
        chatHistory.length = 0;
        const clearMsg = { username: 'System', content: `Moderator ${info.username} cleared chat history.`, timestamp: new Date(), isSystem: true };
        pushHistory(clearMsg);
        io.emit('chat history', chatHistory);
    });

    // Admin ban user
    socket.on('admin:ban_user', data => {
        const info = getStaffDisplayInfo(data.username);
        if (!info.isAdmin) return socket.emit('system_error', 'Admin privileges required.');
        const target = (data.target || '').trim();
        if (!target) return;
        bannedUsers.add(target.toLowerCase());
        const leaveMsg = { username: 'System', content: `${target} has been banned by admin.`, timestamp: new Date(), isSystem: true };
        pushHistory(leaveMsg);
        io.emit('chat message', leaveMsg);
        const targetSocketId = usernamesMap.get(target.toLowerCase());
        if (targetSocketId) io.to(targetSocketId).disconnect(true);
    });

    // Admin hardware ban
    socket.on('admin:hw_ban_user', data => {
        const info = getStaffDisplayInfo(data.username);
        if (!info.isAdmin) return socket.emit('system_error', 'Admin privileges required.');
        const target = (data.target || '').trim();
        if (!target) return;
        hwBannedUsers.add(target.toLowerCase());
        const leaveMsg = { username: 'System', content: `${target} has been hardware banned by admin.`, timestamp: new Date(), isSystem: true };
        pushHistory(leaveMsg);
        io.emit('chat message', leaveMsg);
        const targetSocketId = usernamesMap.get(target.toLowerCase());
        if (targetSocketId) io.to(targetSocketId).disconnect(true);
    });

    // Disconnect
    socket.on('disconnect', () => {
        const name = socketsMap.get(socket.id);
        if (!name) return;
        const lower = name.toLowerCase();
        namesInUse.delete(lower);
        usernamesMap.delete(lower);
        socketsMap.delete(socket.id);
        const leaveMsg = { username: 'System', content: `${name} has left the chat.`, timestamp: new Date(), isSystem: true };
        pushHistory(leaveMsg);
        io.emit('chat message', leaveMsg);
        broadcastUserCount();
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
