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

const BANNED_NAMES = ['hitler', 'admin', 'mod'];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();
const usernamesMap = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

function isNameReserved(name) {
  if(!name) return false;
  const lower = name.trim().toLowerCase();
  if(BANNED_NAMES.some(b=>lower.includes(b))) return true;
  return STAFF_LIST.some(s=>s.loginName.toLowerCase()===lower || s.displayName.toLowerCase()===lower);
}

function getStaffDisplayInfo(enteredName) {
  const secure = enteredName.trim();
  const staff = STAFF_LIST.find(s => s.loginName===secure || s.displayName.toLowerCase()===secure.toLowerCase());
  if(staff) return { isAdmin:true, username: staff.displayName, secureName: staff.loginName };
  return { isAdmin:false, username:secure, secureName:secure };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  if(chatHistory.length>100) chatHistory.shift();
}

function broadcastUserCount() {
  const list = Array.from(socketsMap.values()).sort();
  io.emit('user count',{ count: namesInUse.size, userList:list });
}

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  socket.on('check_staff_status', enteredName=>{
    const name = (enteredName||'').trim();
    const lower = name.toLowerCase();
    if(!name){ socket.emit('name_rejected','Please provide a name.'); return; }
    if(namesInUse.has(lower)){ socket.emit('name_rejected','That name is already in use.'); return; }
    if(isNameReserved(name)){
      const info = getStaffDisplayInfo(name);
      if(info.isAdmin){
        namesInUse.add(info.username.toLowerCase());
        socketsMap.set(socket.id, info.username);
        usernamesMap.set(info.username.toLowerCase(), socket.id);
        socket.join('staff_room');
        socket.emit('staff_status_update',{ isAdmin:true, displayName: info.username, secureName: info.secureName });
        io.emit('chat message', { username:'System', content:'A moderator has entered the chat.', timestamp:new Date(), isAdmin:true });
      } else {
        socket.emit('name_rejected','That name is reserved.');
        return;
      }
    } else {
      namesInUse.add(lower);
      socketsMap.set(socket.id, name);
      usernamesMap.set(name.toLowerCase(), socket.id);
      socket.emit('name_accepted',name);
      const joinMsg = { username:name, content:`${name} has joined the chat.`, timestamp:new Date(), isAdmin:false };
      pushHistory(joinMsg);
      io.emit('chat message',joinMsg);
    }
    broadcastUserCount();
  });

  socket.on('chat message', msg => {
    if(!msg.content) return;
    const info = getStaffDisplayInfo(msg.username);
    const messageData = { username:info.username, content:msg.content, timestamp:new Date(), isAdmin:info.isAdmin };
    pushHistory(messageData);
    io.emit('chat message', messageData);
  });

  socket.on('disconnect',()=>{
    const name = socketsMap.get(socket.id);
    if(!name) return;
    const lower = name.toLowerCase();
    namesInUse.delete(lower);
    usernamesMap.delete(lower);
    socketsMap.delete(socket.id);
    const leaveMsg = { username:'System', content:`${name} has left the chat.`, timestamp:new Date(), isAdmin:false };
    pushHistory(leaveMsg);
    io.emit('chat message',leaveMsg);
    broadcastUserCount();
  });

  socket.on('admin:clear_history', data => {
    const info = getStaffDisplayInfo(data.username);
    if(!info.isAdmin){ socket.emit('system_error','Unauthorized'); return; }
    chatHistory.length=0;
    pushHistory({ username:'System', content:`Moderator ${info.username} cleared chat history.`, timestamp:new Date(), isAdmin:true });
    io.emit('chat history', chatHistory);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>console.log(`Server listening on port ${PORT}`));
