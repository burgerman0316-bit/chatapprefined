const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');
const dmMenu = document.querySelector('.dm-user-menu');

let displayName = '';
let secureName = '';
let isAdmin = false;

// ================= Utility Functions =================

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

  let headerText = isSender ? `You → ${recipient}` : `${sender} → You`;
  const header = `<div class="msg-header">${headerText} <span class="private-indicator">(Private)</span></div>`;
  const body = `<div class="message-content">${content}</div>`;
  const foot = `<div class="timestamp">${timestamp}</div>`;

  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ================= Event Handlers =================

joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (name) socket.emit('check_staff_status', name);
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

socket.on('name_rejected', msg => alert('Name rejected: ' + msg));

socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendPrivateMessage(msg));

socket.on('chat history', history => {
  messagesDiv.innerHTML = '';
  history.forEach(item => appendMessage(item));
});

socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
});

socket.on('system_error', msg => appendMessage({ username: 'System', content: `Error: ${msg}`, timestamp: new Date(), isAdmin: true }));
socket.on('system_alert', msg => appendMessage({ username: 'System', content: `Alert: ${msg}`, timestamp: new Date(), isAdmin: true }));

// ================= Enter Key Handling =================

messageInputDiv.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
});

// ================= DM Menu Handling =================

messageInputDiv.addEventListener('input', () => {
  const text = messageInputDiv.innerText.trim();

  // Only show DM menu if typing "/msg "
  if (text.startsWith('/msg ')) {
    const parts = text.substring(5).split(/\s+/);
    const search = parts[0] || '';

    // Get all users from #messages div (or your own user list if available)
    const users = Array.from(document.querySelectorAll('.msg .msg-header'))
      .map(h => h.textContent.replace(/ \(Admin\)/, '').split(' → ')[0])
      .filter(u => u && u.toLowerCase() !== displayName.toLowerCase());

    const matches = users.filter(u => u.toLowerCase().includes(search.toLowerCase()));

    dmMenu.innerHTML = '';
    matches.forEach(u => {
      const btn = document.createElement('button');
      btn.textContent = u;
      btn.addEventListener('click', () => {
        const msg = parts.slice(1).join(' ');
        messageInputDiv.innerText = `/msg ${u} ${msg}`;
        dmMenu.style.display = 'none';
        messageInputDiv.focus();
      });
      dmMenu.appendChild(btn);
    });

    dmMenu.style.display = matches.length ? 'flex' : 'none';
    dmMenu.style.flexDirection = 'column';
  } else {
    dmMenu.style.display = 'none';
  }
});

// ================= Message Form Submission =================

messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if (!content || !displayName) return;

  if (content.star
