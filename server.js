const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. STAFF CONFIGURATION (Array of Objects Format) ---
const STAFF_LIST = [
    { 
        loginName: "STAFF_CONTROLS-LIAM",  // <--- Secure username
        displayName: "Liam Stern"   // <--- Public name
    },
    { 
        loginName: "STAFF_CONTROLS-DIESEL",
        displayName: "Diesel Carter"
    },
    { 
        loginName: "STAFF_CONTROLS-DONOVAN",
        displayName: "Donovan Powell"
    }
    // Add all your staff members here. Ensure loginName is unique.
];

// Simple in-memory storage for chat history
const chatHistory = [];
const MAX_HISTORY = 100;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Function to check if a name is reserved by staff
function isStaffNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim().toUpperCase(); // Case-insensitive check

    // Check if the entered username (secure or public) is reserved
    return STAFF_LIST.some(staff => 
        staff.loginName.toUpperCase() === checkName || 
        staff.displayName.toUpperCase() === checkName
    );
}

// Function to check staff credentials and get the display name
function getStaffDisplayInfo(enteredUsername) {
    const secureUsername = enteredUsername.trim();
    
    // Find a matching loginName in the STAFF_LIST
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

    // Send chat history to the newly connected user
    socket.emit('chat history', chatHistory);

    // NEW: Handle the client checking their staff status (used for initial name check)
    socket.on('check_staff_status', (enteredName) => {
        // 1. Check if the name is reserved (secure or public)
        if (isStaffNameReserved(enteredName)) {
            // 2. Check if the name is a valid secure login name
            const staffInfo = getStaffDisplayInfo(enteredName);
            
            if (!staffInfo.isAdmin) {
                // Name is reserved (e.g., 'Alice C. (Admin)'), but they didn't enter the secure key
                socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                return;
            }
            // If it IS a staff login, send success
            socket.emit('staff_status_update', {
                isAdmin: true,
                displayName: staffInfo.username,
                secureName: enteredName
            });
        } else {
            // Name is not reserved, allow it.
            socket.emit('name_accepted', enteredName);
        }
    });

    socket.on('chat message', (msg) => {
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // Final server-side security check: If a regular user tries to send a message
        // using a reserved name, reject it.
        if (!staffInfo.isAdmin && isStaffNameReserved(msg.username)) {
            console.log(`REJECTED: Non-staff user tried to send message as reserved name: ${msg.username}`);
            return; 
        }

        const messageData = {
            username: staffInfo.username, 
            content: msg.content,
            timestamp: new Date(),
            isAdmin: staffInfo.isAdmin
        };
        // ... (rest of message handling)
        chatHistory.push(messageData);
        while (chatHistory.length > MAX_HISTORY) {
            chatHistory.shift();
        }

        io.emit('chat message', messageData);
    });

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

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

