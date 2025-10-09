// chat.js - FINAL SCRIPT WITH ALL FEATURES

// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 
const renameModal = new bootstrap.Modal(document.getElementById('renameModal')); 

// Socket connection
const socket = io();

// Elements
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const container = document.getElementById('container'); 

const displayNameEl = document.getElementById('display-name');
const messagesDiv = document.getElementById('messages'); 
const messageInputDiv = document.getElementById('messageInput');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('message-input');
const charCountSpan = document.getElementById('char-count'); 
const charCountContainer = document.getElementById('charCountContainer'); 

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');
const adminUserListEl = document.getElementById('admin-user-list'); // NEW REFERENCE

const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminModalEl = document.getElementById('adminPanelModal'); 
const renameBtn = document.getElementById('renameBtn');
const goAnonBtn = document.getElementById('goAnonBtn');

// Chat Context Tabs
const publicChatTab = document.getElementById('publicChatTab');
const adminChatTab = document.getElementById('adminChatTab');

// Modal Elements for Clear History
const clearConfirmModal = new bootstrap.Modal(document.getElementById('clearConfirmModal'));
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmTargetName = document.getElementById('clearConfirmTargetName');

// User Action Modal Elements
const userActionModal = new bootstrap.Modal(document.getElementById('userActionModal'));
const actionTargetNameEl = document.getElementById('actionTargetName');
const actionTargetIpEl = document.getElementById('actionTargetIp');
const actionTargetFpEl = document.getElementById('actionTargetFp');
const kickUserBtn = document.getElementById('kickUserBtn');
const banForm = document.getElementById('banForm');
const banDaysInput = document.getElementById('banDays');
const banHoursInput = document.getElementById('banHours');
const banMinutesInput = document.getElementById('banMinutes');
const banReasonInput = document.getElementById('banReason');
const ipBanSubmitBtn = document.getElementById('ipBanSubmitBtn');
const fpBanSubmitBtn = document.getElementById('fpBanSubmitBtn');
const unbanFpForm = document.getElementById('unbanFpForm');
const unbanFpInput = document.getElementById('unbanFpInput');

// Banned Modal
const bannedModal = new bootstrap.Modal(document.getElementById('bannedModal'));
const bannedModalBody = document.getElementById('bannedModalBody');

// State Variables
let isUserAdmin = false;
let currentContext = 'public'; // 'public' or 'admin_chat'
let currentAdminUserMap = {}; // Stores all user info for admin actions
let actionTargetData = null; // Stores data for the user currently selected in the admin panel

// --- FPID GENERATION AND INITIAL SUBMISSION (FIXED) ---
function generateAndSendFingerprint() {
    let fpId;
    
    // Check if Fingerprint2 is available (from the CDN script in index.html)
    if (window.Fingerprint2) {
        Fingerprint2.get(function(components) {
            const values = components.map(function (component) { return component.value; });
            fpId = Fingerprint2.x64hash128(values.join(''), 31);
            socket.emit('client:send_fingerprint_id', fpId);
            console.log('FPID generated and sent:', fpId);
        });
    } else {
        // Fallback for when the library is not loaded (should not happen with the fix)
        fpId = 'FP_TEMP_' + Math.random().toString(36).substring(2, 15);
        socket.emit('client:send_fingerprint_id', fpId);
        console.warn('Fingerprint2 not found. Sent temporary FPID:', fpId);
    }
}

// Immediately attempt to generate and send the FPID when the script loads
generateAndSendFingerprint();


// --- UI FUNCTIONS ---

function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('message');

    // Add class for styling
    if (msg.type === 'system') {
        item.classList.add('system-message');
    } else if (msg.type === 'private') {
        item.classList.add('private-message');
    } else if (msg.isAdmin) {
        item.classList.add('admin-message');
    }

    // Format Timestamp
    const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Format content based on type
    let contentHtml = '';
    if (msg.type === 'private') {
        // Display private message differently for sender and recipient
        const isSender = msg.username === displayNameEl.textContent;
        const targetName = isSender ? msg.username : msg.senderName;
        const fromTo = isSender ? `-> ${msg.username}` : `<- ${msg.senderName}`;
        
        contentHtml = `<span class="private-tag">[PM ${fromTo}]</span> <span class="pm-content">${msg.content}</span>`;
    } else if (msg.type === 'system') {
        // System message doesn't need a username prefix
        contentHtml = `<span class="system-content">${msg.content}</span>`;
    } else {
        // Regular message
        const usernameClass = msg.isAdmin ? 'admin-username' : 'regular-username';
        contentHtml = `<span class="${usernameClass}">${msg.username}:</span> ${msg.content}`;
    }

    item.innerHTML = `<span class="timestamp">${time}</span> ${contentHtml}`;
    messagesDiv.appendChild(item);
}

function updateMessageDisplay(history) {
    messagesDiv.innerHTML = '';
    history.forEach(appendMessage);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateCharCount(value) {
    const maxLength = 500;
    const remaining = maxLength - value.length;
    charCountSpan.textContent = remaining;
    
    // Simple color change based on remaining characters
    if (remaining < 25) {
        charCountContainer.style.color = 'red';
    } else if (remaining < 100) {
        charCountContainer.style.color = 'yellow';
    } else {
        charCountContainer.style.color = '#f0f0f0';
    }
}

function handleCommand(command, fullMsg) {
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    
    if (cmd === '!help') {
        const adminCommands = isUserAdmin ? `
        <li>**!admin** - Switch to the private admin chat.</li>
        <li>**!public** - Switch back to the public chat.</li>
        <li>**!kick [name]** - Kick a user (non-permanent).</li>
        <li>**!banfp [name] [days] [hours] [minutes] [reason]** - Permanent ban using Fingerprint ID (Admin Panel Recommended).</li>
        ` : '';
        
        const helpMessage = `
            <span class="system-content">
                <strong>Available Commands:</strong>
                <ul>
                    <li>**!help** - Shows this list.</li>
                    <li>**!name [newname]** - Change your display name.</li>
                    <li>**!pm [name] [message]** - Send a private message.</li>
                    ${adminCommands}
                </ul>
            </span>
        `;
        appendMessage({ username: 'System', content: helpMessage, timestamp: new Date(), type: 'system' });
    } else if (cmd === '!name') {
        const newName = parts.slice(1).join(' ');
        if (newName) {
            socket.emit('name_change', newName);
        } else {
            appendMessage({ username: 'System', content: 'Usage: !name [newname]', timestamp: new Date(), type: 'system' });
        }
    } else if (cmd === '!pm') {
        const recipientName = parts[1];
        const pmContent = parts.slice(2).join(' ');
        if (recipientName && pmContent) {
            socket.emit('private message', { recipient: recipientName, content: pmContent });
        } else {
            appendMessage({ username: 'System', content: 'Usage: !pm [name] [message]', timestamp: new Date(), type: 'system' });
        }
    } else if (cmd === '!admin' && isUserAdmin) {
        socket.emit('admin:set_context', 'admin_chat');
    } else if (cmd === '!public' && isUserAdmin) {
        socket.emit('admin:set_context', 'public');
    } else if (cmd === '!kick' && isUserAdmin) {
        const targetName = parts[1];
        if (targetName) {
            socket.emit('admin:kick_user', targetName);
        } else {
            appendMessage({ username: 'System', content: 'Usage: !kick [name]', timestamp: new Date(), type: 'system' });
        }
    } else {
        appendMessage({ username: 'System', content: 'Unknown command. Type **!help** for a list of commands.', timestamp: new Date(), type: 'system' });
    }
}


function displayAdminUserList(userMap) {
    currentAdminUserMap = userMap;
    adminUserListEl.innerHTML = '';
    
    // Sort users: Admins first, then alphabetically
    const sortedUsers = Object.values(userMap)
        .sort((a, b) => {
            if (a.isAdmin && !b.isAdmin) return -1;
            if (!a.isAdmin && b.isAdmin) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

    if (sortedUsers.length === 0) {
        adminUserListEl.innerHTML = '<p class="text-secondary text-center">No users online.</p>';
        return;
    }

    sortedUsers.forEach(user => {
        const item = document.createElement('button');
        item.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'justify-content-between', 'align-items-center');
        item.setAttribute('data-target-name', user.displayName);

        const badgeText = user.isAdmin ? 'Admin' : 'User';
        const badgeClass = user.isAdmin ? 'bg-danger' : 'bg-secondary';
        
        item.innerHTML = `
            ${user.displayName} 
            <span class="badge ${badgeClass} rounded-pill">${badgeText}</span>
        `;
        
        // Add click listener to open the action modal
        item.addEventListener('click', () => {
            if (user.isAdmin && user.displayName === displayNameEl.textContent) {
                 alert("You cannot perform actions on yourself.");
                 return;
            }
            actionTargetData = user;
            actionTargetNameEl.textContent = user.displayName;
            actionTargetIpEl.textContent = user.ip || 'N/A';
            actionTargetFpEl.textContent = user.fingerprintId ? user.fingerprintId.substring(0, 8) + '...' : 'N/A'; // Show snippet
            
            // Set up ban form defaults
            banDaysInput.value = 0;
            banHoursInput.value = 1;
            banMinutesInput.value = 0;
            banReasonInput.value = `Violation of chat rules. (Target: ${user.displayName})`;
            
            userActionModal.show();
        });
        
        adminUserListEl.appendChild(item);
    });
}


// --- EVENT LISTENERS ---

// 1. Initial Name Submission
nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (name) {
        socket.emit('check_staff_status', name);
    }
});

// 2. Message Submission
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    
    if (msg) {
        if (msg.startsWith('!')) {
            handleCommand(msg.toLowerCase(), msg);
        } else {
            socket.emit('chat message', { content: msg });
        }
        messageInput.value = '';
        updateCharCount('');
    }
});

// 3. Rename Button
renameBtn.addEventListener('click', () => {
    document.getElementById('rename-input').value = displayNameEl.textContent;
    renameModal.show();
});

// 4. Rename Form Submission
document.getElementById('rename-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newName = document.getElementById('rename-input').value.trim();
    if (newName) {
        socket.emit('name_change', newName);
        renameModal.hide();
    }
});

// 5. Message Input Character Count
messageInput.addEventListener('input', (e) => {
    updateCharCount(e.target.value);
});

// 6. Admin Panel Tab Switching
publicChatTab.addEventListener('click', () => {
    if (currentContext !== 'public' && isUserAdmin) {
        socket.emit('admin:set_context', 'public');
    }
});
adminChatTab.addEventListener('click', () => {
    if (currentContext !== 'admin_chat' && isUserAdmin) {
        socket.emit('admin:set_context', 'admin_chat');
    }
});

// 7. Admin Panel Go Anonymous Button
goAnonBtn.addEventListener('click', () => {
    if (isUserAdmin) {
        socket.emit('admin:go_anonymous');
    }
});

// 8. Admin Panel Modal Events
adminModalEl.addEventListener('show.bs.modal', () => {
    if (isUserAdmin) {
        socket.emit('admin:request_user_map');
    }
});

// 9. Kick Button Action
kickUserBtn.addEventListener('click', () => {
    if (actionTargetData) {
        const targetName = actionTargetData.displayName;
        socket.emit('admin:kick_user', targetName);
        userActionModal.hide();
    }
});

// 10. Clear History Buttons (Pre-confirm)
document.getElementById('clearPublicHistoryBtn').addEventListener('click', (e) => {
    clearConfirmTargetName.textContent = 'Public Chat';
    clearConfirmBtn.setAttribute('data-target-context', 'public');
});
document.getElementById('clearAdminHistoryBtn').addEventListener('click', (e) => {
    clearConfirmTargetName.textContent = 'Admin Chat';
    clearConfirmBtn.setAttribute('data-target-context', 'admin');
});

// 11. Clear History Confirmation
clearConfirmBtn.addEventListener('click', (e) => {
    const context = e.target.getAttribute('data-target-context');
    if (context) {
        socket.emit('admin:clear_history', context);
        clearConfirmModal.hide();
    }
});

// 12. Ban Form Submission (Handles both IP and FPID bans based on button clicked)
banForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!actionTargetData) return;

    const days = parseInt(banDaysInput.value);
    const hours = parseInt(banHoursInput.value);
    const minutes = parseInt(banMinutesInput.value);
    const reason = banReasonInput.value.trim();
    
    if (days === 0 && hours === 0 && minutes === 0) {
        alert('Ban duration must be greater than zero.');
        return;
    }
    if (!reason) {
        alert('A reason is required for the ban.');
        return;
    }

    const targetName = actionTargetData.displayName;

    if (e.submitter.id === 'ipBanSubmitBtn') {
        const targetIp = actionTargetData.ip;
        if (!targetIp) { alert("Could not find IP for user."); return; }
        socket.emit('admin:ip_ban_user', { targetName, targetIp, days, hours, minutes, reason });
    } else if (e.submitter.id === 'fpBanSubmitBtn') {
        const targetFP = actionTargetData.fingerprintId;
        if (!targetFP || targetFP.startsWith('FP_TEMP')) { 
            alert("FPID is temporary or missing. Cannot execute permanent FPID Ban."); 
            return; 
        }
        // This is the core logic that triggers the server's Google Sheets logging
        socket.emit('admin:fp_ban_user', { targetName, targetFP, days, hours, minutes, reason }); 
    }
    
    userActionModal.hide();
});

// 13. FPID Unban Form
unbanFpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fpId = unbanFpInput.value.trim();
    if (fpId) {
        socket.emit('admin:unban_fp', fpId);
        unbanFpInput.value = '';
    }
});


// --- SOCKET RECEIVERS ---

socket.on('chat history', updateMessageDisplay);

socket.on('chat message', (msg) => {
    if (currentContext === 'public') {
        appendMessage(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
});

socket.on('admin chat message', (msg) => {
    if (currentContext === 'admin_chat') {
        appendMessage(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
});

socket.on('user count', (data) => {
    const { userList, usersMap } = data;
    userCountEl.textContent = userList.length;
    
    userListEl.innerHTML = '';
    userList.forEach(name => {
        const item = document.createElement('li');
        item.classList.add('user-list-item');
        item.textContent = name;
        if (usersMap[name] && usersMap[name].isAdmin) {
            item.classList.add('admin-user');
        }
        userListEl.appendChild(item);
    });
});

socket.on('name_rejected', (reason) => {
    alert(reason);
});

socket.on('name_accepted', (name) => {
    displayNameEl.textContent = name;
    container.style.display = 'flex';
    myModal.hide();
    renameBtn.style.display = 'inline-block';
    
    // Clear name input for next time
    nameInput.value = ''; 
});

socket.on('name_updated_ui', (newName) => {
    displayNameEl.textContent = newName;
});

socket.on('system_error', (msg) => {
    alert(`Error: ${msg}`);
});

socket.on('system_alert', (msg) => {
    appendMessage({ username: 'System', content: msg, timestamp: new Date(), type: 'system' });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on('private message', (msg) => {
    appendMessage(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});


socket.on('staff_status_update', (data) => {
    isUserAdmin = data.isAdmin;
    displayNameEl.textContent = data.displayName;
    
    // Toggle Admin UI elements
    adminPanelBtn.style.display = isUserAdmin ? 'block' : 'none';
    adminChatTab.style.display = isUserAdmin ? 'block' : 'none';
    goAnonBtn.style.display = isUserAdmin ? 'block' : 'none';
    renameBtn.style.display = isUserAdmin ? 'none' : 'inline-block';
    
    // Restore context status if admin
    currentContext = data.currentContext || 'public';
    if (currentContext === 'admin_chat') {
        publicChatTab.classList.remove('active');
        adminChatTab.classList.add('active');
    } else {
        publicChatTab.classList.add('active');
        adminChatTab.classList.remove('active');
    }
    
    // Set chat context for command handling
    if (isUserAdmin && currentContext === 'admin_chat') {
        socket.emit('admin:set_context', 'admin_chat'); // Ensure server knows context
    }
});

socket.on('admin_context_switched', (newContext) => {
    currentContext = newContext;
    if (newContext === 'admin_chat') {
        publicChatTab.classList.remove('active');
        adminChatTab.classList.add('active');
    } else {
        publicChatTab.classList.add('active');
        adminChatTab.classList.remove('active');
    }
});

socket.on('admin_user_map', (userMap) => {
    displayAdminUserList(userMap);
});

// Banned Modal Receiver (Triggers on connection if banned, or on ban action)
socket.on('banned_modal', (data) => {
    const banReason = data.reason || 'You are BANNED from the chat.';
    const banDurationMs = data.banDurationMs || 0;
    
    container.style.display = 'none'; // Hide the main chat UI
    
    bannedModalBody.innerHTML = `You are BANNED from the chat.<br>Reason: <strong>${banReason}</strong><br>Time remaining: <span id="banTimer"></span>`;
    bannedModal.show();
    
    // Countdown Timer Logic
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


// --- INITIALIZATION ---
myModal.show();
