const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();
const usernamesMap = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Helper
function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > 100) chatHistory.shift();
}

function broadcastUserCount() {
  io.emit('user count', { count: namesInUse.size, userList: Array.from(namesInUse) });
}

function isStaffName(name) {
  return STAFF_LIST.some(s => s.displayName.toLowerCase() === name.toLowerCase());
}

// ========== Socket ==========
io.on('connection', socket => {
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  socket.on('check_name', name => {
    const lower = name.toLowerCase();
    if (isStaffName(name)) {
      socket.emit('name_rejected_reserved');
      return;
    }
    if (namesInUse.has(lower)) {
      socket.emit('name_rejected_inuse');
      return;
    }

    namesInUse.add(lower);
    socketsMap.set(socket.id, name);
    usernamesMap.set(lower, socket.id);

    socket.emit('name_accepted', { displayName: name, secureName: name, isAdmin: false });

    const joinMsg = { username: 'System', content: `${name} joined the chat.`, timestamp: new Date(), isAdmin: false };
    pushHistory(joinMsg);
    io.emit('chat message', joinMsg);
    broadcastUserCount();
  });

  socket.on('chat message', msg => {
    pushHistory(msg);
    io.emit('chat message', msg);
  });

  socket.on('private message', msg => {
    const sender = socketsMap.get(socket.id);
    if (!sender) return;
    const recipient = msg.recipient.toLowerCase();
    const recSocketId = usernamesMap.get(recipient);
    if (recSocketId) {
      io.to(recSocketId).emit('private message', { sender, recipient: msg.recipient, content: msg.content, timestamp: new Date(), isPrivate: true });
      socket.emit('private message', { sender, recipient: msg.recipient, content: msg.content, timestamp: new Date(), isPrivate: true });
    } else {
      socket.emit('chat message', { username: 'System', content: `User '${msg.recipient}' not found.`, timestamp: new Date(), isAdmin: true });
    }
  });

  socket.on('request_users', () => {
    const users = Array.from(namesInUse);
    socket.emit('user_list', users);
  });

  socket.on('admin:clear_history', data => {
    chatHistory.length = 0;
    io.emit('chat history', chatHistory);
  });

  socket.on('disconnect', () => {
    const name = socketsMap.get(socket.id);
    if (!name) return;
    namesInUse.delete(name.toLowerCase());
    usernamesMap.delete(name.toLowerCase());
    socketsMap.delete(socket.id);
    const leaveMsg = { username: 'System', content: `${name} left the chat.`, timestamp: new Date(), isAdmin: false };
    pushHistory(leaveMsg);
    io.emit('chat message', leaveMsg);
    broadcastUserCount();
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Server running'));
