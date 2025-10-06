// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Config
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler', 'admin', 'mod']; // example banned fragments
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

const chatHistory = [];
const namesInUse = new Set();        // lowercased names currently in use
const socketsMap = new Map();       // socket.id -> displayName
const usernamesMap = new Map();     // lowercased displayName -> socket.id

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// helpers
function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount() {
  const list = Array.from(socketsMap.values()).sort();
  io.emit('user count', { count: namesInUse.size, userList: list });
}

function isNameBanned(name) {
  const lower = (name || '').toLowerCase();
  return BANNED_NAMES.some(b => lower.includes(b.toLowerCase()));
}

function isNameReservedForStaff(name) {
  const lower = (name || '').toLowerCase();
  return STAFF_LIST.some(s => s.loginName.toLowerCase() === lower || s.displayName.toLowerCase() === lower);
}

// socket logic
io.on('connection', socket => {
  console.log('connected', socket.id);

  // send chat history & user list
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // handle name checks
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    if (!name) {
      socket.emit('name_rejected', 'Please provide a name.');
      return;
    }

    const lower = name.toLowerCase();
    if (namesInUse.has(lower)) {
      socket.emit('name_rejected', 'That name is already in use.');
      return;
    }

    if (isNameBanned(name)) {
      socket.emit('name_rejected', 'That name is not allowed.');
      return;
    }

    // IMPORTANT: treat any staff loginName/displayName as reserved
    if (isNameReservedForStaff(name)) {
      socket.emit('name_rejected', 'That name is reserved for staff.');
      return;
    }

    // Accept normal user
    namesInUse.add(lower);
    socketsMap.set(socket.id, name);
    usernamesMap.set(lower, socket.id);

    s
