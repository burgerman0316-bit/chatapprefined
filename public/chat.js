const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

let displayName = '';
let secureName = '';
let isAdmin = false;

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

  if (isSender) {
    item.classList.add('own');
  } else {
    item.classList.add('other');
  }

  let headerText;
  if (isSender) {
    headerText = `You → ${recipient}`;
  } else {
    headerText = `${sender} → You`;
  }

  const header = `<div class="msg-header">${headerText} <span class="private-indicator">(Private)</span></div>`;
  const body = `<div class="message-content">${content}</div>`;
  const foot = `<div class="timestamp">${timestamp}</div>`;

  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== Event wiring ==========

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

socket.on('name_rejected', msg => {
  alert('Name rejected: ' + msg);
});

socket.on('chat message', msg => {
  appendMessage(msg);
});

socket.on('private message', msg => {
  appendPrivateMessage(msg);
});

socket.on('chat history', history => {
  messagesDiv.innerHTML = '';
  history.forEach(item => appendMessage(item));
});

socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
});

socket.on('system_error', msg => {
  appendMessage({ username: 'System', content: `Error: ${msg}`, timestamp: new Date(), isAdmin: true });
});
socket.on('system_alert', msg => {
  appendMessage({ username: 'System', content: `Alert: ${msg}`, timestamp: new Date(), isAdmin: true });
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
      messageInputDiv.innerText = '';
      return;
    } else {
      appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), isAdmin: true });
      messageInputDiv.innerText = '';
      return;
    }
  }

  // regular message
  socket.emit('chat message', { username: secureName || displayName, content });
  messageInputDiv.innerText = '';
});
