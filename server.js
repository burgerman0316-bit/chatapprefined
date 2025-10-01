const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// In-memory chat history (keep last 200 messages)
let chatHistory = [];

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send chat history to new client
  socket.emit('chat history', chatHistory);

  // Listen for incoming messages
  socket.on('chat message', (msg) => {
    chatHistory.push(msg);
    if (chatHistory.length > 200) chatHistory.shift(); // Keep last 200 messages
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Listen on Railway port or default 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('🎉 Use your Railway URL to access the app!');
});
