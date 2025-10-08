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
const charCountSpan = document.getElementById('char-count'); 
const charCountContainer = document.getElementById('charCountContainer'); 

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');
const adminUserListEl = document.getElementById('admin-user-list'); 
const bannedUserListEl = document.getElementById('banned-user-list'); // NEW REFERENCE

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

// Modal Elements for IP Ban
const banModalEl = document.getElementById('ipBanModal');
const banModal = new bootstrap.Modal(banModalEl);
const banConfirmBtn = document.getElementById('banConfirmBtn');
const banTargetNameSpan = document.getElementById('banTargetName');
const banDurationDaysInput = document.getElementById('banDurationDays');
const banDurationHoursInput = document.getElementById('banDurationHours');
const banDurationMinutesInput = document.getElementById('banDurationMinutes');
const banReasonInput = document.getElementById('banReason');

let displayName = '';
let isAdmin = false;
let userToKick = null; 
let userIpToBan = null; 
let currentChatContext = 'public'; 
const MAX_CHARS = 500;
const ADMIN_CHAT_ID = 'admin_chat';

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
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
    } 
    // OWN MESSAGE (Public or Private)
    // Check if the message username matches the current user's display name
    else if (msg.username === displayName) {
        item.classList.add('own');
        
        // This is the fix to always show the name on your own messages
        const nameDisplay = msg.isPrivate ? `You to ${msg.recipient}` : displayName;
        const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
        
        // RENDER OWN NAME
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${msg.content} ${timeHtml}`;

    } 
    // OTHER MESSAGES (Public or Private)
    else {
        item.classList.add('other');
        
        // This is the fix for the gold border on admin-sent messages
        if (msg.isAdmin) { 
            item.classList.add('admin-msg'); // Admin gold border/style
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
        
        // Display MOD tag in the public list
        if (userEntry.isAdmin) { 
             li.textContent += ' (MOD)'; 
             li.classList.add('admin-name-list'); 
        }
        
        li.title = `Click to send private message to ${userDisplayName}`;
        li.addEventListener('click', () => {
             // Only allow PM in public chat context
             if (currentChatContext === 'public' && userDisplayName !== displayName) {
                 messageInputDiv.innerText = `/msg ${userDisplayName} `;
                 messageInputDiv.focus();
             } else {
                 appendMessage({ username: 'System', content: 'Private messages are only available in the public chat.', timestamp: new Date(), type: 'system' });
             }
        });
        userListEl.appendChild(li);
    });
}

// Utility: Updates the admin management list (Admin only)
function updateAdminManagementList(adminUsersMap) {
    if (!isAdmin) return; // Should only run for admins

    adminUserListEl.innerHTML = ''; 
    
    // Iterate over the full admin map (includes IP)
    Object.keys(adminUsersMap).forEach(key => {
         const user = adminUsersMap[key];
         const userDisplayName = user.displayName;
         
         // Only display users in public chat or currently logged-in admins
         if (user.chatContext !== 'public' && !user.isAdmin) return;
         
         const adminLi = document.createElement('li');
         adminLi.textContent = userDisplayName;
         
         if (user.isAdmin) {
             adminLi.textContent += ' (MOD)';
             adminLi.classList.add('admin-name-list');
         }
         
         adminLi.addEventListener('click', () => {
             if (userDisplayName.toLowerCase() === displayName.toLowerCase()) {
                  alert('Cannot manage yourself!');
                  return;
             }
             
             userToKick = userDisplayName; 
             userIpToBan = user.ip; 
             
             kickConfirmBody.innerHTML = `Manage user: <strong>${userDisplayName}</strong><br>IP: ${user.ip}<br>Admin Status: ${user.isAdmin ? 'Yes' : 'No'}`;
             
             const adminModal = bootstrap.Modal.getInstance(adminModalEl);
             if (adminModal) adminModal.hide(); 
             kickConfirmModal.show();
         });
         
         adminUserListEl.appendChild(adminLi);
    });
}

// Utility: Updates the IP Ban list (Admin only)
function updateBannedList(banList) {
    if (!isAdmin) return;
    
    bannedUserListEl.innerHTML = '';
    
    // Sort bans alphabetically by last known name
    banList.sort(([, a], [, b]) => (a.lastDisplayName || '').localeCompare(b.lastDisplayName || ''));
    
    banList.forEach(item => {
        const [ip, banData] = item;
        const li = document.createElement('li');
        
        const nameDisplay = banData.lastDisplayName || 'Unknown User';
        
        // Display last known name and IP
        li.innerHTML = `<strong>${nameDisplay}</strong> (${ip}) - <small>${banData.reason}</small>`;
        
        // Add unban button
        const unbanBtn = document.createElement('button');
        unbanBtn.classList.add('btn', 'btn-sm', 'btn-success', 'ms-2');
        unbanBtn.textContent = 'Unban';
        
        unbanBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the li click event if one existed
            if (confirm(`Are you sure you want to unban ${nameDisplay} (${ip})?`)) {
                socket.emit('admin:ip_unban_user', ip);
            }
        });
        
        li.appendChild(unbanBtn);
        bannedUserListEl.appendChild(li);
    });
    
    if (banList.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No active IP bans.';
        li.style.cursor = 'default';
        bannedUserListEl.appendChild(li);
    }
}

// Utility: Switches the chat window (Public vs Admin)
function switchChatContext(contextId) {
    // Prevent non-admins from switching to admin chat
    if (!isAdmin && contextId === ADMIN_CHAT_ID) {
        appendMessage({ username: 'System', content: 'You do not have permission to access the Admin Chat.', timestamp: new Date(), type: 'system' });
        return;
    }
    
    currentChatContext = contextId;
    messagesDiv.innerHTML = ''; 
    
    // Update tabs
    if (contextId === ADMIN_CHAT_ID) {
        adminChatTab.classList.add('active');
        publicChatTab.classList.remove('active');
        document.getElementById('chatTitle').textContent = 'Admin Chat';
        document.getElementById('msg-btn').textContent = 'Send (Admin)';
        
    } else {
        adminChatTab.classList.remove('active');
        publicChatTab.classList.add('active');
        document.getElementById('chatTitle').textContent = 'Public Chat';
        document.getElementById('msg-btn').textContent = 'Send';
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
    socket.emit('check_staff_status', name);
});

// 2. Handle Message Form Submission 
messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const content = messageInputDiv.innerText.trim();
    
    // Reset input and counter before potentially sending
    messageInputDiv.innerText = ''; 
    charCountSpan.textContent = `0/${MAX_CHARS}`; 
    charCountContainer.style.color = '#ccc'; 

    if (!content || content.length > MAX_CHARS) return;

    // Command Check
    if (content.startsWith('/')) {
        const parts = content.split(' ');
        const command = parts[0].toLowerCase();
        const args = content.substring(command.length).trim();

        if (command === '/msg') {
            if (currentChatContext !== 'public') {
                appendMessage({ username: 'System', content: 'The /msg command is only available in the Public Chat.', timestamp: new Date(), type: 'system' });
                return;
            }
            const match = args.match(/^(\S+)\s+(.*)/s); 
            if (match) {
                const recipient = match[1];
                const dmContent = match[2];
                if (recipient && dmContent) {
                    socket.emit('private message', { recipient: recipient, content: dmContent, isPrivate: true });
                } else {
                    appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), type: 'system' });
                }
            } else {
                 appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), type: 'system' });
            }
        } 
        else if (command === '/kick' || command === '/clear') {
            // These commands are blocked in the chat to encourage using the Admin Panel
            appendMessage({ username: 'System', content: `Please use the Admin Panel buttons for the ${command} command.`, timestamp: new Date(), type: 'system' });
        }
        else {
             appendMessage({ username: 'System', content: `Unknown command: ${command}`, timestamp: new Date(), type: 'system' });
        }
    } else {
        // Regular public/admin chat message
        socket.emit('chat message', { content, isPrivate: false }); 
    }
});

// 3. Input Character Counter (Visibility improved via CSS)
messageInputDiv.addEventListener('input', () => {
    const rawText = messageInputDiv.innerText;
    const currentLength = rawText.length;
    
    if (currentLength > MAX_CHARS) {
        // Truncate the text inside the contenteditable div
        messageInputDiv.innerText = rawText.substring(0, MAX_CHARS);
        // Recalculate length after truncation
        const correctedLength = messageInputDiv.innerText.length;
        charCountSpan.textContent = `${correctedLength}/${MAX_CHARS}`;
    } else {
        // Character count fix: ensure it doesn't go below 0
        const displayLength = Math.max(0, currentLength);
        charCountSpan.textContent = `${displayLength}/${MAX_CHARS}`;
        
        // Style change
        if (displayLength >= MAX_CHARS * 0.9) {
            charCountContainer.style.color = '#ff4d4d'; 
        } else {
            charCountContainer.style.color = '#ccc'; 
        }
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
    
    if (isAdmin && userToKick && userIpToBan) {
        banTargetNameSpan.textContent = userToKick;
        banDurationDaysInput.value = '0';
        banDurationHoursInput.value = '0';
        banDurationMinutesInput.value = '30';
        banReasonInput.value = 'Spam/Hate Speech';
        banModal.show();
    } else {
         userToKick = null; 
         userIpToBan = null;
    }
});

// 7. Admin: Kick User Directly (Skip Ban Modal)
document.getElementById('kickDirectlyBtn').addEventListener('click', () => {
     if (isAdmin && userToKick) {
         socket.emit('admin:kick_user', { targetName: userToKick });
     }
     kickConfirmModal.hide();
     userToKick = null;
     userIpToBan = null;
});


// 8. Admin: IP Ban Submission
banConfirmBtn.addEventListener('click', () => {
    if (!isAdmin || !userToKick || !userIpToBan) {
        banModal.hide();
        return;
    }
    
    const days = parseInt(banDurationDaysInput.value);
    const hours = parseInt(banDurationHoursInput.value);
    const minutes = parseInt(banDurationMinutesInput.value);
    const reason = banReasonInput.value;
    
    if (isNaN(days) || isNaN(hours) || isNaN(minutes) || (days === 0 && hours === 0 && minutes === 0) || days > 999 || hours > 99 || minutes > 99) {
        alert('Invalid duration. Max: 999 days, 99 hours, 99 minutes. Duration must be > 0.');
        return;
    }
    
    socket.emit('admin:ip_ban_user', { 
        targetName: userToKick,
        targetIp: userIpToBan, 
        days: days, 
        hours: hours, 
        minutes: minutes,
        reason: reason
    });
    
    banModal.hide(); 
    userToKick = null; 
    userIpToBan = null;
});

// 9. Admin: Log out (Go Anonymous)
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:go_anonymous');
    }
});

// 10. Chat Tab Switches
publicChatTab.addEventListener('click', () => switchChatContext('public'));
adminChatTab.addEventListener('click', () => switchChatContext(ADMIN_CHAT_ID));

// 11. Rename form submission
document.getElementById('rename-form').addEventListener('submit', e => {
    e.preventDefault();
    const newName = document.getElementById('new-name-input').value.trim();
    if (newName) {
        socket.emit('name_change', newName);
    }
    renameModal.hide();
});

// 12. Enable rename button after successful login
renameBtn.addEventListener('click', () => {
    document.getElementById('new-name-input').value = displayName;
    renameModal.show();
});

// --- Socket Events ---

// Shared function to handle successful login
function handleSuccessfulLogin(data) {
    displayName = data.displayName;
    isAdmin = data.isAdmin || false; 
    displayNameEl.textContent = displayName + (isAdmin ? ' (MOD)' : '');
    currentChatContext = data.currentContext || 'public';
    
    myModal.hide(); 
    container.style.display = 'flex'; 

    adminPanelBtn.style.display = isAdmin ? 'block' : 'none';
    renameBtn.style.display = 'block';
    document.getElementById('adminLogoutBtn').style.display = isAdmin ? 'block' : 'none'; 
    adminChatTab.style.display = isAdmin ? 'block' : 'none';
    
    if (isAdmin && currentChatContext === ADMIN_CHAT_ID) {
        switchChatContext(ADMIN_CHAT_ID); // Ensure tabs are set correctly
    } else {
        switchChatContext('public'); // Ensure tabs are set correctly
    }
}

// 1. Successful Name/Staff Status
socket.on('name_accepted', name => {
    handleSuccessfulLogin({ displayName: name, isAdmin: false, currentContext: 'public' });
});

// 2. Staff Status Update (Used for admin login/re-login and go anonymous)
socket.on('staff_status_update', data => {
    handleSuccessfulLogin(data);
});

// 3. Name Rejected/Error
socket.on('name_rejected', message => {
    alert(`Login Failed: ${message}`);
    nameInput.focus();
});

// 4. Update Chat Message
socket.on('chat message', msg => {
    appendMessage(msg);
});

// 5. Update Chat History
socket.on('chat history', history => {
    messagesDiv.innerHTML = '';
    history.forEach(appendMessage);
});

// 6. Update User Count/List
socket.on('user count', data => {
    updatePublicUserList(data);
});

// 7. Update Admin User Map
socket.on('admin_user_map', adminUsersMap => {
    updateAdminManagementList(adminUsersMap);
});

// 8. Update Admin Ban List
socket.on('admin:ban_list', banList => {
    updateBannedList(banList);
});

// 9. Admin Chat Message (only received if in Admin room)
socket.on('admin chat message', msg => {
    if (currentChatContext === ADMIN_CHAT_ID) {
        appendMessage(msg);
    }
});

// 10. History Cleared Notification
socket.on('admin:history_cleared', data => {
    if (data.targetChatId === currentChatContext) {
        messagesDiv.innerHTML = '';
        appendMessage(data.clearMsg);
    }
    // Also append to the other chat if it's a system message that should be seen everywhere
    if (data.targetChatId === 'public') {
        // Do nothing, the server already broadcast the system message to public and admin chat history.
    }
});

// 11. System Alerts (non-fatal, like name change alerts)
socket.on('system_alert', message => {
    appendMessage({ username: 'System', content: message, timestamp: new Date(), type: 'system' });
});

// 12. System Error (fatal, requires action)
socket.on('system_error', message => {
    alert(message);
    appendMessage({ username: 'System', content: `[ERROR] ${message}`, timestamp: new Date(), type: 'system' });
});

// 13. Name update UI only
socket.on('name_updated_ui', newName => {
    displayName = newName;
    displayNameEl.textContent = displayName + (isAdmin ? ' (MOD)' : '');
    // Renames do not change context, history re-send happens naturally.
});

// 14. Trigger Login Modal
socket.on('show_login_modal', () => {
    myModal.show();
});

// 15. Banned Modal
socket.on('banned_modal', data => {
    const bannedModalEl = document.getElementById('bannedModal');
    const bannedModal = new bootstrap.Modal(bannedModalEl);
    const bannedModalBody = document.getElementById('bannedModalBody');
    const banReason = data.reason || 'Banned by Moderator';
    const banDurationMs = data.banDurationMs;
    
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
