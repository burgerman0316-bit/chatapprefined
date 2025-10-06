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
const usernamesMap = new Map(); // lowercase username -> socket id

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

// ========== Event wiring ==========

joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (name) socket.emit('check_staff_status', name);
});

// Socket listeners
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

socket.on('name_rejected', msg => alert('Name rejected: ' + msg));

socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendPrivateMessage(msg));
socket.on('chat history', history => {
  messagesDiv.innerHTML = '';
  history.forEach(item => appendMessage(item));
});

socket.on('user count', data => userCountDisplay.textContent = `${data.count} Users Online`);
socket.on('system_error', msg => appendMessage({ username: 'System', content: `Error: ${msg}`, timestamp: new Date(), isAdmin: true }));
socket.on('system_alert', msg => appendMessage({ username: 'System', content: `Alert: ${msg}`, timestamp: new Date(), isAdmin: true }));

// ========== Handle message input ==========

messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if (!content || !displayName) return;

  // Handle /msg command
  if (content.startsWith('/msg ')) {
    const parts = content.substring(5).trim().split(/\s+/);
    const recipient = parts.shift();
    const msg = parts.join(' ');

    // No recipient -> show DM menu
    if (!recipient) {
      dmUserMenu.innerHTML = '';
      const onlineUsers = Array.from(usernamesMap.keys())
        .filter(name => name !== displayName.toLowerCase());

      if (onlineUsers.length === 0) {
        appendMessage({ username: 'System', content: 'No online users to DM.', timestamp: new Date(), isAdmin: true });
        messageInputDiv.innerText = '';
        return;
      }

      onlineUsers.forEach(name => {
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.addEventListener('click', () => {
          messageInputDiv.innerText = `/msg ${name} `;
          dmUserMenu.style.display = 'none';
          messageInputDiv.focus();
        });
        dmUserMenu.appendChild(btn);
      });

      dmUserMenu.style.display = 'flex';
      messageInputDiv.innerText = '';
      return;
    }

    // Recipient exists but no message
    if (!msg) {
      appendMessage({ username: 'System', content: 'Please type a message after the username.', timestamp: new Date(), isAdmin: true });
      messageInputDiv.innerText = `/msg ${recipient} `;
      return;
    }

    // Normal private message
    socket.emit('private message', { recipient, content: msg });
    messageInputDiv.innerText = '';
    return;
  }

  // Regular public message
  socket.emit('chat message', { username: secureName || displayName, content });
  messageInputDiv.innerText = '';
});

// ========== Update DM menu dynamically when user count changes ==========
socket.on('user count', data => {
  usernamesMap.clear();
  data.userList?.forEach(name => usernamesMap.set(name.toLowerCase(), true)); // simple map for lookup
});
