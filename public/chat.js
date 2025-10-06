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
    sendM
