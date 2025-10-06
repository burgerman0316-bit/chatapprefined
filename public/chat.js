const socket = io();

// DOM Elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const openAdminPanelBtn = document.getElementById('openAdminPanelBtn');
const messageInputDiv = document.getElementById('messageInput');
const messageForm = document.getElementById('messageForm');
const messagesDiv = document.getElementById('messages');

const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');

const adminPanelModal = document.getElementById('adminPanelModal');
const panelClearChatBtn = document.getElementById('panelClearChatBtn');

const nameReservedModal = document.getElementById('nameReservedModal');

let displayName = '';
let isAdmin = false;
let dmTarget = '';

// Utility to append messages
function appendMessage(msg) {
  const item = document.createElement('div');
  if (msg.isSystem) {
    item.className = 'system-msg';
    item.textContent = msg.content;
  } else {
    item.className = 'msg';
    if (msg.username === displayName) item.classList.add('own');
    else item.classList.add('other');

    const header = document.createElement('div');
    header.className = 'msg-header';
    header.textContent = msg.username;
    const body = document.createElement('div');
    body.textContent = msg.content;
    item.appendChild(header);
    item.appendChild(body);
  }
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Join chat
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) return;
  socket.emit('check_staff_status', name);
});

// Handle Enter key send
messageInputDiv.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    messageForm.requestSubmit();
  }
});

// Send message
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if (!content || !displayName) return;

  // Handle DM highlight
  const dmMatch = content.match(/^\[(.+?)\]:\s/);
  if (dmMatch) {
    const recipient = dmMatch[1];
    const msg = content.replace(/^\[.+?\]:\s/, '');
    if (msg) {
      socket.emit('private message', { recipient, content: msg });
      messageInputDiv.innerText = '';
      return;
    } else return;
  }

  // Normal message
  socket.emit('chat message', { username: displayName, content });
  messageInputDiv.innerText = '';
});

// Socket events
socket.on('name_rejected', () => {
  nameReservedModal.style.display = 'flex';
});

socket.on('name_accepted', name => {
  displayName = name;
});

socket.on('staff_status_update', data => {
  displayName = data.displayName;
  isAdmin = data.isAdmin;
  if (isAdmin) openAdminPanelBtn.style.display = 'inline-block';
});

socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage({ ...msg, username: `${msg.sender} → ${msg.recipient}` }));

// Admin panel actions
openAdminPanelBtn.addEventListener('click', () => adminPanelModal.style.display='flex');
adminPanelModal.querySelector('.close-btn').addEventListener('click', () => adminPanelModal.style.display='none');

panelClearChatBtn.addEventListener('click', () => {
  socket.emit('admin:clear_history', { username: displayName });
  adminPanelModal.style.display='none';
});

// Close modals
document.querySelectorAll('.modal .close-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    btn.closest('.modal').style.display = 'none';
  });
});
