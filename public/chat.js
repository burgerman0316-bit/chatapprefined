const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const dmModalClose = document.getElementById('dmModalClose');

const adminModal = document.getElementById('adminModal');
const adminModalClose = document.getElementById('adminModalClose');
const adminClearHistoryBtn = document.getElementById('adminClearHistoryBtn');
const adminBanUserBtn = document.getElementById('adminBanUserBtn');
const adminHWBanBtn = document.getElementById('adminHWBanBtn');

const usernameModal = document.getElementById('usernameModal');
const usernameModalText = document.getElementById('usernameModalText');
const usernameModalClose = document.getElementById('usernameModalClose');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmTarget = null;

// ========== Utility Functions ==========

function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');

    if (msg.isSystem) {
        item.classList.add('system-msg');
    } else if (!msg.isAdmin && msg.username.toLowerCase() === displayName.toLowerCase()) {
        item.classList.add('own');
    } else {
        item.classList.add('other');
    }

    const header = msg.isSystem ? '' : `<div class="msg-header">${msg.username}${msg.isAdmin ? ' (Admin)' : ''}</div>`;
    const body = `<div class="message-content">${msg.content}</div>`;

    item.innerHTML = header + body;
    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== Event Handlers ==========

// Joining
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return;
    socket.emit('check_staff_status', name);
});

// Sending messages
messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const content = messageInputDiv.innerText.trim();
    if (!content || !displayName) return;

    // Handle DM modal trigger
    if (content.startsWith('/msg')) {
        if (!dmTarget) {
            // Show modal to select user
            socket.emit('request_user_list');
            dmModal.style.display = 'flex';
            return;
        }
    }

    if (dmTarget) {
        const msgContent = content.replace(`${dmTarget}: `, '');
        socket.emit('private message', { recipient: dmTarget, content: msgContent });
        messageInputDiv.innerText = '';
        dmTarget = null;
        return;
    }

    // Normal chat message
    socket.emit('chat message', { username: secureName || displayName, content });
    messageInputDiv.innerText = '';
});

// Key handling: Enter sends, Shift+Enter new line
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// DM modal close
dmModalClose.addEventListener('click', () => {
    dmModal.style.display = 'none';
});

// Admin panel open
adminPanelBtn.addEventListener('click', () => {
    adminModal.style.display = 'flex';
});

// Admin modal close
adminModalClose.addEventListener('click', () => {
    adminModal.style.display = 'none';
});

// Admin actions
adminClearHistoryBtn.addEventListener('click', () => {
    socket.emit('admin:clear_history', { username: secureName });
});

adminBanUserBtn.addEventListener('click', () => {
    const user = prompt('Enter username to ban:');
    if (user) socket.emit('admin:ban_user', { username: user });
});

adminHWBanBtn.addEventListener('click', () => {
    const user = prompt('Enter username for hardware ban:');
    if (user) socket.emit('admin:hw_ban_user', { username: user });
});

// Username modal close
usernameModalClose.addEventListener('click', () => {
    usernameModal.style.display = 'none';
});

// DM modal user selection
socket.on('user_list', users => {
    dmUserList.innerHTML = '';
    users.forEach(u => {
        if (u !== displayName) {
            const btn = document.createElement('button');
            btn.innerText = u;
            btn.addEventListener('click', () => {
                dmTarget = u;
                dmModal.style.display = 'none';
                messageInputDiv.innerText = `${u}: `;
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(messageInputDiv);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                messageInputDiv.focus();
            });
            dmUserList.appendChild(btn);
        }
    });
});

// Socket events
socket.on('name_accepted', name => {
    displayName = name;
    secureName = name;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
});

socket.on('name_rejected', msg => {
    usernameModalText.innerText = msg;
    usernameModal.style.display = 'flex';
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

socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage({ ...msg, content: `(Private) ${msg.content}` }));
socket.on('chat history', history => {
    messagesDiv.innerHTML = '';
    history.forEach(msg => appendMessage(msg));
});
socket.on('user count', data => {
    userCountDisplay.textContent = `${data.count} Users Online`;
});
