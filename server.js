const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {cors:{origin:'*'}});

const MAX_HISTORY = 100;
const STAFF_LIST = [
  {loginName:'STAFF_CONTROLS-LIAM', displayName:'Liam Stern'},
  {loginName:'STAFF_CONTROLS-DIESEL', displayName:'Diesel Carter'},
  {loginName:'STAFF_CONTROLS-RICKY', displayName:'Ricky Martinez'}
];
const BANNED_NAMES = ['hitler','admin','mod'];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();
const usernamesMap = new Map();

app.use(express.static(path.join(__dirname,'public')));
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

function pushHistory(msg){
  chatHistory.push(msg);
  if(chatHistory.length>MAX_HISTORY) chatHistory.shift();
}

function broadcastUserCount(){
  io.emit('user count',{count:namesInUse.size});
}

function getStaffInfo(name){
  const staff = STAFF_LIST.find(s=>s.loginName===name || s.displayName.toLowerCase()===name.toLowerCase());
  if(staff) return {isAdmin:true,username:staff.displayName,secureName:staff.loginName};
  return {isAdmin:false,username:name,secureName:name};
}

io.on('connection', socket=>{
  console.log('Client connected:',socket.id);
  socket.emit('chat history',chatHistory);
  broadcastUserCount();

  socket.on('check_staff_status', name=>{
    const n = name.trim();
    if(!n){
      socket.emit('name_rejected','Please provide a name.');
      return;
    }
    const lower = n.toLowerCase();
    if(namesInUse.has(lower)){
      socket.emit('name_rejected','That name is already in use.');
      return;
    }
    const staffInfo = getStaffInfo(n);
    if(staffInfo.isAdmin){
      socket.emit('name_rejected','That name is reserved for staff.');
      return;
    }

    namesInUse.add(lower);
    socketsMap.set(socket.id,n);
    usernamesMap.set(lower,socket.id);
    socket.emit('name_accepted',n);

    const joinMsg = {username:'System',content:`${n} has joined the chat.`,timestamp:new Date(),isSystem:true};
    pushHistory(joinMsg);
    io.emit('chat message',joinMsg);
    broadcastUserCount();
  });

  socket.on('chat message', msg=>{
    if(!msg.content) return;
    const messageData = {username:msg.username,content:msg.content,timestamp:new Date()};
    pushHistory(messageData);
    io.emit('chat message',messageData);
  });

  socket.on('private message', msg=>{
    const sender = socketsMap.get(socket.id);
    if(!sender) return;
    const rec = msg.recipient;
    const recSocketId = usernamesMap.get(rec.toLowerCase());
    if(!recSocketId){
      socket.emit('chat message',{username:'System',content:`User '${rec}' not found or offline.`,isSystem:true});
      return;
    }
    const messageData = {username:sender,content:msg.content,timestamp:new Date(),isPrivate:true};
    io.to(recSocketId).emit('private message',messageData);
    socket.emit('private message',messageData);
  });

  socket.on('get_users', ()=>{
    const users = Array.from(namesInUse);
    socket.emit('users_list',users);
  });

  socket.on('disconnect', ()=>{
    const name = socketsMap.get(socket.id);
    if(!name) return;
    namesInUse.delete(name.toLowerCase());
    socketsMap.delete(socket.id);
    usernamesMap.delete(name.toLowerCase());
    const leaveMsg = {username:'System',content:`${name} has left the chat.`,isSystem:true};
    pushHistory(leaveMsg);
    io.emit('chat message',leaveMsg);
    broadcastUserCount();
  });
});

server.listen(3000,()=>console.log('Server listening on port 3000'));
