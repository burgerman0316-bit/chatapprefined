// chat.js - FIXED VERSION FOR LOGIN AND MSG COMMANDS

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

// Modal Elements for IP Ban
const banModalEl = document.getElementById('ipBanModal');
const banModal = new bootstrap.Modal(banModalEl);
const banConfirmBtn = document.getElementById('banConfirmBtn');
const banTargetNameSpan = document.getElementById('banTargetName');
const banDurationDaysInput = document.getElementById('banDurationDays');
const banDurationHoursInput = document.getElementById('banDurationHours');
const banDurationMinutesInput = document.getElementById('banDurationMinutes');
const banReasonInput = document.getElementById('banReason');
const banTypeSelect = document.getElementById('banType');

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

// ============================================
// CLIENT-SIDE: Update public/chat.js
// ============================================
// Add at the TOP of chat.js (after socket connection):

let deviceFingerprint = '';

// Generate fingerprint on page load
(async () => {
    deviceFingerprint = await generateDeviceFingerprint();
    console.log('Device Fingerprint Generated:', deviceFingerprint);
})();

// Utility: Generate a device fingerprint
async function generateDeviceFingerprint() {
    // In a real implementation, this would use a more robust fingerprinting method
    // For this example, we'll use a simple approach with browser properties
    const fingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        screen.colorDepth,
        navigator.platform,
        navigator.hardwareConcurrency,
        Math.round(window.devicePixelRatio * 100)
    ].join('|');
    
    // Simple hash function to create a consistent fingerprint
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

// UPDATE the 'check_staff_status' event to include fingerprint:
socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    if (!name) return;
    
    // Send fingerprint along with name
    socket.emit('check_staff_status', { name, fingerprint: deviceFingerprint });
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
        // --- FINAL FIXED LOGIC: Ensures name display structure is correct ---
        item.classList.add('own');
        
        // Use 'You' for private message confirmations, otherwise use their displayName
        const nameDisplay = (msg.username === 'You' && msg.isPrivate) 
            ? 'You' 
            : msg.username;
            
        // Add a special class for private messages for potential styling
        const nameClass = (msg.isPrivate) 
            ? 'sender-name private-name' 
            : 'sender-name';
            
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${msg.content} ${timeHtml}`;
        // ------------------------------------------------------------------
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
             if (userDisplayName === displayName) {
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
            // FIXED: Properly handle spaces in usernames with quotes
            // This regex handles both quoted and unquoted names with spaces
            const match = args.match(/^(".*?"|[^\\s]+)(\\s+(.*))?$/);
            if (match) {
                // Extract recipient (handle quoted names)
                let recipient = match[1];
                if (recipient.startsWith('"') && recipient.endsWith('"')) {
                    recipient = recipient.slice(1, -1); // Remove quotes
                }
                const dmContent = match[3] || '';
                if (recipient && dmContent && currentChatContext === 'public') {
                    socket.emit('private message', { recipient: recipient, content: dmContent });
                } else {
                    appendMessage({ username: 'System', content: 'Invalid /msg command or only available in public chat.', timestamp: new Date(), type: 'system' });
                }
            } else {
                 appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg "username with spaces" [message] or /msg username [message]', timestamp: new Date(), type: 'system' });
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
        else if (command === '/machinegun') {
            if (!isAdmin) {
                appendMessage({ username: 'System', content: 'You do not have permission to use the /machinegun command.', timestamp: new Date(), type: 'system' });
                return;
            }
            if (args) {
                socket.emit('admin:machine_gun', { targetName: args });
            } else {
                appendMessage({ username: 'System', content: 'Invalid /machinegun command. Usage: /machinegun [username]', timestamp: new Date(), type: 'system' });
            }
        } else {
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
    
    if (isAdmin && userToKick && userIpToBan) {
        banTargetNameSpan.textContent = userToKick;
        banDurationDaysInput.value = '0';
        banDurationHoursInput.value = '0';
        banDurationMinutesInput.value = '30';
        banReasonInput.value = 'Spam/Hate Speech';
        banTypeSelect.value = 'ip';
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
    const banType = banTypeSelect.value;
    
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
        reason: reason,
        banType: banType
    });
    
    banModal.hide(); 
    userToKick = null; 
    userIpToBan = null;
});

// 9. Admin: Machine Gun Button Click
document.getElementById('machineGunBtn').addEventListener('click', () => {
    if (!isAdmin) return;
    const targetName = prompt('Enter username to spam:');
    if (targetName) {
        socket.emit('admin:machine_gun', { targetName });
    }
});

// 10. Admin: Unban Device Button Click
document.getElementById('unbanDeviceBtn').addEventListener('click', () => {
    if (!isAdmin) return;
    const fingerprint = prompt('Enter device fingerprint to unban:');
    if (fingerprint) {
        socket.emit('admin:unban_device', fingerprint);
    }
});

// 11. Admin: Log out (Go Anonymous)
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:go_anonymous');
    }
});

// 12. Chat Tab Switches
publicChatTab.addEventListener('click', () => switchChatContext('public'));
adminChatTab.addEventListener('click', () => switchChatContext(ADMIN_CHAT_ID));

// 13. Rename form submission
document.getElementById('rename-form').addEventListener('submit', e => {
    e.preventDefault();
    const newName = document.getElementById('new-name-input').value.trim();
    if (newName) {
        socket.emit('name_change', newName);
    }
    renameModal.hide();
});

// 14. Enable rename button after successful login
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
    
    // Show/hide machine gun and unban device buttons
    document.getElementById('machineGunBtn').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('unbanDeviceBtn').style.display = isAdmin ? 'block' : 'none';
    
    if (isAdmin && currentChatContext === ADMIN_CHAT_ID) {
        switchChatContext(ADMIN_CHAT_ID);
    } else {
        switchChatContext('public');
    }
}

// Login Success events
socket.on('name_accepted', name => {
    handleSuccessfulLogin({ displayName: name, isAdmin: false });
});
socket.on('staff_status_update', data => {
    handleSuccessfulLogin(data);
});

// Login Errors & Rejections
socket.on('name_rejected', msg => {
    alert(`Login Failed: ${msg}`);
});

// UI update after name change
socket.on('name_updated_ui', newName => {
    displayName = newName;
    displayNameEl.textContent = displayName + (isAdmin ? ' (MOD)' : '');
});

// Admin Context Switched
socket.on('admin_context_switched', newContext => {
    currentChatContext = newContext;
});

// Chat Events (Both Public and Private)
socket.on('chat history', history => {
    messagesDiv.innerHTML = ''; 
    history.forEach(msg => appendMessage(msg));
});
socket.on('chat message', msg => {
    if (currentChatContext === 'public' || msg.isPrivate) {
        appendMessage(msg);
    }
}); 
socket.on('admin chat message', msg => {
    if (currentChatContext === ADMIN_CHAT_ID) {
        appendMessage(msg);
    }
});

// Admin Events 
socket.on('admin:history_cleared', data => {
    if (data.targetChatId === currentChatContext) {
        messagesDiv.innerHTML = ''; 
        appendMessage(data.clearMsg);             
    }
});

// System Alerts
socket.on('system_error', msg => appendMessage({ username: 'System', content: `ERROR: ${msg}`, timestamp: new Date(), type: 'system' }));
socket.on('system_alert', msg => appendMessage({ username: 'System', content: msg, timestamp: new Date(), type: 'system' }));

// IP Banned Modal (NEW)
socket.on('banned_modal', data => {
    const banReason = data.reason;
    const banDurationMs = data.banDurationMs;
    
    const bannedModalBody = document.getElementById('bannedModalBody');
    const bannedModal = new bootstrap.Modal(document.getElementById('bannedModal'));
    
    bannedModalBody.innerHTML = `You are BANNED from the chat.<br>Reason: <strong>${banReason}</strong><br>Time remaining: <span id="banTimer"></span><br>Device Fingerprint: ${deviceFingerprint}`;
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
    
    socket.disconnect();
});

// User List Update
socket.on('user count', data => updatePublicUserList(data)); 

// Admin User Map Update (for Admin Panel management list)
socket.on('admin_user_map', adminMap => {
    updateAdminManagementList(adminMap);
});
