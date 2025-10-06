const socket = io();

const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');
const dmUserMenu = document.querySelector('.dm-user-menu');

let displayName = '';
let onlineUsers = [];

// ========== Utilities ==========
function appendMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('msg', msg.username === displayName ? 'own' : 'other');
  const header = `<div class="msg-header">${msg.username || 'System'}</div>`;
  const body = `<div class="message-content">${msg.content}</div>`;
  item.innerHTML = header + body;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== Event Handlers ==========
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) return;
  socket.emit('check_staff_status', name);
});

messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if (!content || !displayName) return;

  // /msg command
  if (content.startsWith('/msg ')) {
    const parts = content.substring(5).trim().split(/\s+/);
    const recipient = parts.shift();
    const msg = parts.join(' ');
    if (recipient && msg) {
      socket.emit('private message', { recipient, content: msg });
      messageInputDiv.innerText = '';
      dmUserMenu.style.display = 'none';
      return;
    } else {
      appendMessage({ username:'System', content:'Invalid /msg usage' });
      return;
    }
  }

  // normal message
  socket.emit('chat message', { username: displayName, content });
  messageInputDiv.innerText = '';
  dmUserMenu.style.display = 'none';
});

// Prevent Enter from creating new lines, send message instead
messageInputDiv.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event('submit'));
  }
});

// DM menu while typing /msg
messageInputDiv.addEventListener('input', () => {
  const text = messageInputDiv.innerText.trim();
  if (!text.startsWith('/msg ')) {
    dmUserMenu.style.display = 'none';
    return;
  }

  const partial = text.substring(5).trim().toLowerCase();
  const filtered = onlineUsers.filter(u => u.toLowerCase().startsWith(partial) && u !== displayName);

  dmUserMenu.innerHTML = '';
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
});

// ========== Socket Events ==========
socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));

socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
  onlineUsers = data.userList || [];
});

socket.on('name_accepted', name => displayName = name);
