const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
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
    if (!fs.existsSync(MESSAGES_FILE)) {
      console.log('messages.json not found. Creating new file with empty array.');
      fs.writeFileSync(MESSAGES_FILE, '[]', 'utf8');
      chatHistory = [];
      return;
    }
    
    const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
    
    if (data.trim().length > 0 && data.trim() !== '[]') {
      chatHistory = JSON.parse(data);
      console.log(`Loaded ${chatHistory.length} messages from file.`);
    } else {
      chatHistory = [];
      console.log('messages.json is empty or contains no valid history.');
    }
  } catch (err) {
    console.error('CRITICAL ERROR loading chat history:', err.message);
    chatHistory = [];
  }
}

/**
 * Saves the current chat history to messages.json (Asynchronous)
 */
function saveHistory() {
  const historyToSave = chatHistory.slice(-200); 
  
  fs.writeFile(MESSAGES_FILE, JSON.stringify(historyToSave, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('Error saving chat history:', err.message);
    } else {
      console.log('History saved asynchronously to messages.json.');
    }
  });
}

// Load history immediately when the server starts
loadHistory();

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send chat history to new client immediately
  socket.emit('chat history', chatHistory);

  // Listen for incoming messages
  socket.on('chat message', (msg) => {
    chatHistory.push(msg);
    io.emit('chat message', msg);
    saveHistory(); 
  });
  
  // NEW: Listen for chat clear request from client
  socket.on('clear history', () => {
    console.log('Admin requested to clear chat history.');
    // 1. Clear server-side memory
    chatHistory = [];
    // 2. Save empty history to file
    saveHistory(); 
    // 3. Notify ALL clients to clear their screen
    io.emit('history cleared');
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Listen on Railway port or default 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('🎉 Deploying to Railway will ensure persistence!');
});
