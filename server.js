const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // allow all origins for simplicity
});

// ========== Settings ==========
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler', 'admin', 'mod'];
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

// ========== Data Storage ==========
const chatHistory = [];
const namesInUse = new Set();               // lowercased names
const socketsMap = new Map();               // socket.id -> displayName
const usernamesMap = new Map();             // lowercased displayName -> socket.id

// ========== Middleware ==========
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ========== Helper Functions ==========
function isNameReserved(name) {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  if (BANNED_NAMES.some(b => lower.includes(b.toLowerCase()))) return true;
  return STAFF_LIST.some(s => s.loginName.toLowerCase() === lower || s.displayName.toLowerCase() === lower);
}

function getStaffInfo(name) {
  const staff = STAFF_LIST.find(
    s => s.loginName === name || s.displayName.toLowerCase() === name.toLowerCase()
  );
  if (staff) {
    return { isAdmin: true, displayName: staff.displayName, loginName: staff.loginName };
  }
  return { isAdmin: false, displayName: name, loginName: name };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount() {
  const users = Array.from(socketsMap.values()).sort();
  io.emit('user count', { count: namesInUse.size, userList: users });
}

// ========== Socket.IO ==========
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  // Send chat history
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // ========== Name Registration ==========
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    if (!name) {
      socket.emit('name_rejected', 'Please provide a name.');
      return;
    }

    const lowerName = name.toLowerCase();

    if (namesInUse.has(lowerName)) {
      socket.emit('name_modal', `The name "${name}" is already in use.`);
      return;
    }

    if (isNameReserved(name)) {
      const info = getStaffInfo(name);
      if (info.isAdmin) {
        socket.emit('name_modal', `The name "${info.displayName}" is reserved for staff.`);
        return;
      }
    }

    // Accept normal user
    namesInUse.add(lowerName);
    socketsMap.set(socket.id, name);
    usernamesMap.set(lowerName, socket.id);

    socket.emit('name_accepted', name);

    const joinMsg = {
      username: name,
      content: `${name} has joined the chat.`,
      timestamp: new Date(),
      isAdmin: false
    };
    pushHistory(joinMsg);
    io.emit('chat message', joinMsg);

    broadcastUserCount();
  });

  // ========== Public Chat ==========
  socket.on('chat message', msg => {
    if (!msg.content) return;
    const info = getStaffInfo(msg.username);
    const messageData = {
      username: info.displayName,
      content: msg.content,
      timestamp: new Date(),
      isAdmin: info.isAdmin
    };
    pushHistory(messageData);
    io.emit('chat message', messageData);
  });

  // ========== Private Chat ==========
  socket.on('private message', msg => {
    const sender = socketsMap.get(socket.id);
    if (!sender) {
      socket.emit('system_error', 'You must set a name first.');
      return;
    }

    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();
    if (!recipient || !content) {
      socket.emit('system_error', 'Invalid private message.');
      return;
    }

    if (recipient.toLowerCase() === sender.toLowerCase()) {
      socket.emit('system_alert', 'You cannot send a private message to yourself.');
      return;
    }

    const recSocketId = usernamesMap.get(recipient.toLowerCase());
    if (!recSocketId) {
      socket.emit('system_error', `User "${recipient}" not found or offline.`);
      return;
    }

    const messageData = {
      sender,
      recipient,
      content,
      timestamp: new Date(),
      isPrivate: true
    };

    // Send to recipient
    io.to(recSocketId).emit('private message', messageData);
    // Send copy to sender
    socket.emit('private message', messageData);
  });

  // ========== Admin Clear ==========
  socket.on('admin:clear_history', data => {
    const info = getStaffInfo(data.username);
    if (!info.isAdmin) {
      socket.emit('system_error', 'Unauthorized: Admin privileges required.');
      return;
    }
    chatHistory.length = 0;
    const clearMsg = {
      username: 'System',
      content: `Moderator ${info.displayName} cleared chat history.`,
      timestamp: new Date(),
      isAdmin: true
    };
    pushHistory(clearMsg);
    io.emit('chat history', chatHistory);
  });

  // ========== Disconnect ==========
  socket.on('disconnect', () => {
    const name = socketsMap.get(socket.id);
    if (!name) return;

    const lower = name.toLowerCase();
    namesInUse.delete(lower);
    usernamesMap.delete(lower);
    socketsMap.delete(socket.id);

    const leaveMsg = {
      username: 'System',
      content: `${name} has left the chat.`,
      timestamp: new Date(),
      isAdmin: false
    };
    pushHistory(leaveMsg);
    io.emit('chat message', leaveMsg);
    broadcastUserCount();
  });
});

// ========== HTTP Route ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== Start Server ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
