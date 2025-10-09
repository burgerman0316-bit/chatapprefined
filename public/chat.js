// chat.js - FINAL SCRIPT WITH ALL FEATURES

// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 
const renameModal = new bootstrap.Modal(document.getElementById('renameModal')); 
const adminPanelModal = new bootstrap.Modal(document.getElementById('adminPanelModal')); 
const clearConfirmModal = new bootstrap.Modal(document.getElementById('clearConfirmModal')); 
const bannedModal = new bootstrap.Modal(document.getElementById('bannedModal'));

// Socket connection
const socket = io();

// Elements
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const container = document.getElementById('container'); 

const displayNameEl = document.getElementById('display-name');
const messagesDiv = document.getElementById('messages'); 
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const charCountSpan = document.getElementById('char-count'); 

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');
const adminUserListEl = document.getElementById('admin-user-list'); 

const adminPanelBtn = document.getElementById('adminPanelBtn');
const renameBtn = document.getElementById('renameBtn');

// Chat Context Tabs
const publicChatTab = document.getElementById('publicChatTab');
const adminChatTab = document.getElementById('adminChatTab');

// Admin Action Buttons
const kickButton = document.getElementById('kickButton');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const fpBanSubmitBtn = document.getElementById('fpBanSubmitBtn');
const fpUnbanBtn = document.getElementById('fpUnbanBtn');
const adminGoAnon = document.getElementById('adminGoAnon');

// Admin Panel Status & Data
const adminActionStatus = document.getElementById('adminActionStatus');
const banTargetNameEl = document.getElementById('banTargetName');
const banTargetFPIdHidden = document.getElementById('banTargetFPIdHidden');

// Modal Elements for Clear History
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmTargetName = document.getElementById('clearConfirmTargetName'); 

let currentUserName = '';
let isAdmin = false;
let chatContext = 'public';
let selectedUserForAdminAction = { name: '', fpId: '' };
let clearTargetContext = 'public'; // Used for the clear confirm modal

// --- HELPER FUNCTIONS ---

function updateCharCount() {
    const text = messageInput.textContent;
    charCountSpan.textContent = `${text.length}/500`;
    charCountSpan.style.color = text.length > 500 ? 'red' : '#ccc';
}

function appendMessage(msg) {
    const li = document.createElement('li');
    li.classList.add('msg');
    
    if (msg.username === 'System' || msg.type === 'system') {
        li.classList.add('system');
    } else if (msg.username === displayNameEl.textContent) {
        li.classList.add('own');
    }

    const nameClass = msg.isAdmin ? 'admin-msg' : '';

    const timestamp = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (msg.senderName && msg.senderName !== msg.username) {
        li.innerHTML = `<span class="sender-name private-name">${msg.senderName}:</span> ${msg.content} <span class="timestamp">${timestamp}</span>`;
    } else {
        li.innerHTML = `<span class="sender-name ${nameClass}">${msg.username}:</span> ${msg.content} <span class="timestamp">${timestamp}</span>`;
    }

    messagesDiv.appendChild(li);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateContextUI(context) {
    if (context === 'admin_chat') {
        publicChatTab.classList.remove('active');
        adminChatTab.classList.add('active');
        document.getElementById('chatTitle').textContent = 'Admin Chat';
        clearTargetContext = 'admin';
    } else {
        publicChatTab.classList.add('active');
        adminChatTab.classList.remove('active');
        document.getElementById('chatTitle').textContent = 'Public Chat';
        clearTargetContext = 'public';
    }
}

function populateAdminUserList(usersMap) {
    adminUserListEl.innerHTML = '';

    const userKeys = Object.keys(usersMap);

    if (userKeys.length === 0) {
        const li = document.createElement('li');
        li.textContent = "No non-admin users online.";
        li.classList.add('list-group-item', 'list-group-item-action', 'list-group-item-dark');
        adminUserListEl.appendChild(li);
        return;
    }

    userKeys.forEach(name => {
        const user = usersMap[name];
        // Ensure we only list non-admin users for action
        if (user.isAdmin) return; 
        
        const li = document.createElement('li');
        li.textContent = `${user.displayName} (FP: ${user.fingerprintId.substring(0, 8)}...)`;
        li.dataset.name = user.displayName;
        li.dataset.fpid = user.fingerprintId;
        li.classList.add('list-group-item', 'list-group-item-action', 'list-group-item-dark');
        li.addEventListener('click', () => selectUserForAdminAction(user));
        adminUserListEl.appendChild(li);
    });
}

function selectUserForAdminAction(user) {
    selectedUserForAdminAction = user;

    // UI Updates
    adminActionStatus.textContent = user.displayName;
    banTargetNameEl.textContent = user.displayName;
    banTargetFPIdHidden.value = user.fingerprintId;

    // Enable buttons
    kickButton.disabled = false;
    fpBanSubmitBtn.disabled = false;
    
    // Highlight selection
    Array.from(adminUserListEl.children).forEach(li => {
        li.classList.toggle('active', li.dataset.name === user.displayName);
    });
}

function resetAdminActionUI() {
    selectedUserForAdminAction = { name: '', fpId: '' };
    adminActionStatus.textContent = 'None';
    banTargetNameEl.textContent = 'N/A';
    banTargetFPIdHidden.value = '';
    kickButton.disabled = true;
    fpBanSubmitBtn.disabled = true;
    
    document.getElementById('banDays').value = 0;
    document.getElementById('banHours').value = 0;
    document.getElementById('banMinutes').value = 30; // Default to 30 mins ban
    document.getElementById('banReason').value = 'Spam/Hate Speech';
    document.getElementById('fpUnbanInput').value = '';

    Array.from(adminUserListEl.children).forEach(li => {
        li.classList.remove('active');
    });
}

// --- INITIALIZATION ---

window.onload = () => {
    myModal.show();
    // Use Fingerprint2.js library loaded in index.html
    if (window.Fingerprint2) {
        new Fingerprint2().get(function(result) {
            socket.emit('client:send_fingerprint_id', result);
        });
    } else {
        // Fallback (though the library is now in index.html)
        const fallbackId = `fallback_${Math.random().toString(36).substring(2, 9)}`;
        socket.emit('client:send_fingerprint_id', fallbackId);
    }
};


// --- EVENT LISTENERS ---

// Message Input Enter Key Listener
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
});

// Character Count Listener
messageInput.addEventListener('input', updateCharCount);

// Name Submission
nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (name) {
        socket.emit('check_staff_status', name);
    }
});

// Message Submission
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = messageInput.textContent.trim();
    if (content) {
        // PM logic
        if (content.toLowerCase().startsWith('/pm ')) {
             const parts = content.substring(4).trim().split(' ');
             const recipient = parts.shift();
             const pmContent = parts.join(' ');

             if (recipient && pmContent) {
                 socket.emit('private message', { recipient: recipient, content: pmContent });
             } else {
                 alert('PM usage: /pm [username] [message]');
             }
        } else {
            // Regular chat
            socket.emit('chat message', { content: content });
        }
        messageInput.textContent = ''; 
        updateCharCount();
    }
});

// Rename button click
renameBtn.addEventListener('click', () => {
    document.getElementById('new-name-input').value = displayNameEl.textContent;
    renameModal.show();
});

// Rename submission
document.getElementById('rename-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newName = document.getElementById('new-name-input').value.trim();
    if (newName && newName !== displayNameEl.textContent) {
        socket.emit('name_change', newName);
        renameModal.hide();
    }
});

// Admin Panel Button click (Opens the full modal and REQUESTS user map)
adminPanelBtn.addEventListener('click', () => {
    if (isAdmin) {
        resetAdminActionUI(); 
        
        // FIX: Request the latest user map from the server
        socket.emit('admin:request_user_map'); 
        
        adminPanelModal.show();
    }
});

// Kick Button
kickButton.addEventListener('click', () => {
    if (selectedUserForAdminAction.name) {
        if (confirm(`Are you sure you want to KICK ${selectedUserForAdminAction.name}?`)) {
            socket.emit('admin:kick_user', selectedUserForAdminAction.name);
            adminPanelModal.hide();
        }
    }
});

// Ban Submission
fpBanSubmitBtn.addEventListener('click', () => {
    const targetName = banTargetNameEl.textContent;
    const targetFP = banTargetFPIdHidden.value;
    const days = parseInt(document.getElementById('banDays').value) || 0;
    const hours = parseInt(document.getElementById('banHours').value) || 0;
    const minutes = parseInt(document.getElementById('banMinutes').value) || 0;
    const reason = document.getElementById('banReason').value.trim();

    if (!targetFP || !reason || targetName === 'N/A') {
        alert("Must select a user and provide a reason.");
        return;
    }
    
    if (days === 0 && hours === 0 && minutes === 0) {
        if (!confirm(`Are you sure you want to PERMANENTLY BAN ${targetName} for "${reason}"?`)) {
            return;
        }
    }

    socket.emit('admin:fp_ban_user', { targetName, targetFP, days, hours, minutes, reason });
    adminPanelModal.hide();
});

// Unban Submission
fpUnbanBtn.addEventListener('click', () => {
    const fpId = document.getElementById('fpUnbanInput').value.trim();
    if (fpId) {
        socket.emit('admin:unban_fp', fpId);
        // Do not clear the input; wait for server alert/confirmation
    } else {
        alert("Enter a Fingerprint ID to unban.");
    }
});

// Clear History Button (inside Admin Panel)
clearHistoryBtn.addEventListener('click', () => {
    // Set up the confirmation modal
    document.getElementById('clearConfirmTargetName').textContent = clearTargetContext === 'admin' ? 'Admin Chat' : 'Public Chat';
    
    // The button click handler in index.html now opens the confirm modal directly,
    // so we don't need to hide the admin panel here.
});

// Clear History Confirmation (Final execution)
clearConfirmBtn.addEventListener('click', () => {
    // Use the context set by updateContextUI or default
    let targetContext = clearTargetContext; 
    
    if (isAdmin) {
        socket.emit('admin:clear_history', targetContext);
        clearConfirmModal.hide();
        adminPanelModal.show(); // Show admin panel again after action
    }
});

// Admin Go Anonymous button
adminGoAnon.addEventListener('click', () => {
    socket.emit('admin:go_anonymous');
});


// Context Switching (Admin only)
publicChatTab.addEventListener('click', () => {
    if (isAdmin && chatContext !== 'public') {
        socket.emit('admin:set_context', 'public');
    }
});

adminChatTab.addEventListener('click', () => {
    if (isAdmin && chatContext !== 'admin_chat') {
        socket.emit('admin:set_context', 'admin_chat');
    }
});


// --- SOCKET LISTENERS ---

socket.on('name_accepted', (name) => {
    currentUserName = name;
    displayNameEl.textContent = name;
    myModal.hide();
    container.style.display = 'flex';
    renameBtn.style.display = 'inline';
});

socket.on('name_rejected', (reason) => {
    alert(`Name Rejected: ${reason}`);
    nameInput.value = '';
});

socket.on('name_updated_ui', (newName) => {
    currentUserName = newName;
    displayNameEl.textContent = newName;
});

socket.on('system_error', (message) => {
    alert(`ERROR: ${message}`);
});

socket.on('system_alert', (message) => {
    alert(`Alert: ${message}`);
    // If the alert confirms an admin action, reset the panel state
    if (message.includes('kicked') || message.includes('BANNED') || message.includes('UNBANNED') || message.includes('anonymous')) {
        resetAdminActionUI();
    }
});

socket.on('chat history', (history) => {
    messagesDiv.innerHTML = '';
    history.forEach(appendMessage);
});

socket.on('chat message', appendMessage);

socket.on('admin chat message', appendMessage);

socket.on('private message', appendMessage);

socket.on('user count', ({ userList, usersMap }) => {
    userCountEl.textContent = userList.length;
    userListEl.innerHTML = '';
    
    // Update main user list
    userList.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        if (usersMap[name] && usersMap[name].isAdmin) {
             li.classList.add('admin-name-list'); 
        }
        li.addEventListener('click', () => {
            messageInput.textContent = `/pm ${name} `;
            messageInput.focus();
            updateCharCount();
        });
        userListEl.appendChild(li);
    });
});

socket.on('admin_user_map', usersMap => {
    // This runs after the request in adminPanelBtn click
    if (isAdmin) {
        populateAdminUserList(usersMap);
    }
});

socket.on('admin_context_switched', newContext => {
    chatContext = newContext;
    updateContextUI(newContext);
});

socket.on('staff_status_update', ({ isAdmin: status, displayName, currentContext }) => {
    isAdmin = status;
    currentUserName = displayName;
    chatContext = currentContext;
    displayNameEl.textContent = displayName;
    
    if (isAdmin) {
        adminChatTab.style.display = 'block';
        adminPanelBtn.style.display = 'inline-block';
        adminGoAnon.style.display = 'inline-block';
    } else {
        adminChatTab.style.display = 'none';
        adminPanelBtn.style.display = 'none';
        adminGoAnon.style.display = 'none';
    }
    renameBtn.style.display = 'inline';
    myModal.hide();
    container.style.display = 'flex';
    updateContextUI(currentContext);
});

socket.on('banned_modal', ({ reason: banReason, banDurationMs }) => {
    const bannedModalBody = document.getElementById('bannedModalBody');
    if (!bannedModalBody) return;
    
    bannedModalBody.innerHTML = `You are BANNED from the chat.<br>Reason: <strong>${banReason}</strong><br>Time remaining: <span id="banTimer"></span>`;
    bannedModal.show();
    
    let endTime = new Date().getTime() + banDurationMs;
    
    const timerInterval = setInterval(() => {
        let now = new Date().getTime();
        let distance = endTime - now;
        
        if (distance < 0) {
            clearInterval(timerInterval);
            const timerElement = document.getElementById('banTimer');
            if (timerElement) timerElement.textContent = "Your ban has expired. Please refresh.";
            return;
        }

        let days = Math.floor(distance / (1000 * 60 * 60 * 24));
        let hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        let minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        let seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        const timerElement = document.getElementById('banTimer');
        if (timerElement) {
            timerElement.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }
        
    }, 1000);
});
