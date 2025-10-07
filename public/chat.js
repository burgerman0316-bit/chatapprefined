// =========================================================================
// 1. INITIAL SETUP AND ELEMENT DEFINITIONS
// =========================================================================
const socket = io();

// Global State
let username = '';
let isMod = false;
let kickTargetSocketId = ''; 

// Chat Elements
const container = document.getElementById('container');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messages = document.getElementById('messages');
const displayNameSpan = document.getElementById('display-name');
const userCountSpan = document.getElementById('user-count');
const userList = document.getElementById('user-list');

// Sidebar Elements
const adminPanelBtn = document.getElementById('adminPanelBtn');

// Modal Elements (Requires Bootstrap 5)
const nameModalEl = document.getElementById('nameModal');
const nameModal = new bootstrap.Modal(nameModalEl, { backdrop: 'static', keyboard: false });
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

const renameModalEl = document.getElementById('renameModal');
const renameModal = new bootstrap.Modal(renameModalEl);
const renameForm = document.getElementById('rename-form');
const newNameInput = document.getElementById('new-name-input');

const adminPanelModalEl = document.getElementById('adminPanelModal');
const adminPanelModal = new bootstrap.Modal(adminPanelModalEl);
const adminUserList = document.getElementById('admin-user-list');
const clearChatBtn = document.getElementById('clearChatBtn');
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmModalEl = document.getElementById('clearConfirmModal');
const clearConfirmModal = new bootstrap.Modal(clearConfirmModalEl);

const kickConfirmModalEl = document.getElementById('kickConfirmModal');
const kickConfirmModal = new bootstrap.Modal(kickConfirmModalEl);
const kickConfirmBody = document.getElementById('kickConfirmBody');
const kickConfirmBtn = document.getElementById('kickConfirmBtn');

// =========================================================================
// 2. HELPER FUNCTIONS
// =========================================================================

/**
 * Creates and appends a list item to the chat window.
 * @param {string} msg - The message content.
 * @param {string} type - 'own', 'other', or 'system'.
 */
function appendMessage(msg, type) {
    const item = document.createElement('li');
    item.classList.add('msg', type);
    item.textContent = msg;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight; // Auto-scroll to bottom
}

/**
 * Updates the user count and the sidebar user list.
 * @param {Array<Object>} users - Array of {id, username, isMod}.
 */
function updateUserList(users) {
    userCountSpan.textContent = users.length;
    userList.innerHTML = '';
    adminUserList.innerHTML = '';

    users.forEach(user => {
        // Update Sidebar List
        const li = document.createElement('li');
        li.textContent = `${user.username}${user.isMod ? ' (Mod)' : ''}`;
        userList.appendChild(li);

        // Update Admin Panel List (if user is a Mod)
        if (isMod) {
            const adminLi = document.createElement('li');
            adminLi.textContent = user.username;
            
            // Do not allow kicking yourself
            if (user.username !== username) {
                adminLi.classList.add('kick-target');
                adminLi.dataset.socketId = user.id;
                adminLi.onclick = () => showKickConfirmModal(user.username, user.id);
            }
            adminUserList.appendChild(adminLi);
        }
    });
}

// =========================================================================
// 3. RENAME FUNCTIONALITY
// =========================================================================

/**
 * Function to handle the renaming process.
 * Emits 'rename' event to the server.
 */
function handleRename(newName) {
    if (newName === username) {
        renameModal.hide();
        return;
    }

    // Emit the new name to the server, expecting a callback response
    socket.emit('rename', newName, function(response) {
        if (response.success) {
            // Success: Update client-side state and UI
            displayNameSpan.textContent = response.username; // Use server-verified name
            username = response.username; 

            newNameInput.value = '';
            renameModal.hide(); 
        } else {
            // Failure: Use server-provided message if available
            alert(`Rename failed: ${response.message || 'The name might be taken or invalid.'}`);
        }
    });
}

// =========================================================================
// 4. ADMIN FUNCTIONALITY
// =========================================================================

/**
 * Shows the confirmation modal for kicking a user.
 */
function showKickConfirmModal(targetName, targetId) {
    kickTargetSocketId = targetId;
    kickConfirmBody.innerHTML = `Are you sure you want to KICK <strong>${targetName}</strong> from the chat?`;
    kickConfirmModal.show();
    adminPanelModal.hide(); // Hide the admin panel behind the confirmation
}

/**
 * Kicks the targeted user by emitting an event to the server.
 */
function confirmKick() {
    if (kickTargetSocketId) {
        socket.emit('kick user', kickTargetSocketId, (success) => {
            if (!success) {
                appendMessage('Error: Failed to kick user. They may have already left.', 'system');
            }
        });
        kickTargetSocketId = ''; // Clear the target ID
        kickConfirmModal.hide();
    }
}

/**
 * Clears the chat history by emitting an event to the server.
 */
function confirmClearHistory() {
    socket.emit('clear history');
    clearConfirmModal.hide();
    adminPanelModal.hide();
}


// =========================================================================
// 5. EVENT LISTENERS
// =========================================================================

// Show the login modal immediately on page load
nameModal.show();

// --- Login Listener ---
nameForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const inputName = nameInput.value.trim();
    if (inputName) {
        // Emit 'new user' and wait for server callback
        socket.emit('new user', inputName, (response) => {
            if (response.success) {
                username = response.username;
                isMod = response.isMod;
                
                displayNameSpan.textContent = username;
                container.style.display = 'flex'; // Show the chat
                nameModal.hide(); // Hide the login modal

                // Show admin button if user is a moderator
                if (isMod) {
                    adminPanelBtn.style.display = 'block';
                }
            } else {
                alert(`Login failed: ${response.message || 'Name may be taken or invalid.'}`);
            }
        });
    }
});

// --- Message Submit Listener ---
messageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const msg = messageInput.textContent.trim();
    if (msg) {
        // Basic command handling
        if (msg.startsWith('/clear') && isMod) {
            clearConfirmModal.show();
        } else {
            socket.emit('chat message', msg);
        }
        messageInput.textContent = ''; // Clear the input field
    }
});

// --- Rename Listener ---
renameForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const newName = newNameInput.value.trim();
    if (newName && newName.length <= 20) { 
        handleRename(newName);
    } else {
        alert('Please enter a valid name (1-20 characters).');
    }
});

// --- Admin Panel Listeners ---
clearChatBtn.addEventListener('click', () => {
    adminPanelModal.hide(); 
    clearConfirmModal.show();
});
clearConfirmBtn.addEventListener('click', confirmClearHistory);
kickConfirmBtn.addEventListener('click', confirmKick);


// =========================================================================
// 6. SOCKET.IO LISTENERS (SERVER RESPONSES)
// =========================================================================

// Incoming Chat Message
socket.on('chat message', function(data) {
    const messageType = data.username === username ? 'own' : 'other';
    const sender = data.username === username ? 'You' : data.username;
    
    // Assumes server sends a time property (data.time) for a complete display
    appendMessage(`${sender}: ${data.msg}`, messageType);
});

// System Messages (e.g., user joined, user left, rename notice)
socket.on('system message', function(msg) {
    appendMessage(msg, 'system');
});

// Server sends updated user list
socket.on('user list update', function(users) {
    updateUserList(users);
});

// Server forces a clear of the messages list
socket.on('clear messages', function() {
    messages.innerHTML = '';
    appendMessage('Chat history has been cleared by a moderator.', 'system');
});

// Server tells the client they were kicked
socket.on('kicked', function() {
    alert("You have been kicked from the chat.");
    location.reload(); // Simple way to force logout and reload
});
