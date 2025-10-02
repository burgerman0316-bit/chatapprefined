const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ======================================================
// 1. STAFF CONFIGURATION (The field for Usernames and Names)
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
    },
    { 
        loginName: "STAFF_CONTROLS-DONOVAN",
        displayName: "Donovan Powell"
    }
    // ADD ALL YOUR STAFF MEMBERS HERE
    // Ensure the 'loginName' is unique and used only by staff.
];

// Simple in-memory storage for chat history
const chatHistory = [];
const MAX_HISTORY = 200;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Function to check if a name (loginName or displayName) is reserved by staff
function isStaffNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim();

    // Check against both loginName (secure) and displayName (public)
    return STAFF_LIST.some(staff => 
        staff.loginName === checkName || 
        staff.displayName === checkName
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

    // ======================================================
    // 2. NAME VALIDATION AND STAFF CHECK
    // ======================================================
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

    // ======================================================
    // 3. MESSAGE HANDLING
    // ======================================================
    socket.on('chat message', (msg) => {
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // Server-side security check: If a regular user somehow sends a message
        // using a reserved name, reject it.
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
        
        // Add to history and enforce limit
        chatHistory.push(messageData);
        while (chatHistory.length > MAX_HISTORY) {
            chatHistory.shift();
        }

        // Broadcast the message with the correct display name and isAdmin flag
        io.emit('chat message', messageData);
    });

    // ======================================================
    // 4. ADMIN CONTROL HANDLING
    // ======================================================
    socket.on('admin:clear_history', (data) => {
        // The client sends the secure login name, so we validate it
        const staffInfo = getStaffDisplayInfo(data.username);
        
        if (staffInfo.isAdmin) {
            chatHistory.length = 0; // Clear the array
            
            // Broadcast the clear event with the public staff name
            io.emit('history_cleared', {
                username: staffInfo.username, // Use the public display name
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

