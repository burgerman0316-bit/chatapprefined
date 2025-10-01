const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs'); // Node's built-in file system module
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Define the path to the messages file
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Global chat history array
let chatHistory = [];

/**
 * Loads chat history from messages.json
 */
function loadHistory() {
  try {
    const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
    // Ensure the data is not empty before parsing
    if (data.trim().length > 0) {
      chatHistory = JSON.parse(data);
      console.log(`Loaded ${chatHistory.length} messages from file.`);
    } else {
      chatHistory = [];
      console.log('messages.json is empty. Starting with no history.');
    }
  } catch (err) {
    // If the file doesn't exist or is invalid JSON, start with an empty array
    if (err.code === 'ENOENT') {
      console.log('messages.json not found. Creating new file.');
      fs.writeFileSync(MESSAGES_FILE, '[]', 'utf8');
    } else {
      console.error('Error loading chat history:', err.message);
      chatHistory = [];
    }
  }
}

/**
 * Saves the current chat history to messages.json
 */
function saveHistory() {
  // Only keep the last 200 messages before saving
  const historyToSave = chatHistory.slice(-200); 
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(historyToSave, null, 2), 'utf8');
  console.log('History saved to messages.json.');
}

// Load history immediately when the server starts
loadHistory();

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send chat history to new client
  socket.emit('chat history', chatHistory);

  // Listen for incoming messages
  socket.on('chat message', (msg) => {
    // 1. Add new message
    chatHistory.push(msg);
    // 2. Trim history (optional, messages.json will handle keeping the last 200)
    // 3. Broadcast the message immediately
    io.emit('chat message', msg);
    // 4. Save history to disk after every message
    saveHistory(); 
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
