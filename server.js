// server.js
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
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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
    if (staffMember) {
        return { isAdmin: true, username: staffMember.displayName, secureName: staffMember.loginName };
    }
    return { isAdmin: false, username: secureUsername, secureName: secureUsername };
}

function addSystemMessageToHistory(content, isAdmin = false, secureName) {
    const messageData = {
        username: "System",
        content: content,
        timestamp: new Date(),
        isAdmin: isAdmin,
        secureName: secureName || null
    };
    chatHistory.push(messageData);
    while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
    return messageData;
}

function broadcastUserCount() {
    const count = namesInUse.size;
    io.emit('user count', count);
}

io.on('connection', (socket) => {
    console.log('A user connected');

    // Send history (may lack secureName for older entries)
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
            // Staff login attempt or banned
            const staffMatch = STAFF_LIST.find(s =>
                s.loginName.toLowerCase() === lowerName || s.displayName.toLowerCase() === lowerName
            );
            if (staffMatch) {
                // must login with exact loginName to succeed as staff
                if (staffMatch.loginName.toLowerCase() !== lowerName && staffMatch.displayName.toLowerCase() === lowerName) {
                    socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                    return;
                }

                const staffInfo = getStaffDisplayInfo(trimmedName);
                const staffDisplayNameLower = staffInfo.username.toLowerCase();
                namesInUse.add(staffDisplayNameLower);
                socketsMap.set(socket.id, staffDisplayNameLower);
                socket.join(STAFF_ROOM);

                const privateMsg = addSystemMessageToHistory(`Staff member ${staffInfo.username} connected.`, true, staffInfo.secureName);
                socket.to(STAFF_ROOM).emit('staff message', privateMsg);

                const publicMsg = addSystemMessageToHistory(`A moderator has entered the chat.`, true);
                io.except(STAFF_ROOM).emit('chat message', publicMsg);

                socket.emit('staff_status_update', {
                    isAdmin: true,
                    displayName: staffInfo.username,
                    secureName: staffInfo.secureName
                });
            } else {
                socket.emit('name_rejected', 'That name contains forbidden words. Please choose another name.');
                return;
            }
        } else {
            namesInUse.add(lowerName);
            socketsMap.set(socket.id, lowerName);
            socket.emit('name_accepted', trimmedName);

            const msg = {
                username: trimmedName,
                content: `${trimmedName} has joined the chat.`,
                timestamp: new Date(),
                isAdmin: false,
                secureName: trimmedName
            };
            chatHistory.push(msg);
            while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
            io.emit('chat message', msg);
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

        if (currentDisplayName) {
            namesInUse.delete(currentDisplayName.toLowerCase());
        }
        namesInUse.add(newLowerName);
        socketsMap.set(socket.id, newName);

        const successData = {
            oldDisplayName: currentDisplayName,
            newDisplayName: newName,
            newSecureName: newName,
            timestamp: new Date()
        };

        if (getStaffDisplayInfo(oldSecureName).isAdmin) {
            successData.newSecureName = oldSecureName;
            socket.emit('name_change_success', successData);

            const privateMsg = {
                username: "System",
                content: `Staff member ${currentDisplayName} changed display name to ${newName}.`,
                timestamp: new Date(),
                isAdmin: true,
                secureName: oldSecureName
            };
            socket.to(STAFF_ROOM).emit('staff message', privateMsg);
            return;
        }

        socket.emit('name_change_success', successData);
        const publicSys = {
            username: "System",
            content: `${currentDisplayName} is now known as ${newName}.`,
            timestamp: new Date(),
            isAdmin: true,
            secureName: newName
        };
        chatHistory.push(publicSys);
        while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
        io.emit('chat message', publicSys);
    });

    socket.on('chat message', (msg) => {
        if (containsBannedWord(msg.content)) {
            console.log(`MESSAGE REJECTION: Message from ${msg.username} contained a banned word.`);
            socket.emit('system_error', 'Your message contained forbidden language and was not sent.');
            return;
        }

        const staffInfo = getStaffDisplayInfo(msg.username);
        const messageData = {
            username: staffInfo.username,
            content: msg.content,
            timestamp: new Date(),
            isAdmin: staffInfo.isAdmin,
            secureName: staffInfo.secureName
        };

        chatHistory.push(messageData);
        while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
        io.emit('chat message', messageData);
    });

    socket.on('admin:clear_history', (data) => {
        const staffInfo = getStaffDisplayInfo(data.username);
        if (staffInfo.isAdmin) {
            chatHistory.length = 0;
            const staffMsgData = {
                username: staffInfo.username,
                content: `Chat history cleared by ${staffInfo.username}.`,
                timestamp: new Date(),
                secureName: staffInfo.secureName
            };
            io.to(STAFF_ROOM).emit('history_cleared_staff', staffMsgData);

            const publicMsgData = {
                username: "Moderator",
                content: "The chat history has been cleared.",
                timestamp: new Date()
            };
            io.except(STAFF_ROOM).emit('history_cleared_public', publicMsgData);

            addSystemMessageToHistory(publicMsgData.content, true);
            console.log(`History cleared by ${staffInfo.username}. Public notice sent.`);
        }
    });

    socket.on('disconnect', () => {
        const nameToRemove = socketsMap.get(socket.id);

        if (socket.rooms.has(STAFF_ROOM)) {
            const privateMsg = addSystemMessageToHistory(`Staff member ${nameToRemove} disconnected.`, true);
            io.to(STAFF_ROOM).emit('staff message', privateMsg);
        }

        if (nameToRemove) {
            namesInUse.delete(nameToRemove.toLowerCase());
            socketsMap.delete(socket.id);
            console.log(`User disconnected. Name ${nameToRemove} released.`);

            if (!socket.rooms.has(STAFF_ROOM)) {
                 const msg = {
                     username: nameToRemove,
                     content: `${nameToRemove} has left the chat.`,
                     timestamp: new Date(),
                     isAdmin: false,
                     secureName: nameToRemove
                 };
                 chatHistory.push(msg);
                 while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
                 io.emit('chat message', msg);
            }
        }
        broadcastUserCount();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
