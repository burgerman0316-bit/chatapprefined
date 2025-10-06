const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const MAX_HISTORY = 100;

// STAFF LIST
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

// CHAT STORAGE
const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map(); // socket.id -> displayName
const usernamesMap = new Map(); // lowercased displayName -> socket.id
const bannedUsers = new Set();
const bannedIps = new Set();

// ====== STATIC FILES ======
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ====== HELPERS ======
function isStaffName(name) {
  return STAFF_LIST.some(
    s =>
      s.loginName.toLowerCase() === name.toLowerCase() ||
      s.displayName.toLowerCase() === name.toLowerCase()
  );
}

function getStaffInfo(name) {
  const staff = STAFF_LIST.find(
    s =>
      s.loginName.toLowerCase() === name.toLowerCase() ||
      s.displayName.toLowerCase() === name.toLowerCase()
  );
  if (staff) return { isAdmin: true, displayName: staff.displayName, secureName: staff.loginName };
  return { isAdmin: false, displayName: name, secureName: name };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount() {
  io.emit('user count', { count: namesInUse.size, userList: Array.from(namesInUse) });
}

// ====== SOCKET.IO ======
io.on('connection', socket => {
  const clientIp = socket.handshake.address;

  // Reject banned IPs
  if (bannedIps.has(clientIp)) {
    socket.disconnect();
    return;
  }

  console.log('Connected:', socket.id);
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // ====== CHECK NAME ======
  socket.on('check_staff_status', name => {
    const lower = name.toLowerCase();

    if (!name) {
      socket.emit('name_rejected', 'Please provide a name.');
      return;
    }

    if (namesInUse.has(lower)) {
      socket.emit('name_rejected', 'That name is already in use.');
      return;
    }

    if (isStaffName(name)) {
      socket.emit('name_rejected', 'That name is reserved for staff.');
      return;
    }

    if (bannedUsers.has(lower)) {
      socket.emit('name_rejected', 'You are banned from this chat.');
      return;
    }

    // Normal user
    namesInUse.add(lower);
    socketsMap.set(socket.id, name);
    usernamesMap.set(lower, socket.id);
    socket.emit('name_accepted', name);

    const joinMsg = {
      username: 'System',
      content: `${name} has joined the chat.`,
      timestamp: new Date(),
      isSystem: true
    };
    pushHistory(joinMsg);
    io.emit('chat message', joinMsg);

    broadcastUserCount();
  });

  // ====== CHAT MESSAGE ======
  socket.on('chat message', msg => {
    if (!msg.content) return;
    const messageData = {
      username: msg.username,
      content: msg.content,
      timestamp: new Date(),
      isSystem: false
    };
    pushHistory(messageData);
    io.emit('chat message', messageData);
  });

  // ====== PRIVATE MESSAGE ======
  socket.on('private message', msg => {
    const sender = socketsMap.get(socket.id);
    if (!sender) return;

    const recipient = msg.recipient.trim();
    const content = msg.content.trim();
    if (!recipient || !content) return;

    const recSocketId = usernamesMap.get(recipient.toLowerCase());
    if (recSocketId) {
      const messageData = {
        sender,
        recipient,
        content,
        timestamp: new Date(),
        isPrivate: true,
        username: sender
      };
      io.to(recSocketId).emit('private message', messageData);
      socket.emit('private message', messageData);
    } else {
      socket.emit('chat message', {
        username: 'System',
        content: `User '${recipient}' not found.`,
        timestamp: new Date(),
        isSystem: true
      });
    }
  });

  // ====== REQUEST USER LIST FOR DM ======
  socket.on('request_user_list', () => {
    const users = Array.from(namesInUse).filter(
      u => u.toLowerCase() !== (socketsMap.get(socket.id) || '').toLowerCase()
    );
    socket.emit('user_list', users);
  });

  // ====== DISCONNECT ======
  socket.on('disconnect', () => {
    const name = socketsMap.get(socket.id);
    if (name) {
      namesInUse.delete(name.toLowerCase());
      usernamesMap.delete(name.toLowerCase());
      socketsMap.delete(socket.id);

      const leaveMsg = {
        username: 'System',
        content: `${name} has left the chat.`,
        timestamp: new Date(),
        isSystem: true
      };
      pushHistory(leaveMsg);
      io.emit('chat message', leaveMsg);
      broadcastUserCount();
    }
  });

  // ====== ADMIN DATA ======
  socket.on('request_admin_data', () => {
    socket.emit('admin_data', {
      onlineUsers: Array.from(namesInUse),
      bannedUsers: Array.from(bannedUsers),
      bannedIps: Array.from(bannedIps)
    });
  });

  // ====== ADMIN ACTIONS ======
  socket.on('admin:clear_history', data => {
    chatHistory.length = 0;
    io.emit('chat history', chatHistory);
  });

  socket.on('admin:ban_user', name => {
    bannedUsers.add(name.toLowerCase());
    const id = usernamesMap.get(name.toLowerCase());
    if (id) io.sockets.sockets.get(id)?.disconnect();
  });

  socket.on('admin:unban_user', name => bannedUsers.delete(name.toLowerCase()));
  socket.on('admin:ban_ip', ip => bannedIps.add(ip));
  socket.on('admin:unban_ip', ip => bannedIps.delete(ip));

  socket.on('admin:force_disconnect', name => {
    const id = usernamesMap.get(name.toLowerCase());
    if (id) io.sockets.sockets.get(id)?.disconnect();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
