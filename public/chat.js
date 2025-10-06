const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

// Modals
const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const closeDmModalBtn = document.getElementById('closeDmModal');

const clearChatModal = document.getElementById('clearChatModal');
const confirmClearBtn = document.getElementById('confirmClearBtn');
const cancelClearBtn = document.getElementById('cancelClearBtn');

const reservedNameModal = document.getElementById('reservedNameModal');
const closeReservedName = document.getElementById('closeReservedName');

const nameInUseModal = document.getElementById('nameInUseModal');
const closeNameInUse = document.getElementById('closeNameInUse');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmRecipient = '';

// ========== Utility / Append functions ==========
function appendMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('msg');

  if (msg.isPrivate) {
    item.classList.add('private');
  } else if (msg.username === 'System') {
    item.classList.add('system');
  } else {
    if (msg.username && displayName && msg.username.toLowerCase() === displayName.toLowerCase()) {
      item.classList.add('own');
    } else {
      item.classList.add('other');
    }
  }

  const header = msg.username !== 'System' ? `<div class="msg-header">${msg.username}${msg.isAdmin ? ' (Admin)' : ''}</div>` : '';
  const body = `<div class="message-content">${msg.content}</div>`;
  const foot = `<div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;
  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== Join Chat ==========
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) return;
  socket.emit('check_name', name);
});

// ========== Socket Events ==========
socket.on('name_accepted', data => {
  displayName = data.displayName;
  secureName = data.secureName;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
  isAdmin = data.isAdmin;
  clearChatBtn.style.display = isAdmin ? 'inline-block' : 'none';
});

socket.on('name_rejected_reserved', () => {
  reservedNameModal.style.display = 'flex';
});

socket.on('name_rejected_inuse', () => {
  nameInUseModal.style.display = 'flex';
});

socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));

socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
});

// ========== Close modals ==========
closeReservedName.onclick = () => reservedNameModal.style.display = 'none';
closeNameInUse.onclick = () => nameInUseModal.style.display = 'none';

// ========== Clear Chat ==========
clearChatBtn.onclick = () => clearChatModal.style.display = 'flex';
cancelClearBtn.onclick = () => clearChatModal.style.display = 'none';
confirmClearBtn.onclick = () => {
  socket.emit('admin:clear_history', { username: secureName });
  clearChatModal.style.display = 'none';
};

// ========== DM Modal ==========
closeDmModalBtn.onclick = () => {
  dmModal.style.display = 'none';
  dmRecipient = '';
};

// ========== Message Handling ==========
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  sendMessage();
});

// Send message on Enter (no shift)
messageInputDiv.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function sendMessage() {
  let content = messageInputDiv.innerText.trim();
  if (!content) return;

  // Check for DM prefix
  const dmMatch = content.match(/^\[([^\]]+)\]:\s/);
  if (dmMatch) {
    const recipient = dmMatch[1];
    const messageText = content.substring(dmMatch[0].length);
    if (!messageText) return;

    socket.emit('private message', { recipient, content: messageText });
    messageInputDiv.innerHTML = '';
    dmRecipient = '';
    return;
  }

  // Check for /msg command to open DM modal
  if (content.startsWith('/msg')) {
    openDmModal();
    return;
  }

  // Regular message
  socket.emit('chat message', { username: secureName || displayName, content });
  messageInputDiv.innerHTML = '';
}

// ========== Open DM Modal ==========
function openDmModal() {
  socket.emit('request_users');
  dmModal.style.display = 'flex';
}

// Populate DM user list
socket.on('user_list', users => {
  dmUserList.innerHTML = '';
  users.forEach(user => {
    if (user.toLowerCase() === displayName.toLowerCase()) return; // skip self
    const btn = document.createElement('button');
    btn.textContent = user;
    btn.onclick = () => {
      dmRecipient = user;
      messageInputDiv.innerHTML = `<span class="highlighted">[${dmRecipient}]: </span>&nbsp;`;
      dmModal.style.display = 'none';
      placeCaretAtEnd(messageInputDiv);
    };
    dmUserList.appendChild(btn);
  });
});

// Helper to place caret at end
function placeCaretAtEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
