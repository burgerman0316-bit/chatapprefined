// chat.js - SCRIPT WITH VISUAL FIX AND CORE CHAT LOGIC

// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 
const clearConfirmModal = new bootstrap.Modal(document.getElementById('clearConfirmModal'));
const kickConfirmModal = new bootstrap.Modal(document.getElementById('kickConfirmModal')); // Added for consistency

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

const adminPanelBtn = document.getElementById('adminPanelBtn');

// Modal Elements for Clear History
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmTargetName = document.getElementById('clearConfirmTargetName'); // Not used in this version but kept for future proofing

// Modal Elements for Kick Confirmation
const kickConfirmTarget = document.getElementById('kickConfirmTarget');
let userToKick = null; 
const kickDirectlyBtn = document.getElementById('kickDirectlyBtn');


let displayName = '';
let isAdmin = false;
const MAX_CHARS = 256;


// --- UTILITY FUNCTIONS ---

// Utility: Appends a message to the chat
function appendMessage(msg) {
    const item = document.createElement('li');
    item.classList.add('msg');
    
    const time = new Date(msg.timestamp);
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeHtml = `<span class="timestamp">${timeString}</span>`; 

    if (msg.username === 'System') {
        item.classList.add('system');
        item.textContent = msg.content;
    } 
    // FIXED: Corrected logic for identifying and formatting the user's own messages
    else if (msg.username === displayName || (msg.username === 'You' && msg.isPrivate)) {
        item.classList.add('own');
        
        let nameDisplay = msg.username === 'You' ? 'You' : displayName;
        let nameClass = 'sender-name';

        if (msg.isPrivate) {
             nameDisplay = msg.username === 'You' ? `You (Private to ${msg.recipient})` : `Private from ${msg.username}`;
             nameClass = 'sender-name private-name';
        } 
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${msg.content} ${timeHtml}`;
    } 
    // This block handles messages from other users
    else { 
        item.classList.add('other');
        if (msg.isAdmin) { 
            item.classList.add('admin-msg'); 
        }
        
        const nameDisplay = msg.isPrivate ? `Private from ${msg.username}` : msg.username;
        const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${msg.content} ${timeHtml}`;
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Utility: Updates the online user list
function updateUserList(userList) {
    userCountEl.textContent = userList.length;
    userListEl.innerHTML = '';
    
    userList.forEach(userDisplayName => {
        const li = document.createElement('li');
        li.textContent = userDisplayName;
        
        // Check if the user is the current display name (not perfect but simple)
        const isCurrentAdmin = isAdmin && (userDisplayName === displayName);
        
        // Note: Server doesn't send admin status to public users in this version, only names. 
        // We rely on the server side to filter this better for admin status if needed.

        li.title = `Click to send private message to ${userDisplayName}`;
        li.addEventListener('click', () => {
             messageInputDiv.innerText = `/msg ${userDisplayName} `;
             messageInputDiv.focus();
        });
        
        // For admins, allow kicking
        if (isAdmin && userDisplayName !== displayName) {
             const kickBtn = document.createElement('button');
             kickBtn.textContent = 'Kick';
             kickBtn.classList.add('btn', 'btn-sm', 'btn-danger', 'ms-2');
             kickBtn.addEventListener('click', (e) => {
                 e.stopPropagation();
                 userToKick = userDisplayName;
                 kickConfirmTarget.textContent = userDisplayName;
                 kickConfirmModal.show();
             });
             li.appendChild(kickBtn);
        }
        
        userListEl.appendChild(li);
    });
}

// --- Event Listeners ---

// 1. Handle Login Form Submission
nameForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    socket.emit('check_staff_status', name);
});

// 2. Handle Message Form Submission 
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
                if (recipient && dmContent) {
                    socket.emit('private message', { recipient: recipient, content: dmContent });
                } else {
                    appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date() });
                }
            } else {
                 appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date() });
            }
        } 
        else if (command === '/kick') { 
            if (!isAdmin) {
                 appendMessage({ username: 'System', content: 'You do not have permission to use the /kick command.', timestamp: new Date() });
                 return;
            }
            if (args) {
                socket.emit('admin:kick_user', args);
            } else {
                appendMessage({ username: 'System', content: 'Invalid /kick command. Usage: /kick [username]', timestamp: new Date() });
            }
        }
        else if (command === '/clear') {
            if (isAdmin) {
                 clearConfirmModal.show();
            } else {
                appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date() });
            }
        } else {
             appendMessage({ username: 'System', content: `Unknown command: ${command}`, timestamp: new Date() });
        }
    } else {
        socket.emit('chat message', { content }); 
    }
});

// 3. Input Character Counter
messageInputDiv.addEventListener('input', () => {
    const currentLength = messageInputDiv.innerText.length;
    
    if (currentLength > MAX_CHARS) {
        messageInputDiv.innerText = messageInputDiv.innerText.substring(0, MAX_CHARS);
        charCountSpan.textContent = `${MAX_CHARS}/${MAX_CHARS}`;
    } else {
        charCountSpan.textContent = `${currentLength}/${MAX_CHARS}`;
    }
    
    if (currentLength >= MAX_CHARS * 0.9) {
        charCountContainer.style.color = '#ff4d4d'; 
    } else {
        charCountContainer.style.color = '#ccc'; 
    }
});

// Ensure Enter sends message
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// 4. Admin Panel Button Handlers
adminPanelBtn.addEventListener('click', () => {
    // In this basic version, the panel only contains the clear button/kick, no separate modal is shown.
    // If the modal exists in HTML, this will open it.
});

// 5. Clear History Confirmation Click 
clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:clear_history'); 
    }
    clearConfirmModal.hide(); 
});

// 6. Kick User Confirmation Click Handler
kickDirectlyBtn.addEventListener('click', () => {
     if (isAdmin && userToKick) {
         socket.emit('admin:kick_user', userToKick);
     }
     kickConfirmModal.hide();
     userToKick = null;
});


// --- Socket Events ---

// Shared function to handle successful login
function handleSuccessfulLogin(data) {
    displayName = data.displayName;
    isAdmin = data.isAdmin || false; 
    displayNameEl.textContent = displayName + (isAdmin ? ' (MOD)' : '');
    
    myModal.hide(); 
    // THIS IS THE CRUCIAL VISUAL FIX
    container.style.display = 'flex'; 

    if (isAdmin) {
        adminPanelBtn.style.display = 'block';
    } else {
        adminPanelBtn.style.display = 'none';
    }
}

// Login Success events
socket.on('name_accepted', name => {
    handleSuccessfulLogin({ displayName: name, isAdmin: false });
});
socket.on('staff_status_update', data => {
    handleSuccessfulLogin(data);
});

// Login Errors & Rejections
socket.on('name_rejected', msg => {
    alert(`Login Failed: ${msg}`);
});

// Chat Events (Both Public and Private)
socket.on('chat history', history => {
    messagesDiv.innerHTML = ''; 
    history.forEach(msg => appendMessage(msg));
});
socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));

// Admin Events 
socket.on('admin:history_cleared', msg => {
    messagesDiv.innerHTML = ''; 
    appendMessage(msg);             
});

// System Alerts
socket.on('system_error', msg => appendMessage({ username: 'System', content: `ERROR: ${msg}`, timestamp: new Date() }));
socket.on('system_alert', msg => appendMessage({ username: 'System', content: msg, timestamp: new Date() }));


// User List Update
socket.on('user count', userList => updateUserList(userList));
