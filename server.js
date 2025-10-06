const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Settings
const STAFF_ROOM = 'staff_room';
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler', 'admin', 'mod'];
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();    // socket.id → displayName
const usernamesMap = new Map();  // lowercased displayName → socket.id

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper functions
function isNameReserved(name) {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  if (BANNED_NAMES.some(b => lower.includes(b.toLowerCase()))) {
    return true;
  }
  return STAFF_LIST.some(s => s.loginName.toLowerCase() === lower || s.displayName.toLowerCase() === lower);
}

function getStaffDisplayInfo(enteredName) {
  const secure = enteredName.trim();
  const staff = STAFF_LIST.find(s => s.loginName === secure || s.displayName.toLowerCase() === secure.toLowerCase());
  if (staff) {
    return { isAdmin: true, username: staff.displayName, secureName: staff.loginName };
  }
  return { isAdmin: false, username: secure, secureName: secure };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory.shift();
  }
}

function broadcastUserCount() {
  const list = Array.from(socketsMap.values()).sort();
  io.emit('user count', { count: namesInUse.size, userList: list });
}

// Socket logic
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  // Send existing chat history
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // Name check
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();
    if (!name) {
      socket.emit('name_rejected', 'Please provide a name.');
      return;
    }
    if (namesInUse.has(lower)) {
      socket.emit('name_rejected', 'That name is already in use.');
      return;
    }
    if (isNameReserved(name)) {
      const info = getStaffDisplayInfo(name);
      if (info.isAdmin) {
        // Accept staff
        namesInUse.add(info.username.toLowerCase());
        socketsMap.set(socket.id, info.username);
        usernamesMap.set(info.username.toLowerCase(), socket.id);
        socket.join(STAFF_ROOM);

        // Notify staff room and public
        socket.emit('staff_status_update', { isAdmin: true, displayName: info.username, secureName: info.secureName });
        const publicMsg = {
          username: 'System',
          content: `A moderator has entered the chat.`,
          timestamp: new Date(),
          isAdmin: true
        };
        io.emit('chat message', publicMsg);
      } else {
        socket.emit('name_rejected', 'That name is reserved.');
        return;
      }
    } else {
      // Normal user
      namesInUse.add(lower);
      socketsMap.set(socket.id, name);
      usernamesMap.set(name.toLowerCase(), socket.id);
      socket.emit('name_accepted', name);

      const joinMsg = {
        username: name,
        content: `${name} has joined the chat.`,
        timestamp: new Date(),
        isAdmin: false
      };
      pushHistory(joinMsg);
      io.emit('chat message', joinMsg);
    }
    broadcastUserCount();
  });

  // Public chat messages
  socket.on('chat message', msg => {
    if (!msg.content) return;
    // (Optionally) filter bad words here
    const info = getStaffDisplayInfo(msg.username);
    const messageData = {
      username: info.username,
      content: msg.content,
      timestamp: new Date(),
      isAdmin: info.isAdmin
    };
    pushHistory(messageData);
    io.emit('chat message', messageData);
  });

  // Private message
  socket.on('private message', msg => {
    const sender = socketsMap.get(socket.id);
    if (!sender) {
      socket.emit('system_error', 'You must set a name first.');
      return;
    }
    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();
    if (!recipient || !content) {
      socket.emit('system_error', 'Invalid /msg command. Usage: /msg [username] [message]');
      return;
    }
    if (recipient.toLowerCase() === sender.toLowerCase()) {
      socket.emit('system_alert', 'You cannot send a private message to yourself.');
      return;
    }
    const recLower = recipient.toLowerCase();
    const recSocketId = usernamesMap.get(recLower);
    if (recSocketId) {
      const messageData = {
        sender: sender,
        recipient: recipient,
        content: content,
        timestamp: new Date(),
        isPrivate: true
      };
      // send to recipient
      io.to(recSocketId).emit('private message', messageData);
      // send copy to sender
      socket.emit('private message', messageData);
    } else {
      socket.emit('system_error', `User '${recipient}' not found or offline.`);
    }
  });

  // Clear history (admin only)
  socket.on('admin:clear_history', data => {
    const info = getStaffDisplayInfo(data.username);
    if (!info.isAdmin) {
      socket.emit('system_error', 'Unauthorized: Admin privileges required.');
      return;
    }
    chatHistory.length = 0;
    const clearMsg = {
      username: 'System',
      content: `Moderator ${info.username} cleared chat history.`,
      timestamp: new Date(),
      isAdmin: true
    };
    pushHistory(clearMsg);
    io.emit('chat history', chatHistory);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const name = socketsMap.get(socket.id);
    if (!name) return;

    const lower = name.toLowerCase();
    if (namesInUse.has(lower)) {
      namesInUse.delete(lower);
    }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
