// public/js/chat.js
// === CONFIGURATION ===
const MAX_MESSAGE_LENGTH = 256;
const NORMAL_ROOM = 'normal_chat';
const ADMIN_ROOM = 'admin_chat';


// === SOCKET CONNECTION (FIXED FOR PROXY/RAILWAY) ===
// Explicitly define the connection URL using the window's current protocol and host
const SOCKET_URL = window.location.protocol + "//" + window.location.host;
const socket = io(SOCKET_URL, {
    // Explicitly listing transports helps some proxies
    transports: ['websocket', 'polling']
});


// === STATE ===
let currentRoom = NORMAL_ROOM;
let currentUserName = '';
let currentIsAdmin = false;
let currentIsAnon = false;

// === DOM ELEMENTS ===
const nameModal = new bootstrap.Modal(document.getElementById('nameModal'), { backdrop: 'static', keyboard: false });
const renameModal = new bootstrap.Modal(document.getElementById('renameModal'));
const adminPanelModal = new bootstrap.Modal(document.getElementById('adminPanelModal'));
const clearConfirmModal = new bootstrap.Modal(document.getElementById('clearConfirmModal'));
const kickConfirmModal = new bootstrap.Modal(document.getElementById('kickConfirmModal'));
const banConfirmModal = new bootstrap.Modal(document.getElementById('banConfirmModal'));

const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const messageForm = document.getElementById('messageForm');
const charCounter = document.getElementById('char-counter');
const userList = document.getElementById('user-list');
const adminUserList = document.getElementById('admin-user-list');

// Variables for Admin Actions
let targetUserId = null;
let targetUserDisplayName = null;


// === HELPER FUNCTIONS ===

// Function to safely sanitize and format message content
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Renders a single message to the chat history
function displayMessage(msg) {
    // Determine the room of the displayed message
    const msgRoom = msg.room || NORMAL_ROOM;

    // Only display messages relevant to the current room (or global messages)
    if (msgRoom !== currentRoom && msgRoom !== 'GLOBAL') {
        return;
    }

    const item = document.createElement('li');
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isSelf = msg.username === currentUserName && !msg.isSystem;
    const isAnonAdmin = msg.isAnon && msg.isAdmin;

    // Determine the class and content structure
    let contentHTML = '';
    let classList = 'msg';
    
    if (msg.isSystem) {
        classList += ' system';
        contentHTML = escapeHTML(msg.content); // System messages are simple
        if (msg.room === 'GLOBAL') {
             classList += ' admin';
             item.style.fontWeight = 'bold';
             item.style.color = '#ff6666'; // Highlight global messages
             contentHTML = escapeHTML(msg.content);
        }
    } else if (msg.isPrivate) {
        // Private message structure
        classList += ' private system';
        const partner = msg.sender === currentUserName ? msg.recipient : msg.sender;
        contentHTML = `(Private to ${partner}): ${escapeHTML(msg.content)}`;
    } else {
        // Standard chat message
        classList += isSelf ? ' own' : ' other';
        if (msg.isAdmin) {
            classList += ' admin'; // Add gold border for admins
        }

        // Standard bubble content
        const displayName = isAnonAdmin && !currentIsAdmin ? 'Anonymous' : escapeHTML(msg.username);
        
        contentHTML = `
            <span class="sender-name">${displayName}</span>
            <div class="message-content">${escapeHTML(msg.content)}</div>
            <span class="timestamp">${time}</span>
        `;
    }

    item.className = classList;
    item.innerHTML = contentHTML;

    // Logic to fix stacking/spacing for sequential messages from the same user
    const lastMsg = messages.lastElementChild;
    if (lastMsg) {
        // Check if the last message was a regular chat message and from the same sender
        const isSameSender = lastMsg.classList.contains(isSelf ? 'own' : 'other');
        const wasChatMsg = !lastMsg.classList.contains('system') && !lastMsg.classList.contains('private');
        
        if (wasChatMsg && isSameSender && !msg.isSystem && !msg.isPrivate) {
            // Apply spacing fix and remove the arrow/tail from the top message
            item.style.marginTop = '-8px';
            if (isSelf) {
                lastMsg.style.borderBottomRightRadius = '0';
                lastMsg.classList.remove('own');
                lastMsg.classList.add('own-stacked-top');
            } else {
                lastMsg.style.borderBottomLeftRadius = '0';
                lastMsg.classList.remove('other');
                lastMsg.classList.add('other-stacked-top');
            }
        }
    }
    
    // Add arrow/tail styling back to the new message if it's not a stacked one
    if (isSelf && !msg.isSystem && !msg.isPrivate) {
        item.style.borderBottomRightRadius = '0';
    } else if (!isSelf && !msg.isSystem && !msg.isPrivate) {
        item.style.borderBottomLeftRadius = '0';
    }


    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

// Renders the list of online users in the sidebar
function renderUserList(users, listElement) {
    listElement.innerHTML = '';
    
    users.forEach(user => {
        const li = document.createElement('li');
        li.dataset.socketId = user.socketId;
        li.dataset.displayName = user.displayName;
        
        let nameHtml = escapeHTML(user.displayName);
        
        if (user.isAdmin) {
            nameHtml = `<span style="color: gold;">⭐ ${nameHtml}</span>`;
            if (user.isAnon) {
                nameHtml += ' (Anon)';
            }
        } else if (user.isAnon && currentIsAdmin) {
            // Admins see "Anonymous (Real Name)"
            nameHtml = `<span style="color: #ccc;">Anonymous (${escapeHTML(user.displayName)})</span>`;
        } else if (user.isAnon && !currentIsAdmin) {
            // Non-admins only see "Anonymous"
            nameHtml = `<span style="color: #ccc;">Anonymous</span>`;
        }

        li.innerHTML = nameHtml;
        listElement.appendChild(li);
    });

    // Update the user count display
    document.getElementById('user-count').textContent = users.length;
}

// Function to handle chat commands
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
    
    if (command === '/kick') {
        if (!currentIsAdmin) return socket.emit('system_error', 'Unauthorized: /kick is Admin only.');
        const targetUser = parts[1];
        if (!targetUser) return socket.emit('system_error', 'Usage: /kick [user]');

        openKickConfirmModal(targetUser, currentRoom);
        return true;
    }
    
    if (command === '/clear') {
        if (!currentIsAdmin) return socket.emit('system_error', 'Unauthorized: /clear is Admin only.');
        // Show confirmation modal
        clearConfirmModal.show();
        return true;
    }
    
    // Global Message Command
    if (command === '/gmsg') {
        if (!currentIsAdmin) return socket.emit('system_error', 'Unauthorized: /gmsg is Admin only.');
        const content = parts.slice(1).join(' ');
        if (!content) return socket.emit('system_error', 'Usage: /gmsg [global message]');
        
        socket.emit('admin:global_message', content.substring(0, MAX_MESSAGE_LENGTH));
        return true;
    }

    return false; // Not a recognized command
}


// === ADMIN ACTION MODALS ===

// Opens the Kick/Ban choice modal
function openKickConfirmModal(displayName, room) {
    // We only need the display name for the admin action
    targetUserDisplayName = displayName;
    
    document.getElementById('kickConfirmBody').innerHTML = `Action for: <strong>${escapeHTML(displayName)}</strong>`;
    
    // Set up listeners for the modal buttons
    document.getElementById('kickConfirmBtn').onclick = () => {
        socket.emit('admin:kick_user', targetUserDisplayName, currentRoom);
        kickConfirmModal.hide();
    };

    document.getElementById('openBanModalBtn').onclick = () => {
        kickConfirmModal.hide();
        document.getElementById('banTargetName').textContent = targetUserDisplayName;
        banConfirmModal.show();
    };
    
    kickConfirmModal.show();
}

// Sets up the Ban confirmation and emission
document.getElementById('banConfirmBtn').addEventListener('click', () => {
    const days = parseInt(document.getElementById('banDays').value) || 0;
    const hours = parseInt(document.getElementById('banHours').value) || 0;
    const minutes = parseInt(document.getElementById('banMinutes').value) || 0;

    if (days === 0 && hours === 0 && minutes === 0) {
        return alert('Ban duration must be greater than zero.');
    }
    
    socket.emit('admin:ban_ip', targetUserDisplayName, days, hours, minutes);
    banConfirmModal.hide();
});


// === INITIALIZATION / LOGIN ===

document.addEventListener('DOMContentLoaded', () => {
    nameModal.show();
    
    // Listen for client connection errors (e.g., from IP ban middleware)
    socket.on('connect_error', (err) => {
        console.error("Connection Error:", err.message);
        document.getElementById('container').style.display = 'none';
        document.body.innerHTML = `<h1 style="color: red; text-align: center; padding-top: 100px;">Connection Failed: ${err.message}</h1>`;
    });
});

document.getElementById('name-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name-input').value;

    socket.emit('check_staff_status', name, ({ success, reason, displayName, isAdmin, isAnon }) => {
        if (success) {
            currentUserName = displayName;
            currentIsAdmin = isAdmin;
            currentIsAnon = isAnon;

            // Update UI elements
            document.getElementById('display-name').textContent = currentUserName + (currentIsAdmin ? ' (Admin)' : '');
            document.getElementById('container').style.display = 'flex';
            document.getElementById('renameBtn').disabled = false;
            
            if (currentIsAdmin) {
                document.getElementById('adminPanelBtn').style.display = 'block';
                document.getElementById('adminPanelBtn').disabled = false;
                document.getElementById('anon-toggle-container').style.display = 'block'; // Show anon toggle
            }

            nameModal.hide();
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
    messageInput.textContent = ''; // Clear input field
    updateCharCounter(); // Reset counter
    
    if (content) {
        // 1. Check for command
        const isCommand = handleCommand(content);

        // 2. If not a command, send as a regular chat message
        if (!isCommand) {
            const safeContent = content.substring(0, MAX_MESSAGE_LENGTH);
            socket.emit('chat message', { content: safeContent }, currentRoom);
        }
    }
});

// Character Counter and Max Length Enforcement
messageInput.addEventListener('input', updateCharCounter);
messageInput.addEventListener('keydown', function(e) {
    // Block input if max length is reached
    if (messageInput.textContent.length >= MAX_MESSAGE_LENGTH && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
    }
    // Handle Enter key for submission (preventing new line)
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
document.getElementById('rename-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const newName = document.getElementById('new-name-input').value;
    const isAnon = currentIsAdmin ? document.getElementById('anonCheckbox').checked : false;

    socket.emit('rename', newName, isAnon, ({ success, message, newName, isAnon }) => {
        if (success) {
            currentUserName = newName;
            currentIsAnon = isAnon;
            document.getElementById('display-name').textContent = currentUserName + (currentIsAdmin ? ' (Admin)' : '');
            renameModal.hide();
        } else {
            alert('Rename failed: ' + message);
        }
    });
});

// Admin Panel User List Click Handler
adminUserList.addEventListener('click', function(e) {
    const li = e.target.closest('li');
    if (!li || !currentIsAdmin) return;
    
    const targetName = li.dataset.displayName;
    
    // Prevent admin from kicking/banning themselves
    if (targetName === currentUserName) {
        return socket.emit('system_error', "You cannot kick or ban yourself.");
    }

    adminPanelModal.hide();
    openKickConfirmModal(targetName, currentRoom);
});

// Clear Chat Confirmation Button
document.getElementById('clearConfirmBtn').addEventListener('click', () => {
    socket.emit('admin:clear_history', currentRoom);
    clearConfirmModal.hide();
});

// Switch to Admin Chat Button
document.getElementById('adminChatBtn').addEventListener('click', () => {
    const newRoom = currentRoom === NORMAL_ROOM ? ADMIN_ROOM : NORMAL_ROOM;
    socket.emit('change room', newRoom);
    adminPanelModal.hide();
});


// === SOCKET EVENT HANDLERS ===

socket.on('chat message', function(msg) {
    displayMessage(msg);
});

socket.on('private message', function(msg) {
    displayMessage(msg);
});

socket.on('system_error', function(message) {
    displayMessage({ username: 'System Error', content: message, timestamp: new Date(), isSystem: true, isAdmin: true });
});

socket.on('system_alert', function(message) {
    displayMessage({ username: 'System Alert', content: message, timestamp: new Date(), isSystem: true });
});

socket.on('user list update', function(users) {
    if (currentRoom === NORMAL_ROOM) {
        renderUserList(users, userList);
    }
});

socket.on('admin user list update', function(users) {
    // Admins always get the list of users in the NORMAL_ROOM for the panel
    renderUserList(users, adminUserList);
});

socket.on('chat history', function(history, room) {
    if (room !== currentRoom) return;

    messages.innerHTML = '';
    history.forEach(msg => displayMessage(msg));
});

socket.on('room changed', function(newRoom) {
    currentRoom = newRoom;
    const title = document.getElementById('adminPanelTitle');
    const switchBtn = document.getElementById('adminChatBtn');
    
    if (newRoom === ADMIN_ROOM) {
        title.textContent = 'Admin Chat - Admin Panel';
        switchBtn.textContent = 'Switch to Normal Chat';
        switchBtn.classList.replace('btn-warning', 'btn-success');
    } else {
        title.textContent = 'Normal Chat - Admin Panel';
        switchBtn.textContent = 'Switch to Admin Chat';
        switchBtn.classList.replace('btn-success', 'btn-warning');
    }
    
    const roomMsg = {
        username: 'System', 
        content: `You have switched to the ${newRoom === ADMIN_ROOM ? 'Admin Chat' : 'Normal Chat'} room.`,
        timestamp: new Date(), 
        isSystem: true, 
        isAdmin: true,
        room: newRoom
    };
    displayMessage(roomMsg);
});

socket.on('admin:history_cleared', function(clearMsg) {
    messages.innerHTML = '';
    displayMessage(clearMsg);
});
