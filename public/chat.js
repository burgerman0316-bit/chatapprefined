const socket = io();

// DOM Elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

// Modals
const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const dmCloseBtn = document.getElementById('dmCloseBtn');

const adminModal = document.getElementById('adminModal');
const adminCloseBtn = document.getElementById('adminCloseBtn');
const adminUserList = document.getElementById('adminUserList');

const hardwareModal = document.getElementById('hardwareModal');
const hardwareUserList = document.getElementById('hardwareUserList');
const hardwareCloseBtn = document.getElementById('hardwareCloseBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;
let currentDM = '';

// -------------------- UTILITY FUNCTIONS --------------------
function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');

    if (msg.isSystem) {
        item.classList.add('system');
    } else if (msg.sender && displayName && msg.sender.toLowerCase() === displayName.toLowerCase()) {
        item.classList.add('own');
    } else {
        item.classList.add('other');
    }

    const header = `<div class="msg-header">${msg.sender || ''}${msg.isAdmin ? ' (Admin)' : ''}</div>`;
    const body = `<div class="message-content">${msg.content}</div>`;
    const foot = `<div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;

    item.innerHTML = header + body + foot;
    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function openDMModal() {
    // Populate user list
    dmUserList.innerHTML = '';
    socket.emit('request_user_list');
    dmModal.style.display = 'flex';
}

function highlightDM(username) {
    messageInputDiv.innerHTML = `<span class="highlighted-dm">${username}:</span>&nbsp;`;
    placeCaretAtEnd(messageInputDiv);
}

// Places cursor at end of contenteditable
function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection != "undefined"
        && typeof document.createRange != "undefined") {
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// -------------------- SOCKET EVENTS --------------------
socket.on('connect', () => {
    console.log('Connected:', socket.id);
});

socket.on('name_accepted', (name) => {
    displayName = name;
    secureName = name;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
});

socket.on('name_rejected', (msg) => {
    alert(msg); // Could later replace with a modal
});

socket.on('chat message', (msg) => {
    appendMessage(msg);
});

socket.on('private message', (msg) => {
    appendMessage({ ...msg, content: `[Private] ${msg.content}` });
});

socket.on('user list', (users) => {
    // Populate DM modal
    dmUserList.innerHTML = '';
    users.forEach(u => {
        if (u.toLowerCase() !== displayName.toLowerCase()) {
            const btn = document.createElement('button');
            btn.textContent = u;
            btn.addEventListener('click', () => {
                highlightDM(u);
                dmModal.style.display = 'none';
                currentDM = u;
            });
            dmUserList.appendChild(btn);
        }
    });
});

// -------------------- JOIN CHAT --------------------
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return;
    socket.emit('check_name', name);
});

// -------------------- MESSAGE FORM --------------------
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let content = messageInputDiv.innerText.trim();
    if (!content) return;

    const dmMatch = content.match(/^(.+?):\s/);
    if (dmMatch) {
        // Private message
        const recipient = dmMatch[1];
        const msg = content.replace(/^(.+?):\s/, '');
        socket.emit('private message', { recipient, content: msg });
        messageInputDiv.innerText = '';
        return;
    }

    // Regular message
    socket.emit('chat message', { sender: secureName || displayName, content });
    messageInputDiv.innerText = '';
});

// -------------------- ENTER TO SEND --------------------
messageInputDiv.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
    // Remove highlight if backspacing over it
    if (e.key === 'Backspace') {
        const firstChild = messageInputDiv.firstChild;
        if (firstChild && firstChild.classList && firstChild.classList.contains('highlighted-dm')) {
            const range = document.getSelection().getRangeAt(0);
            if (range.startOffset === 0) {
                firstChild.remove();
                currentDM = '';
            }
        }
    }
});

// -------------------- DM MODAL --------------------
dmCloseBtn.addEventListener('click', () => {
    dmModal.style.display = 'none';
});

// -------------------- ADMIN PANEL --------------------
adminPanelBtn.addEventListener('click', () => {
    if (!isAdmin) return;
    adminModal.style.display = 'flex';
    socket.emit('request_user_list_admin');
});

adminCloseBtn.addEventListener('click', () => {
    adminModal.style.display = 'none';
});

// -------------------- HARDWARE BAN MODAL --------------------
hardwareCloseBtn.addEventListener('click', () => {
    hardwareModal.style.display = 'none';
});

// -------------------- CLEAR CHAT --------------------
clearChatBtn.addEventListener('click', () => {
    if (!isAdmin) return;
    if (confirm('Are you sure you want to clear chat history?')) {
