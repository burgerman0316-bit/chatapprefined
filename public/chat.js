const socket = io();

// ===== DOM Elements =====
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

// ===== Modals =====
const staffNameModal = document.getElementById('staffNameModal');
const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const dmCloseBtn = document.getElementById('dmCloseBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmTarget = null; // Stores currently selected DM target

// ===== Helper Functions =====
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

  if (msg.isPrivate) item.classList.add('private');
  if (msg.isSystem) item.classList.add('system-msg');

  const header = msg.username ? `<div class="msg-header">${msg.username}</div>` : '';
  const body = `<div class="message-content">${msg.content}</div>`;
  const foot = msg.timestamp ? `<div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>` : '';
  
  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showStaffNameModal(message) {
  const modalText = staffNameModal.querySelector('.modal-message');
  modalText.textContent = message;
  staffNameModal.style.display = 'flex';
}

function hideStaffNameModal() {
  staffNameModal.style.display = 'none';
}

function showDmModal(users) {
  dmUserList.innerHTML = '';
  users.forEach(u => {
    if (u.toLowerCase() !== displayName.toLowerCase()) {
      const btn = document.createElement('button');
      btn.textContent = u;
      btn.addEventListener('click', () => {
        dmTarget = u;
        messageInputDiv.innerHTML = '';
        const span = document.createElement('span');
        span.classList.add('dm-highlight');
        span.textContent = `[${u}]: `;
        messageInputDiv.appendChild(span);
        messageInputDiv.appendChild(document.createTextNode(' '));
        dmModal.style.display = 'none';
        messageInputDiv.focus();
      });
      dmUserList.appendChild(btn);
    }
  });
  dmModal.style.display = 'flex';
}

function hideDmModal() {
  dmModal.style.display = 'none';
}

// ===== Event Listeners =====

// Join chat
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) return;
  socket.emit('check_staff_status', name);
});

// Enter key sends message
messageInputDiv.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event('submit'));
  }
});

// Form submit
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  let content = messageInputDiv.innerText.trim();
  if (!content || !displayName) return;

  // Check for DM highlight
  if (dmTarget) {
    const firstChild = messageInputDiv.firstChild;
    if (firstChild && firstChild.classList.contains('dm-highlight')) {
      const p
