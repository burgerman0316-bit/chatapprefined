// --- INITIAL SETUP AND SOCKET CONNECTION ---
const socket = io();

// DOM Elements
const nameModal = document.getElementById('name-modal');
const nameInput = document.getElementById('name-input');
const joinChatButton = document.getElementById('join-chat-button');
const nameErrorMessage = document.getElementById('name-error-message');
const chatContainer = document.getElementById('chat-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages');
const displayUsername = document.getElementById('display-username');
const onlineUsersList = document.getElementById('online-users-list');
const usersOnlineCount = document.getElementById('users-online-count');
const chatHeader = document.getElementById('chat-header');

// Staff Elements
const staffControls = document.getElementById('staff-controls');
const guestControls = document.getElementById('guest-controls');
const publicTab = document.getElementById('public-tab');
const adminTab = document.getElementById('admin-tab');
const commandsList = document.getElementById('commands-list');
const adminPanelButton = document.getElementById('admin-panel-button');
const renameButtonGuest = document.getElementById('rename-button-guest');

// Admin Panel Modal Elements
const adminPanelModal = document.getElementById('admin-panel-modal');
const adminContentArea = document.getElementById('admin-content-area');
const closeButton = adminPanelModal ? adminPanelModal.querySelector('.close-button') : null; // Safe selector

// Banned Modal Elements
const bannedModal = document.getElementById('banned-modal');
const banReason = document.getElementById('ban-reason');
const banTimer = document.getElementById('ban-timer');

// State Variables
let currentUsername = 'Guest';
let isAdmin = false;
let currentChatContext = 'public'; // 'public' or 'admin_chat'
let currentAdminUserMap = {}; // Map of socketId -> { displayName, ip, isAdmin, ... }

// --- FPID AND CONNECTION SETUP ---
let fingerprintId = 'no_fingerprint_id';

// Generate Fingerprint ID (Used for ban persistence)
if (window.Fingerprint2) {
    Fingerprint2.get((components) => {
        const values = components.map(component => component.value);
        fingerprintId = Fingerprint2.x64hash128(values.join(''), 31);
        socket.emit('client:send_fingerprint_id', fingerprintId);
    });
} else {
    socket.emit('client:send_fingerprint_id', fingerprintId);
}

// --- EVENT LISTENERS (CRITICAL FOR LOGIN) ---

// 1. JOIN CHAT BUTTON CLICK HANDLER
if (joinChatButton) {
    joinChatButton.addEventListener('click', () => {
        const loginAttempt = nameInput.value.trim();
        nameErrorMessage.textContent = '';
        
        if (loginAttempt.length === 0) {
            nameErrorMessage.textContent = 'Please enter a name or staff key.';
            return;
        }
        
        socket.emit('check_staff_status', loginAttempt);
    });
}


// 2. MESSAGE FORM SUBMISSION
if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();

        if (!content) return;

        if (content.startsWith('/msg ')) {
            // Handle Private Message
            const parts = content.split(' ');
            if (parts.length < 3) {
                appendMessage({ username: 'System', content: 'Usage: /msg [user] [content]', type: 'system' });
                messageInput.value = '';
                return;
            }
            const recipient = parts[1];
            const privateContent = parts.slice(2).join(' ');
            
            socket.emit('private message', { recipient: recipient, content: privateContent });

        } else if (content === '/anon') {
            // Handle Anonymous Login (Staff only)
            if (isAdmin) {
                 socket.emit('admin:go_anonymous');
            } else {
                 appendMessage({ username: 'System', content: 'Command not recognized or access denied.', type: 'system' });
            }
        } else {
            // Regular chat message
            socket.emit('chat message', { content: content, context: currentChatContext });
        }

        messageInput.value = '';
    });
}


// 3. RENAME BUTTONS
if (renameButtonGuest) {
    renameButtonGuest.addEventListener('click', () => {
        const newName = prompt("Enter a new username (max 16 chars):");
        if (newName && newName.trim().length > 0) {
            socket.emit('name_change', newName.trim());
        }
    });
}


// 4. ADMIN PANEL BUTTON AND CLOSE BUTTON
if (adminPanelButton) {
    adminPanelButton.addEventListener('click', () => {
        if (isAdmin) {
            openAdminPanel();
        }
    });
}

if (closeButton) {
    closeButton.addEventListener('click', () => {
        adminPanelModal.style.display = 'none';
    });
}

// 5. STAFF CONTEXT TABS
if (publicTab && adminTab) {
    publicTab.addEventListener('click', () => {
        if (currentChatContext !== 'public') {
            switchChatContext('public');
        }
    });

    adminTab.addEventListener('click', () => {
        if (currentChatContext !== 'admin_chat' && isAdmin) {
            switchChatContext('admin_chat');
        }
    });
}

// --- HELPER UI FUNCTIONS ---

function switchChatContext(context) {
    currentChatContext = context;
    if (publicTab) publicTab.classList.remove('active');
    if (adminTab) adminTab.classList.remove('active');
    messagesList.innerHTML = ''; 

    if (context === 'public') {
        if (publicTab) publicTab.classList.add('active');
        chatHeader.textContent = 'Public Chat';
        socket.emit('admin:set_context', 'public');
    } else if (context === 'admin_chat' && isAdmin) {
        if (adminTab) adminTab.classList.add('active');
        chatHeader.textContent = 'Admin Chat (Moderators Only)';
        socket.emit('admin:set_context', 'admin_chat');
    }
}

function appendMessage(msg, isHistory = false) {
    const li = document.createElement('li');
    let messageText = '';
    const date = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Style based on message type
    if (msg.type === 'system') {
        li.classList.add('system-message');
        messageText = `[${date}] ${msg.content}`;
    } else {
        // Regular, Admin, or Private message
        const isSelf = msg.username === currentUsername;
        let nameClass = msg.isAdmin ? 'admin-message' : '';
        
        if (msg.type === 'private') {
            li.classList.add('private-message');
            // Check if it's a message sent by "You" or received by the user
            const recipientText = msg.recipient ? ` to ${msg.recipient}` : '';
            messageText = `[${date}] (PM${recipientText}) <span class="${nameClass}">${msg.username}</span>: ${msg.content}`;
        } else {
            messageText = `[${date}] <span class="${nameClass}">${msg.username}</span>: ${msg.content}`;
        }
    }
    
    li.innerHTML = messageText;
    messagesList.appendChild(li);

    // Scroll to bottom only if it's not loading history
    if (!isHistory) {
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

function updateCommands() {
    if (!commandsList) return;
    commandsList.innerHTML = '';
    let commands = [
        { name: '/msg [user] [content]', desc: 'Send a private message.' }
    ];
    
    if (isAdmin) {
        commands.push(
            { name: '/anon', desc: 'Log out of Admin Mode.' }
        );
    }
    
    commands.forEach(cmd => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${cmd.name}</strong>`;
        commandsList.appendChild(li);
    });
}

function openAdminPanel() {
    if (!adminPanelModal || !adminContentArea || !currentAdminUserMap) return;

    adminPanelModal.style.display = 'flex';
    adminContentArea.innerHTML = '';
    
    // Build User Management Section
    const userList = document.createElement('div');
    userList.innerHTML = '<h3>Manage Connected Users:</h3>';
    
    const table = document.createElement('table');
    table.style.width = '100%';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
                <th>IP</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    // Populate user table with actions (Kick/Ban)
    Object.entries(currentAdminUserMap).forEach(([socketId, user]) => {
        if (user.displayName === currentUsername) return; // Skip self

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.displayName} ${user.isAdmin ? '(MOD)' : ''}</td>
            <td>${user.ip}</td>
            <td>
                <button class="action-kick" data-user="${user.displayName}" style="background-color:#d44; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Kick</button>
                <button class="action-ban" data-user="${user.displayName}" style="background-color:#f7931e; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; margin-left:5px;">Ban (FPID)</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    userList.appendChild(table);

    // Add History Clearing Section
    const clearSection = document.createElement('div');
    clearSection.style.marginTop = '20px';
    clearSection.innerHTML = `
        <h3>Clear Chat History:</h3>
        <button id="clear-public-btn" style="background-color:#58a6ff; color:white; border:none; padding:8px 15px; margin-right:10px; border-radius:6px; cursor:pointer;">Clear Public Chat</button>
        <button id="clear-admin-btn" style="background-color:#f7931e; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Clear Admin Chat</button>
    `;

    adminContentArea.appendChild(userList);
    adminContentArea.appendChild(clearSection);
    
    // ----------------------------------------------------------------
    // CRITICAL: ATTACH LISTENERS TO DYNAMICALLY CREATED BUTTONS
    // ----------------------------------------------------------------
    
    // Add event listeners for History Clearing buttons
    document.getElementById('clear-public-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the PUBLIC chat history?')) {
            socket.emit('admin:clear_history', 'public');
            adminPanelModal.style.display = 'none';
        }
    });
    
    document.getElementById('clear-admin-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the ADMIN chat history?')) {
            socket.emit('admin:clear_history', 'admin_chat');
            adminPanelModal.style.display = 'none';
        }
    });

    // Add event listeners for Kick buttons
    adminContentArea.querySelectorAll('.action-kick').forEach(button => {
        button.addEventListener('click', (e) => {
            const targetName = e.target.dataset.user;
            if (confirm(`Are you sure you want to KICK ${targetName}?`)) {
                socket.emit('admin:kick_user', { targetName });
                adminPanelModal.style.display = 'none';
            }
        });
    });
    
    // Add event listeners for Ban buttons
    adminContentArea.querySelectorAll('.action-ban').forEach(button => {
        button.addEventListener('click', (e) => {
            const targetName = e.target.dataset.user;
            const days = parseInt(prompt(`Ban ${targetName} for how many days? (0 for temporary)`)) || 0;
            const hours = parseInt(prompt(`Ban ${targetName} for how many hours?`)) || 0;
            const minutes = parseInt(prompt(`Ban ${targetName} for how many minutes?`)) || 0;
            const reason = prompt(`Reason for banning ${targetName}?`) || "No reason specified";

            if (days >= 0 && hours >= 0 && minutes >= 0 && (days + hours + minutes > 0)) {
                socket.emit('admin:ip_ban_user', { targetName, days, hours, minutes, reason });
                adminPanelModal.style.display = 'none';
            } else {
                alert('Ban cancelled or invalid duration specified.');
            }
        });
    });
}


// --- SOCKET.IO HANDLERS ---

// 1. Successful Regular Login
socket.on('name_accepted', (name) => {
    currentUsername = name;
    displayUsername.textContent = name;
    nameModal.style.display = 'none';
    chatContainer.style.display = 'flex';
    if (staffControls) staffControls.style.display = 'none'; 
    if (guestControls) guestControls.style.display = 'block';
    updateCommands();
});

// 2. Successful Staff Login/Status Update
socket.on('staff_status_update', (data) => {
    currentUsername = data.displayName;
    isAdmin = data.isAdmin;
    currentChatContext = data.currentContext;

    displayUsername.textContent = `${currentUsername} (MOD)`;
    nameModal.style.display = 'none';
    chatContainer.style.display = 'flex';
    
    // Show staff elements
    if (staffControls) staffControls.style.display = 'flex';
    if (guestControls) guestControls.style.display = 'none';
    if (adminPanelButton) adminPanelButton.style.display = 'block';
    
    updateCommands();
});

// 3. Name Rejected by Server (Name Conflict)
socket.on('name_rejected', (message) => {
    nameErrorMessage.textContent = message;
    nameInput.value = '';
});

// 4. Name Change Success
socket.on('name_updated_ui', (newName) => {
    currentUsername = newName;
    displayUsername.textContent = newName;
    if (isAdmin) {
         displayUsername.textContent = `${newName} (MOD)`;
    }
});

// 5. Incoming Chat Message
socket.on('chat message', (msg) => {
    if (currentChatContext === 'public') {
        appendMessage(msg);
    }
});

// 6. Incoming Admin Chat Message
socket.on('admin chat message', (msg) => {
    if (currentChatContext === 'admin_chat') {
        appendMessage(msg);
    }
});

// 7. Initial Chat History Load
socket.on('chat history', (history) => {
    messagesList.innerHTML = '';
    history.forEach(msg => appendMessage(msg, true));
    messagesList.scrollTop = messagesList.scrollHeight;
});

// 8. User Count/List Update
socket.on('user count', (data) => {
    usersOnlineCount.textContent = `Users Online: ${data.userList.length}`;
    onlineUsersList.innerHTML = '';
    
    data.userList.forEach(name => {
        const li = document.createElement('li');
        let nameHtml = name;
        if (data.usersMap[name] && data.usersMap[name].isAdmin) {
            nameHtml = `${name} <span class="mod-tag">(MOD)</span>`;
        }
        li.innerHTML = nameHtml;
        onlineUsersList.appendChild(li);
    });
});

// 9. Admin User Map Update (for Admin Panel)
socket.on('admin_user_map', (adminUsersMap) => {
    currentAdminUserMap = adminUsersMap;
});

// 10. Admin History Cleared
socket.on('admin:history_cleared', (data) => {
    if (data.targetChatId === currentChatContext) {
        messagesList.innerHTML = '';
        appendMessage(data.clearMsg);
    }
});

// 11. Banned Modal Display
socket.on('banned_modal', (data) => {
    if (chatContainer) chatContainer.style.display = 'none';
    if (nameModal) nameModal.style.display = 'none';
    if (bannedModal) bannedModal.style.display = 'flex';
    
    banReason.textContent = data.reason;
    
    let timeRemaining = data.banDurationMs;
    const interval = setInterval(() => {
        timeRemaining -= 1000;
        
        if (timeRemaining <= 0) {
            clearInterval(interval);
            banTimer.textContent = '00:00:00';
            // You might want to automatically refresh the page here
        }
        
        const seconds = Math.floor((timeRemaining / 1000) % 60);
        const minutes = Math.floor((timeRemaining / (1000 * 60)) % 60);
        const hours = Math.floor((timeRemaining / (1000 * 60 * 60)) % 24);
        const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));

        const display = `${days > 0 ? days + 'd ' : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        banTimer.textContent = display;
        
    }, 1000);
});

// 12. General System Alerts/Errors
socket.on('system_alert', (message) => {
    appendMessage({ username: 'System', content: message, type: 'system' });
});

socket.on('system_error', (message) => {
    alert(`Error: ${message}`);
});
