// chat.js - FINAL SCRIPT WITH ALL FEATURES

// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 
const renameModal = new bootstrap.Modal(document.getElementById('renameModal')); 
// CRITICAL: Ensure these modal IDs are present in index.html
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
const charCountContainer = document.getElementById('charCountContainer'); 

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');
const adminUserListEl = document.getElementById('admin-user-list'); 

const adminPanelBtn = document.getElementById('adminPanelBtn');
const renameBtn = document.getElementById('renameBtn');

// Chat Context Tabs
const publicChatTab = document.getElementById('publicChatTab');
const adminChatTab = document.getElementById('adminChatTab');

// Modal Elements for Clear History
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmTargetName = document.getElementById('clearConfirmTargetName'); 

// Modal Elements for Ban/Kick
const kickButton = document.getElementById('kickButton');
const banButton = document.getElementById('fpBanSubmitBtn'); 
const unbanButton = document.getElementById('fpUnbanBtn');
const unbanInput = document.getElementById('fpUnbanInput');

// Admin Panel Status & Data
let currentUserName = '';
let isAdmin = false;
let chatContext = 'public';
let currentAdminUserMap = {}; 
let selectedUserForAdminAction = { name: '', fpId: '' };


// --- HELPER FUNCTIONS ---

function updateCharCount() {
    const text = messageInput.textContent;
    charCountSpan.textContent = `${text.length}/500`;
    charCountContainer.style.color = text.length > 500 ? 'red' : '#ccc';
}

function appendMessage(msg) {
    const li = document.createElement('li');
    li.classList.add('msg');
    
    if (msg.username === currentUserName) {
        li.classList.add('own');
    } else if (msg.username === 'System' || msg.type === 'system') {
        li.classList.add('system');
    } else {
        li.classList.add('other');
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
    if (context === 'admin') {
        publicChatTab.classList.remove('active');
        adminChatTab.classList.add('active');
        document.getElementById('chatTitle').textContent = 'Admin Chat';
    } else {
        publicChatTab.classList.add('active');
        adminChatTab.classList.remove('active');
        document.getElementById('chatTitle').textContent = 'Public Chat';
    }
}

// Helper: Select user in the list for kick/ban actions (CRITICAL FOR BAN FIX)
function selectUserForAdminAction(name, fpId) {
    selectedUserForAdminAction = { name, fpId };
    document.getElementById('banTargetName').textContent = name;
    document.getElementById('banTargetFPIdHidden').value = fpId; 
    
    document.getElementById('kickButton').disabled = false;
    document.getElementById('fpBanSubmitBtn').disabled = false; 
    
    document.getElementById('adminActionStatus').textContent = `Selected: ${name}`;
}

// Helper: Populate the Admin User List 
function populateAdminUserList(users) {
    adminUserListEl.innerHTML = '';
    
    const sortedUsers = Object.values(users)
        .filter(u => u.displayName !== 'Connecting...' && !u.isAdmin) 
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    if (sortedUsers.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No non-admin users online.';
        li.style.fontStyle = 'italic';
        adminUserListEl.appendChild(li);
        return;
    }

    sortedUsers.forEach(user => {
        const li = document.createElement('li');
        li.textContent = `${user.displayName} (FP: ${user.fingerprintId || 'Unknown'})`; 
        li.className = 'list-group-item user-select-list-item'; 
        
        li.addEventListener('click', () => {
            selectUserForAdminAction(user.displayName, user.fingerprintId);
        });

        adminUserListEl.appendChild(li);
    });
}


// --- INITIALIZATION ---

// Prompt for name on connection
window.onload = () => {
    myModal.show();
    // Use an external library (like Fingerprint2) to get a unique device ID
    // NOTE: Ensure the Fingerprint2 script tag is included in index.html
    if (window.Fingerprint2) {
        new Fingerprint2().get(function(result, components) {
            socket.emit('client:send_fingerprint_id', result);
        });
    } else {
        // Fallback
        const fallbackId = `fallback_${Math.random().toString(36).substring(2, 9)}`;
        socket.emit('client:send_fingerprint_id', fallbackId);
    }
};

// --- EVENT LISTENERS ---

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
});

messageInput.addEventListener('input', updateCharCount);

nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (name) {
        socket.emit('check_staff_status', name);
    }
});

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = messageInput.textContent.trim();
    if (content) {
        if (content.toLowerCase().startsWith('/pm ')) {
             const parts = content.substring(4).trim().split(' ');
             const recipient = parts.shift();
             const pmContent = parts.join(' ');

             if (recipient && pmContent) {
                 socket.emit('private message', {
                     recipient: recipient,
                     content: pmContent
                 });
             } else {
                 alert('PM usage: /pm [username] [message]');
             }
        } else {
            socket.emit('chat message', { content: content });
        }
        messageInput.textContent = ''; 
        updateCharCount();
    }
});

renameBtn.addEventListener('click', () => {
    document.getElementById('rename-input').value = currentUserName;
    renameModal.show();
});

document.getElementById('rename-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newName = document.getElementById('rename-input').value.trim();
    if (newName && newName !== currentUserName) {
        socket.emit('name_change', newName);
        renameModal.hide();
    }
});

adminPanelBtn.addEventListener('click', () => {
    if (isAdmin) {
        adminPanelModal.show();
    }
});

document.getElementById('adminGoAnon').addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:go_anonymous');
    }
});

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    clearTargetContext = chatContext; 
    clearConfirmTargetName.textContent = chatContext === 'admin' ? 'Admin Chat' : 'Public Chat';
    clearConfirmModal.show();
});

clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:clear_history', clearTargetContext);
        clearConfirmModal.hide();
    }
});

publicChatTab.addEventListener('click', () => {
    if (chatContext !== 'public' && isAdmin) {
        socket.emit('admin:set_context', 'public');
    }
});

adminChatTab.addEventListener('click', () => {
    if (chatContext !== 'admin' && isAdmin) {
        socket.emit('admin:set_context', 'admin_chat');
    }
});

kickButton.addEventListener('click', () => {
    if (selectedUserForAdminAction.name && selectedUserForAdminAction.name !== currentUserName) {
        socket.emit('admin:kick_user', { 
            targetName: selectedUserForAdminAction.name,
            adminName: currentUserName 
        });
        adminPanelModal.hide();
    }
});

banButton.addEventListener('click', () => {
    const targetName = document.getElementById('banTargetName').textContent;
    const targetFingerprintId = document.getElementById('banTargetFPIdHidden').value; 
    const days = parseInt(document.getElementById('banDays').value) || 0;
    const hours = parseInt(document.getElementById('banHours').value) || 0;
    const minutes = parseInt(document.getElementById('banMinutes').value) || 0;
    const reason = document.getElementById('banReason').value || 'No reason provided';

    if (!targetFingerprintId) {
        alert('Error: Please select a user to ban.');
        return;
    }

    if (days === 0 && hours === 0 && minutes === 0) {
        alert('Ban duration must be greater than zero.');
        return;
    }

    socket.emit('admin:fp_ban_user', {
        targetName,
        targetFingerprintId, 
        days,
        hours,
        minutes,
        reason,
        adminName: currentUserName
    });

    document.getElementById('banDays').value = 0;
    document.getElementById('banHours').value = 0;
    document.getElementById('banMinutes').value = 0;
    document.getElementById('banReason').value = '';
    adminPanelModal.hide();
});

unbanButton.addEventListener('click', () => {
    const fpId = unbanInput.value.trim();
    if (fpId) {
        socket.emit('admin:unban_fp', fpId);
        unbanInput.value = '';
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

socket.on('admin_user_map', serverUsersMap => {
    currentAdminUserMap = serverUsersMap;
    if (isAdmin) {
        populateAdminUserList(currentAdminUserMap);
    }
});

socket.on('admin_context_switched', newContext => {
    chatContext = newContext;
    updateContextUI(newContext);
});

socket.on('staff_status_update', ({ isAdmin: status, displayName, secureName, currentContext }) => {
    isAdmin = status;
    currentUserName = displayName;
    chatContext = currentContext;
    displayNameEl.textContent = displayName;

    if (isAdmin) {
        adminChatTab.style.display = 'block';
        adminPanelBtn.style.display = 'inline-block';
        populateAdminUserList(currentAdminUserMap); 
    } else {
        adminChatTab.style.display = 'none';
        adminPanelBtn.style.display = 'none';
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
