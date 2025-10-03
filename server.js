// server.js (or index.js)
const express = require('express');
const { createServer } = require('http'); // 1. Use Node's standard HTTP server
const { Server } = require('socket.io'); // 2. Import the Socket.IO server
const { join } = require('path');

const app = express();
const httpServer = createServer(app); // 3. Create the HTTP server
const io = new Server(httpServer); // 4. Attach Socket.IO to the HTTP server
const PORT = 3000;

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// --- CORE SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
  // This line is the most important test!
  console.log('A user connected to the main chat'); 

  // Add the staff namespace as well, just to ensure that connection works
  const staffIo = io.of('/staff');
  staffIo.on('connection', (staffSocket) => {
      console.log('A user connected to the /staff namespace');
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});
