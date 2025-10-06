const socket = io();

const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

const staffNameModal = document.getElementById('staffNameModal');
const staffModalCloseBtn = document.getElementById('staffModalCloseBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;

// Append message
function appendMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('msg');

  if(msg.isSystem) item.classList.add('system');
  else if(msg.username.toLowerCase() === displayName.toLowerCase()) item.classList.add('own');
  else item.classList.add('other');

  let header = msg.isSystem ? '' : `<div class="msg-header">${msg.username}</div>`;
  let body = `<div class="message-content">${msg.content}</div>`;
  let foot = msg.isSystem ? '' : `<div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;

  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// EVENTS
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if(!name) return;
  socket.emit('check_staff_status', name);
});

staffModalCloseBtn.addEventListener('click', () => {
  staffNameModal.style.display = 'none';
});

clearChatBtn.addEventListener('click', () => {
  socket.emit('admin:clear_history', { username: secureName });
});

messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if(!content || !displayName) return;

  if(content.startsWith('/msg ')) {
    appendMessage({ username: 'System', content: 'Private messaging currently not enabled.', timestamp: new Date(), isSystem: true });
    messageInputDiv.innerText = '';
    return;
  }

  socket.emit('chat message', { username: secureName || displayName, content });
  messageInputDiv.innerText = '';
});

// SOCKET LISTENERS
socket.on('name_accepted', name => {
  displayName = name;
  secureName = name;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
});

socket.on('name_rejected', msg => {
  staffNameModal.style.display = 'flex';
});

socket.on('staff_status_update', data => {
  displayName = data.displayName;
  secureName = data.secureName;
  isAdmin = data.isAdmin;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
  clearChatBtn.style.display = isAdmin ? 'inline-block' : 'none';
});

socket.on('chat message', msg => appendMessage(msg));
socket.on('chat history', history => { messagesDiv.innerHTML=''; history.forEach(m=>appendMessage(m)); });
socket.on('user count', data => userCountDisplay.textContent = `${data.count} Users Online`);
