// ===============================================
// public/client.js
// This script handles all front-end chat logic, 
// including Socket.IO communication and UI updates.
// ===============================================

const socket = io();

// --- STATE VARIABLES ---
let myDisplayName = '';
let isStaff = false;
let currentContext = 'public';
let typingUsers = [];

// --- DOM ELEMENTS ---
const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('m');
const loginForm = document.getElementById('login-form');
const nameInput = document.getElementById('name-input');
const statusMessage = document.getElementById('status-message');
const userListElement = document.getElementById('user-list');
const typingIndicator = document.getElementById('typing-indicator');
const adminPanel = document.getElementById('admin-panel');
const chatContainer = document.getElementById('chat-container');


// ===============================================
// CORE UI FUNCTIONS
// ===============================================

/**
 * Appends a message object to the chat window.
 */
function appendMessage(msg) {
    const item = document.createElement('li');
    let messageClass = '';
    let contentHtml = msg.content;
    let usernameDisplay = msg.username;

    // Determine message style/class
    if (msg.type === 'system') {
        messageClass = 'system-message';
    } else if (msg.type === 'private') {
        messageClass = msg.isSelf ? 'private-sent' : 'private-received';
        usernameDisplay = msg.isSelf ? `(PM to ${msg.recipient})` : `(PM from ${msg.username})`;
    } else if (msg.username === myDisplayName) {
        messageClass = 'self-message';
    } else if (msg.isAdmin) {
        messageClass = 'admin-message';
    }

    // Apply bolding to the username
    let usernameHtml = msg.isAdmin ? `<strong>[STAFF] ${usernameDisplay}</strong>` : `<strong>${usernameDisplay}</strong>`;

    item.classList.add(messageClass);
    item.innerHTML = `
        <span class="timestamp">[${new Date(msg.timestamp).toLocaleTimeString()}]</span>
        <span class="username">${usernameHtml}:</span> 
        <span class="content">${contentHtml}</span>
    `;

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight; // Auto-scroll to the bottom
}

/**
 * Hides the login and shows the main chat UI.
 */
function showChatUI() {
    loginForm.style.display = 'none';
    chatContainer.style.display = 'flex'; // Use flex for layout
}

/**
 * Hides/shows the admin panel based on staff status.
 */
function updateAdminUI(isAdmin) {
    if (isAdmin) {
        adminPanel.style.display = 'block';
    } else {
        adminPanel.style.display = 'none';
    }
}


// ===============================================
// SOCKET.IO LISTENERS
// ===============================================

socket.on('connect', () => {
    // 1. Get or Generate Fingerprint ID (Placeholder for real implementation)
    let fpid = localStorage.getItem('chat_fpid');
    if (!fpid) {
        fpid = 'fp-' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('chat_fpid', fpid);
    }
    
    // 2. Send FPID to server for ban check
    socket.emit('client:send_fingerprint_id', fpid);
});

// --- Login/Status Events ---

socket.on('name_rejected', (msg) => {
    statusMessage.textContent = msg;
    statusMessage.style.color = 'red';
    nameInput.disabled = false;
});

socket.on('name_accepted', (displayName) => {
    myDisplayName = displayName;
    isStaff = false;
    currentContext = 'public';
    showChatUI();
    updateAdminUI(false);
    document.getElementById('context-display').textContent = `Chatting as: ${myDisplayName}`;
});

socket.on('staff_status_update', (data) => {
    myDisplayName = data.displayName;
    isStaff = true;
    currentContext = data.currentContext; // Should be 'admin_chat'
    showChatUI();
    updateAdminUI(true);
    document.getElementById('context-display').textContent = `Chatting as: [STAFF] ${myDisplayName}`;
});

socket.on('banned_modal', (data) => {
    alert(`You have been banned.\nReason: ${data.reason}\nDuration: ${Math.ceil(data.banDurationMs / (1000 * 60))} minutes.`);
    socket.disconnect();
});

socket.on('name_updated_ui', (newName) => {
    myDisplayName = newName;
    document.getElementById('context-display').textContent = isStaff ? `Chatting as: [STAFF] ${myDisplayName}` : `Chatting as: ${myDisplayName}`;
});


// --- Chat/System Events ---

socket.on('chat history', (history) => {
    messages.innerHTML = '';
    history.forEach(appendMessage);
});

socket.on('chat message', appendMessage);

socket.on('system_alert', (msg) => {
    alert(msg);
});

socket.on('system_error', (msg) => {
    alert(`Error: ${msg}`);
});

socket.on('user count', (data) => {
    userListElement.innerHTML = '';
    data.userList.forEach(name => {
        const li = document.createElement('li');
        const userStatus = data.usersMap[name].isAdmin ? '[STAFF]' : '';
        li.textContent = `${userStatus} ${name}`;
        userListElement.appendChild(li);
    });
});

socket.on('typing_status', (users) => {
    typingUsers = users.filter(name => name !== myDisplayName);
    if (typingUsers.length > 0) {
        typingIndicator.textContent = `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`;
    } else {
        typingIndicator.textContent = '';
    }
});


// --- ADMIN SPECIFIC LISTENERS ---

socket.on('admin_user_map', (adminUserMap) => {
    // This function draws the list of users and their control buttons
    updateAdminUserList(adminUserMap);
});

socket.on('admin:history_cleared', (data) => {
    // Clear local messages and append the system message about the clear
    if (data.targetChatId === currentContext) {
        messages.innerHTML = '';
        appendMessage(data.clearMsg); 
    }
});

// ===============================================
// UI ACTION HANDLERS
// ===============================================

// --- 1. Login Form Handler ---
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const loginAttempt = nameInput.value.trim();
    if (loginAttempt) {
        nameInput.disabled = true;
        socket.emit('check_staff_status', loginAttempt);
    }
});

// --- 2. Chat Form Handler ---
form.addEventListener('submit', function(e) {
    e.preventDefault();
    const content = input.value.trim();
    if (content) {
        // Check for private message format
        const pmMatch = content.match(/^\/pm\s+(\w+)\s+(.+)$/i);
        
        if (pmMatch) {
            // Private Message
            const recipient = pmMatch[1];
            const pmContent = pmMatch[2];
            socket.emit('private message', { recipient, content: pmContent });
        } else if (content === '/name' || content.startsWith('/name ')) {
            // Name Change command
            const newName = content.replace('/name', '').trim();
            if (newName) {
                socket.emit('name_change', newName);
            } else {
                alert('Usage: /name <new_name>');
            }
        } else {
            // Regular Chat Message
            socket.emit('chat message', { content: content, context: currentContext });
        }
        
        // Clear input and stop typing indicator
        input.value = '';
        socket.emit('typing', false);
    }
});

// --- 3. Typing Indicator Handler ---
let typingTimeout = null;
input.addEventListener('input', () => {
    if (input.value.length > 0) {
        socket.emit('typing', true);
        clearTimeout(typingTimeout);
        // Stop typing after 3 seconds of no input
        typingTimeout = setTimeout(() => {
            socket.emit('typing', false);
        }, 3000);
    } else {
        socket.emit('typing', false);
        clearTimeout(typingTimeout);
    }
});

// --- 4. ADMIN PANEL FUNCTIONS ---

let adminUserMap = {}; // Global variable to store the latest admin user map

/**
 * Populates the user list in the admin panel with Kick/Ban controls.
 */
function updateAdminUserList(newAdminUserMap) {
    adminUserMap = newAdminUserMap; 
    const adminUserList = document.getElementById('admin-user-list');
    if (!adminUserList || !isStaff) return; 

    adminUserList.innerHTML = ''; 

    for (const [socketId, user] of Object.entries(adminUserMap)) {
        const li = document.createElement('li');
        li.classList.add('admin-user-item');

        // Display user name and FPID (first few chars)
        const fpidDisplay = user.fpid ? ` (FPID: ${user.fpid.substring(0, 8)}...)` : '';
        li.innerHTML = `<strong>${user.displayName}</strong> ${user.isAdmin ? '(Staff)' : ''} ${fpidDisplay}`;
        
        // Skip adding controls for the admin user themselves
        if (user.displayName === myDisplayName) {
            li.classList.add('self-admin');
            adminUserList.appendChild(li);
            continue;
        }

        // --- Kick Button ---
        const kickBtn = document.createElement('button');
        kickBtn.textContent = 'Kick';
        kickBtn.classList.add('admin-action-btn', 'kick-btn');
        kickBtn.onclick = () => {
            if (confirm(`Are you sure you want to KICK ${user.displayName}?`)) {
                socket.emit('admin:kick_user', { targetName: user.displayName });
            }
        };
        li.appendChild(kickBtn);

        // --- Ban Button ---
        const banBtn = document.createElement('button');
        banBtn.textContent = 'Ban';
        banBtn.classList.add('admin-action-btn', 'ban-btn');
        banBtn.onclick = () => {
            // Simple prompt for ban details
            const banDurationDays = parseInt(prompt(`Ban ${user.displayName} for how many DAYS?`, 0) || 0);
            const banDurationHours = parseInt(prompt(`Ban ${user.displayName} for how many HOURS?`, 1) || 1);
            const banDurationMinutes = parseInt(prompt(`Ban ${user.displayName} for how many MINUTES?`, 0) || 0);
            const banReason = prompt(`Reason for banning ${user.displayName}:`, 'Violation of terms') || 'No reason provided';
            
            if (banReason) {
                socket.emit('admin:ip_ban_user', {
                    targetName: user.displayName,
                    days: banDurationDays,
                    hours: banDurationHours,
                    minutes: banDurationMinutes,
                    reason: banReason
                });
            }
        };
        li.appendChild(banBtn);

        adminUserList.appendChild(li);
    }
}

/**
 * Sets up click handlers for all static admin buttons (Clear History, Context Switch, Go Anon).
 */
function setupAdminButtonHandlers() {
    const clearPublicBtn = document.getElementById('clear-public-history-btn');
    const clearAdminBtn = document.getElementById('clear-admin-history-btn');
    const goAnonBtn = document.getElementById('admin-go-anon-btn');
    const switchPublicBtn = document.getElementById('switch-to-public-btn');
    const switchAdminBtn = document.getElementById('switch-to-admin-btn');
    
    // Clear History
    if (clearPublicBtn) clearPublicBtn.onclick = () => {
        if (confirm('Are you sure you want to clear the PUBLIC chat history?')) {
            socket.emit('admin:clear_history', 'public');
        }
    };
    if (clearAdminBtn) clearAdminBtn.onclick = () => {
        if (confirm('Are you sure you want to clear the ADMIN chat history?')) {
            socket.emit('admin:clear_history', 'admin_chat');
        }
    };

    // Go Anonymous
    if (goAnonBtn) goAnonBtn.onclick = () => {
        if (confirm('Are you sure you want to log out of staff mode and go anonymous?')) {
            socket.emit('admin:go_anonymous');
            // The server will send a staff_status_update or name_accepted event to update the UI
        }
    };

    // Context Switch (View Public/Admin Chat)
    if (switchPublicBtn) switchPublicBtn.onclick = () => {
        if (currentContext !== 'public' && isStaff) {
            currentContext = 'public';
            socket.emit('admin:set_context', 'public');
            switchPublicBtn.classList.add('active');
            switchAdminBtn.classList.remove('active');
            document.getElementById('messages').innerHTML = '<li>Loading public chat history...</li>';
        }
    };
    if (switchAdminBtn) switchAdminBtn.onclick = () => {
        if (currentContext !== 'admin_chat' && isStaff) {
            currentContext = 'admin_chat';
            socket.emit('admin:set_context', 'admin_chat');
            switchAdminBtn.classList.add('active');
            switchPublicBtn.classList.remove('active');
            document.getElementById('messages').innerHTML = '<li>Loading admin chat history...</li>';
        }
    };
}

// Ensure button handlers are set up after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', setupAdminButtonHandlers);
