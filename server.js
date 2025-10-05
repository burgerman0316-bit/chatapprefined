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

const STAFF_ROOM = 'staff_room';
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler','admin','mod','foulword1','foulword2'];
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' },
  { loginName: 'STAFF_CONTROLS-AARON', displayName: 'Aaron Ortega' },
  { loginName: 'STAFF_CONTROLS-DONOVAN', displayName: 'Donovan Powell' }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function isNameReserved(name) {
  if (!name) return false;
  const check = name.trim().toLowerCase();
  for (const b of BANNED_NAMES) if (check.includes(b.toLowerCase())) return true;
  return STAFF_LIST.some(s => s.loginName.toLowerCase() === check || s.displayName.toLowerCase() === check);
}

function containsBannedWord(content) {
  if (!content) return false;
  const c = content.toLowerCase();
  return BANNED_NAMES.some(b => c.includes(b.toLowerCase()));
}

function getStaffDisplayInfo(enteredUsername) {
  const secure = String(enteredUsername || '').trim();
  const staff = STAFF_LIST.find(s => s.loginName === secure);
  if (staff) return { isAdmin: true, username: staff.displayName, secureName: staff.loginName };
  return { isAdmin: false, username: secure || '', secureName: secure || '' };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount() {
  io.emit('user count', namesInUse.size);
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
      // staff or banned
      const staffMatch = STAFF_LIST.find(s => s.loginName.toLowerCase() === lower || s.displayName.toLowerCase() === lower);
      if (staffMatch) {
        // require exact loginName to actually log in as staff
        if (staffMatch.loginName.toLowerCase() !== lower && staffMatch.displayName.toLowerCase() === lower) {
          socket.emit('name_rejected', 'That name is reserved by staff.'); return;
        }
        const info = getStaffDisplayInfo(trimmed);
        namesInUse.add(info.username.toLowerCase());
        socketsMap.set(socket.id, info.username);
        socket.join(STAFF_ROOM);

        const privateMsg = { username: 'System', content: `Staff member ${info.username} connected.`, timestamp: new Date(), isAdmin: true, secureName: info.secureName };
        socket.to(STAFF_ROOM).emit('staff message', privateMsg);

        const publicMsg = { username: 'System', content: 'A moderator has entered the chat.', timestamp: new Date(), isAdmin: true, secureName: null };
        // send to everyone (including staff) but you can change to exclude staff if desired:
        io.emit('chat message', publicMsg);

        socket.emit('staff_status_update', { isAdmin: true, displayName: info.username, secureName: info.secureName });
      } else {
        socket.emit('name_rejected', 'That name contains forbidden words.'); return;
      }
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

    if (getStaffDisplayInfo(oldSecure).isAdmin) {
      success.newSecureName = oldSecure;
      socket.emit('name_change_success', success);
      const privateMsg = { username: 'System', content: `Staff member ${currentDisplay} changed display name to ${newName}.`, timestamp: new Date(), isAdmin: true, secureName: oldSecure };
      socket.to(STAFF_ROOM).emit('staff message', privateMsg);
      return;
    }

    socket.emit('name_change_success', success);
    const publicSys = { username: 'System', content: `${currentDisplay} is now known as ${newName}.`, timestamp: new Date(), isAdmin: true, secureName: newName };
    pushHistory(publicSys);
    io.emit('chat message', publicSys);
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

  socket.on('admin:clear_history', (data) => {
    const info = getStaffDisplayInfo(data.username);
    if (info.isAdmin) {
      chatHistory.length = 0;
      const staffMsg = { username: info.username, content: `Chat history cleared by ${info.username}.`, timestamp: new Date(), secureName: info.secureName };
      io.to(STAFF_ROOM).emit('history_cleared_staff', staffMsg);
      const publicMsg = { username: 'Moderator', content: 'The chat history has been cleared.', timestamp: new Date() };
      io.emit('history_cleared_public', publicMsg);
      pushHistory(publicMsg);
    }
  });

  socket.on('disconnect', () => {
    const name = socketsMap.get(socket.id);
    const inStaff = socket.rooms.has(STAFF_ROOM);
    if (inStaff && name) {
      const privateMsg = { username: 'System', content: `Staff member ${name} disconnected.`, timestamp: new Date(), isAdmin: true, secureName: null };
      io.to(STAFF_ROOM).emit('staff message', privateMsg);
    }
    if (name) {
      namesInUse.delete(name.toLowerCase());
      socketsMap.delete(socket.id);
      if (!inStaff) {
        const leaveMsg = { username: name, content: `${name} has left the chat.`, timestamp: new Date(), isAdmin: false, secureName: name };
        pushHistory(leaveMsg);
        io.emit('chat message', leaveMsg);
      }
    }
    broadcastUserCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
