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
 * Gets the count of currently connected USERS (based on namesInUse) and sends it to all clients.
 */
function broadcastUserCount() {
    // We count the size of the Set that stores successfully logged-in usernames.
    const count = namesInUse.size; 
    io.emit('user count', count);
}


// ======================================================
// 3. SOCKET.IO CONNECTION HANDLING
// ======================================================

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.emit('chat history', chatHistory);
    // Send initial count when a client connects (before they log in)
    broadcastUserCount();

    // NAME VALIDATION AND STAFF CHECK (INITIAL LOGIN)
    socket.on('check_staff_status', (enteredName) => {
        const trimmedName = enteredName.trim();
        const lowerName = trimmedName.toLowerCase();

        if (namesInUse.has(lowerName)) {
            socket.emit('name_rejected', 'That name is already in use. Please choose another name.');
            return;
        }

        // Check for banned words or reserved staff names
        if (isNameReserved(trimmedName)) {
            
            // Staff login attempt (requires correct loginName for success)
            if (STAFF_LIST.some(staff => staff.loginName.toLowerCase() === lowerName || staff.displayName.toLowerCase() === lowerName)) {
                const staffInfo = getStaffDisplayInfo(trimmedName);
                if (!staffInfo.isAdmin) {
                    socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                    return;
                }
                
                // Staff login success logic:
                const staffDisplayNameLower = staffInfo.username.toLowerCase();
                namesInUse.add(staffDisplayNameLower);
                socketsMap.set(socket.id, staffDisplayNameLower);
                socket.join(STAFF_ROOM);
                
                // 1. Private Announcement to Staff
                const privateMsg = addSystemMessageToHistory(`Staff member ${staffInfo.username} connected.`, true);
                socket.to(STAFF_ROOM).emit('staff message', privateMsg); 
                
                // 2. Public Announcement to Everyone (Generic Message)
                const publicMsg = addSystemMessageToHistory(`A moderator has entered the chat.`, true); // true for alert styling
                io.emit('chat message', publicMsg);
                
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
        
        // Broadcast the updated count AFTER successful login
        broadcastUserCount();
    });

    // NAME CHANGE REQUEST HANDLING
    socket.on('name_change_request', (data) => {
        const oldSecureName = data.oldName.trim();
        const newName = data.newName.trim();
        const newLowerName = newName.toLowerCase();
        
        const currentDisplayName = socketsMap.get(socket.id); 

        // 1. Basic Validation
        if (!newName || newName === currentDisplayName) {
            socket.emit('name_change_failed', 'A valid, different name is required.');
            return;
        }
        
        // 2. Check for Banned/Reserved Names
        if (isNameReserved(newName)) {
            socket.emit('name_change_failed', 'That name is reserved or contains forbidden words.');
            return;
        }

        // 3. Check if the new name is already in use
        if (namesInUse.has(newLowerName)) {
            socket.emit('name_change_failed', 'That name is already taken.');
            return;
        }
        
        // --- SUCCESS: PERFORM NAME CHANGE ---
        
        // 1. Update the namesInUse set (release old, claim new)
        if (currentDisplayName) {
            namesInUse.delete(currentDisplayName.toLowerCase());
        }
        namesInUse.add(newLowerName);
        
        // 2. Update the socket map (maps socket ID to the new display name)
        socketsMap.set(socket.id, newName); 
        
        // 3. Build success data
        const successData = {
            oldDisplayName: currentDisplayName,
            newDisplayName: newName,
            newSecureName: newName, 
            timestamp: new Date()
        };
        
        // If the user was a staff member, we must preserve their secure loginName
        if (getStaffDisplayInfo(oldSecureName).isAdmin) {
            successData.newSecureName = oldSecureName; // Keep the original STAFF_CONTROLS-X login name
            
            // Staff name changes are private
            socket.emit('name_change_success', successData); 
            
            // Notify other staff privately
            const privateMsg = {
                 username: "System",
                 content: `Staff member ${currentDisplayName} changed display name to ${newName}.`,
                 timestamp: new Date(),
                 isAdmin: true
            };
            socket.to(STAFF_ROOM).emit('staff message', privateMsg);
            
            return; // Exit, no public broadcast for staff name change
        }
        
        // 4. Send success back to the user who requested the change
        socket.emit('name_change_success', successData);
        
        // 5. Broadcast public notification (Regular user only)
        io.emit('chat message', addSystemMessageToHistory(`${currentDisplayName} is now known as ${newName}.`));

    });

    // PUBLIC MESSAGE HANDLING
    socket.on('chat message', (msg) => {
        
        // CRITICAL: MESSAGE CONTENT FILTERING
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
            isAdmin: staffInfo.isAdmin
        };
        
        chatHistory.push(messageData);
        while (chatHistory.length > MAX_HISTORY) {
            chatHistory.shift();
        }

        io.emit('chat message', messageData);
    });

    // ADMIN CONTROL HANDLING (PRIVACY IMPLEMENTED)
    socket.on('admin:clear_history', (data) => {
        const staffInfo = getStaffDisplayInfo(data.username);
        
        if (staffInfo.isAdmin) {
            chatHistory.length = 0;
            
            // 1. MESSAGE FOR STAFF ONLY (Includes Admin Name)
            const staffMsgData = {
                username: staffInfo.username,
                content: `Chat history cleared by ${staffInfo.username}.`, 
                timestamp: new Date()
            };
            io.to(STAFF_ROOM).emit('history_cleared_staff', staffMsgData);
            
            // 2. MESSAGE FOR REGULAR USERS (Generic Name)
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

    // USER DISCONNECTION
    socket.on('disconnect', () => {
        const nameToRemove = socketsMap.get(socket.id);
        
        if (socket.rooms.has(STAFF_ROOM)) {
            const privateMsg = addSystemMessageToHistory(`Staff member ${nameToRemove} disconnected.`, true);
            io.to(STAFF_ROOM).emit('staff message', privateMsg); 
        }
        
        if (nameToRemove) {
            namesInUse.delete(nameToRemove.toLowerCase()); // Use lowercase for Set lookup
            socketsMap.delete(socket.id);
            console.log(`User disconnected. Name ${nameToRemove} released.`);
            
            // Only announce public departure if they were not staff (staff departures are private)
            if (!socket.rooms.has(STAFF_ROOM)) {
                 const msg = addSystemMessageToHistory(`${nameToRemove} has left the chat.`);
                 io.emit('chat message', msg);
            }
        }
        
        // Broadcast the updated count when a client disconnects
        broadcastUserCount();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
