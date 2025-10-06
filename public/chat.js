const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');
const dmUserMenu = document.querySelector('.dm-user-menu');

let displayName = '';
let secureName = '';
let isAdmin = false;
let onlineUsers = []; // store online users for DM menu

// ========== Utility / Append functions ==========
function appendMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('msg');
  if (!msg.isAdmin) {
    if (msg.username && displayName && msg.username.toLowerCase() === displayName.toLowerCase()) {
      item.classList.add('own');
    } else {
      item.classList.add('other');
    }
  }
  const header = `<div class="msg-header">${msg.username}${msg.isAdmin ? ' (Admin)' : ''}</div>`;
  const body = `<div class="message-content">${msg.content}</div>`;
  const foot = `<div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;
  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendPrivateMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('msg', 'private');

  const sender = msg.sender || 'Unknown';
  const recipient = msg.recipient || '';
  const content = msg.content;
  const timestamp = new Date(msg.timestamp).toLocaleTimeString();
  const isSender = (sender.toLowerCase() === displayName.toLowerCase());

  if (isSender) item.classList.add('own');
  else item.classList.add('other');

  const headerText = isSender ? `You → ${recipient}` : `${sender} → You`;

  const header = `<div class="msg-header">${headerText} <span class="private-indicator">(Private)</span></div>`;
  const body = `<div class="message-content">${content}</div>`;
  const foot = `<div class="timestamp">${timestamp}</div>`;

  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== Socket Events ==========
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (name) {
    socket.emit('check_staff_status', name);
  }
});

socket.on('name_accepted', name => {
  displayName = name;
  secureName = name;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
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
socket.on('private message', msg => appendPrivateMessage(msg));

socket.on('chat history', history => {
  messagesDiv.innerHTML = '';
  history.forEach(item => appendMessage(item));
});

socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
  onlineUsers = data.userList || []; // store online users for DM menu
});

socket.on('system_error', msg => appendMessage({ username: 'System', content: `Error: ${msg}`, timestamp: new Date(), isAdmin: true }));
socket.on('system_alert', msg => appendMessage({ username: 'System', content: `Alert: ${msg}`, timestamp: new Date(), isAdmin: true }));

// ========== DM User Menu Logic ==========
function showDMMenu(filter = '') {
  dmUserMenu.innerHTML = '';
  const filtered = onlineUsers.filter(u => u.toLowerCase().startsWith(filter.toLowerCase()) && u.toLowerCase() !== displayName.toLowerCase());
  if (filtered.length === 0) {
    dmUserMenu.style.display = 'none';
    return;
  }

  filtered.forEach(user => {
    const btn = document.createElement('button');
    btn.textContent = user;
    btn.addEventListener('click', () => {
      messageInputDiv.innerText = `/msg ${user} `;
      messageInputDiv.focus();
      dmUserMenu.style.display = 'none';
    });
    dmUserMenu.appendChild(btn);
  });

  dmUserMenu.style.display = 'flex';
}

// Hide DM menu when clicking outside
document.addEventListener('click', e => {
  if (!dmUserMenu.contains(e.target) && e.target !== messageInputDiv) {
    dmUserMenu.style.display = 'none';
  }
});

// ========== Message Sending ==========
messageInputDiv.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // prevent newline
    messageForm.dispatchEvent(new Event('submit'));
  }
});

messageInputDiv.addEventListener('input', () => {
  const content = messageInputDiv.innerText.trim();
  if (content.startsWith('/msg ')) {
    const partial = content.substring(5).trim();
    showDMMenu(partial);
  } else {
    dmUserMenu.style.display = 'none';
  }
});

messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if (!content || !displayName) return;

  if (content.startsWith('/msg ')) {
    const parts = content.substring(5).trim().split(/\s+/);
    const recipient = parts.shift();
    const msg = parts.join(' ');
    if (recipient && msg) {
      socket.emit('private message', { recipient, content: msg });
      appendPrivateMessage({ sender: displayName, recipient, content, timestamp: new Date() });
      messageInputDiv.innerText = '';
      dmUserMenu.style.display = 'none';
      return;
    } else {
      appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), isAdmin: true });
      messageInputDiv.innerText = '';
      dmUserMenu.style.display = 'none';
      return;
    }
  }

  // regular message
  socket.emit('chat message', { username: secureName || displayName, content });
  messageInputDiv.innerText = '';
  dmUserMenu.style.display = 'none';
});
