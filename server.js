// server.js
const express = require('express');
const path = require('path');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// In-memory chat history (keep last 200 messages)
let chatHistory = [];

// Socket.io connection
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send chat history to new client
  socket.emit('chat history', chatHistory);

  // Listen for incoming messages
  socket.on('chat message', (msg) => {
    chatHistory.push(msg);
    if (chatHistory.length > 200) chatHistory.shift(); // Keep last 200 messages
    io.emit('chat message', msg); // Send message to all clients
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
