// public/js/chat.js (Simplified Stable Base)
// === CONFIGURATION ===
const MAX_MESSAGE_LENGTH = 256;


// === SOCKET CONNECTION (KEEPING CRITICAL PROXY FIX) ===
const SOCKET_URL = window.location.protocol + "//" + window.location.host;
const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling']
});


// === STATE ===
let currentUserName = '';

// === DOM ELEMENTS (Simplified) ===
// Assuming you still use a name modal (or just prompt for name)
const nameModalElement = document.getElementById('nameModal');
const nameModal = nameModalElement ? new bootstrap.Modal(nameModalElement, { backdrop: 'static', keyboard: false }) : null;
const renameModal = document.getElementById('renameModal') ? new bootstrap.Modal(document.getElementById('renameModal')) : null;

const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const messageForm = document.getElementById('messageForm');
const charCounter = document.getElementById('char-counter');
const userList = document.getElementById('user-list');

// --- Admin-related DOM elements/vars REMOVED ---


// === HELPER FUNCTIONS ===

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function displayMessage(msg) {
    const item = document.createElement('li');
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isSelf = msg.username === currentUserName && !msg.isSystem && !msg.isPrivate;

    let contentHTML = '';
    let classList = 'msg';
    
    if (msg.isSystem) {
        classList += ' system';
        contentHTML = escapeHTML(msg.content);
    } else if (msg.isPrivate) {
        classList += ' private system';
        const partner = msg.sender === currentUserName ? msg.recipient : msg.sender;
        contentHTML = `(Private to ${partner}): ${escapeHTML(msg.content)}`;
    } else {
        classList += isSelf ? ' own' : ' other';
        contentHTML = `
            <span class="sender-name">${escapeHTML(msg.username)}</span>
            <div class="message-content">${escapeHTML(msg.content)}</div>
            <span class="timestamp">${time}</span>
        `;
    }

    item.className = classList;
    item.innerHTML = contentHTML;

    // Simplified stacking logic (you may need to manually adjust your CSS if needed)
    const lastMsg = messages.lastElementChild;
    if (lastMsg && !msg.isSystem && !msg.isPrivate && lastMsg.classList.contains(isSelf ? 'own' : 'other')) {
        item.style.marginTop = '-8px';
    }

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

function renderUserList(users, listElement) {
    listElement.innerHTML = '';
    
    users.forEach(user => {
        const li = document.createElement('li');
        li.dataset.displayName = user.displayName;
        li.innerHTML = escapeHTML(user.displayName);
        listElement.appendChild(li);
    });

    document.getElementById('user-count').textContent = users.length;
}

function handleCommand(input) {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    
    if (command === '/msg') {
        const recipient = parts[1];
        const content = parts.slice(2).join(' ');
        
        if (!recipient || !content) {
            return socket.emit('system_error', 'Usage: /msg [user] [message]');
        }
        
        socket.emit('private message', { recipient: recipient, content: content.substring(0, MAX_MESSAGE_LENGTH) });
        return true;
    } 
    // All other admin commands removed
    return false;
}


// === INITIALIZATION / LOGIN ===

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('container').style.display = 'flex'; // Ensure chat area is shown
    
    if (nameModal) {
        nameModal.show();
    } else {
        // Fallback prompt if modal is not present (for simple HTML frontends)
        let name = prompt("Enter your display name (3-20 characters):");
        if (name) {
            document.getElementById('name-input').value = name;
            document.getElementById('name-form').dispatchEvent(new Event('submit'));
        }
    }
    
    socket.on('connect_error', (err) => {
        console.error("Connection Error:", err.message);
        document.body.innerHTML = `<h1 style="color: red; text-align: center; padding-top: 100px;">Connection Failed: ${err.message}</h1>`;
    });
});

document.getElementById('name-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name-input').value;

    // Note the server event name change from 'check_staff_status' to 'check_name_status'
    socket.emit('check_name_status', name, ({ success, reason, displayName }) => {
        if (success) {
            currentUserName = displayName;
            document.getElementById('display-name').textContent = currentUserName;
            
            if (nameModal) nameModal.hide();
            messageInput.focus();
        } else {
            let message = '';
            if (reason === 'banned_word_or_length') {
                message = 'Name must be 3-20 characters and cannot contain banned words.';
            } else if (reason === 'name_in_use') {
                message = 'This name is already in use.';
            }
            alert('Login failed: ' + message);
        }
    });
});


// === EVENT LISTENERS ===

// Chat Form Submission
messageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const content = messageInput.textContent.trim();
    messageInput.textContent = ''; 
    updateCharCounter(); 
    
    if (content) {
        const isCommand = handleCommand(content);
        if (!isCommand) {
            const safeContent = content.substring(0, MAX_MESSAGE_LENGTH);
            socket.emit('chat message', { content: safeContent }); // No room argument needed
        }
    }
});

// Character Counter and Max Length Enforcement
messageInput.addEventListener('input', updateCharCounter);
messageInput.addEventListener('keydown', function(e) {
    if (messageInput.textContent.length >= MAX_MESSAGE_LENGTH && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});
function updateCharCounter() {
    const count = messageInput.textContent.length;
    charCounter.textContent = `${count} / ${MAX_MESSAGE_LENGTH}`;
    charCounter.style.color = count > MAX_MESSAGE_LENGTH ? 'red' : '#888';
}


// Rename Form Submission
if (renameModal) {
    document.getElementById('rename-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const newName = document.getElementById('new-name-input').value;

        socket.emit('rename', newName, ({ success, message, newName: updatedName }) => {
            if (success) {
                currentUserName = updatedName;
                document.getElementById('display-name').textContent = currentUserName;
                renameModal.hide();
            } else {
                alert('Rename failed: ' + message);
            }
        });
    });
}


// === SOCKET EVENT HANDLERS ===

socket.on('chat message', function(msg) {
    displayMessage(msg);
});

socket.on('private message', function(msg) {
    displayMessage(msg);
});

socket.on('system_error', function(message) {
    displayMessage({ username: 'System Error', content: message, timestamp: new Date(), isSystem: true });
});

socket.on('system_alert', function(message) {
    displayMessage({ username: 'System Alert', content: message, timestamp: new Date(), isSystem: true });
});

socket.on('user list update', function(users) {
    renderUserList(users, userList);
});

socket.on('chat history', function(history) {
    messages.innerHTML = '';
    history.forEach(msg => displayMessage(msg));
});

// Admin-related handlers (room changed, clear, etc.) REMOVED
