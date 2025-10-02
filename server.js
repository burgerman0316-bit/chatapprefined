const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. SECURE STAFF CONFIGURATION (New) ---
// Key: The secure login username (Staff member must enter this exact name)
// Value: The public display name (What everyone sees in the chat)
const STAFF_MAP = {
    "STAFF_CONTROLS-LIAM": "Liam Stern",
    "STAFF_COBTROLS-DIESEL": "Diesel Carter",
    "STAFF_CONTROLS-DONOVAN": "Donovan Powell",
    "STAFF_CONTROLS-AARON": "Aaron Ortega",
    "STAFF_CONTROLS-RICKY": "Ricky Martinez"
    // Add all your staff members here. Keys must be unique.
};

// Simple in-memory storage for chat history
const chatHistory = [];
const MAX_HISTORY = 100; // Limit messages for performance

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Function to check staff credentials and get the display name
function getStaffDisplayInfo(username) {
    const secureUsername = username.trim();
    const displayName = STAFF_MAP[secureUsername];

    if (displayName) {
        return {
            isAdmin: true,
            username: displayName // Return the public display name
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

    socket.on('chat message', (msg) => {
        // --- 2. AUTHENTICATION AND NAME MAPPING (New) ---
        // Get the secure info and public name from the server map
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        const messageData = {
            // Use the secure username for internal logs (optional) but the display name for chat
            username: staffInfo.username, 
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

    socket.on('admin:clear_history', (data) => {
        // The client only sends the secure name, so we check and get the display name again
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

