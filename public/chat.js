// chat.js
// --- SOCKET.IO CONNECTION ---
const socket = io(); 

// --- CONSTANTS ---
const NORMAL_ROOM = 'normal_chat';
const ADMIN_ROOM = 'admin_chat';
const MAX_MESSAGE_LENGTH = 256;

// --- STATE ---
let user = {
    displayName: '',
    isAdmin: false,
    isAnon: false,
    currentRoom: NORMAL_ROOM
};

// --- Elements ---
const container = document.getElementById('container');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const charCounter = document.getElementById('char-counter');
const messages = document.getElementById('messages');
const displayNameSpan = document.getElementById('display-name');
const userCountSpan = document.getElementById('user-count');
const userList = document.getElementById('user-list');

// Sidebar Elements
const renameBtn = document.getElementById('renameBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');

// Modal Elements (Bootstrap)
const nameModal = new bootstrap.Modal(document.getElementById('nameModal'), { backdrop: 'static', keyboard: false });
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

const renameModalEl = document.getElementById('renameModal');
const renameModal = new bootstrap.Modal(renameModalEl);
const renameForm = document.getElementById('rename-form');
const newNameInput = document.getElementById('new-name-input');
const anonToggleContainer = document.getElementById('anon-toggle-container'); // Container for anon checkbox
const anonCheckbox = document.getElementById('anonCheckbox'); // New checkbox

const adminPanelModal = new bootstrap.Modal(document.getElementById('adminPanelModal'));
const adminChatBtn = document.getElementById('adminChatBtn'); // New button to switch to admin chat
const adminPanelTitle = document.getElementById('adminPanelTitle');

// Kick/Clear/Ban Modals
const adminUserList = document.getElementById('admin-user-list');
const kickConfirmModal = new bootstrap.Modal(document.getElementById('kickConfirmModal'));
const kickConfirmBody = document.getElementById('kickConfirmBody');
const kickConfirmBtn = document.getElementById('kickConfirmBtn');
const clearConfirmModal = new bootstrap.Modal(document.getElementById('clearConfirmModal'));
const clearConfirmBtn = document.getElementById('clearConfirmBtn');

const banConfirmModal = new bootstrap.Modal(document.getElementById('banConfirmModal'));
const banTargetNameSpan = document.getElementById('banTargetName');
const banDaysInput = document.getElementById('banDays');
const banHoursInput = document.getElementById('banHours');
const banMinutesInput = document.getElementById('banMinutes');
const banConfirmBtn = document.getElementById('banConfirmBtn');

let kickTargetDisplayName = ''; 
let banTargetDisplayName = '';

// =========================================================================
// 2. HELPER FUNCTIONS
// =========================================================================

function formatTimestamp(date) {
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function appendMessage(data) {
    if (data.room && data.room !== user.currentRoom) return; // Only show messages for the active room

    const isOwn = data.username === user.displayName || (data.isAdmin && data.username === 'Anonymous' && user.isAnon);
    const item = document.createElement('li');
    
    if (data.isSystem) {
        item.classList.add('msg', 'system');
    } else {
        item.classList.add('msg', isOwn ? 'own' : 'other');
        if (data.isAdmin) item.classList.add('admin');
        if (data.isAnon) item.classList.add('anon'); // Optional: Add visual style for anon
    }
    
    if (data.isPrivate) {
        const direction = data.sender === user.displayName ? 'to' : 'from';
        const target = data.sender === user.displayName ? data.recipient : data.sender;
        item.innerHTML = `<span class="sender-name">PM ${direction} ${target}</span><br>${data.content}`;
    } else if (!data.isSystem) {
        item.innerHTML = `<span class="sender-name">${data.username}</span><br>${data.content}`;
    } else {
        item.textContent = data.content;
    }

    if (!data.isSystem) {
        const time = document.createElement('span');
        time.classList.add('timestamp');
        time.textContent = formatTimestamp(data.timestamp);
        item.appendChild(time);
    }
    
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight; 
}

function updateUserList(users) {
    userCountSpan.textContent = users.length;
    userList.innerHTML = '';
    adminUserList.innerHTML = '';
    
    users.forEach(u => {
        // 1. Sidebar list
        const li = document.createElement('li');
        li.textContent = `${u.displayName}${u.isAdmin ? ' (Admin)' : ''}`;
        if (u.isAdmin) li.style.color = 'gold'; // Admin name highlight
        userList.appendChild(li);

        // 2. Admin Kick/Ban list
        if (user.isAdmin) {
            const adminLi = document.createElement('li');
            adminLi.innerHTML = `${u.displayName} ${u.isAdmin ? ' (Admin)' : ''} ${u.isAnon ? ' (Anon)' : ''}`;
            
            // Cannot kick self or other admins
            if (!u.isAdmin) {
                adminLi.classList.add('kick-target');
                adminLi.dataset.displayName = u.displayName;
                adminLi.onclick = () => showKickOrBanModal(u.displayName, u.socketId);
            } else if (u.isAdmin) {
                adminLi.style.fontWeight = 'bold';
                adminLi.style.color = 'gold';
            }
            adminUserList.appendChild(adminLi);
        }
    });
}

// =========================================================================
// 3. COMMAND PARSING AND HANDLERS
// =========================================================================

function handleMessageCommand(input) {
    const parts = input.match(/^\/msg\s+([\s\S]+?)\s+([\s\S]+)$/i);
    
    if (parts) {
        // The regex captures everything after /msg and the last word.
        // We need to parse out the recipient name from the content.
        const msgStart = parts[0].lastIndexOf(parts[2]);
        const recipientName = parts[0].substring(5, msgStart).trim();
        const content = parts[2].trim();
        
        if (recipientName && content) {
            socket.emit('private message', { recipient: recipientName, content: content });
            return true;
        }
    }
    
    socket.emit('system_error', 'Invalid /msg command. Usage: /msg [username] [message]');
    return true;
}

function handleKickCommand(input) {
    const parts = input.match(/^\/kick\s+([\s\S]+)$/i);
    
    if (!parts || !user.isAdmin) {
        socket.emit('system_error', 'Unauthorized or invalid /kick command. Usage: /kick [username]');
        return true;
    }
    
    const targetName = parts[1].trim();
    if (targetName) {
        // Use the simple kick confirmation for command-line kicks
        kickTargetDisplayName = targetName;
        kickConfirmBody.innerHTML = `Are you sure you want to KICK <strong>${targetName}</strong> from the chat?`;
        kickConfirmModal.show();
        return true;
    }
    
    socket.emit('system_error', 'Invalid /kick command. Usage: /kick [username]');
    return true;
}

// =========================================================================
// 4. ADMIN MODAL HANDLERS
// =========================================================================

function showKickOrBanModal(displayName, socketId) {
    // This is the list-click handler. We'll show the kick modal, which also contains a button to open the ban modal.
    kickTargetDisplayName = displayName;
    kickConfirmBody.innerHTML = `Action for <strong>${displayName}</strong>:`;
    
    // Set the ban modal defaults
    banTargetNameSpan.textContent = displayName;
    banDaysInput.value = 0;
    banHoursInput.value = 1;
    banMinutesInput.value = 0;
    
    kickConfirmModal.show();
    adminPanelModal.hide(); 
}

function confirmKick() {
    if (kickTargetDisplayName) {
        // The server will handle the logic and broadcast the kick
        socket.emit('admin:kick_user', kickTargetDisplayName, user.currentRoom);
        kickTargetDisplayName = ''; 
        kickConfirmModal.hide();
        adminPanelModal.show();
    }
}

function showBanModal() {
    kickConfirmModal.hide();
    banConfirmModal.show();
}

function confirmBan() {
    const targetName = banTargetNameSpan.textContent;
    const days = parseInt(banDaysInput.value) || 0;
    const hours = parseInt(banHoursInput.value) || 0;
    const minutes = parseInt(banMinutesInput.value) || 0;
    
    if (days + hours + minutes <= 0) {
        socket.emit('system_error', 'Ban duration must be greater than zero.');
        return;
    }

    socket.emit('admin:ban_ip', targetName, days, hours, minutes);
    banConfirmModal.hide();
    adminPanelModal.show();
}

function confirmClearHistory() {
    socket.emit('admin:clear_history', user.currentRoom);
    clearConfirmModal.hide();
    adminPanelModal.hide();
}

// =========================================================================
// 5. EVENT LISTENERS
// =========================================================================

// Show the login modal immediately on page load
nameModal.show();

// --- Message Input Character Counter ---
messageInput.addEventListener('input', () => {
    let content = messageInput.textContent;
    if (content.length > MAX_MESSAGE_LENGTH) {
        content = content.substring(0, MAX_MESSAGE_LENGTH);
        messageInput.textContent = content;
    }
    
    charCounter.textContent = `${content.length} / ${MAX_MESSAGE_LENGTH}`;
    charCounter.style.color = content.length === MAX_MESSAGE_LENGTH ? 'red' : '#888';
});

// --- Login Listener ---
nameForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const inputName = nameInput.value.trim();
    if (inputName) {
        socket.emit('check_staff_status', inputName, (response) => {
            if (response.success) {
                user.displayName = response.displayName;
                user.isAdmin = response.isAdmin;
                user.isAnon = response.isAnon || false;
                
                displayNameSpan.textContent = user.displayName + (user.isAdmin ? ' (Admin)' : '');
                container.style.display = 'flex'; 
                nameModal.hide(); 
                
                // Set up rename and admin panel access
                if (user.isAdmin) {
                    adminPanelBtn.removeAttribute('disabled');
                    adminPanelBtn.style.display = 'block';
                    anonToggleContainer.style.display = 'block';
                    anonCheckbox.checked = user.isAnon;
                }
                renameBtn.removeAttribute('disabled');
            } else {
                let message = 'Login failed.';
                switch (response.reason) {
                    case 'banned_word_or_length':
                        message = 'Name must be 3-20 characters and cannot contain banned words.';
                        break;
                    case 'name_in_use':
                        message = 'That name is already in use.';
                        break;
                    default:
                        message = response.message || 'Name rejected by server.';
                }
                socket.emit('system_error', message);
            }
        });
    }
});

// --- Message Submit Listener ---
messageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const msg = messageInput.textContent.trim();
    
    if (msg.length > MAX_MESSAGE_LENGTH) return;
    
    if (msg.startsWith('/')) {
        const command = msg.split(/\s+/)[0].toLowerCase();
        let handled = false;
        
        if (command === '/msg') {
            handled = handleMessageCommand(msg);
        } else if (command === '/clear' && user.isAdmin) {
            clearConfirmModal.show();
            handled = true;
        } else if (command === '/kick' && user.isAdmin) {
            handled = handleKickCommand(msg);
        } else if (command === '/clear' || command === '/kick') {
            socket.emit('system_error', `Unauthorized: ${command} is an admin command.`);
            handled = true;
        }

        if (handled) {
            messageInput.textContent = ''; 
            messageInput.dispatchEvent(new Event('input'));
            return;
        }
    }
    
    if (msg) {
        socket.emit('chat message', { content: msg }, user.currentRoom);
        messageInput.textContent = ''; 
        messageInput.dispatchEvent(new Event('input'));
    }
});

// --- Rename Listener ---
renameForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const newName = newNameInput.value.trim();
    const isAnon = user.isAdmin ? anonCheckbox.checked : false;

    if (newName) { 
        socket.emit('rename', newName, isAnon, (response) => {
            if (response.success) {
                user.displayName = response.newName;
                user.isAnon = response.isAnon;
                displayNameSpan.textContent = user.displayName + (user.isAdmin ? ' (Admin)' : '');
                newNameInput.value = '';
                renameModal.hide();
            } else {
                socket.emit('system_error', response.message || 'Rename failed: Name may be taken or invalid.');
            }
        });
    } else {
        socket.emit('system_error', 'Please enter a valid name (3-20 characters).');
    }
});

// --- Admin Panel Room Switch ---
adminChatBtn.addEventListener('click', () => {
    const newRoom = user.currentRoom === NORMAL_ROOM ? ADMIN_ROOM : NORMAL_ROOM;
    socket.emit('change room', newRoom);
    adminPanelModal.hide();
});

// --- Admin Panel Modals ---
document.getElementById('clearChatBtn').addEventListener('click', () => {
    adminPanelModal.hide(); 
    clearConfirmModal.show();
});
clearConfirmBtn.addEventListener('click', confirmClearHistory);
kickConfirmBtn.addEventListener('click', confirmKick);
document.getElementById('openBanModalBtn').addEventListener('click', showBanModal);
banConfirmBtn.addEventListener('click', confirmBan);


// =========================================================================
// 6. SOCKET.IO LISTENERS (SERVER RESPONSES)
// =========================================================================

// Incoming Chat Message
socket.on('chat message', function(data) {
    // The server ensures the message is for the current room
    appendMessage(data);
});

// Private Messages
socket.on('private message', function(data) {
    appendMessage(data);
});

// Initial History Load and Room Switch History
socket.on('chat history', function(history, room) {
    if (room === user.currentRoom) {
        messages.innerHTML = ''; // Clear chat area
        history.forEach(appendMessage);
    }
});

// Normal User List
socket.on('user list update', function(users) {
    if (user.currentRoom === NORMAL_ROOM) {
        updateUserList(users);
    }
});

// Admin User List (For Admin Panel)
socket.on('admin user list update', function(users) {
    // This list is only used for the Admin Modal, regardless of the current chat room
    updateUserList(users);
});

// Room Change Confirmation
socket.on('room changed', function(newRoom) {
    user.currentRoom = newRoom;
    
    // Update UI elements to reflect room change
    const roomName = newRoom === NORMAL_ROOM ? 'Normal Chat' : 'Admin Chat';
    adminPanelTitle.textContent = `${roomName} - Admin Panel`;
    adminChatBtn.textContent = newRoom === NORMAL_ROOM ? 'Switch to Admin Chat' : 'Switch to Normal Chat';
    
    // Clear chat and wait for the new history to be sent by the server
    messages.innerHTML = '';
    appendMessage({ username: 'System', content: `Switched to ${roomName}.`, timestamp: new Date(), isSystem: true });
});

// Server forces a clear of the messages list
socket.on('admin:history_cleared', function(clearMsg) {
    if (clearMsg.room === user.currentRoom) {
        messages.innerHTML = '';
        if (user.isAdmin) {
            appendMessage(clearMsg);
        }
    }
});

// Server-side errors/alerts
socket.on('system_error', function(msg) {
    appendMessage({ username: 'System', content: `ERROR: ${msg}`, timestamp: new Date(), isSystem: true, isAdmin: false });
});

socket.on('system_alert', function(msg) {
    appendMessage({ username: 'System', content: `ALERT: ${msg}`, timestamp: new Date(), isSystem: true, isAdmin: false });
});
