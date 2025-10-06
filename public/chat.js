const socket = io();

// Elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const displayNameEl = document.getElementById('displayName');
const messagesDiv = document.getElementById('messages');
const messageInputDiv = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const container = document.getElementById('container');
const overlay = document.getElementById('overlay');
const loginModal = document.getElementById('loginModal');

const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');

const adminModal = document.getElementById('adminModal');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const hardwareBanBtn = document.getElementById('hardwareBanBtn');
const adminUserList = document.getElementById('adminUserList');

let displayName = '';
let isAdmin = false;
let privateRecipient = '';

// Utility
function appendMessage(msg) {
    const item = document.createElement('li');
    item.classList.add('msg');

    if (msg.isPrivate) {
        item.classList.add('other');
        item.innerHTML = `<strong>${msg.sender} → ${msg.recipient}:</strong> ${msg.content}`;
    } else if (msg.username === displayName) {
        item.classList.add('own');
        item.innerHTML = `<strong>You:</strong> ${msg.content}`;
    } else if (msg.username === 'System') {
        item.classList.add('system');
        item.textContent = msg.content;
    } else {
        item.classList.add('other');
        item.innerHTML = `<strong>${msg.username}:</strong> ${msg.content}`;
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Login
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return;
    socket.emit('check_staff_status', name);
});

// Enter to send message
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// Send message
sendBtn.addEventListener('click', () => {
    const content = messageInputDiv.innerText.trim();
    if (!content) return;

    if (privateRecipient) {
        socket.emit('private message', { recipient: privateRecipient, content });
        privateRecipient = '';
        messageInputDiv.innerText = '';
        return;
    }

    socket.emit('chat message', { username: displayName, content });
    messageInputDiv.innerText = '';
});

// Socket events
socket.on('name_accepted', name => {
    displayName = name;
    displayNameEl.textContent = displayName;
    loginModal.style.display = 'none';
    overlay.style.display = 'none';
    container.style.pointerEvents = 'auto';
});

socket.on('staff_status_update', data => {
    displayName = data.displayName;
    isAdmin = data.isAdmin;
    displayNameEl.textContent = displayName;
    loginModal.style.display = 'none';
    overlay.style.display = 'none';
    container.style.pointerEvents = 'auto';

    if (isAdmin) adminPanelBtn.style.display = 'inline-block';
});

socket.on('staff_name_reserved_modal', msg => {
    alert(msg);
});

socket.on('name_in_use_modal', msg => {
    alert(msg);
});

socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));

// Admin Panel
adminPanelBtn.addEventListener('click', () => {
    adminModal.style.display = 'flex';
});

// Close modals
document.querySelectorAll('.closeBtn').forEach(btn => {
    btn.addEventListener('click', e => {
        e.target.closest('.modal').style.display = 'none';
    });
});

// Clear chat
clearChatBtn.addEventListener('click', () => {
    socket.emit('admin:clear_history', { username: displayName });
});

// Dummy hardware ban (open modal and pick user)
hardwareBanBtn.addEventListener('click', () => {
    alert('Select a user to hardware ban (functionality placeholder).');
});
