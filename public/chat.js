const socket = io();

const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

let displayName = '';
let isAdmin = false;
let currentDM = null;

// ---------- Append functions ----------
function appendMessage(msg) {
  const item = document.createElement('div');
  if (msg.system) {
    item.className = msg.isAdmin ? 'admin-system-msg' : 'system-msg';
    item.textContent = msg.content;
  } else {
    item.classList.add('msg');
    item.classList.add(msg.isAdmin ? 'admin-msg' : (msg.username === displayName ? 'own' : 'other'));
    item.innerHTML = `
      <div class="msg-header">${msg.username}${msg.isPrivate ? ' (Private)' : ''}</div>
      <div class="message-content">${msg.content}</div>
      <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
    `;
  }
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendPrivateMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('msg', 'private');
  item.classList.add(msg.sender === displayName ? 'own' : 'other');

  const head = msg.sender === displayName ? `You → ${msg.recipient}` : `${msg.sender} → You`;
  item.innerHTML = `
    <div class="msg-header">${head} <span class="private-indicator">(Private)</span></div>
    <div class="message-content">${msg.content}</div>
    <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
  `;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ---------- Modal creation ----------
function showModal(message) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close">&times;</button>
      <p>${message}</p>
      <button id="closeModalBtn">OK</button>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.modal-close').onclick = modal.querySelector('#closeModalBtn').onclick = () => modal.remove();
}

function openDMUserModal(userList) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  const listHTML = userList
    .filter(u => u !== displayName)
    .map(u => `<div class="dm-user-item">${u}</div>`)
    .join('');
  modal.innerHTML = `
    <div class="modal-content" id="dmUserModal">
      <button class="modal-close">&times;</button>
      <h3>Select a user to DM</h3>
      ${listHTML || '<p>No other users online</p>'}
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('.modal-close').onclick = () => modal.remove();
  modal.querySelectorAll('.dm-user-item').forEach(item => {
    item.onclick = () => {
      currentDM = item.textContent;
      modal.remove();
      setDMTag(currentDM);
    };
  });
}

function setDMTag(name) {
  messageInputDiv.innerHTML = `<span class="dm-tag">${name}:</span>&nbsp;`;
  placeCaretAtEnd(messageInputDiv);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ---------- Event listeners ----------
joinBtn.onclick = () => {
  const name = usernameInput.value.trim();
  if (name) socket.emit('check_staff_status', name);
};

socket.on('name_rejected', msg => showModal(msg));

socket.on('name_accepted', name => {
  displayName = name;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
});

socket.on('staff_status_update', data => {
  displayName = data.displayName;
  isAdmin = data.isAdmin;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
  clearChatBtn.style.display = isAdmin ? 'inline-block' : 'none';
});

socket.on('chat message', appendMessage);
socket.on('private message', appendPrivateMessage);

socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
  socket.userList = data.userList;
});

socket.on('system_error', showModal);

// ---------- Send logic ----------
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = messageInputDiv.innerText.trim();
  if (!text || !displayName) return;

  if (text === '/msg') {
    openDMUserModal(socket.userList || []);
    messageInputDiv.innerText = '';
    return;
  }

  if (currentDM) {
    socket.emit('private message', { recipient: currentDM, content: text });
    currentDM = null;
    messageInputDiv.innerText = '';
    return;
  }

  socket.emit('chat message', { username: displayName, content: text });
  messageInputDiv.innerText = '';
});

// Enter sends, Shift+Enter = newline
messageInputDiv.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
});
