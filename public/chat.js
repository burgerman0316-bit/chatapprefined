// =========================================================================
// 0. SOCKET.IO CONNECTION (This must be outside the listener)
// =========================================================================
// Use your specific Railway URL here:
const socket = io("https://chatapprefined-production.up.railway.app"); 

// Wrap all logic inside DOMContentLoaded to ensure elements exist before script runs
document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 1. INITIAL SETUP AND ELEMENT DEFINITIONS
    // =========================================================================

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
    // Initialize modals safely, ensuring the elements are ready.
    const nameModalEl = document.getElementById('nameModal');
    // NOTE: We now use nameModalEl directly in the listener, not the instance
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

    function appendMessage(msg, type) {
        const item = document.createElement('li');
        item.classList.add('msg', type);
        item.textContent = msg;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight; 
    }

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

    // Show the login modal immediately on page load
    nameModal.show();

    // --- Login Listener ---
    nameForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const inputName = nameInput.value.trim();
        if (inputName) {
            socket.emit('new user', inputName, (response) => {
                if (response.success) {
                    username = response.username;
                    isMod = response.isMod;
                    
                    displayNameSpan.textContent = username;
                    container.style.display = 'flex'; 
                    nameModal.hide(); 

                    // Enable buttons on successful login 
                    renameBtn.removeAttribute('disabled');
                    if (isMod) {
                        adminPanelBtn.removeAttribute('disabled');
                        adminPanelBtn.style.display = 'block';
                    }
                } else {
                    appendMessage(`[Client Error] Login failed: ${response.message || 'Name may be taken or invalid.'}`, 'system');
                }
            });
        }
    });

    // --- Message Submit Listener ---
    messageForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const msg = messageInput.textContent.trim();
        if (msg) {
            if (msg.startsWith('/clear') && isMod) {
                clearConfirmModal.show();
            } else {
                socket.emit('chat message', msg);
            }
            messageInput.textContent = ''; 
        }
    });

    // --- Rename Listener ---
    renameForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const newName = newNameInput.value.trim();
        if (newName && newName.length <= 20) { 
            handleRename(newName);
        } else {
            appendMessage('Please enter a valid name (1-20 characters).', 'system');
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

    socket.on('chat message', function(data) {
        const messageType = data.username === username ? 'own' : 'other';
        const sender = data.username === username ? 'You' : data.username;
        
        appendMessage(`${sender}: ${data.msg}`, messageType);
    });

    socket.on('system message', function(msg) {
        appendMessage(msg, 'system');
    });

    socket.on('user list update', function(users) {
        updateUserList(users);
    });

    socket.on('clear messages', function() {
        messages.innerHTML = '';
        appendMessage('Chat history has been cleared by a moderator.', 'system');
    });

    socket.on('kicked', function() {
        location.reload(); 
    });
}); // End of DOMContentLoaded listener
