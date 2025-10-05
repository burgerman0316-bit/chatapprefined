// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const MAX_HISTORY = 100;

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function isNameReserved(name) {
  if (!name) return false;
  const check = name.trim().toLowerCase();
  return false;
}

function containsBannedWord(content) {
  if (!content) return false;
  const c = content.toLowerCase();
  return false;
}

function getStaffDisplayInfo(enteredUsername) {
  const secure = String(enteredUsername || '').trim();
  return { isAdmin: false, username: secure || '', secureName: secure || '' };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount() {
  const userList = Array.from(socketsMap.values()).sort();
  io.emit('user count', { count: namesInUse.size, userList });
}

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  socket.on('check_staff_status', (enteredName) => {
    const trimmed = String(enteredName || '').trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed) { socket.emit('name_rejected', 'Please provide a name.'); return; }
    if (namesInUse.has(lower)) { socket.emit('name_rejected', 'That name is already in use.'); return; }

    if (isNameReserved(trimmed)) {
        socket.emit('name_rejected', 'That name contains forbidden words.'); return;
    } else {
      namesInUse.add(lower);
      socketsMap.set(socket.id, trimmed);
      socket.emit('name_accepted', trimmed);

      const joinMsg = { username: trimmed, content: `${trimmed} has joined the chat.`, timestamp: new Date(), isAdmin: false, secureName: trimmed };
      pushHistory(joinMsg);
      io.emit('chat message', joinMsg);
    }
    broadcastUserCount();
  });

  socket.on('name_change_request', (data) => {
    const oldSecure = String(data.oldName || '').trim();
    const newName = String(data.newName || '').trim();
    const newLower = newName.toLowerCase();
    const currentDisplay = socketsMap.get(socket.id) || '';

    if (!newName || newName === currentDisplay) { socket.emit('name_change_failed', 'A valid, different name is required.'); return; }
    if (isNameReserved(newName)) { socket.emit('name_change_failed', 'That name is reserved or contains forbidden words.'); return; }
    if (namesInUse.has(newLower)) { socket.emit('name_change_failed', 'That name is already taken.'); return; }

    if (currentDisplay) namesInUse.delete(currentDisplay.toLowerCase());
    namesInUse.add(newLower);
    socketsMap.set(socket.id, newName);

    const success = { oldDisplayName: currentDisplay, newDisplayName: newName, newSecureName: newName, timestamp: new Date() };

    socket.emit('name_change_success', success);
    const publicSys = { username: 'System', content: `${currentDisplay} is now known as ${newName}.`, timestamp: new Date(), isAdmin: true, secureName: newName };
    pushHistory(publicSys);
    io.emit('chat message', publicSys);
    broadcastUserCount();
  });

  socket.on('chat message', (msg) => {
    try {
      if (containsBannedWord(msg.content)) {
        socket.emit('system_error', 'Your message contained forbidden language and was not sent.');
        return;
      }
      const staffInfo = getStaffDisplayInfo(msg.username);
      const messageData = { username: staffInfo.username, content: msg.content, timestamp: new Date(), isAdmin: staffInfo.isAdmin, secureName: staffInfo.secureName };
      pushHistory(messageData);
      io.emit('chat message', messageData);
    } catch (err) {
      console.error('chat message handler error:', err);
      socket.emit('system_error', 'Server error while processing message.');
    }
  });

  socket.on('private message', (msg) => {
    const senderDisplayName = socketsMap.get(socket.id);
    if (!senderDisplayName) return;

    let recipientSocketId = null;
    for (const [id, displayName] of socketsMap.entries()) {
      if (displayName.toLowerCase() === msg.recipient.toLowerCase()) {
        recipientSocketId = id;
        break;
      }
    }

    if (recipientSocketId) {
      const messageData = {
        sender: senderDisplayName,
        recipient: msg.recipient,
        content: msg.content,
        timestamp: new Date()
      };
      io.to(recipientSocketId).emit('private message', messageData);
      socket.emit('private message', messageData);
    } else {
      socket.emit('system_error', `User '${msg.recipient}' not found or not online.`);
    }
  });

  socket.on('admin:clear_history', (data) => {
    const info = getStaffDisplayInfo(data.username);
    if (info.isAdmin) {
      chatHistory.length = 0;
      const clearMsg = {
        username: 'System',
        content: `Moderator ${info.username} has cleared the chat history.`,
        timestamp: new Date(),
        isAdmin: true
      };
      pushHistory(clearMsg);
      io.emit('chat message', clearMsg);
    } else {
      socket.emit('system_error', 'Unauthorized: Admin privileges required to clear history.');
    }
  });

  socket.on('disconnect', () => {
    const nameToRemove = socketsMap.get(socket.id);

    if (nameToRemove) {
      namesInUse.delete(nameToRemove.toLowerCase());
      socketsMap.delete(socket.id);
      console.log(`User disconnected. Name ${nameToRemove} released.`);

      const publicNotice = {
        username: 'System',
        content: 'A user has left the chat.',
        timestamp: new Date(),
        isAdmin: true
      };
      pushHistory(publicNotice);
      io.emit('chat message', publicNotice);
    }
    broadcastUserCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
