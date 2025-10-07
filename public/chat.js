// =========================================================================
// 1. INITIAL SETUP AND ELEMENT DEFINITIONS
// =========================================================================

// *** FIX 1: Explicitly connect to the deployed server URL ***
const socket = io("https://chatapprefined-production.up.railway.app"); 

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
const renameBtn = document.getElementById('renameBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');

// Modal Elements (Requires Bootstrap 5)
// LOGIN Modal
const nameModalEl = document.getElementById('nameModal');
const nameModal = new bootstrap.Modal(nameModalEl, { backdrop: 'static', keyboard: false });
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

// RENAME Modal
const renameModalEl = document.getElementById('renameModal');
const renameModal = new bootstrap.Modal(renameModalEl);
const renameForm = document.getElementById('rename-form');
const newNameInput = document.getElementById('new-name-input');

// ADMIN Modals
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
    messages.scrollTop = messages.scrollHeight; 
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
        const li = document.createElement('li');
        li.textContent = `${user.username}${user.isMod ? ' (Mod)' : ''}`;
        userList.appendChild(li);

        if (isMod) {
            const adminLi = document.createElement('li');
            adminLi.textContent = user.username;
            
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

function handleRename(newName) {
    if (newName === username) {
        renameModal.hide();
        return;
    }

    socket.emit('rename', newName, function(response) {
        if (response.success) {
            displayNameSpan.textContent = response.username; 
            username = response.username; 

            newNameInput.value = '';
            renameModal.hide(); 
        } else {
            // *** FIX 2: Replace alert() with appendMessage() ***
            appendMessage(`[Client Error] Rename failed: ${response.message || 'The name might be taken or invalid.'}`, 'system');
        }
    });
}

// =========================================================================
// 4. ADMIN FUNCTIONALITY
// =========================================================================

function showKickConfirmModal(targetName, targetId) {
    kickTargetSocketId = targetId;
    kickConfirmBody.innerHTML = `Are you sure you want to KICK <strong>${targetName}</strong> from the chat?`;
    kickConfirmModal.show();
    adminPanelModal.hide(); 
}

function confirmKick() {
    if (kickTargetSocketId) {
        socket.emit('kick user', kickTargetSocketId, (success) => {
            if (!success) {
                appendMessage('Error: Failed to kick user. They may have already left.', 'system');
            }
        });
        kickTargetSocketId = ''; 
        kickConfirmModal.hide();
    }
}

function confirmClearHistory() {
    socket.emit('clear history');
    clearConfirmModal.hide();
    adminPanelModal.hide();
}


// =========================================================================
// 5. EVENT LISTENERS
// =========================================================================
