// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 

// Socket connection
const socket = io();

// Elements
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const container = document.getElementById('container'); // Main chat container

const displayNameEl = document.getElementById('display-name');
const messagesDiv = document.getElementById('messages');
const messageInputDiv = document.getElementById('messageInput');
const sendBtn = document.querySelector('#messageForm button');
const messageForm = document.getElementById('messageForm');

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');

const adminPanelBtn = document.getElementById('adminPanelBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const adminUserList = document.getElementById('admin-user-list'); 
const adminModalEl = document.getElementById('adminPanelModal'); 


let displayName = '';
let isAdmin = false;

// --- Initial Setup ---
// Show the login modal immediately upon load
document.addEventListener('DOMContentLoaded', () => {
    // If the modal isn't already visible (e.g., from a previous session state), show it
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
        // Fallback for others and private messages
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
    adminUserList.innerHTML = ''; // For Admin Panel list

    userList.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        li.title = `Click to send private message to ${user}`;
        
        // Add user to the main list
        userListEl.appendChild(li);

        // Add user to the Admin Panel list (only if admin panel button is visible)
        if (isAdmin) {
             const adminLi = document.createElement('li');
             adminLi.textContent = user;
             
             // Admin Kick functionality
             adminLi.addEventListener('click', () => {
                 if (user === displayName) {
                      alert('You cannot kick yourself!');
                      return;
                 }
                 if (confirm(`Are you sure you want to KICK "${user}" from the chat?`)) {
                      socket.emit('admin:kick_user', { targetName: user, adminName: displayName });
                      
                      // Optionally close the modal after action
                      const adminModal = bootstrap.Modal.getInstance(adminModalEl);
                      if (adminModal) adminModal.hide();
                 }
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
    if (!content) return;

    // Check for /msg command
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
    // Check for /clear command (Admin-only client-side check)
    else if (content.toLowerCase() === '/clear') {
        if (isAdmin) {
             if (confirm('Are you sure you want to clear the chat history for everyone?')) {
                socket.emit('admin:clear_history', { username: displayName });
             }
        } else {
            appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date() });
        }
        
    } else {
        // Regular public message
        socket.emit('chat message', { username: displayName, content });
    }

    messageInputDiv.innerText = ''; // Clear input
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
    if (confirm('Are you sure you want to clear the chat history for everyone?')) {
        socket.emit('admin:clear_history', { username: displayName });
        // Close modal after sending command
        const adminModal = bootstrap.Modal.getInstance(adminModalEl);
        if (adminModal) adminModal.hide();
    }
});

// --- Socket Events ---

// Shared function to handle successful login
function handleSuccessfulLogin(data) {
    displayName = data.displayName;
    isAdmin = data.isAdmin || false; 
    displayNameEl.textContent = displayName;
    
    // Hide modal and show chat container
    myModal.hide(); 
    container.style.display = 'flex'; 

    // FIX: Show/Hide Admin Button (Must be 'block' for button)
    if (isAdmin) {
        adminPanelBtn.style.display = 'block';
    } else {
        adminPanelBtn.style.display = 'none';
    }
}

// Login Success for normal user
socket.on('name_accepted', name => {
    handleSuccessfulLogin({ displayName: name, isAdmin: false });
});

// Login Success for staff
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
    messagesDiv.innerHTML = ''; // Clear existing
    history.forEach(msg => appendMessage(msg));
});
socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));

// Admin Events
socket.on('admin:history_cleared', msg => {
    messagesDiv.innerHTML = ''; // Physical UI clear
    appendMessage(msg); // Add the system message that history was cleared
});

// System Alerts
socket.on('system_error', msg => appendMessage({ username: 'System', content: `ERROR: ${msg}`, timestamp: new Date() }));
socket.on('system_alert', msg => appendMessage({ username: 'System', content: msg, timestamp: new Date() }));

// User List Update
socket.on('user count', data => updateUsers(data.userList));
