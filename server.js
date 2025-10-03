const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { join } = require('path');

const app = express();
const httpServer = createServer(app);
const PORT = 3000;

// --- CRITICAL FIX: ENABLE CORS ---
// Without this, the client often fails to connect, resulting in a blank page 
// or "transport error" in the browser console.
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:3000", // Allow connection from the server itself
        methods: ["GET", "POST"]
    }
});

// Serve the index.html file
app.get('/', (req, res) => {
    // __dirname is the current directory of the server.js file
    res.sendFile(join(__dirname, 'index.html'));
});

// ==========================================================
// A. MAIN CHAT LOGIC (Default Namespace: '/')
// ==========================================================
io.on('connection', (socket) => {
    console.log(`[Main Chat] A user connected: ${socket.id}`);

    socket.on('chat message', (msg) => {
        console.log(`[Main Chat] Message: ${msg}`);
        io.emit('chat message', msg); // Broadcast to all clients in the main namespace
    });

    socket.on('disconnect', () => {
        console.log(`[Main Chat] User disconnected: ${socket.id}`);
    });
});

// ==========================================================
// B. STAFF CHAT LOGIC (Custom Namespace: '/staff')
// ==========================================================
const staffIo = io.of('/staff');

staffIo.on('connection', (staffSocket) => {
    console.log(`[Staff Chat] An admin connected: ${staffSocket.id}`);

    staffSocket.on('staff message', (msg) => {
        console.log(`[Staff Chat] Message: ${msg}`);
        staffIo.emit('staff message', msg); // Broadcast to all clients in the /staff namespace
    });

    staffSocket.on('disconnect', () => {
        console.log(`[Staff Chat] Admin disconnected: ${staffSocket.id}`);
    });
});


// Start the server
httpServer.listen(PORT, () => {
    console.log(`Server running and listening on http://localhost:${PORT}`);
});
