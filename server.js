const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { join } = require('path');

const app = express();
const httpServer = createServer(app);
const PORT = 3000;

// --- CRITICAL SETUP: Serve static files from the 'public' folder ---
app.use(express.static('public'));

// --- CRITICAL FIX: Enable CORS to prevent browser connection errors ---
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Serve the index.html file (It will look in the 'public' folder first due to the static setup)
app.get('/', (req, res) => {
    // We explicitly send the file path, joining the current directory (__dirname) with the file path
    res.sendFile(join(__dirname, 'public', 'index.html'));
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
