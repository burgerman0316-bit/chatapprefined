// ===============================================
// public/client.js
// This script handles all front-end chat logic, 
// including Socket.IO communication and UI updates.
// ===============================================

// --- SOCKET CONNECTION ---
const socket = io();

// --- STATE VARIABLES ---
let myDisplayName = '';
let isStaff = false;
let currentContext = 'public';
let typingUsers = [];
let adminUserMap = {}; 

// --- DOM ELEMENTS ---
// Defined globally, assigned inside DOMContentLoaded.
let messages, form, mInput, loginForm, nameInput, statusMessage, userListElement;
let typingIndicator, adminPanel, chatContainer;
let clearPublicBtn, clearAdminBtn, goAnonBtn, switchPublicBtn, switchAdminBtn;
let contextDisplay;


// ===============================================
// CORE UI & HELPER FUNCTIONS
// ===============================================

/**
 * Gets a reference to all necessary DOM elements.
 * Uses 'm' for the chat input field, as per the HTML.
 */
function getDOMElements() {
    messages = document.getElementById('messages');
    form = document.getElementById('chat-form');
    mInput = document.getElementById('m'); // CRITICAL: Using 'm' here
    loginForm = document.getElementById('login-form');
    nameInput = document.getElementById('name-input');
    statusMessage = document.getElementById('status-message');
    userListElement = document.getElementById('user-list');
    typingIndicator = document.getElementById('typing-indicator');
    adminPanel = document.getElementById('admin-panel');
    chatContainer = document.getElementById('chat-container');
    contextDisplay = document.getElementById('context-display');

    // Admin buttons
    clearPublicBtn = document.getElementById('clear-public-history-btn');
    clearAdminBtn = document.getElementById('clear-admin-history-btn');
    goAnonBtn = document.getElementById('admin-go-anon-btn');
    switchPublicBtn = document.getElementById('switch-to-public-btn');
    switchAdminBtn = document.getElementById('switch-to-admin-btn');
}

/**
 * Appends a message object to the chat window.
 */
function appendMessage(msg) {
    if (!messages) return;
    const item = document.createElement('li');
    let messageClass = '';
    let usernameDisplay = msg.username;

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

    let usernameHtml = msg.isAdmin ? `<strong>[STAFF] ${usernameDisplay}</strong>` : `<strong>${usernameDisplay}</strong>`;

    item.classList.add(messageClass);
    item.innerHTML = `
        <span class="timestamp">[${new Date(msg.timestamp).toLocaleTimeString()}]</span>
        <span class="username">${usernameHtml}:</span> 
        <span class="content">${msg.content}</span>
    `;

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Hides the login and shows the main chat UI.
 */
function showChatUI() {
    if (loginForm && chatContainer) {
        loginForm.style.display = 'none';
        chatContainer.style.display = 'grid'; // Use 'grid' as defined in CSS
    }
}

/**
 * Hides/shows the admin panel and updates context display.
 */
function updateAdminUI(isAdmin) {
    if (adminPanel) {
        adminPanel.style.display = isAdmin ? 'block' : 'none';
    }
    if (contextDisplay) {
        contextDisplay.textContent = isAdmin 
            ? `Chatting as: [STAFF] ${myDisplayName}` 
            : `Chatting as: ${myDisplayName}`;
    }
}


// ===============================================
// SOCKET.IO LISTENERS
// ===============================================

function setupSocketListeners() {
    socket.on('connect', () => {
        let fpid = localStorage.getItem('chat_fpid');
        if (!fpid) {
            fpid = 'fp-' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('chat_fpid', fpid);
        }
        socket.emit('client:send_fingerprint_id', fpid);
    });

    // --- Login/Status Events ---
    socket.on('name_rejected', (msg) => {
        if (statusMessage) {
            statusMessage.textContent = msg;
            statusMessage.style.color = 'red';
        }
        if (nameInput) nameInput.disabled = false;
    });

    socket.on('name_accepted', (displayName) => {
        myDisplayName = displayName;
        isStaff = false;
        currentContext = 'public';
        showChatUI();
        updateAdminUI(false);
    });

    socket.on('staff_status_update', (data) => {
        myDisplayName = data.displayName;
        isStaff = true;
        currentContext = data.currentContext;
        showChatUI();
        updateAdminUI(true);
    });

    socket.on('banned_modal', (data) => {
        alert(`You have been banned.\nReason: ${data.reason}\nDuration: ${Math.ceil(data.banDurationMs / (1000 * 60))} minutes.`);
        socket.disconnect();
    });

    socket.on('name_updated_ui', (newName) => {
        myDisplayName = newName;
        updateAdminUI(isStaff); 
    });

    // --- Chat/System Events ---
    socket.on('chat history', (history) => {
        if (messages) messages.innerHTML = '';
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
        if (!userListElement) return;
        userListElement.innerHTML = '';
        data.userList.forEach(name => {
            const li = document.createElement('li');
            const userStatus = data.usersMap[name].isAdmin ? '[STAFF]' : '';
            li.textContent = `${userStatus} ${name}`;
            userListElement.appendChild(li);
        });
    });

    socket.on('typing_status', (users) => {
        if (!typingIndicator) return;
        typingUsers = users.filter(name => name !== myDisplayName);
        if (typingUsers.length > 0) {
            typingIndicator.textContent = `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`;
        } else {
            typingIndicator.textContent = '';
        }
    });

    // --- ADMIN SPECIFIC LISTENERS ---
    socket.on('admin_user_map', (newAdminUserMap) => {
        adminUserMap = newAdminUserMap;
        updateAdminUserList(adminUserMap);
    });

    socket.on('admin:history_cleared', (data) => {
        if (data.targetChatId === currentContext) {
            if (messages) messages.innerHTML = '';
            appendMessage(data.clearMsg); 
        }
    });
}


// ===============================================
// UI ACTION HANDLERS
// ===============================================

function setupInputHandlers() {
    // 1. Login Form Handler
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const loginAttempt = nameInput.value.trim();
            if (loginAttempt) {
                if (nameInput) nameInput.disabled = true;
                socket.emit('check_staff_status', loginAttempt);
            }
        });
    }

    // 2. Chat Form Handler
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const content = mInput.value.trim(); // Using mInput (id="m")
            if (content) {
                const pmMatch = content.match(/^\/pm\s+(\w+)\s+(.+)$/i);
                
                if (pmMatch) {
                    const recipient = pmMatch[1];
                    const pmContent = pmMatch[2];
                    socket.emit('private message', { recipient, content: pmContent });
                } else if (content === '/name' || content.startsWith('/name ')) {
                    const newName = content.replace('/name', '').trim();
                    if (newName) {
                        socket.emit('name_change', newName);
                    } else {
                        alert('Usage: /name <new_name>');
                    }
                } else {
                    socket.emit('chat message', { content: content, context: currentContext });
                }
                
                mInput.value = '';
                socket.emit('typing', false);
            }
        });
    }

    // 3. Typing Indicator Handler
    let typingTimeout = null;
    if (mInput) {
        mInput.addEventListener('input', () => {
            if (mInput.value.length > 0) {
                socket.emit('typing', true);
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    socket.emit('typing', false);
                }, 3000);
            } else {
                socket.emit('typing', false);
                clearTimeout(typingTimeout);
            }
        });
    }
}


// ===============================================
// ADMIN PANEL SPECIFIC FUNCTIONS
// ===============================================

/**
 * Populates the user list in the admin panel with Kick/Ban controls.
 */
function updateAdminUserList(adminUserMap) {
    const adminUserList = document.getElementById('admin-user-list');
    if (!adminUserList || !isStaff) return; 

    adminUserList.innerHTML = ''; 

    for (const [socketId, user] of Object.entries(adminUserMap)) {
        const li = document.createElement('li');
        li.classList.add('admin-user-item');

        const fpidDisplay = user.fpid ? ` (FPID: ${user.fpid.substring(0, 8)}...)` : '';
        li.innerHTML = `<strong>${user.displayName}</strong> ${user.isAdmin ? '(Staff)' : ''} ${fpidDisplay}`;
        
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
 * Sets up click handlers for all static admin buttons.
 */
function setupAdminButtonHandlers() {
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
        }
    };

    // Context Switch (View Public/Admin Chat)
    if (switchPublicBtn) switchPublicBtn.onclick = () => {
        if (currentContext !== 'public' && isStaff) {
            currentContext = 'public';
            socket.emit('admin:set_context', 'public');
            switchPublicBtn.classList.add('active');
            switchAdminBtn.classList.remove('active');
            if(messages) messages.innerHTML = '<li>Loading public chat history...</li>';
        }
    };
    if (switchAdminBtn) switchAdminBtn.onclick = () => {
        if (currentContext !== 'admin_chat' && isStaff) {
            currentContext = 'admin_chat';
            socket.emit('admin:set_context', 'admin_chat');
            switchAdminBtn.classList.add('active');
            switchPublicBtn.classList.remove('active');
            if(messages) messages.innerHTML = '<li>Loading admin chat history...</li>';
        }
    };
}


// ===============================================
// INITIALIZATION
// ===============================================

document.addEventListener('DOMContentLoaded', () => {
    getDOMElements(); 
    setupSocketListeners(); 
    setupInputHandlers(); 
    setupAdminButtonHandlers();
});
