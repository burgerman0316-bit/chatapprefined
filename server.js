const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
// FIX: Enable CORS to prevent browser connection errors
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// ======================================================
// 1. CONFIGURATION 
// ======================================================
const STAFF_ROOM = 'staff_room'; // Staff chat channel
const MAX_HISTORY = 100;

// --- BANNED NAMES/WORDS LIST (Substrings are banned) ---
const BANNED_NAMES = [
    "hitler", 
    "admin", 
    "mod",
    "foulword1", 
    "foulword2", 
    // ADD ALL YOUR BANNED NAMES OR WORDS HERE (They will be checked case-insensitively)
];

const STAFF_LIST = [
    {  
        loginName: "STAFF_CONTROLS-LIAM", 
        displayName: "Liam Stern"    
    },
    {  
        loginName: "STAFF_CONTROLS-DIESEL",
        displayName: "Diesel Carter"
    },
    {  
        loginName: "STAFF_CONTROLS-RICKY",
        displayName: "Ricky Martinez"
    },
    {  
        loginName: "STAFF_CONTROLS-AARON",
        displayName: "Aaron Ortega"
    },{  
        loginName: "STAFF_CONTROLS-DONOVAN",
        displayName: "Donovan Powell"
    }
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
 * Checks if the entered name is reserved either by staff or because it 
 * contains a banned word.
 * This is the function updated to check for substrings in banned names.
 */
function isNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim().toLowerCase();

    // 1. Check against BANNED_NAMES (SUBSTRING CONTAINMENT)
    for (const bannedWord of BANNED_NAMES) {
        // If the entered name CONTAINS the banned word, reject it
        if (checkName.includes(bannedWord.toLowerCase())) {
            console.log(`REJECTION: Name "${enteredUsername}" contains banned word: "${bannedWord}"`);
            return true;
        }
    }

    // 2. Check against Staff Names (EXACT MATCH)
    return STAFF_LIST.some(staff => 
        staff.loginName.toLowerCase() === checkName || 
        staff.displayName.toLowerCase() === checkName
    );
}


function getStaffDisplayInfo(enteredUsername) {
    const secureUsername = enteredUsername.trim();
    
    const staffMember = STAFF_LIST.find(staff => 
        staff.loginName === secureUsername
    );

    if (staffMember) {
        return {
            isAdmin: true,
            username: staffMember.displayName
        };
    }
    
    return {
        isAdmin: false,
        username: secureUsername
    };
}

/**
 * Adds a system-generated message to the chat history.
 */
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


// ======================================================
// 3. SOCKET.IO CONNECTION HANDLING
// ======================================================

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.emit('chat history', chatHistory);

    // NAME VALIDATION AND STAFF CHECK
    socket.on('check_staff_status', (enteredName) => {
        const trimmedName = enteredName.trim();
        const lowerName = trimmedName.toLowerCase();

        // 1. Check if name is already in use
        if (namesInUse.has(lowerName)) {
            socket.emit('name_rejected', 'That name is already in use. Please choose another name.');
            return;
        }

        // 2. Check for banned words (substring match)
        for (const bannedWord of BANNED_NAMES) {
            if (lowerName.includes(bannedWord.toLowerCase())) {
                socket.emit('name_rejected', 'That name contains forbidden words. Please choose another name.');
                return;
            }
        }

        // 3. Check for staff/reserved names
        // We use the simpler STAFF_LIST check here since banned names are already filtered above
        if (STAFF_LIST.some(staff => staff.loginName.toLowerCase() === lowerName || staff.displayName.toLowerCase() === lowerName)) {
            const staffInfo = getStaffDisplayInfo(trimmedName);
            
            // If the name matches a staff member's display name or an incorrect loginName
            if (!staffInfo.isAdmin) { 
                socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                return;
            }
            
            // Staff login success:
            const staffDisplayNameLower = staffInfo.username.toLowerCase();
            namesInUse.add(staffDisplayNameLower);
            socketsMap.set(socket.id, staffDisplayNameLower);
            
            // 1. Join the private staff room
            socket.join(STAFF_ROOM); 

            // 2. Broadcast private connection message to only the staff room
            const privateMsg = addSystemMessageToHistory(`Staff member ${staffInfo.username} connected.`, true);
            socket.to(STAFF_ROOM).emit('staff message', privateMsg); 
            
            // 3. Emit the public status update to the client
            socket.emit('staff_status_update', {
                isAdmin: true,
                displayName: staffInfo.username,
                secureName: trimmedName
            });
            
        } else {
            // Regular user login success:
            namesInUse.add(lowerName);
            socketsMap.set(socket.id, lowerName);
            socket.emit('name_accepted', trimmedName);
            
            // Save and broadcast the public "joined the chat" message
            const msg = addSystemMessageToHistory(`${trimmedName} has joined the chat.`);
            io.emit('chat message', msg); 
        }
    });

    // PUBLIC MESSAGE HANDLING
    socket.on('chat message', (msg) => {
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // Security Check: If a non-staff user tries to send a message using a reserved staff name
        if (!staffInfo.isAdmin && STAFF_LIST.some(staff => staff.loginName === msg.username)) {
            console.log(`SECURITY REJECTION: Non-staff user tried to send message as reserved name: ${msg.username}`);
            return; 
        }

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

    // NEW: STAFF MESSAGE HANDLING (Private Chat)
    socket.on('staff message', (msg) => { 
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // Security Check: Must be a staff member and in the staff room
        if (!staffInfo.isAdmin || !socket.rooms.has(STAFF_ROOM)) {
            console.log(`SECURITY REJECTION: Non-staff user tried to send staff message: ${msg.username}`);
            return;
        }

        const messageData = {
            username: staffInfo.username,
            content: msg.content,
            timestamp: new Date(),
            isAdmin: true 
        };

        // Send the message only to the staff room
        io.to(STAFF_ROOM).emit('staff message', messageData);
    });

    // ADMIN CONTROL HANDLING
    socket.on('admin:clear_history', (data) => {
        const staffInfo = getStaffDisplayInfo(data.username);
        
        if (staffInfo.isAdmin) {
            chatHistory.length = 0;
            
            const msg = addSystemMessageToHistory(`Chat history cleared by ${staffInfo.username}.`, true);
            
            io.emit('history_cleared', {
                username: staffInfo.username,
                timestamp: msg.timestamp
            });
        }
    });

    // USER DISCONNECTION
    socket.on('disconnect', () => {
        const nameToRemove = socketsMap.get(socket.id);
        
        if (socket.rooms.has(STAFF_ROOM)) {
            // Broadcast private disconnection message to remaining staff
            const privateMsg = addSystemMessageToHistory(`Staff member ${nameToRemove} disconnected.`, true);
            io.to(STAFF_ROOM).emit('staff message', privateMsg); 
        }
        
        if (nameToRemove) {
            namesInUse.delete(nameToRemove);
            socketsMap.delete(socket.id);
            console.log(`User disconnected. Name ${nameToRemove} released.`);
            
            // Announce public disconnection only if they were not staff (staff announcements are private)
            if (!socket.rooms.has(STAFF_ROOM)) {
                 const msg = addSystemMessageToHistory(`${nameToRemove} has left the chat.`);
                 io.emit('chat message', msg);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
