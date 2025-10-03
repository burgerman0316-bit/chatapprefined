const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

// Create the main Socket.IO server
const io = new Server(server);

// Create a separate namespace for staff
const staffIo = io.of('/staff');

// Serve the index.html file
app.get('/', (req, res) => {
  // Assuming your HTML is in the same directory as server.js
  res.sendFile(__dirname + '/index.html');
});

// --- General Chat Logic ---
io.on('connection', (socket) => {
  console.log('A user connected to the main chat');

  // Listen for the general chat message event from the client
  socket.on('chat message', (msg) => {
    console.log('General message: ' + msg);
    // Broadcast the message to all connected clients in the main namespace
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected from the main chat');
  });
});

// --- Staff Chat Logic (using a separate namespace) ---
staffIo.on('connection', (socket) => {
  console.log('A STAFF member connected to the staff chat');
  
  // Listen for the staff message event
  // This listener is only in the /staff namespace
  socket.on('staff message', (msg) => {
    console.log('Staff message: ' + msg);
    // Broadcast the staff message ONLY to clients in the /staff namespace
    staffIo.emit('staff message', msg);
  });

  socket.on('disconnect', () => {
    console.log('A STAFF member disconnected from the staff chat');
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});

// To run this:
// 1. npm init -y
// 2. npm install express socket.io
// 3. node server.js
