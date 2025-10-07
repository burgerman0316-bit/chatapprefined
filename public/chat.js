// chat.js - FINAL SCRIPT WITH ALL MODAL FIXES

// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 

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

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');

const adminPanelBtn = document.getElementById('adminPanelBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const adminUserList = document.getElementById('admin-user-list'); 
const adminModalEl = document.getElementById('adminPanelModal'); 

// Modal Elements for Clear History
const clearConfirmModalEl = document.getElementById('clearConfirmModal');
const clearConfirmModal = new bootstrap.Modal(clearConfirmModalEl);
const clearConfirmBtn = document.getElementById('clearConfirmBtn');

// *** NEW Modal Elements for Kick Confirmation ***
const kickConfirmModalEl = document.getElementById('kickConfirmModal');
const kickConfirmModal = new bootstrap.Modal(kickConfirmModalEl);
const kickConfirmBtn = document.getElementById('kickConfirmBtn');
const kickConfirmBody = document.getElementById('kickConfirmBody');
let userToKick = null; // Variable to temporarily store the target user's name

let displayName = '';
let isAdmin = false;

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('container').style.display || document.getElementById('container').style.display === 'none') {
        myModal.show();
    }
});

// Utility: Appends a message to the chat
function appendMessage(msg) {
    const item = document.createElement('li');
    item.classList.add('msg');
    const timestamp = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (msg.username === 'System') {
        item.classList.add('system');
        item.textContent = msg.content;
    } else if (msg.username === displayName) {
        item.classList.add('own');
        item.innerHTML = `<strong>You:</strong> ${msg.content} <span class="text-muted small">${timestamp}</span>`;
    } else {
        item.classList.add('other');
        const nameDisplay = msg.isPrivate ? `${msg.sender} → ${msg.recipient}` : msg.username;
        item.innerHTML = `<strong>${nameDisplay}:</strong> ${msg.content} <span class="text-muted small">${timestamp}</span>`;
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Utility: Updates the online user list
function updateUsers(userList) {
    userCountEl.textContent = userList.length;
    userListEl.innerHTML = '';
    adminUserList.innerHTML = ''; 

    userList.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        li.title = `Click to send private message to ${user}`;
        
        userListEl.appendChild(li);

        if (isAdmin) {
             const adminLi = document.createElement('li');
             adminLi.textContent = user;
             
             // *** FIX: Replace click listener with Modal Trigger ***
             adminLi.addEventListener('click', () => {
                 if (user === displayName) {
                      alert('You cannot kick yourself!');
                      return;
                 }
                 
                 userToKick = user; // Store the target user's name
                 
                 // Update the modal body text for the specific user
                 kickConfirmBody.innerHTML = `Are you sure you want to KICK <strong>${user}</strong> from the chat?`;
                 
                 // Show the Kick Confirmation Modal
                 kickConfirmModal.show();
                 
                 // Hide the Admin Panel modal
                 const adminModal = bootstrap.Modal.getInstance(adminModalEl);
                 if (adminModal) adminModal.hide();
             });
             
             adminUserList.appendChild(adminLi);
        }
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
    
    if (!content) return;

    // Check for commands
    if (content.startsWith('/msg ')) {
        const parts = content.split(' ');
        const recipient = parts[1];
        const dmContent = parts.slice(2).join(' ');
        if (recipient && dmContent) {
            socket.emit('private message', { recipient: recipient, content: dmContent });
        } else {
            appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date() });
        }
    } 
    else if (content.toLowerCase() === '/clear') {
        if (isAdmin) {
             // Already fixed: Shows Clear Modal
             clearConfirmModal.show();
             console.log("[CLIENT DEBUG - COMMAND] Bootstrap Modal Shown for /clear.");
        } else {
            appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date() });
        }
    } else {
        // Regular public message
        socket.emit('chat message', { username: displayName, content });
    }
});

// 3. Enter key in input box
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// 4. Admin: Clear Chat Button
clearChatBtn.addEventListener('click', () => {
    clearConfirmModal.show();
    console.log("[CLIENT DEBUG - BUTTON] Bootstrap Modal Shown for Clear Chat Button.");
    
    const adminModal = bootstrap.Modal.getInstance(adminModalEl);
    if (adminModal) adminModal.hide();
});

// 5. Clear History Confirmation Click 
clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:clear_history', { username: displayName });
        console.log(`[CLIENT DEBUG - BUTTON] Event 'admin:clear_history' EMITTED from Bootstrap Modal.`);
    }
    clearConfirmModal.hide(); 
});


// *** 6. NEW: Kick User Confirmation Click Handler ***
kickConfirmBtn.addEventListener('click', () => {
    if (isAdmin && userToKick) {
        socket.emit('admin:kick_user', { targetName: userToKick, adminName: displayName });
        console.log(`[CLIENT DEBUG - KICK] Event 'admin:kick_user' EMITTED for user: ${userToKick}`);
    } else {
        console.error('[CLIENT DEBUG - KICK] Kick failed. Not admin or no target user selected.');
    }
    
    kickConfirmModal.hide(); 
    userToKick = null; // Clear the temporary variable
});


// --- Socket Events ---

// Shared function to handle successful login
function handleSuccessfulLogin(data) {
    displayName = data.displayName;
    isAdmin = data.isAdmin || false; 
    displayNameEl.textContent = displayName;
    
    myModal.hide(); 
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

// Login Errors 
socket.on('staff_name_reserved_modal', msg => {
    alert(msg);
});
socket.on('name_in_use_modal', msg => {
    alert(msg);
});

// Chat Events 
socket.on('chat history', history => {
    messagesDiv.innerHTML = ''; 
    history.forEach(msg => appendMessage(msg));
});
socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));

// Admin Events 
socket.on('admin:history_cleared', msg => {
    console.log(`[CLIENT DEBUG] Received 'admin:history_cleared' broadcast. UI cleared.`);
    
    const messagesElement = document.getElementById('messages');
    
    if (messagesElement) {
        messagesElement.innerHTML = ''; 
        appendMessage(msg);             
    }
});

// System Alerts
socket.on('system_error', msg => appendMessage({ username: 'System', content: `ERROR: ${msg}`, timestamp: new Date() }));
socket.on('system_alert', msg => appendMessage({ username: 'System', content: msg, timestamp: new Date() }));

// User List Update
socket.on('user count', data => updateUsers(data.userList));
