const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput");
const userCountDisplay = document.getElementById("userCountDisplay");
const nameControlButton = document.getElementById("nameControlButton");
const dmUserMenu = document.getElementById("dmUserMenu");
const messageFormButton = document.querySelector('#messageForm button');
const staffNameModal = document.getElementById("staffNameModal");
const staffNameModalMessage = document.getElementById("staffNameModalMessage");
const messageForm = document.getElementById('messageForm');

let currentUser = {
  name: null,         // secure/internal name (if used)
  displayName: null,  // visible display name
  isAdmin: false
};

let isNameSet = false;
let onlineUsers = [];
let dmMenuHighlightedIndex = -1;

// --- Utilities ---
function getCursorPosition(element) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    return preCaretRange.toString().length;
  }
  return 0;
}

function setCursorToEnd(element) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  element.focus();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// --- UI adders ---
function addMessage(username, content, timestamp, isSystem = false, isAdmin = false, isPrivate = false) {
  const msgEl = document.createElement("div");
  msgEl.classList.add("msg");

  const isOwn = username === currentUser.displayName || username === currentUser.name;
  msgEl.classList.add(isOwn ? "own" : "other");

  if (isSystem) {
    msgEl.classList.add("system-msg");
    if (isAdmin) msgEl.classList.add("admin-system-msg");
  } else if (isAdmin) {
    msgEl.classList.add("admin-msg");
  }

  if (isPrivate) msgEl.classList.add("private");

  if (username && !isSystem) {
    const headerEl = document.createElement("div");
    headerEl.classList.add("msg-header");
    headerEl.textContent = isPrivate ? `(Private) ${username}` : username;
    msgEl.appendChild(headerEl);
  }

  const contentEl = document.createElement("div");
  contentEl.textContent = content;
  msgEl.appendChild(contentEl);

  messagesContainer.appendChild(msgEl);
  scrollToBottom();
}

function addPlainText(content, timestamp) {
  const plainEl = document.createElement("div");
  plainEl.classList.add("chat-plain");
  plainEl.textContent = content;
  messagesContainer.appendChild(plainEl);
  scrollToBottom();
}

// --- Name handling ---
function handleNameAction() {
  const newName = usernameInput.value.trim();
  if (!newName) {
    addMessage("System Alert", "Please enter a username.", new Date(), true);
    return;
  }

  if (!isNameSet) {
    currentUser.name = newName;
    socket.emit("check_staff_status", newName);
  } else {
    if (newName === currentUser.displayName) {
      addMessage("System Alert", "Your new name must be different from your current display name.", new Date(), true);
      return;
    }
    socket.emit("name_change_request", { oldName: currentUser.name, newName });
  }
}

// --- DM menu highlight ---
function updateDmMenuHighlight() {
  const buttons = dmUserMenu.querySelectorAll('button');
  buttons.forEach((btn, idx) => btn.classList.toggle('highlighted', idx === dmMenuHighlightedIndex));
}

function showDmUserMenu(searchTerm = "") {
  dmUserMenu.innerHTML = "";
  dmMenuHighlightedIndex = -1;
  const filtered = onlineUsers
    .filter(n => n && n.toLowerCase().includes(searchTerm.toLowerCase()) && n !== currentUser.displayName)
    .sort((a,b)=>a.localeCompare(b))
    .slice(0,3);

  filtered.forEach(user => {
    const btn = document.createElement('button');
    btn.textContent = user;
    btn.onclick = (e) => { e.preventDefault(); autofillDMRecipient(user); };
    dmUserMenu.appendChild(btn);
  });

  dmUserMenu.style.display = filtered.length ? 'flex' : 'none';
}

function hideDmUserMenu() {
  dmUserMenu.style.display = 'none';
}

// Autocomplete insertion: ensures exact displayName, caret at end, triggers input
function autofillDMRecipient(username) {
  const currentContent = messageInput.textContent;
  const msgIndex = currentContent.lastIndexOf("/msg");
  if (msgIndex !== -1) {
    const prefix = currentContent.substring(0, msgIndex + 5); // includes "/msg "
    const newContent = `${prefix}${username} `;
    messageInput.textContent = newContent;
    setCursorToEnd(messageInput);
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    hideDmUserMenu();
  }
}

// --- Message sending (fixed /msg parsing) ---
function sendMessage() {
  const text = messageInput.textContent.trim();
  if (!isNameSet) {
    addMessage("System Alert", "Please enter and set your username first.", new Date(), true);
    return;
  }
  if (!text) return;

  if (text.startsWith("/msg ")) {
    const rest = text.substring(5).trim();
    const m = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m) {
      addMessage("System Alert", "Invalid /msg command. Usage: /msg [username] [message]", new Date(), true);
      messageInput.textContent = "";
      return;
    }
    const recipient = m[1];
    const content = m[2];

    const messageData = {
      sender: currentUser.displayName,
      recipient,
      content,
      timestamp: new Date()
    };
    // debug: console.log('emit private message', messageData);
    socket.emit("private message", messageData);
    addMessage(currentUser.displayName, content, new Date(), false, false, true);

  } else {
    const messageData = {
      username: currentUser.displayName,
      content: text,
      timestamp: new Date()
    };
    socket.emit("chat message", messageData);
  }

  messageInput.textContent = "";
  messageInput.focus();
}

// --- Input handlers: use keydown for reliability ---
messageInput.addEventListener('keydown', (e) => {
  // DM menu navigation
  if (dmUserMenu.style.display === 'flex') {
    const buttons = dmUserMenu.querySelectorAll('button');
    if (buttons.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); dmMenuHighlightedIndex = (dmMenuHighlightedIndex + 1) % buttons.length; updateDmMenuHighlight(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); dmMenuHighlightedIndex = (dmMenuHighlightedIndex - 1 + buttons.length) % buttons.length; updateDmMenuHighlight(); return; }
      if (e.key === 'Tab')       { e.preventDefault(); if (dmMenuHighlightedIndex !== -1) buttons[dmMenuHighlightedIndex].click(); return; }
    }
  }

  // Enter to send (Shift+Enter for newline)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (dmUserMenu.style.display === 'flex' && dmMenuHighlightedIndex !== -1) {
      const buttons = dmUserMenu.querySelectorAll('button');
      buttons[dmMenuHighlightedIndex].click();
    } else {
      sendMessage();
    }
  }
});

messageInput.addEventListener('input', () => {
  // show/hide DM menu based on cursor position after "/msg "
  const text = messageInput.textContent;
  const cursorPos = getCursorPosition(messageInput);
  const before = text.substring(0, cursorPos);
  const idx = before.lastIndexOf("/msg");
  if (idx !== -1 && before.length >= idx + 5) {
    const searchTerm = before.substring(idx + 5);
    showDmUserMenu(searchTerm);
  } else {
    hideDmUserMenu();
  }
});

// --- Socket listeners ---
socket.on('name_accepted', (displayName) => {
  currentUser.isAdmin = false;
  currentUser.displayName = displayName;
  currentUser.name = displayName;
  isNameSet = true;
  staffControlsDiv.style.display = 'none';
  addPlainText(`${displayName} has joined the chat.`, new Date());
  usernameInput.disabled = false;
  nameControlButton.textContent = "Change Name";
  messageInput.contentEditable = true;
  messageFormButton.disabled = false;
  messageInput.focus();
  // Explicit register to ensure server map is in sync (optional; server already records on check_staff_status)
  socket.emit('register', currentUser.displayName);
});

socket.on("staff_status_update", (data) => {
  if (data.secureName === currentUser.name || data.displayName === currentUser.name) {
    currentUser.isAdmin = true;
    currentUser.displayName = data.displayName;
    isNameSet = true;
    staffControlsDiv.style.display = 'inline-block';
    addMessage("System", `${data.displayName} has logged in.`, new Date(), true, true);
    usernameInput.disabled = false;
    usernameInput.value = data.displayName;
    nameControlButton.textContent = "Change Name";
    messageInput.contentEditable = true;
    messageFormButton.disabled = false;
    messageInput.focus();
    socket.emit('register', currentUser.displayName);
  }
});

socket.on('name_rejected', (reason) => {
  showStaffNameModal(reason);
  usernameInput.value = currentUser.displayName || '';
  if (!isNameSet) {
    currentUser.name = null;
    currentUser.isAdmin = false;
    currentUser.displayName = null;
    messageInput.contentEditable = false;
    messageFormButton.disabled = true;
  }
  staffControlsDiv.style.display = 'none';
});

socket.on('name_change_success', (data) => {
  const oldName = data.oldDisplayName;
  const newName = data.newDisplayName;
  currentUser.name = data.newSecureName || newName;
  currentUser.displayName = newName;
  usernameInput.value = newName;

  if (!currentUser.isAdmin) {
    addPlainText(`${oldName} is now known as ${newName}.`, data.timestamp);
  } else {
    addMessage("System", `${oldName} changed display name to ${newName}.`, data.timestamp, true, true);
  }
  addMessage("System Alert", `Name successfully changed to ${newName}!`, new Date(), true);
  // update server mapping (optional)
  socket.emit('register', currentUser.displayName);
});

socket.on('name_change_failed', (reason) => {
  addMessage("System Alert", reason, new Date(), true);
  usernameInput.value = currentUser.displayName;
});

socket.on('chat message', (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, false, msg.isAdmin, false);
});

socket.on('private message', (msg) => {
  const sender = msg.sender || msg.username || msg.from;
  const content = msg.content;
  addMessage(sender, content, msg.timestamp || new Date(), false, false, true);
});

socket.on('staff message', (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, true, msg.isAdmin, false);
});

socket.on('chat history', (history) => {
  messagesContainer.innerHTML = '';
  history.forEach(msg => {
    if (msg.isAdmin && msg.content && msg.content.includes("Staff member")) {
      addPlainText(msg.content, msg.timestamp);
    } else if (msg.isAdmin) {
      addMessage(msg.username, msg.content, msg.timestamp, true, true, false);
    } else if (msg.username === "System") {
      addPlainText(msg.content, msg.timestamp);
    } else {
      addMessage(msg.username, msg.content, msg.timestamp, false, false, false);
    }
  });
});

socket.on('user count', (data) => {
  userCountDisplay.textContent = `${data.count} Users Online`;
  onlineUsers = Array.isArray(data.userList) ? data.userList.map(n => String(n)) : [];
});

socket.on('system_error', (message) => {
  addMessage("System Error", message, new Date(), true);
});

// --- Modals and admin actions ---
function showAdminModal() {
  if (!currentUser.isAdmin) { addMessage("System Alert", "You must be staff to clear the chat.", new Date(), true); return; }
  document.getElementById("adminModal").style.display = 'flex';
}
function hideAdminModal() { document.getElementById("adminModal").style.display = 'none'; }
function showStaffNameModal(message) { staffNameModalMessage.textContent = message; staffNameModal.style.display = 'flex'; }
function hideStaffNameModal() { staffNameModal.style.display = 'none'; }
function confirmClear() {
  hideAdminModal();
  socket.emit("admin:clear_history", { username: currentUser.name, timestamp: new Date() });
}

// --- Form hookup & init ---
messageForm.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
document.addEventListener('DOMContentLoaded', () => { messageInput.contentEditable = false; messageFormButton.disabled = true; });
