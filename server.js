// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal'));
const renameModal = new bootstrap.Modal(document.getElementById('renameModal'));

// Socket connection
const socket = io();

// Elements
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const container = document.getElementById('container');
const displayNameEl = document.getElementById('display-name');
const messagesDiv = document.getElementById('messages');
const messageInputDiv = document.getElementById('messageInput');
const messageForm = document.getElementById('messageForm');
const charCountSpan = document.getElementById('char-count');
const charCountContainer = document.getElementById('charCountContainer');
const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');
const adminUserListEl = document.getElementById('admin-user-list');

const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminModalEl = document.getElementById('adminPanelModal');
const renameBtn = document.getElementById('renameBtn');

const publicChatTab = document.getElementById('publicChatTab');
const adminChatTab = document.getElementById('adminChatTab');

const clearConfirmModalEl = document.getElementById('clearConfirmModal');
const clearConfirmModal = new bootstrap.Modal(clearConfirmModalEl);
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmTargetName = document.getElementById('clearConfirmTargetName');

const kickConfirmModalEl = document.getElementById('kickConfirmModal');
const kickConfirmModal = new bootstrap.Modal(kickConfirmModalEl);
const kickConfirmBody = document.getElementById('kickConfirmBody');

const banModalEl = document.getElementById('ipBanModal');
const banModal = new bootstrap.Modal(banModalEl);
const banConfirmBtn = document.getElementById('banConfirmBtn');
const banTargetNameSpan = document.getElementById('banTargetName');

const banDurationDaysInput = document.getElementById('banDurationDays');
const banDurationHoursInput = document.getElementById('banDurationHours');
const banDurationMinutesInput = document.getElementById('banDurationMinutes');
const banReasonInput = document.getElementById('banReason');

let displayName = '';
let isAdmin = false;
let userToKick = null;
let userIpToBan = null;
let currentChatContext = 'public';

const MAX_CHARS = 500;
const ADMIN_CHAT_ID = 'admin_chat';

const ANON_NAMES = [
  "Alex", "Jordan", "Morgan", "Taylor", "Riley", "Casey", "Skyler", "Jamie"
];

// Utility: Append a message to the chat
function appendMessage(msg) {
  const item = document.createElement('li');
  item.classList.add('msg');
  
  const time = new Date(msg.timestamp);
  const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeHtml = `<span class="timestamp">${timeString}</span>`;

  if (msg.type === 'system') {
    item.classList.add('system');
    item.textContent = msg.content;
  } else if (msg.username === displayName || (msg.username === 'You' && msg.isPrivate)) {
    item.classList.add('own');
    // Show sender name on own message as well
    item.innerHTML = `<span class="sender-name">${msg.username}</span>${msg.content} ${timeHtml}`;
  } else {
    item.classList.add('other');
    if (msg.isAdmin) item.classList.add('admin-msg');
    const nameDisplay = msg.isPrivate ? `Private from ${msg.username}` : msg.username;
    const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
    item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${msg.content} ${timeHtml}`;
  }

  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Update online user list
function updatePublicUserList(data) {
  const userList = data.userList;
  const publicUserMap = data.usersMap;

  userCountEl.textContent = userList.length;
  userListEl.innerHTML = '';
  
  userList.forEach(userDisplayName => {
    const li = document.createElement('li');
    const userEntry = publicUserMap[userDisplayName] || {};
    li.textContent = userDisplayName;
    if (userEntry.isAdmin) {
      li.textContent += " (MOD)";
      li.classList.add('admin-name-list');
    }
    li.title = `Click to send private message to ${userDisplayName}`;
    li.addEventListener('click', () => {
      messageInputDiv.innerText = `/msg ${userDisplayName} `;
      messageInputDiv.focus();
    });
    userListEl.appendChild(li);
  });
}

// Update admin management list (admin only)
function updateAdminManagementList(adminUsersMap) {
  if (!isAdmin) return;
  adminUserListEl.innerHTML = '';

  Object.keys(adminUsersMap).forEach(key => {
    const user = adminUsersMap[key];
    const userDisplayName = user.displayName;

    if (user.chatContext !== 'public' && !user.isAdmin) return;

    const adminLi = document.createElement('li');
    adminLi.textContent = userDisplayName;
    if (user.isAdmin) {
      adminLi.textContent += ' (MOD)';
      adminLi.classList.add('admin-name-list');
    }
    adminLi.addEventListener('click', () => {
      if (userDisplayName === displayName) {
        alert("Cannot manage yourself!");
        return;
      }
      userToKick = userDisplayName;
      userIpToBan = user.ip;
      kickConfirmBody.innerHTML = `Manage user: <strong>${userDisplayName}</strong><br>IP: ${user.ip}<br>Admin Status: ${user.isAdmin ? 'Yes' : 'No'}`;
      const adminModal = bootstrap.Modal.getInstance(adminModalEl);
      if (adminModal) adminModal.hide();
      kickConfirmModal.show();
    });
    adminUserListEl.appendChild(adminLi);
  });
}

// Switch chat context public/admin
function switchChatContext(contextId) {
  if (!isAdmin && contextId === ADMIN_CHAT_ID) return;
  currentChatContext = contextId;
  messagesDiv.innerHTML = '';

  if (contextId === ADMIN_CHAT_ID) {
    adminChatTab.classList.add('active');
    publicChatTab.classList.remove('active');
    document.getElementById('chatTitle').textContent = 'Admin Chat';
  } else {
    adminChatTab.classList.remove('active');
    publicChatTab.classList.add('active');
    document.getElementById('chatTitle').textContent = 'Public Chat';
  }
  socket.emit('admin:set_context', contextId);
}

// Handle login submission
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  socket.emit('check_staff_status', name);
});

// Handle message submission
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  messageInputDiv.innerText = '';
  charCountSpan.textContent = `0/${MAX_CHARS}`;
  charCountContainer.style.color = '#ccc';

  if (!content || content.length > MAX_CHARS) return;

  if (content.startsWith('/')) {
    const parts = content.split(' ');
    const command = parts[0].toLowerCase();
    const args = content.substring(command.length).trim();

    if (command === '/msg') {
      const match = args.match(/^(\S+)\s+(.*)/s);
      if (match) {
        const recipient = match[1];
        const dmContent = match[2];
        if (recipient && dmContent && currentChatContext === 'public') {
          socket.emit('private message', { recipient, content: dmContent });
        } else {
          appendMessage({ username: 'System', content: 'Invalid /msg command or only available in public chat.', timestamp: new Date(), type: 'system' });
        }
      } else {
        appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), type: 'system' });
      }
    } else if (command === '/kick') {
      if (!isAdmin) {
        appendMessage({ username: 'System', content: 'You do not have permission to use the /kick command.', timestamp: new Date(), type: 'system' });
        return;
      }
      if (args) socket.emit('admin:kick_user', { targetName: args, adminName: displayName });
      else appendMessage({ username: 'System', content: 'Invalid /kick command. Usage: /kick [username]', timestamp: new Date(), type: 'system' });
    } else if (command === '/clear') {
      if (isAdmin) {
        clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
        clearConfirmModal.show();
      } else appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date(), type: 'system' });
    } else {
      appendMessage({ username: 'System', content: `Unknown command: ${command}`, timestamp: new Date(), type: 'system' });
    }
  } else {
    socket.emit('chat message', { content });
  }
});

// Character counter and limit
messageInputDiv.addEventListener('input', () => {
  let currentLength = messageInputDiv.innerText.length;
  if (currentLength > MAX_CHARS) {
    messageInputDiv.innerText = messageInputDiv.innerText.substring(0, MAX_CHARS);
    currentLength = MAX_CHARS;
  }
  // Prevent counter below 1 on backspace
  charCountSpan.textContent = `${Math.max(1, currentLength)}/${MAX_CHARS}`;

  charCountContainer.style.color = currentLength >= MAX_CHARS * 0.9 ? '#ff4d4d' : '#ccc';
});

// Enter sends message
messageInputDiv.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event('submit'));
  }
});

// Clear chat history button
document.getElementById('clearChatBtn').addEventListener('click', () => {
  clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
  clearConfirmModal.show();
  const adminModal = bootstrap.Modal.getInstance(adminModalEl);
  if (adminModal) adminModal.hide();
});

// Confirm clear history
clearConfirmBtn.addEventListener('click', () => {
  if (isAdmin) socket.emit('admin:clear_history', currentChatContext);
  clearConfirmModal.hide();
});

// Kick user - open ban modal
document.getElementById('kickToBanBtn').addEventListener('click', () => {
  kickConfirmModal.hide();
  if (isAdmin && userToKick && userIpToBan) {
    banTargetNameSpan.textContent = userToKick;
    banDurationDaysInput.value = '0';
    banDurationHoursInput.value = '0';
    banDurationMinutesInput.value = '30';
    banReasonInput.value = 'Spam/Hate Speech';
    banModal.show();
  } else {
    userToKick = null;
    userIpToBan = null;
  }
});

// Kick user - direct kick
document.getElementById('kickDirectlyBtn').addEventListener('click', () => {
  if (isAdmin && userToKick) {
    socket.emit('admin:kick_user', { targetName: userToKick });
  }
  kickConfirmModal.hide();
  userToKick = null;
  userIpToBan = null;
});

// Confirm IP ban submission
banConfirmBtn.addEventListener('click', () => {
  if (!isAdmin || !userToKick || !userIpToBan) {
    banModal.hide();
    return;
  }
  const days = parseInt(banDurationDaysInput.value);
  const hours = parseInt(banDurationHoursInput.value);
  const minutes = parseInt(banDurationMinutesInput.value);
  const reason = banReasonInput.value;

  if (isNaN(days) || isNaN(hours) || isNaN(minutes) || (days === 0 && hours === 0 && minutes === 0) || days > 999 || hours > 99 || minutes > 99) {
    alert("Invalid duration. Max 999 days, 99 hours, 99 minutes and duration must be > 0.");
    return;
  }

  socket.emit('admin:ip_ban_user', { targetName: userToKick, targetIp: userIpToBan, days, hours, minutes, reason });
  banModal.hide();
  userToKick = null;
  userIpToBan = null;
});

// Admin logout "Go Anonymous"
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  if (isAdmin) socket.emit('admin:go_anonymous');
});

// Chat tab switches
publicChatTab.addEventListener('click', () => switchChatContext('public'));
adminChatTab.addEventListener('click', () => switchChatContext(ADMIN_CHAT_ID));

// Rename form submit
document.getElementById('rename-form').addEventListener('submit', e => {
  e.preventDefault();
  const newName = document.getElementById('new-name-input').value.trim();
  if (newName) socket.emit('name_change', newName);
  renameModal.hide();
});

// Rename button opens rename modal
renameBtn.addEventListener('click', () => {
  document.getElementById('new-name-input').value = displayName;
  renameModal.show();
});

// Handle successful login UI updates
function handleSuccessfulLogin(data) {
  displayName = data.displayName;
  isAdmin = data.isAdmin || false;
  displayNameEl.textContent = displayName + (isAdmin ? ' (MOD)' : '');
  currentChatContext = data.currentContext || 'public';
  myModal.hide();
  container.style.display = 'flex';
  adminPanelBtn.style.display = isAdmin ? 'block' : 'none';
  renameBtn.style.display = 'block';
  document.getElementById('adminLogoutBtn').style.display = isAdmin ? 'block' : 'none';
  adminChatTab.style.display = isAdmin ? 'block' : 'none';
  if (isAdmin && currentChatContext === ADMIN_CHAT_ID) {
    switchChatContext(ADMIN_CHAT_ID);
  } else {
    switchChatContext('public');
  }
}

// Socket events handlers
socket.on('name_accepted', name => {
  handleSuccessfulLogin({ displayName: name, isAdmin: false });
});

socket.on('staff_status_update', data => {
  handleSuccessfulLogin(data);
});

socket.on('name_rejected', msg => {
  alert("Login Failed: " + msg);
});

socket.on('name_updated_ui', newName => {
  displayName = newName;
  displayNameEl.textContent = displayName + (isAdmin ? " (MOD)" : "");
});

socket.on('admin_context_switched', newContext => {
  currentChatContext = newContext;
});

socket.on('chat history', history => {
  messagesDiv.innerHTML = '';
  history.forEach(msg => appendMessage(msg));
});

socket.on('chat message', msg => {
  if (currentChatContext === 'public' || msg.isPrivate) appendMessage(msg);
});

socket.on('admin chat message', msg => {
  if (currentChatContext === ADMIN_CHAT_ID) appendMessage(msg);
});

socket.on('admin:history_cleared', data => {
  if (data.targetChatId === currentChatContext) {
    messagesDiv.innerHTML = '';
    appendMessage(data.clearMsg);
  }
});

socket.on('system_error', msg => appendMessage({ username: 'System', content: "ERROR: " + msg, timestamp: new Date(), type: 'system' }));

socket.on('system_alert', msg => appendMessage({ username: 'System', content: msg, timestamp: new Date(), type: 'system' }));

// Ban modal
socket.on('banned_modal', data => {
  const bannedModalBody = document.getElementById('bannedModalBody');
  const bannedModal = new bootstrap.Modal(document.getElementById('bannedModal'));
  bannedModalBody.innerHTML = `You are BANNED from the chat.<br>Reason: <strong>${data.reason}</strong><br>Time remaining: <span id="banTimer"></span>`;
  bannedModal.show();
  let endTime = new Date().getTime() + data.banDurationMs;
  const timerInterval = setInterval(() => {
    let now = new Date().getTime();
    let distance = endTime - now;
    const timerElement = document.getElementById('banTimer');
    if (distance < 0) {
      clearInterval(timerInterval);
      if (timerElement) timerElement.textContent = "Your ban has expired. Please refresh.";
      return;
    }
    let days = Math.floor(distance / (1000 * 60 * 60 * 24));
    let hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    let minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    let seconds = Math.floor((distance % (1000 * 60)) / 1000);
    if (timerElement) timerElement.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }, 1000);
  socket.disconnect();
});
