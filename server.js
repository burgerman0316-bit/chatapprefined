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
    "liam", 
    "diesel",
    "ricky", 
    "aaron",
    "donovan",
    // ADD ALL YOUR BANNED NAMES OR WORDS HERE
];

const STAFF_LIST = [
    {  loginName: "STAFF_CONTROLS-LIAM", displayName: "Liam Stern" },
    {  loginName: "STAFF_CONTROLS-DIESEL", displayName: "Diesel Carter" },
    {  loginName: "STAFF_CONTROLS-RICKY", displayName: "Ricky Martinez" },
    {  loginName: "STAFF_CONTROLS-AARON", displayName: "Aaron Ortega" },
    {  loginName: "STAFF_CONTROLS-DONOVAN", displayName: "Donovan Powell" }
    // ADD ALL YOUR STAFF MEMBERS HERE
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map(); 

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ======================================================
// 2. HELPER FUNCTIONS
// ======================================================

/**
 * Checks if the entered name is reserved or contains a banned word (SUBSTRING MATCH).
 */
function isNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim().toLowerCase();

    // 1. Check against BANNED_NAMES (SUBSTRING CONTAINMENT)
    for (const bannedWord of BANNED_NAMES) {
        if (checkName.includes(bannedWord.toLowerCase())) {
            return true;
        }
    }

    // 2. Check against Staff Names (EXACT MATCH)
    return STAFF_LIST.some(staff => 
        staff.loginName.toLowerCase() === checkName || 
        staff.displayName.toLowerCase() === checkName
    );
}

/**
 * Checks if the message content contains any word from the BANNED_NAMES list.
 */
function containsBannedWord(content) {
    const lowerContent = content.toLowerCase();
    
    for (const bannedWord of BANNED_NAMES) {
        if (lowerContent.includes(bannedWord.toLowerCase())) {
            return true;
        }
    }
    return false;
}

function getStaffDisplayInfo(enteredUsername) {
    const secureUsername = enteredUsername.trim();
    
    const staffMember = STAFF_LIST.find(staff => staff.loginName === secureUsername);

    if (staffMember) {
        return { isAdmin: true, username: staffMember.displayName };
    }
    
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
    while (chatHistory.length > MAX_HISTORY) {
        chatHistory.shift();
    }
    return messageData;
}

/**
 * NEW FUNCTION: Gets the count of currently connected sockets and sends it to all clients.
 */
function broadcastUserCount() {
    // io.engine.clientsCount is the official way to get the count
    const count = io.engine.clientsCount;
    io.emit('user count', count);
}


// ======================================================
// 3. SOCKET.IO CONNECTION HANDLING
// ======================================================

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.emit('chat history', chatHistory);
    // NEW: Send the initial count when a client connects
    broadcastUserCount();

    // NAME VALIDATION AND STAFF CHECK
    socket.on('check_staff_status', (enteredName) => {
        const trimmedName = enteredName.trim();
        const lowerName = trimmedName.toLowerCase();

        if (namesInUse.has(lowerName)) {
            socket.emit('name_rejected', 'That name is already in use. Please choose another name.');
            return;
        }

        // Check for banned words (substring match)
        if (isNameReserved(trimmedName)) {
            // Check if it's reserved by staff (requires correct loginName for success)
            if (STAFF_LIST.some(staff => staff.loginName.toLowerCase() === lowerName || staff.displayName.toLowerCase() === lowerName)) {
                const staffInfo = getStaffDisplayInfo(trimmedName);
                if (!staffInfo.isAdmin) {
                    socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                    return;
                }
                
                // Staff login success logic...
                const staffDisplayNameLower = staffInfo.username.toLowerCase();
                namesInUse.add(staffDisplayNameLower);
                socketsMap.set(socket.id, staffDisplayNameLower);
                socket.join(STAFF_ROOM);
                const privateMsg = addSystemMessageToHistory(`Staff member ${staffInfo.username} connected.`, true);
                socket.to(STAFF_ROOM).emit('staff message', privateMsg); 
                
                socket.emit('staff_status_update', {
                    isAdmin: true,
                    displayName: staffInfo.username,
                    secureName: trimmedName
                });
            } else {
                // Name is rejected because it contains a banned word
                 socket.emit('name_rejected', 'That name contains forbidden words. Please choose another name.');
                return;
            }
        } else {
            // Regular user login success:
            namesInUse.add(lowerName);
            socketsMap.set(socket.id, lowerName);
            socket.emit('name_accepted', trimmedName);
            
            const msg = addSystemMessageToHistory(`${trimmedName} has joined the chat.`);
            io.emit('chat message', msg); 
        }
    });

    // PUBLIC MESSAGE HANDLING
    socket.on('chat message', (msg) => {
        
        // CRITICAL FIX: MESSAGE CONTENT FILTERING
        if (containsBannedWord(msg.content)) {
            console.log(`MESSAGE REJECTION: Message from ${msg.username} contained a banned word.`);
            socket.emit('system_error', 'Your message contained forbidden language and was not sent.');
            return;
        }

        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // ... (rest of security and history logic)

        const messageData = {
            username: staffInfo.username,
            content: msg.content,
            timestamp: new Date(),
            isAdmin: staffInfo.isAdmin
        };
        
        chatHistory.push(messageData);
        while (chatHistory.length > MAX_HISTORY) {
            chatHistory.shift();
        }

        io.emit('chat message', messageData);
    });

    // ... (staff message handling and admin controls remain the same)
    
    // USER DISCONNECTION
    socket.on('disconnect', () => {
        const nameToRemove = socketsMap.get(socket.id);
        
        if (socket.rooms.has(STAFF_ROOM)) {
            const privateMsg = addSystemMessageToHistory(`Staff member ${nameToRemove} disconnected.`, true);
            io.to(STAFF_ROOM).emit('staff message', privateMsg); 
        }
        
        if (nameToRemove) {
            namesInUse.delete(nameToRemove);
            socketsMap.delete(socket.id);
            console.log(`User disconnected. Name ${nameToRemove} released.`);
            
            if (!socket.rooms.has(STAFF_ROOM)) {
                 const msg = addSystemMessageToHistory(`${nameToRemove} has left the chat.`);
                 io.emit('chat message', msg);
            }
        }
        
        // NEW: Broadcast the updated count when a client disconnects
        broadcastUserCount();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
