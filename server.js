// server.js
'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Configuration
const MAX_HISTORY = 200;
const BANNED_NAMES = ['hitler', 'bannedword', 'badword'];
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

const chatHistory = [];                // array of msg objects
const namesInUse = new Set();          // lowercased names
const socketsMap = new Map();          // socket.id -> displayName
const usernamesMap = new Map();        // lowercased displayName -> socket.id

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Helpers
function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserList() {
  const list = Array.from(socketsMap.values()).sort();
  io.emit('user count', { count: list.length, userList: list });
}

function isNameBanned(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return BANNED_NAMES.some(b => lower.includes(b.toLowerCase()));
}

function isNameStaffReserved(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return STAFF_LIST.some(s =>
    s.loginName.toLowerCase() === lower || s.displayName.toLowerCase() === lower
  );
}

function getStaffInfoByName(name) {
  if (!name) return null;
  return STAFF_LIST.find(s => s.loginName === name || s.displayName.toLowerCase() === name.toLowerCase()) || null;
}

// Socket logic
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  // Send chat history and current user list immediately
  socket.emit('chat history', chatHistory);
  broadcastUserList();

  // Name check and registration
  socket.on('check_staff_status', enteredName => {
    try {
      const name = (enteredName || '').trim();
      if (!name) {
        socket.emit('name_rejected', 'Please enter a name.');
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

      // If a staff displayName or loginName matches, treat it as reserved
      if (isNameStaffReserved(name) && !name.startsWith('STAFF_CONTROLS-')) {
        socket.emit('name_rejected', 'That name is reserved for staff.');
        return;
      }

      // If user provided a staff loginName exactly (STAFF_CONTROLS-...), accept as staff
      const staffInfo = getStaffInfoByName(name);
      if (staffInfo && staffInfo.loginName === name) {
        // Accept staff loginName (note: in-production you'd authenticate)
        namesInUse.add(staffInfo.displayName.toLowerCase());
        socketsMap.set(socket.id, staffInfo.displayName);
        usernamesMap.set(staffInfo.displayName.toLowerCase(), socket.id);

        socket.emit('staff_status_update', { isAdmin: true, displayName: staffInfo.displayName, secureName: staffInfo.loginName });

        const systemMsg = { username: 'System', content: `Moderator ${staffInfo.displayName} has joined the chat.`, timestamp: new Date(), isAdmin: true, system: true };
        pushHistory(systemMsg);
        io.emit('chat message', systemMsg);
        broadcastUserList();
        return;
      }

      // Normal user accept
      namesInUse.add(lower);
      socketsMap.set(socket.id, name);
      usernamesMap.set(lower, socket.id);

      socket.emit('name_accepted', name);

      const joinMsg = { username: 'System', content: `${name} has joined the chat.`, timestamp: new Date(), system: true };
      pushHistory(joinMsg);
      io.emit('chat message', joinMsg);
      broadcastUserList();
    } catch (err) {
      console.error('check_staff_status error', err);
      socket.emit('name_rejected', 'Server error checking name.');
    }
  });

  // Public chat message
  socket.on('chat message', payload => {
    try {
      if (!payload || !payload.content) return;
      const username = (payload.username || 'Unknown').trim();
      const messageData = { username, content: payload.content, timestamp: new Date() };
      pushHistory(messageData);
      io.emit('chat message', messageData);
    } catch (err) {
      console.error('chat message error', err);
    }
  });

  // Private message
  socket.on('private message', payload => {
    try {
      const sender = socketsMap.get(socket.id);
      if (!sender) {
        socket.emit('system_error', 'Set a name first.');
        return;
      }
      const recipient = (payload.recipient || '').trim();
      const content = (payload.content || '').trim();
      if (!recipient || !content) {
        socket.emit('system_error', 'Invalid private message.');
        return;
      }
      const recId = usernamesMap.get(recipient.toLowerCase());
      if (!recId) {
        socket.emit('system_error', `User '${recipient}' not found or offline.`);
        return;
      }

      const msg = { sender, recipient, content, timestamp: new Date(), isPrivate: true };

      // Send to recipient and send a local copy to sender (localCopy flag)
      io.to(recId).emit('private message', msg);                       // recipient receives
      socket.emit('private message', { ...msg, localCopy: true });      // sender receives localCopy
    } catch (err) {
      console.error('private message error', err);
    }
  });

  // Disconnect cleanup
  socket.on('disconnect', () => {
    try {
      const name = socketsMap.get(socket.id);
      if (name) {
        const lower = name.toLowerCase();
        namesInUse.delete(lower);
        usernamesMap.delete(lower);
        socketsMap.delete(socket.id);

        const leaveMsg = { username: 'System', content: `${name} has left the chat.`, timestamp: new Date(), system: true };
        pushHistory(leaveMsg);
        io.emit('chat message', leaveMsg);
        broadcastUserList();
      }
    } catch (err) {
      console.error('disconnect error', err);
    }
  });

}); // end io.on

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
