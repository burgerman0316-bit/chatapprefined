const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Use the PORT environment variable provided by Railway, or default to 3000
const port = process.env.PORT || 3000;

// Set up Socket.IO
const io = socketIo(server);

// Middleware to serve static files (your HTML, CSS, JS) from the 'public' directory
app.use(express.static('public'));

// CRITICAL: Array to store all chat messages (your server's "database")
let messages = []; 

// Handle incoming client connections
io.on('connection', (socket) => {
    console.log('A user connected');

    // Send the existing history to the newly connected client
    socket.emit('chat history', messages);

    // 1. Handle Incoming Chat Messages
    socket.on('chat message', (msg) => {
        // Store the new message
        messages.push(msg);
        
        // Broadcast the message to all connected clients
        io.emit('chat message', msg); 
    });
    
    // 2. Handle Admin Clear Chat Request
    socket.on('admin:clear_history', (data) => {
        if (!data.username) return; 

        // CRITICAL: CLEAR THE SERVER-SIDE ARRAY
        messages = []; 

        // Announce the action to everyone and trigger the client-side clear
        io.emit('history_cleared', {
            username: data.username
        });
        console.log(`Chat history cleared by ADMIN: ${data.username}`);
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
