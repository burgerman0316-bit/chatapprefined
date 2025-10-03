const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { join } = require('path');

const app = express();
const httpServer = createServer(app);
const PORT = 3000;

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Configure Socket.IO for a single chat (CORS is still a good practice)
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ==========================================================
// SINGLE CHAT LOGIC (Default Namespace: '/')
// ==========================================================
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Listen for incoming chat messages
    socket.on('chat message', (msg) => {
        console.log(`Message received: ${msg}`);
        // Broadcast the message to ALL connected clients
        io.emit('chat message', msg); 
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});


// Start the server
httpServer.listen(PORT, () => {
    console.log(`Server running and listening on http://localhost:${PORT}`);
});
