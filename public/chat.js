const socket = io();

// DOM Elements
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const usernameError = document.getElementById('usernameError');
const usernameClose = document.getElementById('usernameClose');

const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const dmClose = document.getElementById('dmClose');

const adminModal = document.getElementById('adminModal');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminClose = document.getElementById('adminClose');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmRecipient = null;

// Show username modal
usernameModal.style.display = 'flex';

// ========== Username logic ==========
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        socket.emit('check_staff_status', name);
    }
});

usernameClose.addEventListener('click', () => {
    usernameModal.style.display = 'none';
});

socket.on('name_accepted', name => {
    displayName = name;
    secureName = name;
    usernameModal.style.display = 'none';
});

socket.on('staff_name_reserved_modal', msg => {
    usernameError.textContent = msg;
});

socket.on('name_in_use_modal', msg => {
    usernameError.textContent = msg;
});

socket.on('staff_status_update', data => {
    displayName = data.displayName;
    secureName = data.secureName;
    isAdmin = data.isAdmin;
    usernameModal.style.display = 'none';
    if (isAdmin) adminPanelBtn.style.display = 'inline-block';
});

// ========== Chat message display ==========
function appendMessage(msg) {
    const div = document.createElement('div');
    if (msg.isPrivate) {
        div.classList.add('message', msg.sender === displayName ? 'own' : 'other');
        div.textContent = `(Private) ${msg.sender} → ${msg.recipient}: ${msg.content}`;
    } else if (msg.username === 'System') {
        div.classList.add('message', 'system');
        div.textContent = msg.content;
    } else {
        div.classList.add('message', msg.username === displayName ? 'own' : 'other');
        div.textContent = `${msg.username}: ${msg.content}`;
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.on('chat message', appendMessage);
socket.on('private message', appendMessage);
socket.on('chat history', history => {
    chatMessages.innerHTML = '';
    history.forEach(appendMessage);
});

// ========== Sending messages ==========
function sendMessage() {
    const content = messageInput.innerText.trim();
    if (!content) return;

    // Check for DM trigger
    if (content.startsWith('/msg')) {
        showDMModal();
        messageInput.innerText = '';
        return;
    }

    const payload = { username: secureName || displayName, content };
    socket.emit('chat message', payload);
    messageInput.innerText = '';
}

sendBtn.addEventListener('click', sendMessage);

// Press enter to send
messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// ========== DM Modal ==========
function showDMModal() {
    socket.emit('request_user_list');
    dmModal.style.display = 'flex';
}

// Close DM modal
dmClose.addEventListener('click', () => {
    dmModal.style.display = 'none';
});

// Populate DM users list dynamically
socket.on('user count', data => {
    dmUserList.innerHTML = '';
    data.userList.forEach(user => {
        if (user !== displayName) {
            const li = document.createElement('li');
            li.textContent = user;
            li.addEventListener('click', () => {
                dmRecipient = user;
                messageInput.innerText = `[${user}]: `;
                dmModal.style.display = 'none';
            });
            dmUserList.appendChild(li);
        }
    });
});

// ========== Admin Modal ==========
adminPanelBtn.addEventListener('click', () => {
    adminModal.style.display = 'flex';
});

adminClose.addEventListener('click', () => {
    adminModal.style.display = 'none';
});

// Clear history
clearHistoryBtn.addEventListener('click', () => {
    if (!isAdmin) return;
    socket.emit('admin:clear_history', { username: displayName });
});
