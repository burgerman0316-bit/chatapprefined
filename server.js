const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Settings
const STAFF_ROOM = 'staff_room';
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler', 'admin', 'mod'];
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' },
  { loginName: 'STAFF_CONTROLS-AARON', displayName: 'Aaron Ortega' },
  { loginName: 'STAFF_CONTROLS-DONOVAN', displayName: 'Donovan Powell' }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();    // socket.id → displayName
const usernamesMap = new Map();  // lowercased displayName → socket.id

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- Helpers ---
function isNameReserved(name) {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  if (BANNED_NAMES.some(b => lower.includes(b))) return true;
  return STAFF_LIST.some(s =>
    s.displayName.toLowerCase() === lower || s.loginName.toLowerCase() === lower
  );
}

function getStaffDisplayInfo(enteredName) {
  const staff = STAFF_LIST.find(
    s => s.loginName === enteredName.trim() || s.displayName.toLowerCase() === enteredName.trim().toLowerCase()
  );
  if (staff) return { isAdmin: true, username: staff.displayName, secureName: staff.loginName };
  return { isAdmin: false, username: enteredName.trim(), secureName: enteredName.trim() };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount() {
  const list = Array.from(socketsMap.values()).sort();
  io.emit('user count', { count: list.length, userList: list });
}

// --- Socket.io logic ---
io.on('connection', socket => {
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  socket.on('check_staff_status', name => {
    const clean = (name || '').trim();
    const lower = clean.toLowerCase();

    if (!clean) return socket.emit('name_rejected', 'Please provide a name.');
    if (namesInUse.has(lower)) return socket.emit('name_rejected', 'That name is already in use.');
    if (isNameReserved(clean) && !clean.startsWith('STAFF_CONTROLS-')) {
      return socket.emit('name_rejected', 'That name is reserved for staff.');
    }

    const info = getStaffDisplayInfo(clean);
    if (info.isAdmin && clean.startsWith('STAFF_CONTROLS-')) {
      namesInUse.add(info.username.toLowerCase());
      socketsMap.set(socket.id, info.username);
      usernamesMap.set(info.username.toLowerCase(), socket.id);
      socket.join(STAFF_ROOM);
      socket.emit('staff_status_update', info);
      io.emit('chat message', {
        username: 'System',
        content: `Moderator ${info.username} has entered the chat.`,
        timestamp: new Date(),
        isAdmin: true
      });
    } else {
      namesInUse.add(lower);
      socketsMap.set(socket.id, clean);
      usernamesMap.set(lower, socket.id);
      socket.emit('name_accepted', clean);
      const joinMsg = { username: 'System', content: `${clean} has joined the chat.`, timestamp: new Date(), isAdmin: false, system: true };
      pushHistory(joinMsg);
      io.emit('chat message', joinMsg);
    }

    broadcastUserCount();
  });

  socket.on('chat message', msg => {
    if (!msg.content) return;
    const info = getStaffDisplayInfo(msg.username);
    const data = {
      username: info.username,
      content: msg.content,
      timestamp: new Date(),
      isAdmin: info.isAdmin
    };
    pushHistory(data);
    io.emit('chat message', data);
  });

  socket.on('private message', msg => {
    const sender = socketsMap.get(socket.id);
    const recipient = msg.recipient?.trim();
    const content = msg.content?.trim();
    if (!sender || !recipient || !content) return;

    const recId = usernamesMap.get(recipient.toLowerCase());
    if (!recId) {
      socket.emit('system_error', `User '${recipient}' not found or offline.`);
      return;
    }

    const messageData = {
      sender,
      recipient,
      content,
      timestamp: new Date(),
      isPrivate: true
    };

    // Send only one local copy for sender
    io.to(recId).emit('private message', messageData);
    socket.emit('private message', { ...messageData, localCopy: true });
  });

  socket.on('disconnect', () => {
    const name = socketsMap.get(socket.id);
    if (!name) return;
    namesInUse.delete(name.toLowerCase());
    usernamesMap.delete(name.toLowerCase());
    socketsMap.delete(socket.id);

    const leaveMsg = { username: 'System', content: `${name} has left the chat.`, timestamp: new Date(), isAdmin: false, system: true };
    pushHistory(leaveMsg);
    io.emit('chat message', leaveMsg);
    broadcastUserCount();
  });
});

server.listen(3000, () => console.log('✅ Server running on port 3000'));
