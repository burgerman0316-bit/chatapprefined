const socket = io();

// DOM Elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

const nameModal = document.getElementById('nameModal');
const nameModalText = document.getElementById('nameModalText');
const nameModalOkBtn = document.getElementById('nameModalOkBtn');
const closeNameModal = document.getElementById('closeNameModal');

const dmModal = document.getElementById('dmModal');
const closeDMModal = document.getElementById('closeDMModal');
const dmUserList = document.getElementById('dmUserList');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmTarget = null;

// Utility
function appendMessage(msg) {
  const item = document.createElement('div');
  if(msg.isSystem){
    item.classList.add('system-msg');
    item.textContent = msg.content;
  } else {
    item.classList.add('msg');
    item.classList.add(msg.isPrivate ? 'private' : msg.username.toLowerCase() === displayName.toLowerCase() ? 'own' : 'other');
    const header = document.createElement('div');
    header.classList.add('msg-header');
    header.textContent = msg.username + (msg.isAdmin ? ' (Admin)' : '') + (msg.isPrivate ? ' (Private)' : '');
    const body = document.createElement('div');
    body.classList.add('message-content');
    body.textContent = msg.content;
    item.appendChild(header);
    item.appendChild(body);
  }
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showNameModal(text) {
  nameModalText.textContent = text;
  nameModal.style.display = 'flex';
}

// Events
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if(!name) return;
  socket.emit('check_staff_status', name);
});

nameModalOkBtn.addEventListener('click', () => {
  nameModal.style.display = 'none';
});

closeNameModal.addEventListener('click', () => {
  nameModal.style.display = 'none';
});

closeDMModal.addEventListener('click', () => {
  dmModal.style.display = 'none';
});

socket.on('name_accepted', name => {
  displayName = name;
  secureName = name;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
});

socket.on('name_rejected', msg => {
  showNameModal(msg);
});

socket.on('staff_status_update', data => {
  displayName = data.displayName;
  secureName = data.secureName;
  isAdmin = data.isAdmin;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
  clearChatBtn.style.display = isAdmin ? 'inline-block' : 'none';
});

socket.on('chat message', appendMessage);
socket.on('private message', appendMessage);

socket.on('chat history', history => {
  messagesDiv.innerHTML = '';
  history.forEach(appendMessage);
});

socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
});

// Send messages
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if(!content || !displayName) return;

  if(dmTarget){
    socket.emit('private message', {recipient: dmTarget, content});
    messageInputDiv.innerHTML = '';
    dmTarget = null;
    return;
  }

  if(content.startsWith('/msg ')){
    dmModal.style.display = 'flex';
    socket.emit('get_users');
    return;
  }

  socket.emit('chat message', {username: secureName || displayName, content});
  messageInputDiv.innerHTML = '';
});

// Fetch online users for DM modal
socket.on('users_list', users => {
  dmUserList.innerHTML = '';
  users.filter(u => u !== displayName).forEach(u => {
    const btn = document.createElement('button');
    btn.textContent = u;
    btn.addEventListener('click', () => {
      dmTarget = u;
      messageInputDiv.innerHTML = `<span class="dm-highlight">${u}:</span> `;
      dmModal.style.display = 'none';
    });
    dmUserList.appendChild(btn);
  });
});

// Pressing Enter sends message
messageInputDiv.addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    messageForm.dispatchEvent(new Event('submit'));
  }
});
