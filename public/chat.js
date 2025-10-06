const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');
const userCountDisplay = document.getElementById('userCountDisplay');

// Modals
const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const dmCloseBtn = document.getElementById('dmCloseBtn');

const nameErrorModal = document.getElementById('nameErrorModal');
const nameErrorText = document.getElementById('nameErrorText');
const nameErrorClose = document.getElementById('nameErrorClose');

const adminModal = document.getElementById('adminModal');
const adminCloseBtn = document.getElementById('adminCloseBtn');

// Admin modal elements
const adminUserList = document.getElementById('adminUserList');
const bannedUserList = document.getElementById('bannedUserList');
const bannedIpList = document.getElementById('bannedIpList');

const banUsernameInput = document.getElementById('banUsernameInput');
const banUsernameBtn = document.getElementById('banUsernameBtn');
const unbanUsernameInput = document.getElementById('unbanUsernameInput');
const unbanUsernameBtn = document.getElementById('unbanUsernameBtn');

const banIpInput = document.getElementById('banIpInput');
const banIpBtn = document.getElementById('banIpBtn');
const unbanIpInput = document.getElementById('unbanIpInput');
const unbanIpBtn = document.getElementById('unbanIpBtn');

const forceDisconnectInput = document.getElementById('forceDisconnectInput');
const forceDisconnectBtn = document.getElementById('forceDisconnectBtn');

const adminClearHistoryBtn = document.getElementById('adminClearHistoryBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmRecipient = null; // currently selected DM recipient

// =======================
// Message append helpers
// =======================
function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');

    if (msg.isSystem) {
        item.classList.add('system');
        item.innerHTML = msg.content;
    } else if (msg.isPrivate) {
        item.classList.add('private');
        if (msg.sender.toLowerCase() === displayName.toLowerCase()) {
            item.classList.add('own');
            item.innerHTML = `<div class="msg-header">You → ${msg.recipient}</div><div class="message-content">${msg.content}</div><div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;
        } else {
            item.classList.add('other');
            item.innerHTML = `<div class="msg-header">${msg.sender} → You</div><div class="message-content">${msg.content}</div><div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;
        }
    } else {
        if (msg.username.toLowerCase() === displayName.toLowerCase()) {
            item.classList.add('own');
        } else {
            item.classList.add('other');
        }
        item.innerHTML = `<div class="msg-header">${msg.username}</div><div class="message-content">${msg.content}</div><div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// =======================
// Join / Name handling
// =======================
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return;
    socket.emit('check_staff_status', name);
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
    adminPanelBtn.style.display = isAdmin ? 'inline-block' : 'none';
});

socket.on('name_rejected', msg => {
    nameErrorText.textContent = msg;
    nameErrorModal.style.display = 'flex';
});

// =======================
// Message handling
// =======================
messageForm.addEventListener('submit', e => {
    e.preventDefault();
    sendMessage();
});

function sendMessage() {
    if (!displayName) return;

    let content = messageInputDiv.innerText.trim();
    if (!content) return;

    // Check for DM highlight
    if (dmRecipient && content.startsWith(`${dmRecipient}:`)) {
        const msgContent = content.substring(dmRecipient.length + 1).trim();
        if (msgContent) {
            socket.emit('private message', { recipient: dmRecipient, content: msgContent });
        }
        dmRecipient = null;
        messageInputDiv.innerHTML = '';
        return;
    }

    // Check for /msg command to trigger DM modal
    if (content.startsWith('/msg')) {
        // Open DM modal
        updateDmUserList();
        dmModal.style.display = 'flex';
        return;
    }

    // Regular message
    socket.emit('chat message', { username: secureName || displayName, content });
    messageInputDiv.innerHTML = '';
}

// Enter sends message, Shift+Enter newline
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// =======================
// DM modal handling
// =======================
dmCloseBtn.addEventListener('click', () => {
    dmModal.style.display = 'none';
});

function updateDmUserList() {
    dmUserList.innerHTML = '';
    socket.emit('request_user_list', null);
}

socket.on('user list', list => {
    list.forEach(user => {
        if (user.toLowerCase() === displayName.toLowerCase()) return; // don't DM self
        const btn = document.createElement('button');
        btn.textContent = user;
        btn.addEventListener('click', () => {
            dmRecipient = user;
            dmModal.style.display = 'none';
            messageInputDiv.innerHTML = `<span style="background:rgba(0,123,255,0.3); padding:2px 4px; border-radius:4px;">${user}:</span> `;
            placeCaretAtEnd(messageInputDiv);
            messageInputDiv.focus();
        });
        dmUserList.appendChild(btn);
    });
});

// =======================
// Name error modal
// =======================
nameErrorClose.addEventListener('click', () => {
    nameErrorModal.style.display = 'none';
});

// =======================
// Utility
// =======================
function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection != "undefined"
        && typeof document.createRange != "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// =======================
// Admin panel
// =======================
adminPanelBtn.addEventListener('click', () => { adminModal.style.display = 'flex'; });
adminCloseBtn.addEventListener('click', () => { adminModal.style.display = 'none'; });

// Button events
clearChatBtn.addEventListener('click', () => { socket.emit('admin:clear_history', { username: displayName }); });
adminClearHistoryBtn.addEventListener('click', () => { socket.emit('admin:clear_history', { username: displayName }); });
banUsernameBtn.addEventListener('click', () => {
    const u = banUsernameInput.value.trim();
    if (u) socket.emit('admin:ban_user', { username: u });
});
unbanUsernameBtn.addEventListener('click', () => {
    const u = unbanUsernameInput.value.trim();
    if (u) socket.emit('admin:unban_user', { username: u });
});
banIpBtn.addEventListener('click', () => {
    const ip = banIpInput.value.trim();
    if (ip) socket.emit('admin:ban_ip', { ip });
});
unbanIpBtn.addEventListener('click', () => {
    const ip = unbanIpInput.value.trim();
    if (ip) socket.emit('admin:unban_ip', { ip });
});
forceDisconnectBtn.addEventListener('click', () => {
    const u = forceDisconnectInput.value.trim();
    if (u) socket.emit('admin:disconnect_user', { username: u });
});

// =======================
// Socket event listeners
// =======================
socket.on('chat message', msg => { appendMessage(msg); });
socket.on('private message', msg => { appendMessage(msg); });
socket.on('system_message', msg => { appendMessage({ content: msg, isSystem:true }); });
socket.on('user count', data => { userCountDisplay.textContent = `${data.count} Users Online`; });
socket.on('update_admin_lists', data => {
    bannedUserList.innerHTML = '';
    data.userBans.forEach(u => { const div = document.createElement('div'); div.textContent = u; bannedUserList.appendChild(div); });

    bannedIpList.innerHTML = '';
    data.ipBans.forEach(ip => { const div = document.createElement('div'); div.textContent = ip; bannedIpList.appendChild(div); });

    adminUserList.innerHTML = '';
    data.onlineUsers.forEach(u => {
        const div = document.createElement('div');
        div.classList.add('admin-user-item');
        div.textContent = u;
        const btn = document.createElement('button');
        btn.textContent = 'Kick';
        btn.addEventListener('click', () => { socket.emit('admin:disconnect_user', { username: u }); });
        div.appendChild(btn);
        adminUserList.appendChild(div);
    });
});
