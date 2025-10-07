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
const charCountContainer = document.getElementById('charCountContainer'); // NEW

const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');

const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminModalEl = document.getElementById('adminPanelModal'); 

// Chat Context Tabs (NEW)
const publicChatTab = document.getElementById('publicChatTab');
const adminChatTab = document.getElementById('adminChatTab');

// Modal Elements for Clear History
const clearConfirmModalEl = document.getElementById('clearConfirmModal');
const clearConfirmModal = new bootstrap.Modal(clearConfirmModalEl);
const clearConfirmBtn = document.getElementById('clearConfirmBtn');
const clearConfirmTargetName = document.getElementById('clearConfirmTargetName');

// Modal Elements for IP Ban (NEW)
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
let userToKick = null; // Store the target name for the ban modal
let userIpToBan = null; // Store the target IP for the ban modal
let currentChatContext = 'public'; // 'public' or 'admin_chat'
const MAX_CHARS = 256;
const ADMIN_CHAT_ID = 'admin_chat';

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    myModal.show();
});

// Utility: Appends a message to the chat
function appendMessage(msg) {
    const item = document.createElement('li');
    item.classList.add('msg');
    
    // Format timestamp to be white text
    const time = new Date(msg.timestamp);
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeHtml = `<span class="timestamp">${timeString}</span>`; 

    if (msg.type === 'system') {
        item.classList.add('system');
        item.textContent = msg.content;
    } else if (msg.username === displayName || (msg.username === 'You' && msg.isPrivate)) {
        // Fix: "your name isn't you from your perspective" 
        // We use "You" for the sender in /msg, and rely on CSS to hide the name
        item.classList.add('own');
        // Fix: Curved thing in messages is handled by CSS stacking logic
        item.innerHTML = `${msg.content} ${timeHtml}`;
    } else {
        item.classList.add('other');
        if (msg.isAdmin) { 
            item.style.border = '2px solid gold'; // Gold border for admin messages
        }
        
        // Sender Name Display (Fix: remove "You: " from front of messages)
        const nameDisplay = msg.isPrivate ? `Private from ${msg.username}` : msg.username;
        const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${msg.content} ${timeHtml}`;
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Utility: Updates the online user list
function updateUsers(data, adminUsersMap) {
    const userList = data.userList;
    const usersMap = data.usersMap;
    
    // 1. Public Info Panel
    userCountEl.textContent = userList.length;
    userListEl.innerHTML = '';
    
    userList.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        li.title = `Click to send private message to ${user}`;
        li.addEventListener('click', () => {
             messageInputDiv.innerText = `/msg ${user} `;
             messageInputDiv.focus();
        });
        userListEl.appendChild(li);
    });

    // 2. Admin Kick/Ban List (Kick Menu)
    const adminUserList = document.getElementById('admin-user-list');
    adminUserList.innerHTML = ''; 
    
    if (isAdmin) {
        // Iterate over the full admin map (includes IP)
        Object.keys(adminUsersMap).forEach(key => {
             const user = adminUsersMap[key];
             const displayName = user.displayName;
             
             // Only display users in public chat or currently logged-in admins
             if (user.chatContext !== 'public' && !user.isAdmin) return;
             
             const adminLi = document.createElement('li');
             adminLi.textContent = displayName;
             
             // Highlight admins
             if (user.isAdmin) {
                 adminLi.textContent += ' (MOD)';
                 adminLi.classList.add('admin-name-list');
             }
             
             // *** NEW: Add event listener to open Kick/Ban menu on click ***
             adminLi.addEventListener('click', () => {
                 if (displayName === displayNameEl.textContent.split(' ')[0]) {
                      alert('Cannot manage yourself!');
                      return;
                 }
                 
                 userToKick = displayName; 
                 userIpToBan = user.ip; // Store the IP
                 
                 // Update the confirmation modal body text
                 document.getElementById('kickConfirmBody').innerHTML = `Manage user: <strong>${displayName}</strong><br>Admin Status: ${user.isAdmin ? 'Yes' : 'No'}`;
                 
                 // Show the Kick Confirmation Modal
                 const adminModal = bootstrap.Modal.getInstance(adminModalEl);
                 if (adminModal) adminModal.hide(); // Hide the admin panel
                 kickConfirmModal.show();
             });
             
             adminUserList.appendChild(adminLi);
        });
    }
}

// Utility: Switches the chat window (Public vs Admin)
function switchChatContext(contextId) {
    if (!isAdmin && contextId === ADMIN_CHAT_ID) return;
    
    currentChatContext = contextId;
    messagesDiv.innerHTML = ''; // Clear chat window
    
    // Update tabs
    if (contextId === ADMIN_CHAT_ID) {
        adminChatTab.classList.add('active');
        publicChatTab.classList.remove('active');
        document.getElementById('chatTitle').textContent = 'Admin Chat';
        document.getElementById('adminChatSection').style.display = 'block';
    } else {
        adminChatTab.classList.remove('active');
        publicChatTab.classList.add('active');
        document.getElementById('chatTitle').textContent = 'Public Chat';
        document.getElementById('adminChatSection').style.display = 'none';
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
    charCountSpan.textContent = `0/${MAX_CHARS}`; // Reset counter
    
    if (!content) return;
    if (content.length > MAX_CHARS) return;

    // Command Check
    if (content.startsWith('/')) {
        const parts = content.split(' ');
        const command = parts[0].toLowerCase();
        const args = content.substring(command.length).trim();

        if (command === '/msg') {
            const match = args.match(/^(\S+)\s+(.*)/s); // Match recipient and the rest of the message
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
        else if (command === '/kick') { // /kick COMMAND (Allows spaces in name)
            if (!isAdmin) {
                 appendMessage({ username: 'System', content: 'You do not have permission to use the /kick command.', timestamp: new Date(), type: 'system' });
                 return;
            }
            if (args) {
                // Send the full args as the targetName (allows spaces)
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
        } else {
             appendMessage({ username: 'System', content: `Unknown command: ${command}`, timestamp: new Date(), type: 'system' });
        }
    } else {
        // Regular public/admin chat message
        socket.emit('chat message', { content }); 
    }
});

// 3. Input Character Counter 
messageInputDiv.addEventListener('input', () => {
    const currentLength = messageInputDiv.innerText.length;
    
    // Truncate if over limit
    if (currentLength > MAX_CHARS) {
        messageInputDiv.innerText = messageInputDiv.innerText.substring(0, MAX_CHARS);
        charCountSpan.textContent = `${MAX_CHARS}/${MAX_CHARS}`;
    } else {
        charCountSpan.textContent = `${currentLength}/${MAX_CHARS}`;
    }
    
    // Optional: visual feedback when nearing the limit
    if (currentLength >= MAX_CHARS - 10) {
        charCountContainer.style.color = 'red';
    } else {
        charCountContainer.style.color = '#888';
    }
});

// Prevent chat window from changing size (fixed height/width in CSS)
// Ensure Enter sends message
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// 4. Admin: Clear History Confirmation Click 
clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        // Clear history only affects the current chat context
        socket.emit('admin:clear_history', currentChatContext); 
    }
    clearConfirmModal.hide(); 
});

// 5. Admin: Kick User Confirmation Click Handler (Step 1: Open Ban Modal)
document.getElementById('kickToBanBtn').addEventListener('click', () => {
    kickConfirmModal.hide(); 
    
    if (isAdmin && userToKick) {
        banTargetNameSpan.textContent = userToKick;
        // Default to a short, severe ban duration
        banDurationDaysInput.value = '0';
        banDurationHoursInput.value = '0';
        banDurationMinutesInput.value = '30';
        banReasonInput.value = 'Hate Speech/Spam';
        banModal.show();
    } else {
         userToKick = null; 
         userIpToBan = null;
    }
});

// 6. Admin: Kick User Directly (Skip Ban Modal)
document.getElementById('kickDirectlyBtn').addEventListener('click', () => {
     if (isAdmin && userToKick) {
         socket.emit('admin:kick_user', { targetName: userToKick });
     }
     kickConfirmModal.hide();
     userToKick = null;
     userIpToBan = null;
});


// 7. Admin: IP Ban Submission
banConfirmBtn.addEventListener('click', () => {
    if (!isAdmin || !userToKick || !userIpToBan) {
        banModal.hide();
        return;
    }
    
    const days = parseInt(banDurationDaysInput.value);
    const hours = parseInt(banDurationHoursInput.value);
    const minutes = parseInt(banDurationMinutesInput.value);
    const reason = banReasonInput.value;
    
    // Client-side validation for numbers and limits
    if (isNaN(days) || isNaN(hours) || isNaN(minutes) || (days === 0 && hours === 0 && minutes === 0) || days > 999 || hours > 99 || minutes > 99) {
        alert('Invalid duration. Days max 3 digits, Hours/Minutes max 2 digits, and duration must be > 0.');
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

// 8. Admin: Log out (Go Anonymous)
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:go_anonymous');
    }
});

// 9. Public Chat Tab Switch
publicChatTab.addEventListener('click', () => switchChatContext('public'));

// 10. Admin Chat Tab Switch
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
document.getElementById('renameBtn').addEventListener('click', () => {
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
    document.getElementById('renameBtn').style.display = 'block';
    document.getElementById('adminLogoutBtn').style.display = isAdmin ? 'block' : 'none'; 
    adminChatTab.style.display = isAdmin ? 'block' : 'none';
    
    // Set initial context display
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
    // Fix: When chat is cleared, this handles the repaint
    messagesDiv.innerHTML = ''; 
    history.forEach(msg => appendMessage(msg));
});
socket.on('chat message', msg => {
    if (currentChatContext === 'public' || msg.isPrivate) {
        appendMessage(msg);
    }
}); 
// Separate event for Admin Chat messages
socket.on('admin chat message', msg => {
    if (currentChatContext === ADMIN_CHAT_ID) {
        appendMessage(msg);
    }
});

// Admin Events 
socket.on('admin:history_cleared', data => {
    // Fix: When the chat is cleared, the user list should not reset (handled by server logic)
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
    
    // Update the banned modal content 
    const bannedModalBody = document.getElementById('bannedModalBody');
    const bannedModal = new bootstrap.Modal(document.getElementById('bannedModal'));
    
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
    
    // Disconnect the socket immediately
    socket.disconnect();
});


// User List Update
socket.on('user count', data => updateUsers(data, {})); // Public user list
socket.on('admin_user_map', adminMap => {
    if (isAdmin) {
        // Only update the admin panel's user list when we receive the detailed map
        updateUsers({ userList: Object.keys(adminMap).map(id => adminMap[id].displayName), usersMap: adminMap }, adminMap); 
    }
});
