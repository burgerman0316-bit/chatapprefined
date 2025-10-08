// chat.js - FINAL SCRIPT WITH ALL FEATURES (now with Device Fingerprint Banning)

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
const charCountSpan = document.getElementById('char-count'); 
const charCountContainer = document.getElementById('charCountContainer'); 

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');
const adminUserListEl = document.getElementById('admin-user-list'); // NEW REFERENCE

const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminModalEl = document.getElementById('adminPanelModal'); 
const renameBtn = document.getElementById('renameBtn');

// Chat Context Tabs
const publicChatTab = document.getElementById('publicChatTab');
const adminChatTab = document.getElementById('adminChatTab');

// Modal Elements for Clear History
const clearConfirmModalEl = document.getElementById('clearConfirmModal');
const clearConfirmModal = new bootstrap.Modal(clearConfirmModalEl);
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmTargetName = document.getElementById('clearConfirmTargetName');

// Modal Elements for Kick Confirmation (Manage User)
const kickConfirmModalEl = document.getElementById('kickConfirmModal');
const kickConfirmModal = new bootstrap.Modal(kickConfirmModalEl);
const kickConfirmBody = document.getElementById('kickConfirmBody');

// Modal Elements for Fingerprint Ban
const banModalEl = document.getElementById('ipBanModal');
const banModal = new bootstrap.Modal(banModalEl);
const banConfirmBtn = document.getElementById('banConfirmBtn');
const banTargetNameSpan = document.getElementById('banTargetName');
const banTargetFPIDSpan = document.getElementById('banTargetIp'); // Reusing ID for Fingerprint ID
const banDurationDaysInput = document.getElementById('banDurationDays');
const banDurationHoursInput = document.getElementById('banDurationHours');
const banDurationMinutesInput = document.getElementById('banDurationMinutes');
const banReasonInput = document.getElementById('banReason');

let displayName = '';
let isAdmin = false;
let userToKick = null; 
let userFingerprintIdToBan = null; // RENAMED VARIABLE
let currentChatContext = 'public'; 
const MAX_CHARS = 500;
const ADMIN_CHAT_ID = 'admin_chat';

// --- Initial Setup ---
let visitorId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get Device Fingerprint ID
    if (window.FingerprintJS) {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        visitorId = result.visitorId;
        console.log('Device Fingerprint ID:', visitorId);
    } else {
        // Fallback for browsers without FingerprintJS support (or if CDN fails)
        visitorId = 'NO_FP_FALLBACK_' + Math.random().toString(36).substring(2, 15);
    }
    
    // 2. Send FP ID to server immediately after connection
    socket.emit('client:send_fingerprint_id', visitorId);
    
    // 3. Show Name Modal after sending FP ID
    myModal.show();
});

// Utility: Appends a message to the chat
function appendMessage(msg) {
    const item = document.createElement('li');
    item.classList.add('msg');
    
    const time = new Date(msg.timestamp);
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeHtml = `<span class="timestamp">${timeString}</span>`; 

    if (msg.type === 'system') {
        item.classList.add('system');
        item.textContent = msg.content;
    } else if (msg.username === displayName || (msg.username === 'You' && msg.isPrivate)) {
        item.classList.add('own');
        item.innerHTML = `${msg.content} ${timeHtml}`;
    } else {
        item.classList.add('other');
        if (msg.isAdmin) { 
            item.classList.add('admin-msg'); 
        }
        
        const nameDisplay = msg.isPrivate ? `Private from ${msg.username}` : msg.username;
        const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${msg.content} ${timeHtml}`;
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Utility: Updates the online user list for ALL clients (Public list)
function updatePublicUserList(data) {
    const userList = data.userList; // Sorted list of display names
    const publicUserMap = data.usersMap; // Map of displayName -> { isAdmin }
    
    // 1. Public Info Panel
    userCountEl.textContent = userList.length;
    userListEl.innerHTML = '';
    
    userList.forEach(userDisplayName => {
        const li = document.createElement('li');
        
        // Find user status
        const userEntry = publicUserMap[userDisplayName] || {};
        
        li.textContent = userDisplayName;
        
        // FIX: Display MOD tag in the public list
        if (userEntry.isAdmin) { 
             li.textContent += ' (MOD)'; 
             li.classList.add('admin-name-list'); 
        }
        
        li.title = `Click to send private message to ${userDisplayName}`;
        li.addEventListener('click', () => {
             messageInputDiv.innerText = `/msg ${userDisplayName} `;
             messageInputDiv.focus();
        });
        userListEl.appendChild(li);
    });
}

// Utility: Updates the admin management list (Admin only)
function updateAdminManagementList(adminUsersMap) {
    if (!isAdmin) return; // Should only run for admins

    adminUserListEl.innerHTML = ''; 
    
    // Iterate over the full admin map (includes Fingerprint ID)
    Object.keys(adminUsersMap).forEach(key => {
         const user = adminUsersMap[key];
         const userDisplayName = user.displayName;
         
         // Only display users in public chat or currently logged-in admins
         // Also skip users who haven't set their name yet
         if (user.chatContext !== 'public' && !user.isAdmin) return;
         if (userDisplayName === 'Connecting...') return;
         
         const adminLi = document.createElement('li');
         adminLi.textContent = userDisplayName;
         
         if (user.isAdmin) {
             adminLi.textContent += ' (MOD)';
             adminLi.classList.add('admin-name-list');
         }
         
         adminLi.addEventListener('click', () => {
             if (userDisplayName === displayName) {
                  alert('Cannot manage yourself!');
                  return;
             }
             
             userToKick = userDisplayName; 
             userFingerprintIdToBan = user.fingerprintId; // CHANGED to Fingerprint ID
             
             // Update modal body to reflect Fingerprint ID
             kickConfirmBody.innerHTML = `Manage user: <strong>${userDisplayName}</strong><br>Fingerprint ID: ${user.fingerprintId}<br>Admin Status: ${user.isAdmin ? 'Yes' : 'No'}`;
             
             const adminModal = bootstrap.Modal.getInstance(adminModalEl);
             if (adminModal) adminModal.hide(); 
             kickConfirmModal.show();
         });
         
         adminUserListEl.appendChild(adminLi);
    });
}

// Utility: Switches the chat window (Public vs Admin)
function switchChatContext(contextId) {
    if (!isAdmin && contextId === ADMIN_CHAT_ID) return;
    
    currentChatContext = contextId;
    messagesDiv.innerHTML = ''; 
    
    // Update tabs
    if (contextId === ADMIN_CHAT_ID) {
        adminChatTab.classList.add('active');
        publicChatTab.classList.remove('active');
        document.getElementById('chatTitle').textContent = 'Admin Chat';
    } else {
        adminChatTab.classList.remove('active');
        publicChatTab.classList.add('active');
        document.getElementById('chatTitle').textContent = 'Public Chat';
    }
    
    // Tell the server to switch context and send history
    socket.emit('admin:set_context', contextId);
}

// --- Event Listeners ---

// 1. Handle Login Form Submission
nameForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    // Check staff status is called, which also validates the fingerprint is set on server
    socket.emit('check_staff_status', name); 
});

// 2. Handle Message Form Submission 
messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const content = messageInputDiv.innerText.trim();
    
    messageInputDiv.innerText = ''; 
    charCountSpan.textContent = `0/${MAX_CHARS}`; 
    charCountContainer.style.color = '#ccc'; // Reset color

    if (!content || content.length > MAX_CHARS) return;

    // Command Check
    if (content.startsWith('/')) {
        const parts = content.split(' ');
        const command = parts[0].toLowerCase();
        const args = content.substring(command.length).trim();

        if (command === '/msg') {
            const match = args.match(/^(\S+)\s+(.*)/s); 
            if (match) {
                const recipient = match[1];
                const dmContent = match[2];
                if (recipient && dmContent && currentChatContext === 'public') {
                    socket.emit('private message', { recipient: recipient, content: dmContent });
                } else {
                    appendMessage({ username: 'System', content: 'Invalid /msg command or only available in public chat.', timestamp: new Date(), type: 'system' });
                }
            } else {
                 appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), type: 'system' });
            }
        } 
        else if (command === '/kick') { 
            if (!isAdmin) {
                 appendMessage({ username: 'System', content: 'You do not have permission to use the /kick command.', timestamp: new Date(), type: 'system' });
                 return;
            }
            if (args) {
                socket.emit('admin:kick_user', { targetName: args, adminName: displayName });
            } else {
                appendMessage({ username: 'System', content: 'Invalid /kick command. Usage: /kick [username]', timestamp: new Date(), type: 'system' });
            }
        }
        else if (command === '/clear') {
            if (isAdmin) {
                clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
                clearConfirmModal.show();
            } else {
                appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date(), type: 'system' });
            }
        }
        else {
            appendMessage({ username: 'System', content: `Unknown command: ${command}`, timestamp: new Date(), type: 'system' });
        }
    } else {
        // Regular public/admin chat message
        socket.emit('chat message', { content });
    }
});

// 3. Input Character Counter (Visibility improved via CSS)
messageInputDiv.addEventListener('input', () => {
    const currentLength = messageInputDiv.innerText.length;
    if (currentLength > MAX_CHARS) {
        messageInputDiv.innerText = messageInputDiv.innerText.substring(0, MAX_CHARS);
        charCountSpan.textContent = `${MAX_CHARS}/${MAX_CHARS}`;
    } else {
        charCountSpan.textContent = `${currentLength}/${MAX_CHARS}`;
    }
    // Style change
    if (currentLength >= MAX_CHARS * 0.9) {
        charCountContainer.style.color = '#ff4d4d';
    } else {
        charCountContainer.style.color = '#ccc';
    }
});

// Ensure Enter sends message
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// 4. Admin Panel Button Handlers
document.getElementById('clearChatBtn').addEventListener('click', () => {
    clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
    clearConfirmModal.show();
    const adminModal = bootstrap.Modal.getInstance(adminModalEl);
    if (adminModal) adminModal.hide();
});

// 5. Clear History Confirmation Click
clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:clear_history', currentChatContext);
    }
    clearConfirmModal.hide();
});

// 6. Admin: Kick User Confirmation Click Handler (Step 1: Open Ban Modal)
document.getElementById('kickToBanBtn').addEventListener('click', () => {
    kickConfirmModal.hide();
    // Check for Fingerprint ID instead of IP
    if (isAdmin && userToKick && userFingerprintIdToBan) {
        banTargetNameSpan.textContent = userToKick;
        banTargetFPIDSpan.textContent = userFingerprintIdToBan; // Display Fingerprint ID
        banDurationDaysInput.value = '0';
        banDurationHoursInput.value = '0';
        banDurationMinutesInput.value = '30';
        banReasonInput.value = 'Spam/Hate Speech';
        banModal.show();
    } else {
        userToKick = null;
        userFingerprintIdToBan = null; 
    }
});

// 7. Admin: Kick User Directly (Skip Ban Modal)
document.getElementById('kickDirectlyBtn').addEventListener('click', () => {
    if (isAdmin && userToKick) {
        socket.emit('admin:kick_user', { targetName: userToKick, adminName: displayName });
    }
    kickConfirmModal.hide();
    userToKick = null;
    userFingerprintIdToBan = null; 
});


// 8. Admin: Fingerprint Ban Confirmation Click Handler (Step 2: Send Ban to Server)
banConfirmBtn.addEventListener('click', () => {
    // Check for Fingerprint ID instead of IP
    if (isAdmin && userToKick && userFingerprintIdToBan) {
        const days = parseInt(banDurationDaysInput.value) || 0;
        const hours = parseInt(banDurationHoursInput.value) || 0;
        const minutes = parseInt(banDurationMinutesInput.value) || 0;
        const reason = banReasonInput.value.trim();
        
        // Emit Fingerprint ban event
        socket.emit('admin:fp_ban_user', { // CHANGED EVENT NAME
            targetName: userToKick,
            targetFingerprintId: userFingerprintIdToBan, // CHANGED KEY
            days: days,
            hours: hours,
            minutes: minutes,
            reason: reason,
            adminName: displayName
        });

        banModal.hide();
        userToKick = null;
        userFingerprintIdToBan = null; // CHANGED
    }
});

// 9. Admin: Fingerprint Unban Form Handler
document.getElementById('unban-form').addEventListener('submit', e => {
    e.preventDefault();
    const unbanInput = document.getElementById('unban-fp-input');
    const fpIdToUnban = unbanInput.value.trim();
    if (isAdmin && fpIdToUnban) {
        socket.emit('admin:unban_fp', fpIdToUnban); // CHANGED EVENT NAME
        unbanInput.value = '';
    }
});

// --- Server Events ---

// 10. Server: Name Acceptance and UI Switch
socket.on('name_accepted', name => {
    displayName = name;
    displayNameEl.textContent = name;
    container.style.display = 'flex'; // Show main UI
    myModal.hide(); // Hide name modal
    renameBtn.style.display = 'inline-block'; // Show rename button
});

// 11. Server: Staff Status Update (Used for both login and 'Go Anonymous')
socket.on('staff_status_update', data => {
    isAdmin = data.isAdmin;
    displayName = data.displayName;
    displayNameEl.textContent = displayName;
    container.style.display = 'flex';
    myModal.hide();
    renameBtn.style.display = 'inline-block'; 
    adminPanelBtn.style.display = isAdmin ? 'inline-block' : 'none';
    adminChatTab.style.display = isAdmin ? 'inline-block' : 'none';
    document.getElementById('adminLogoutBtn').style.display = isAdmin ? 'inline-block' : 'none';

    // If context was switched while in anonymous mode, switch back to public
    if (!isAdmin && currentChatContext === ADMIN_CHAT_ID) {
        switchChatContext('public');
    }
    
    // Admins get chat history after context switch event is sent
    if (isAdmin && data.currentContext === ADMIN_CHAT_ID) {
         switchChatContext(ADMIN_CHAT_ID); 
    } else {
         switchChatContext('public'); // Reset public chat history on admin login
    }
});

// 12. Server: Banned Modal Display (Based on Fingerprint ID)
socket.on('banned_modal', ({ reason, banDurationMs }) => {
    // Set up modal elements
    const bannedModalEl = document.getElementById('bannedModal');
    const bannedModal = new bootstrap.Modal(bannedModalEl);
    const bannedModalBody = document.getElementById('bannedModalBody');
    
    // Disconnect the socket connection
    socket.disconnect();
    
    bannedModalBody.innerHTML = `You are BANNED from the chat (by Fingerprint ID).<br>Reason: <strong>${reason}</strong><br>Time remaining: <span id="banTimer"></span>`;
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

// 13. Server: Name Rejection
socket.on('name_rejected', reason => {
    alert(reason);
});

// 14. Server: Regular Chat Message
socket.on('chat message', msg => {
    if (currentChatContext === 'public') {
        appendMessage(msg);
    }
});

// 15. Server: Admin Chat Message
socket.on('admin chat message', msg => {
    if (currentChatContext === ADMIN_CHAT_ID) {
        appendMessage(msg);
    }
});

// 16. Server: Private Message
socket.on('private message', msg => {
    if (currentChatContext === 'public') {
        appendMessage({ ...msg, isPrivate: true, username: msg.senderName });
    }
});

// 17. Server: User Count Update (Public list)
socket.on('user count', updatePublicUserList);

// 18. Server: Admin User Map Update (Admin management list)
socket.on('admin_user_map', updateAdminManagementList);

// 19. Server: Chat History
socket.on('chat history', history => {
    messagesDiv.innerHTML = '';
    history.forEach(appendMessage);
});

// 20. Server: System Alerts/Errors (Self-Targeted)
socket.on('system_alert', content => {
    appendMessage({ username: 'System', content: `[ALERT] ${content}`, timestamp: new Date(), type: 'system' });
});

socket.on('system_error', content => {
     appendMessage({ username: 'System', content: `[ERROR] ${content}`, timestamp: new Date(), type: 'system' });
});

// 21. Server: Admin Context Switched (Tells client history is loaded)
socket.on('admin_context_switched', newContext => {
    console.log(`Switched to context: ${newContext}`);
});

// 22. Server: Name updated UI
socket.on('name_updated_ui', newName => {
    displayName = newName;
    displayNameEl.textContent = newName;
    document.getElementById('new-name-input').value = newName;
});
// 23. Server: Kick confirmation 
socket.on('kick_received', msg => {
    if (msg.reason) {
         appendMessage({ username: 'System', content: `You were kicked for: ${msg.reason}`, timestamp: new Date(), type: 'system' });
    }
    socket.disconnect();
});


// 24. Rename Modal Handlers
document.getElementById('renameBtn').addEventListener('click', () => {
    document.getElementById('new-name-input').value = displayName;
    renameModal.show();
});

document.getElementById('rename-form').addEventListener('submit', e => {
    e.preventDefault();
    const newName = document.getElementById('new-name-input').value.trim();
    if (newName) {
        socket.emit('name_change', newName);
        renameModal.hide();
    }
});

// 25. Admin Go Anonymous Button
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to go anonymous?')) {
        socket.emit('admin:go_anonymous');
    }
});
