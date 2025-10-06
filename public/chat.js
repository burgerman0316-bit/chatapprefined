// public/chat.js
const socket = io();

// DOM
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

const genericModal = document.getElementById('genericModal');
const genericModalText = document.getElementById('genericModalText');
const closeGenericModal = document.getElementById('closeGenericModal');

const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const closeDmModal = document.getElementById('closeDmModal');

let displayName = '';
let onlineUsers = [];

// Helpers
function appendMessage(msg) {
  const item = document.createElement('div');
  item.className = 'msg';
  if ((msg.username || msg.sender) === displayName) item.classList.add('own');
  const header = `<div class="msg-header">${msg.username || msg.sender || 'System'}</div>`;
  const body = `<div class="message-content">${msg.content}</div>`;
  const foot = `<div class="timestamp">${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</div>`;
  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showGenericModal(text) {
  genericModalText.textContent = text;
  genericModal.style.display = 'flex';
}
closeGenericModal.addEventListener('click', ()=> genericModal.style.display='none');

function openDmModal() {
  // populate list (exclude self)
  dmUserList.innerHTML = '';
  onlineUsers.forEach(u=>{
    if (u === displayName) return;
    const btn = document.createElement('button');
    btn.textContent = u;
    btn.addEventListener('click', ()=>{
      insertDmTag(u);
      dmModal.style.display = 'none';
    });
    dmUserList.appendChild(btn);
  });
  dmModal.style.display = 'flex';
}
closeDmModal.addEventListener('click', ()=> dmModal.style.display='none');

// insert a non-editable highlighted tag "[NAME]: "
function insertDmTag(name){
  // clear existing content, insert span then a text node for typed message
  messageInputDiv.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'dm-highlight';
  span.setAttribute('contenteditable','false');
  span.textContent = `[${name}]: `;
  messageInputDiv.appendChild(span);
  const textNode = document.createTextNode('');
  messageInputDiv.appendChild(textNode);

  // caret after text node
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  messageInputDiv.focus();
}

// remove dm tag (used when backspacing)
function removeDmTagIfNeeded() {
  const span = messageInputDiv.querySelector('.dm-highlight');
  if (!span) return false;
  // get current selection
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  // if caret is directly after the span and there's no characters after span (or caret is at text node index 0),
  // pressing Backspace once should remove the span.
  // We'll implement: if selection is caret inside the text node directly after span and text node length === 0, remove span.
  const container = range.startContainer;
  const offset = range.startOffset;
  if (container.nodeType === Node.TEXT_NODE) {
    // if the text node is the immediate sibling of span and offset === 0, then remove span
    if (container.previousSibling === span && offset === 0) {
      span.remove();
      // set caret to start of container (0)
      const newRange = document.createRange();
      newRange.setStart(container, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return true;
    }
  }
  return false;
}

// Join button
joinBtn.addEventListener('click', ()=>{
  const name = usernameInput.value.trim();
  if (!name) return;
  socket.emit('check_staff_status', name);
});

// socket events
socket.on('name_rejected', msg => {
  showGenericModal(msg || 'Name rejected.');
});

socket.on('name_accepted', name => {
  displayName = name;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
});

socket.on('staff_status_update', data => {
  displayName = data.displayName;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
  clearChatBtn.style.display = data.isAdmin ? 'inline-block' : 'none';
});

socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));
socket.on('chat history', history => {
  messagesDiv.innerHTML = '';
  history.forEach(appendMessage);
});
socket.on('user count', data => {
  userCountDisplay.textContent = `${data.count} Users Online`;
  onlineUsers = data.userList || [];
});

// handle Enter key (send) and Backspace behavior for DM tag
messageInputDiv.addEventListener('keydown', e=>{
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event('submit'));
    return;
  }

  if (e.key === 'Backspace') {
    // attempt to remove DM tag in one backspace if conditions met
    const removed = removeDmTagIfNeeded();
    if (removed) {
      e.preventDefault(); // prevent normal backspace behavior that might do weird things
    }
  }
});

// Submit handler - handles /msg modal trigger and private sending when DM tag present
messageForm.addEventListener('submit', e=>{
  e.preventDefault();
  const raw = messageInputDiv.innerText || '';
  const content = raw.trim();
  if (!content || !displayName) return;

  // If a DM tag exists in the input, treat as private send
  const dmSpan = messageInputDiv.querySelector('.dm-highlight');
  if (dmSpan) {
    const targetName = dmSpan.textContent.replace(/[\[\]:]/g,'').trim();
    // message content is the remaining text after the span
    const after = (messageInputDiv.textContent || '').replace(dmSpan.textContent, '').trim();
    if (after.length === 0) {
      // nothing to send
      messageInputDiv.focus();
      return;
    }
    socket.emit('private message', { recipient: targetName, content: after });
    // display locally
    appendMessage({ username: displayName, content: `(private to ${targetName}) ${after}`, timestamp: new Date() });
    // clear input
    messageInputDiv.innerText = '';
    return;
  }

  // If content is exactly "/msg" or starts with "/msg " but no recipient, open DM modal
  if (content === '/msg' || (content.startsWith('/msg') && content.split(/\s+/).length === 1)) {
    openDmModal();
    return;
  }

  // If command is "/msg recipient message" send private without modal
  if (content.startsWith('/msg ')) {
    const parts = content.substring(5).trim().split(/\s+/);
    const recipient = parts.shift();
    const msgText = parts.join(' ');
    if (!recipient || !msgText) {
      showGenericModal('Invalid /msg usage. Type /msg and press send to pick a user, or use /msg username message to send directly.');
      return;
    }
    socket.emit('private message', { recipient, content: msgText });
    appendMessage({ username: displayName, content: `(private to ${recipient}) ${msgText}`, timestamp: new Date() });
    messageInputDiv.innerText = '';
    return;
  }

  // Otherwise a normal message
  socket.emit('chat message', { username: displayName, content });
  messageInputDiv.innerText = '';
});
