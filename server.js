const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ======================================================
// 1. STAFF CONFIGURATION 
// ======================================================
const STAFF_LIST = [
    { 
        loginName: "STAFF_CONTROLS-LIAM",  // <--- The secure username they MUST enter
        displayName: "Liam Stern"   // <--- The name everyone sees in chat
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

// Simple in-memory storage for chat history
const chatHistory = [];
const MAX_HISTORY = 100;

// Store names currently in use (in lowercase) to enforce uniqueness
const namesInUse = new Set();
const socketsMap = new Map(); // Map socket ID to the user's public display name (lowercase)

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Function to check if a name (loginName or displayName) is reserved by staff
function isStaffNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim().toLowerCase();

    // Check against both loginName (secure) and displayName (public)
    return STAFF_LIST.some(staff => 
        staff.loginName.toLowerCase() === checkName || 
        staff.displayName.toLowerCase() === checkName
    );
}

// Function to check staff credentials and get the display name
function getStaffDisplayInfo(enteredUsername) {
    const secureUsername = enteredUsername.trim();
    
    // Check for an exact match on the secure login name (this MUST be case sensitive)
    const staffMember = STAFF_LIST.find(staff => 
        staff.loginName === secureUsername
    );

    if (staffMember) {
        return {
            isAdmin: true,
            username: staffMember.displayName // Return the public display name
        };
    }
    
    // Not a staff member
    return {
        isAdmin: false,
        username: secureUsername // Use the entered name as is
    };
}


io.on('connection', (socket) => {
    console.log('A user connected');

    socket.emit('chat history', chatHistory);

    // 2. NAME VALIDATION AND STAFF CHECK
    socket.on('check_staff_status', (enteredName) => {
        const trimmedName = enteredName.trim();
        const lowerName = trimmedName.toLowerCase();

        // 1. Check if the non-staff name is already in use (Case-Insensitive)
        // Staff logins are handled separately below and can reuse reserved display names
        if (namesInUse.has(lowerName)) {
            socket.emit('name_rejected', 'That name is already in use. Please choose another name.');
            return;
        }

        // 2. Check if the name is reserved by staff
        if (isStaffNameReserved(trimmedName)) {
            const staffInfo = getStaffDisplayInfo(trimmedName);
            
            if (!staffInfo.isAdmin) {
                // Name is reserved, but the secure login was wrong (or the name is the public name)
                socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                return;
            }
            
            // Staff login success: add display name to namesInUse
            const staffDisplayNameLower = staffInfo.username.toLowerCase();
            if (namesInUse.has(staffDisplayNameLower) && staffDisplayNameLower !== lowerName) {
                 // Prevent two non-staff users from having names that match a staff member's display name
                 // OR prevent a staff member from logging in if another staff member's public name is the same.
                 // For simplicity, we assume staff members have unique public display names.
            }
            
            // Add staff's public name to namesInUse to block non-staff usage.
            namesInUse.add(staffDisplayNameLower);
            socketsMap.set(socket.id, staffDisplayNameLower);
            
            socket.emit('staff_status_update', {
                isAdmin: true,
                displayName: staffInfo.username,
                secureName: trimmedName
            });
        } else {
            // Name is not reserved, allow it and mark as in use
            namesInUse.add(lowerName);
            socketsMap.set(socket.id, lowerName);
            socket.emit('name_accepted', trimmedName);
        }
    });

    // 3. MESSAGE HANDLING (Unchanged)
    socket.on('chat message', (msg) => {
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // Security check
        if (!staffInfo.isAdmin && isStaffNameReserved(msg.username)) {
            console.log(`SECURITY REJECTION: Non-staff user tried to send message as reserved name: ${msg.username}`);
            return; 
        }

        const messageData = {
            username: staffInfo.username, // Public display name (or regular username)
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

    // 4. ADMIN CONTROL HANDLING (Unchanged)
    socket.on('admin:clear_history', (data) => {
        const staffInfo = getStaffDisplayInfo(data.username);
        
        if (staffInfo.isAdmin) {
            chatHistory.length = 0;
            io.emit('history_cleared', {
                username: staffInfo.username,
                timestamp: new Date()
            });
        }
    });

    // 5. USER DISCONNECTION (NEW: Remove name from set)
    socket.on('disconnect', () => {
        const nameToRemove = socketsMap.get(socket.id);
        if (nameToRemove) {
            namesInUse.delete(nameToRemove);
            socketsMap.delete(socket.id);
            console.log(`User disconnected. Name ${nameToRemove} released.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
