const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// ======================================================
// 1. CONFIGURATION 
// ======================================================
const STAFF_ROOM = 'staff_room';
const MAX_HISTORY = 100;

const BANNED_NAMES = [
    "hitler",
    "admin",
    "mod",
    "foulword1",
    "foulword2",
];

const STAFF_LIST = [
    { loginName: "STAFF_CONTROLS-LIAM", displayName: "Liam Stern" },
    { loginName: "STAFF_CONTROLS-DIESEL", displayName: "Diesel Carter" },
    { loginName: "STAFF_CONTROLS-RICKY", displayName: "Ricky Martinez" },
    { loginName: "STAFF_CONTROLS-AARON", displayName: "Aaron Ortega" },
    { loginName: "STAFF_CONTROLS-DONOVAN", displayName: "Donovan Powell" }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================================================
// 2. HELPERS
// ======================================================
function isNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim().toLowerCase();
    for (const bannedWord of BANNED_NAMES) {
        if (checkName.includes(bannedWord.toLowerCase())) return true;
    }
    return STAFF_LIST.some(staff =>
        staff.loginName.toLowerCase() === checkName ||
        staff.displayName.toLowerCase() === checkName
    );
}

function containsBannedWord(content) {
    const lowerContent = content.toLowerCase();
    for (const bannedWord of BANNED_NAMES) {
        if (lowerContent.includes(bannedWord.toLowerCase())) return true;
    }
    return false;
}

function getStaffDisplayInfo(enteredUsername) {
    const secureUsername = enteredUsername.trim();
    const staffMember = STAFF_LIST.find(staff => staff.loginName === secureUsername);
    if (staffMember) return { isAdmin: true, username: staffMember.displayName };
    return { isAdmin: false, username: secureUsername };
}

function addSystemMessageToHistory(content, isAdmin = false) {
    const messageData = {
        username: "System",
        content: content,
        timestamp: new Date(),
        isAdmin: isAdmin
    };
    chatHistory.push(messageData);
    while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
    return messageData;
}

function broadcastUserCount() {
    const count = namesInUse.size;
    io.emit('user count', count);
}

// ======================================================
// 3. SOCKET.IO
// ======================================================
io.on('connection', (socket) => {
    console.log('A user connected', socket.id);

    socket.emit('chat history', chatHistory);
    broadcastUserCount();

    socket.on('check_staff_status', (enteredName) => {
        const trimmedName = enteredName.trim();
        const lowerName = trimmedName.toLowerCase();

        if (namesInUse.has(lowerName)) {
            socket.emit('name_rejected', 'That name is already in use. Please choose another name.');
            return;
        }

        if (isNameReserved(trimmedName)) {
            if (STAFF_LIST.some(staff => staff.loginName.toLowerCase() === lowerName || staff.displayName.toLowerCase() === lowerName)) {
                const staffInfo = getStaffDisplayInfo(trimmedName);
                if (!staffInfo.isAdmin) {
                    socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                    return;
                }

                const staffDisplayNameLower = staffInfo.username.toLowerCase();
                namesInUse.add(staffDisplayNameLower);
                socketsMap.set(socket.id, staffDisplayNameLower);
                socket.join(STAFF_ROOM);

                const privateMsg = addSystemMessageToHistory(`Staff member ${staffInfo.username} connected.`, true);
                socket.to(STAFF_ROOM).emit('staff message', privateMsg);

                const publicMsg = { username: "Moderator", content: "A moderator has entered the chat.", timestamp: new Date(), isAdmin: true };
                chatHistory.push(publicMsg);
                while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
                io.except(STAFF_ROOM).emit('chat message', publicMsg);

                socket.emit('staff_status_update', {
                    isAdmin: true,
                    displayName: staffInfo.username,
                    secureName: trimmedName
                });

            } else {
                socket.emit('name_rejected', 'That name contains forbidden words. Please choose another name.');
                return;
            }
        } else {
            namesInUse.add(lowerName);
            socketsMap.set(socket.id, lowerName);
            socket.emit('name_accepted', trimmedName);

            const publicMsg = { username: trimmedName, content: `${trimmedName} has joined the chat.`, timestamp: new Date(), isAdmin: false };
            chatHistory.push(publicMsg);
            while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
            io.emit('chat message', publicMsg);
        }

        broadcastUserCount();
    });

    socket.on('name_change_request', (data) => {
        const oldSecureName = data.oldName.trim();
        const newName = data.newName.trim();
        const newLowerName = newName.toLowerCase();
        const currentDisplayName = socketsMap.get(socket.id);

        if (!newName || newName === currentDisplayName) {
            socket.emit('name_change_failed', 'A valid, different name is required.');
            return;
        }
        if (isNameReserved(newName)) {
            socket.emit('name_change_failed', 'That name is reserved or contains forbidden words.');
            return;
        }
        if (namesInUse.has(newLowerName)) {
            socket.emit('name_change_failed', 'That name is already taken.');
            return;
        }

        if (currentDisplayName) names
