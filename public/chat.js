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
const typingIndicator = document.getElementById('typing-indicator'); // New indicator element

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
const adminModalHeader = document.getElementById('admin-modal-header'); // New header for X button
const closeButton = adminModalHeader ? adminModalHeader.querySelector('.close-button') : null; // Close button inside the new header

// Banned Modal Elements
const bannedModal = document.getElementById('banned-modal');
const banReason = document.getElementById('ban-reason');
const banTimer = document.getElementById('ban-timer');

// State Variables
let currentUsername = 'Guest';
let isAdmin = false;
let currentChatContext = 'public'; // 'public' or 'admin_chat'
let currentAdminUserMap = {}; // Map of socketId -> { displayName, ip, isAdmin, ... }
let typingTimeout = null;

// --- FPID AND CONNECTION SETUP ---
let fingerprintId = 'no_fingerprint_id';

if (window.Fingerprint2) {
    Fingerprint2.get((components) => {
        const values = components.map(component => component.value);
        fingerprintId = Fingerprint2.x64hash128(values.join(''), 31);
        socket.emit('client:send_fingerprint_id', fingerprintId);
    });
} else {
    socket.emit('client:send_fingerprint_id', fingerprintId);
}

// --- EVENT LISTENERS ---

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

        // Clear typing indicator on send
        socket.emit('typing', false); 
        
        if (content.startsWith('/msg ')) {
            // Updated PM parsing to support names with spaces in quotes
            const parts = content.match(/^\/msg\s+("([^"]+)"|([^\s]+))\s+(.*)$/);

            if (parts && parts.length >= 5) {
                const recipient = parts[2] || parts[3]; // The name (quoted or unquoted)
                const privateContent = parts[4]; 
                
                socket.emit('private message', { recipient: recipient, content: privateContent });
            } else {
                 appendMessage({ username: 'System', content: 'Usage: /msg "User Name" Content OR /msg SingleName Content', type: 'system' });
            }

        } else if (content === '/anon') {
            if (isAdmin) {
                 socket.emit('admin:go_anonymous');
            } else {
                 appendMessage({ username: 'System', content: 'Command not recognized or access denied.', type: 'system' });
            }
        } else {
            socket.emit('chat message', { content: content, context: currentChatContext });
        }

        messageInput.value = '';
    });
}

// 3. TYPING INDICATOR SEND
if (messageInput) {
    messageInput.addEventListener('input', () => {
        const content = messageInput.value.trim();
        
        // If not typing, send typing=true
        if (content.length > 0 && typingTimeout === null) {
            socket.emit('typing', true);
        }
        
        // Reset timeout to send typing=false after delay
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', false);
            typingTimeout = null;
        }, 2000);
    });
}

// 4. RENAME BUTTONS
if (renameButtonGuest) {
    renameButtonGuest.addEventListener('click', () => {
        const newName = prompt("Enter a new username (max 16 chars):");
        if (newName && newName.trim().length > 0) {
            socket.emit('name_change', newName.trim());
        }
    });
}


// 5. ADMIN PANEL BUTTON AND CLOSE BUTTON
if (adminPanelButton) {
    adminPanelButton.addEventListener('click', () => {
        if (isAdmin) {
            openAdminPanel();
        }
    });
}

// Fix: Close button listener attached directly to the actual button element
if (closeButton) {
    closeButton.addEventListener('click', () => {
        adminPanelModal.style.display = 'none';
    });
}

// 6. STAFF CONTEXT TABS
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

// 7. Sidebar Name Click (Updated to use quotes)
if (onlineUsersList) {
    onlineUsersList.addEventListener('click', (e) => {
        const targetLi = e.target.closest('li');
        if (targetLi) {
            const rawName = targetLi.textContent.split('(')[0].trim(); 
            // Put name in quotes to support spaces
            messageInput.value = `/msg "${rawName}" `;
            messageInput.focus();
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
    
    // Set class for alignment and bubble color
    if (msg.type === 'user' || msg.type === 'private') {
        if (msg.isSelf) {
            li.classList.add('message-self');
        } else {
            li.classList.add('message-other');
        }
    }
    
    // Style based on message type
    if (msg.type === 'system') {
        li.classList.add('system-message');
        messageText = `${msg.content}`;
    } else {
        const isSelf = msg.isSelf;
        let nameClass = msg.isAdmin ? 'admin-message' : '';
        
        if (msg.type === 'private') {
            li.classList.add('private-message');
            const senderName = isSelf ? 'You' : msg.username;
            const recipientText = msg.recipient ? ` to ${msg.recipient}` : '';
            messageText = `(${date}) (PM${recipientText}) <span class="${nameClass}">${senderName}</span>: ${msg.content}`;
        } else {
            messageText = `(${date}) <span class="${nameClass}">${msg.username}</span>: ${msg.content}`;
        }
    }
    
    li.innerHTML = messageText;
    messagesList.appendChild(li);

    if (!isHistory) {
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

function updateCommands() {
    if (!commandsList) return;
    commandsList.innerHTML = '';
    let commands = [
        { name: '/msg "User Name" [content]', desc: 'Send a private message. (Quotes required for spaces)' }
    ];
    
    if (isAdmin) {
        commands.push(
            { name: '/anon', desc: 'Log out of Admin Mode (become a Guest).' }
        );
    }
    
    commands.forEach(cmd => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${cmd.name}</strong> - ${cmd.desc}`;
        commandsList.appendChild(li);
    });
}

function openAdminPanel() {
    if (!adminPanelModal || !adminContentArea || !currentAdminUserMap) return;

    adminPanelModal.style.display = 'flex';
    adminContentArea.innerHTML = '';
    
    // Admin Panel Layout: Two columns with a vertical divider (Swapped for Right-Side Management)
    const adminPanelGrid = document.createElement('div');
    adminPanelGrid.classList.add('admin-panel-grid'); // Use class for CSS styling
    adminContentArea.appendChild(adminPanelGrid);

    // --- LEFT COLUMN: HISTORY CLEARING ---
    const clearSection = document.createElement('div');
    clearSection.innerHTML = `
        <h3>Clear Chat History:</h3>
        <button id="clear-public-btn" style="background-color:#58a6ff; color:white; border:none; padding:8px 15px; margin-right:10px; border-radius:6px; cursor:pointer;">Clear Public Chat</button>
        <button id="clear-admin-btn" style="background-color:#f7931e; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Clear Admin Chat</button>
    `;
    adminPanelGrid.appendChild(clearSection); 

    // --- CENTER COLUMN: VERTICAL DIVIDER ---
    const divider = document.createElement('div');
    divider.classList.add('vertical-divider');
    adminPanelGrid.appendChild(divider);

    // --- RIGHT COLUMN: USER MANAGEMENT (KICK/BAN) ---
    const userManagementArea = document.createElement('div');
    userManagementArea.innerHTML = '<h3>Manage Connected Users:</h3>';
    
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
                <button class="action-kick" data-user="${user.displayName}">Kick</button>
                <button class="action-ban" data-user="${user.displayName}">Ban (FPID)</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    userManagementArea.appendChild(table);
    adminPanelGrid.appendChild(userManagementArea); 
    
    // ----------------------------------------------------------------
    // CRITICAL: ATTACH LISTENERS TO DYNAMICALLY CREATED BUTTONS
    // ----------------------------------------------------------------
    
    // History Clearing listeners
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

    // Kick button listeners
    userManagementArea.querySelectorAll('.action-kick').forEach(button => {
        button.addEventListener('click', (e) => {
            const targetName = e.target.dataset.user;
            if (confirm(`Are you sure you want to KICK ${targetName}?`)) {
                socket.emit('admin:kick_user', { targetName });
                adminPanelModal.style.display = 'none';
            }
        });
    });
    
    // Ban button listeners
    userManagementArea.querySelectorAll('.action-ban').forEach(button => {
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

// 1. Typing Status Update
socket.on('typing_status', (typingNames) => {
    if (!typingIndicator) return;
    
    const isTyping = typingNames.some(name => name !== currentUsername);
    
    if (isTyping) {
        const othersTyping = typingNames.filter(name => name !== currentUsername);
        
        if (othersTyping.length === 1) {
            typingIndicator.textContent = `${othersTyping[0]} is typing...`;
        } else if (othersTyping.length === 2) {
            typingIndicator.textContent = `${othersTyping[0]} and ${othersTyping[1]} are typing...`;
        } else if (othersTyping.length >= 3) {
            typingIndicator.textContent = 'Several people typing...';
        } else {
            typingIndicator.textContent = '';
        }
    } else {
        typingIndicator.textContent = '';
    }
});


// 2. Successful Regular Login
socket.on('name_accepted', (name) => {
    currentUsername = name;
    displayUsername.textContent = name;
    nameModal.style.display = 'none';
    chatContainer.style.display = 'grid';
    if (staffControls) staffControls.style.display = 'none'; 
    if (guestControls) guestControls.style.display = 'block';
    if (publicTab) publicTab.style.display = 'none'; 
    updateCommands();
});

// 3. Successful Staff Login/Status Update
socket.on('staff_status_update', (data) => {
    currentUsername = data.displayName;
    isAdmin = data.isAdmin;
    currentChatContext = data.currentContext;

    displayUsername.textContent = `${currentUsername} (MOD)`;
    nameModal.style.display = 'none';
    chatContainer.style.display = 'grid';
    
    // Show staff elements
    if (staffControls) staffControls.style.display = 'flex';
    if (guestControls) guestControls.style.display = 'none';
    if (adminPanelButton) adminPanelButton.style.display = 'block';
    if (publicTab) publicTab.style.display = 'block'; 
    
    updateCommands();
});

// 4. Message Received (Updated to include isSelf flag for bubble styling)
socket.on('chat message', (msg) => {
    msg.isSelf = msg.username === currentUsername || msg.username === 'You';
    if (currentChatContext === 'public' || msg.type === 'private') {
        appendMessage(msg);
    }
});

// 5. Admin chat message
socket.on('admin chat message', (msg) => {
    msg.isSelf = msg.username === currentUsername || msg.username === 'You';
    if (currentChatContext === 'admin_chat') {
        appendMessage(msg);
    }
});

// 6. Chat History Load (Updated to include isSelf flag)
socket.on('chat history', (history) => {
    messagesList.innerHTML = '';
    history.forEach(msg => {
        msg.isSelf = msg.username === currentUsername || msg.username === 'You';
        appendMessage(msg, true);
    });
    messagesList.scrollTop = messagesList.scrollHeight;
});

// --- Other handlers remain the same for functionality ---
socket.on('name_rejected', (message) => {
    nameErrorMessage.textContent = message;
    nameInput.value = '';
});

socket.on('name_updated_ui', (newName) => {
    currentUsername = newName;
    displayUsername.textContent = newName;
    if (isAdmin) {
         displayUsername.textContent = `${newName} (MOD)`;
    }
});

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

socket.on('admin_user_map', (adminUsersMap) => {
    currentAdminUserMap = adminUsersMap;
});

socket.on('admin:history_cleared', (data) => {
    if (data.targetChatId === currentChatContext) {
        messagesList.innerHTML = '';
        appendMessage(data.clearMsg);
    }
});

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
        }
        
        const seconds = Math.floor((timeRemaining / 1000) % 60);
        const minutes = Math.floor((timeRemaining / (1000 * 60)) % 60);
        const hours = Math.floor((timeRemaining / (1000 * 60 * 60)) % 24);
        const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));

        const display = `${days > 0 ? days + 'd ' : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        banTimer.textContent = display;
        
    }, 1000);
});

socket.on('system_alert', (message) => {
    appendMessage({ username: 'System', content: message, type: 'system' });
});

socket.on('system_error', (message) => {
    alert(`Error: ${message}`);
});
