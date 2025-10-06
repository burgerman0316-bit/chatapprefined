const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const nameModal = new bootstrap.Modal(document.getElementById('nameModal'), { backdrop: 'static', keyboard: false });
const userListElement = document.getElementById('user-list');

let displayName = '';
let secureName = '';
let isAdmin = false;

// --- DOM Manipulation Functions ---

// Renders a standard public message
function appendMessage(msg) {
    const item = document.createElement('li');
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    
    let usernameHtml = `<span class="username">${msg.username}</span>`;
    
    // Add special styling for System and Admin messages
    if (msg.isAdmin) {
        item.classList.add('system-message');
        usernameHtml = `<span class="username-admin">${msg.username}</span>`;
    }

    item.innerHTML = `
        <div class="message-header">
            ${usernameHtml}
            <span class="timestamp">${timestamp}</span>
        </div>
        <div class="message-content">${msg.content}</div>
    `;
    
    messages.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
}

// NEW: Renders a private message
function appendPrivateMessage(msg) {
    const item = document.createElement('li');
    const sender = msg.sender || 'Unknown';
    const content = msg.content;
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    const isSender = (sender.toLowerCase() === displayName.toLowerCase());

    // Determine the class for styling (used by style.css)
    let cssClass = 'private-message';
    if (isSender) {
        cssClass += ' private-message-self';
    } else {
        cssClass += ' private-message-other';
    }
    
    // Determine the display name and recipient indicator
    let nameDisplay;
    if (isSender) {
        // When sending: Show "You -> [Recipient]"
        nameDisplay = `<span class="username">You</span> <span class="private-to">-> ${msg.recipient}</span>`;
    } else {
        // When receiving: Show "[Sender] -> You"
        nameDisplay = `<span class="username">${sender}</span> <span class="private-to">-> You</span>`;
    }
    
    item.classList.add(cssClass);

    item.innerHTML = `
        <div class="message-header">
            ${nameDisplay}
            <span class="private-indicator">(Private)</span>
        </div>
        <div class="message-content">${content}</div>
        <span class="timestamp">${timestamp}</span>
    `;

    messages.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
}

// --- Event Handlers ---

// Username submission handler
nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (name) {
        socket.emit('check_staff_status', name);
    }
});

// Chat message submission handler (includes command parsing)
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message || !displayName) return;

    if (message.startsWith('/msg ')) {
        // Parse /msg [name] [message]
        const parts = message.substring(5).trim().split(/\s+/);
        const recipient = parts.shift();
        const content = parts.join(' ');

        if (recipient && content) {
            socket.emit('private message', { recipient: recipient, content: content });
            input.value = '';
            return; // Exit as DM is handled
        } else {
            appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), isAdmin: true });
        }
    } else if (message.startsWith('/clear')) {
        if (isAdmin) {
            socket.emit('admin:clear_history', { username: secureName });
        } else {
            appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date(), isAdmin: true });
        }
    } else {
        // Send a regular chat message
        socket.emit('chat message', { username: secureName || displayName, content: message });
    }

    input.value = '';
});

// --- Socket Listeners ---

socket.on('name_accepted', (name) => {
    displayName = name;
    secureName = name;
    isAdmin = false;
    document.getElementById('display-name').textContent = displayName;
    nameModal.hide();
});

socket.on('staff_status_update', (data) => {
    displayName = data.displayName;
    secureName = data.secureName;
    isAdmin = data.isAdmin;
    document.getElementById('display-name').textContent = `${displayName} (MOD)`;
    nameModal.hide();
});

socket.on('name_rejected', (msg) => {
    alert('Name Rejected: ' + msg);
});

socket.on('chat message', appendMessage);

socket.on('private message', appendPrivateMessage); // NEW handler for private messages

socket.on('system_error', (msg) => {
    appendMessage({ username: 'System', content: `Error: ${msg}`, timestamp: new Date(), isAdmin: true });
});

socket.on('system_alert', (msg) => {
    appendMessage({ username: 'System', content: `Alert: ${msg}`, timestamp: new Date(), isAdmin: true });
});

socket.on('chat history', (history) => {
    messages.innerHTML = ''; // Clear existing messages
    history.forEach(appendMessage);
});

socket.on('user count', (data) => {
    document.getElementById('user-count').textContent = data.count;
    
    userListElement.innerHTML = '';
    data.userList.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        if (user.toLowerCase() === displayName.toLowerCase()) {
            li.classList.add('user-self');
        }
        userListElement.appendChild(li);
    });
});

// Show name modal on load
document.addEventListener('DOMContentLoaded', () => {
    nameModal.show();
});
