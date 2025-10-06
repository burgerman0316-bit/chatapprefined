const socket = io();

// DOM elements
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');

let displayName = '';
let secureName = '';
let isAdmin = false;

// ------------ Utility / DOM append functions ------------

// Append a public chat message
function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');
    if (msg.isAdmin) {
        item.classList.add('system-msg');
    }
    // Determine own vs other
    if (!msg.isAdmin) {
        if (msg.username && displayName && msg.username.toLowerCase() === displayName.toLowerCase()) {
            item.classList.add('own');
        } else {
            item.classList.add('other');
        }
    }
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    const header = `<div class="msg-header">${msg.username}${msg.isAdmin ? ' (Admin)' : ''}</div>`;
    const body = `<div class="message-content">${msg.content}</div>`;
    const foot = `<div class="timestamp">${timestamp}</div>`;
    item.innerHTML = `${header}${body}${foot}`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

// Append a private message (sender & recipient see it)
function appendPrivateMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg', 'private');

    const sender = msg.sender || 'Unknown';
    const recipient = msg.recipient || '';
    const content = msg.content;
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    const isSender = (sender.toLowerCase() === displayName.toLowerCase());

    if (isSender) {
        item.classList.add('own');
    } else {
        item.classList.add('other');
    }

    let headerText;
    if (isSender) {
        headerText = `You → ${recipient}`;
    } else {
        headerText = `${sender} → You`;
    }

    const header = `<div class="msg-header">${headerText} <span class="private-indicator">(Private)</span></div>`;
    const body = `<div class="message-content">${content}</div>`;
    const foot = `<div class="timestamp">${timestamp}</div>`;

    item.innerHTML = `${header}${body}${foot}`;

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

// ------------ Event handlers & socket communication ------------

// Name submission
if (nameForm) {
    nameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (name) {
            socket.emit('check_staff_status', name);
        }
    });
}

// Message send
if (form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = input.value.trim();
        if (!message || !displayName) return;

        if (message.startsWith('/msg ')) {
            // parse /msg
            const parts = message.substring(5).trim().split(/\s+/);
            const recipient = parts.shift();
            const content = parts.join(' ');
            if (recipient && content) {
                socket.emit('private message', { recipient, content });
                input.value = '';
                return;
            } else {
                appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), isAdmin: true });
                input.value = '';
                return;
            }
        }

        // regular chat message
        socket.emit('chat message', { username: secureName || displayName, content: message });
        input.value = '';
    });
}

// Socket listeners

socket.on('name_accepted', (name) => {
    displayName = name;
    secureName = name;
    isAdmin = false;
    // optionally update UI display name ...
});

socket.on('staff_status_update', (data) => {
    displayName = data.displayName;
    secureName = data.secureName;
    isAdmin = data.isAdmin;
    // optionally update UI display name ...
});

socket.on('name_rejected', (msg) => {
    alert('Name rejected: ' + msg);
});

socket.on('chat message', (msg) => {
    appendMessage(msg);
