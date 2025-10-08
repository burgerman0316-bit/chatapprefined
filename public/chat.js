// chat.js - FINAL SCRIPT WITH FINGERPRINTING AND ADMIN FIXES

// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 

// Global Socket variable (defined as null initially, connected on successful login)
let socket = null;

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
const nameErrorEl = document.getElementById('nameError'); // Added for displaying ban messages

// Modal Elements for Clear History
const clearConfirmModalEl = document.getElementById('clearConfirmModal');
const clearConfirmModal = new bootstrap.Modal(clearConfirmModalEl);
const clearConfirmBtn = document.getElementById('clearConfirmBtn');

// Modal Elements for Kick Confirmation (reused for ban commands)
const kickConfirmModalEl = document.getElementById('kickConfirmModal');
const kickConfirmModal = new bootstrap.Modal(kickConfirmModalEl);
const kickConfirmBtn = document.getElementById('kickConfirmBtn');
const kickConfirmBody = document.getElementById('kickConfirmBody');
let userToKick = null; // Variable to temporarily store the target user's name

let displayName = '';
let isAdmin = false;

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Show login modal on load
    myModal.show();
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
             
             // Admin list click opens kick/ban modal for that user
             adminLi.addEventListener('click', () => {
                 if (user === displayName) {
                      alert('You cannot target yourself!');
                      return;
                 }
                 
                 userToKick = user; // Store the target user's name
                 
                 // Update the modal body text to reflect all potential actions
                 kickConfirmBody.innerHTML = `
                    <p>Target: <strong>${user}</strong></p>
                    <div class="d-grid gap-2">
                        <button class="btn btn-warning" id="actionKickBtn">Kick</button>
                        <input type="number" id="banDuration" class="form-control mb-2" placeholder="Ban Duration (seconds)" value="120">
                        <button class="btn btn-danger" id="actionNameBanBtn">Ban Username</button>
                        <button class="btn btn-danger" id="actionDeviceBanBtn">Ban Device</button>
                    </div>
                 `;
                 
                 // Bind new action buttons
                 document.getElementById('actionKickBtn').onclick = () => sendAdminCommand('/kick', user);
                 document.getElementById('actionNameBanBtn').onclick = () => sendAdminCommand('/ban', user);
                 document.getElementById('actionDeviceBanBtn').onclick = () => sendAdminCommand('/deviceban', user);
                 
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

// Utility: Sends the full command to the server after modal action
function sendAdminCommand(command, targetUser) {
    const duration = document.getElementById('banDuration')?.value;
    let fullCommand = command + ' ' + targetUser;
    
    if (command !== '/kick') {
        if (!duration || isNaN(parseInt(duration)) || parseInt(duration) < 1) {
             alert("Ban duration must be 1 second or greater.");
             return;
        }
        fullCommand += ' ' + duration;
    }
    
    // Emit the command via the normal chat message path
    messageInputDiv.innerText = fullCommand;
    messageForm.dispatchEvent(new Event('submit'));
    kickConfirmModal.hide();
    userToKick = null;
}

// --- Login Handlers ---

// Shared function to handle successful login
function handleSuccessfulLogin(data) {
    // CRITICAL FIX: Ensure isAdmin is correctly extracted and set
    displayName = data.displayName;
    const isAdminStatus = data.isAdmin === true; 
    isAdmin = isAdminStatus; // Set the global variable

    displayNameEl.textContent = displayName;
    
    myModal.hide(); 
    container.style.display = 'flex'; 

    console.log(`[CLIENT DEBUG] Login successful. Is Admin: ${isAdmin}`);

    if (isAdmin) {
        adminPanelBtn.style.display = 'block';
    } else {
        adminPanelBtn.style.display = 'none';
    }
}

// Function to bind ALL socket events (must be called after socket is created)
function bindSocketEvents() {
    // Login Success events
    socket.on('name_accepted', name => {
        nameErrorEl.textContent = ''; // Clear previous errors
        handleSuccessfulLogin({ displayName: name, isAdmin: false });
    });
    socket.on('staff_status_update', data => {
        nameErrorEl.textContent = ''; // Clear previous errors
        handleSuccessfulLogin(data);
    });

    // Login Errors 
    socket.on('staff_name_reserved_modal', msg => {
        socket.disconnect(); // Disconnect to allow client to try again
        nameErrorEl.textContent = msg;
        myModal.show();
    });
    socket.on('name_in_use_modal', msg => {
        socket.disconnect(); // Disconnect to allow client to try again
        nameErrorEl.textContent = msg;
        myModal.show();
    });
    
    // Middleware error (for ban checks)
    socket.on('connect_error', (err) => {
        if (err.message.includes('banned')) {
            nameErrorEl.textContent = `CONNECTION DENIED: ${err.message}`;
        } else {
             nameErrorEl.textContent = `Connection Error: ${err.message}`;
        }
        // Keep modal visible to show the ban message
        myModal.show();
    });

    // Chat Events 
    socket.on('chat history', history => {
        messagesDiv.innerHTML = ''; 
        history.forEach(msg => appendMessage(msg));
    });
    socket.on('chat message', msg => appendMessage(msg));
    socket.on('private message', msg => appendMessage(msg));

    // Admin/System Events 
    socket.on('admin:history_cleared', msg => {
        messagesDiv.innerHTML = ''; 
        appendMessage(msg);
    });
    socket.on('system_error', msg => appendMessage({ username: 'System', content: `ERROR: ${msg}`, timestamp: new Date() }));
    socket.on('system_alert', msg => appendMessage({ username: 'System', content: msg, timestamp: new Date() }));

    // User List Update
    socket.on('user count', data => updateUsers(data.userList));
    
    // User was banned/kicked and disconnected
    socket.on('disconnect', (reason) => {
        if (reason === 'transport close') {
             // Normal disconnection or kick. Do nothing, just wait for reconnect (handled by middleware if banned)
        } else {
            // For example, if the server explicitly sends a reason
            console.log(`Disconnected, reason: ${reason}`);
        }
    });
}

// --- Event Listeners ---

// 1. Handle Login Form Submission
nameForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    
    // 1. Get Device Fingerprint
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const deviceFingerprint = result.visitorId; 
    console.log(`[CLIENT DEBUG] Device Fingerprint: ${deviceFingerprint}`);

    // 2. Initialize or re-initialize the socket with the required parameters
    if (socket) {
        socket.disconnect(); // Disconnect old socket if it exists
    }
    
    // Connect the socket, passing both the name and the fingerprint via query parameters
    socket = io({
        query: {
            name: name,
            fingerprint: deviceFingerprint // Pass the unique device ID
        }
    });
    
    // Bind all socket event listeners
    bindSocketEvents(); 

    // 3. Emit the staff check (login attempt)
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
            appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date().getTime() });
        }
    } 
    else if (content.toLowerCase() === '/clear') {
        if (isAdmin) {
             clearConfirmModal.show();
        } else {
            appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date().getTime() });
        }
    } else if (content.startsWith('/kick ') || content.startsWith('/ban ') || content.startsWith('/deviceban ')) {
        // Allow command execution if admin, otherwise block it on the client side with a message
        if (isAdmin) {
            // Let the command go through to the server to be processed
            socket.emit('chat message', { username: displayName, content });
        } else {
            appendMessage({ username: 'System', content: 'You do not have permission to use moderation commands.', timestamp: new Date().getTime() });
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
    
    const adminModal = bootstrap.Modal.getInstance(adminModalEl);
    if (adminModal) adminModal.hide();
});

// 5. Clear History Confirmation Click 
clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:clear_history', { username: displayName });
    }
    clearConfirmModal.hide(); 
});
