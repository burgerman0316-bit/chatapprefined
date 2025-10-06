const socket = io();

// DOM Elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

const staffNameModal = document.getElementById('staffNameModal');
const staffModalCloseBtn = document.getElementById('staffModalCloseBtn');

const dmModal = document.getElementById('dmModal');
const dmCloseBtn = document.getElementById('dmCloseBtn');
const dmUserList = document.getElementById('dmUserList');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmTarget = null;

// ========== FUNCTIONS ==========
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

function showStaffModal() {
  staffNameModal.style.display = 'flex';
}

function showDmModal(users) {
  dmUserList.innerHTML = '';
  users.forEach(u => {
    if(u.toLowerCase() === displayName.toLowerCase()) return;
    const btn = document.createElement('button');
    btn.innerText = u;
    btn.addEventListener('click', () => {
      dmTarget = u;
      messageInputDiv.innerHTML = `<span class="highlighted">${u}:</span>&nbsp;`;
      dmModal.style.display = 'none';
      placeCaretAtEnd(messageInputDiv);
    });
    dmUserList.appendChild(btn);
  });
  dmModal.style.display = 'flex';
}

function placeCaretAtEnd(el) {
  el.focus();
  document.getSelection().collapse(el, el.childNodes.length);
}

// ========== EVENT LISTENERS ==========

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
  let content = messageInputDiv.innerText.trim();
  if(!content) return;

  if(dmTarget && content.startsWith(`${dmTarget}:`)) {
    // Send private message
    socket.emit('private message', { recipient: dmTarget, content: content.replace(`${dmTarget}:`, '').trim() });
    messageInputDiv.innerText = '';
    dmTarget = null;
    return;
  }

  if(content.startsWith('/msg')) {
    socket.emit('request_user_list');
    return;
  }

  // Regular message
  socket.emit('chat message', { username: secureName || displayName, content });
  messageInputDiv.innerText = '';
});

dmCloseBtn.addEventListener('click', ()
