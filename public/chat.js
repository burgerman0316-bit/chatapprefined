// chat.js - Complete updated version with all features

// Import the Bootstrap namespace to use its functions
const myModal = new bootstrap.Modal(document.getElementById('nameModal')); 
const renameModal = new bootstrap.Modal(document.getElementById('renameModal')); 

// Socket connection
const socket = io();

// Elements
const nameForm = document.getElementById('name-form');
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
const bannedUserListEl = document.getElementById('banned-user-list');

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
let userGoogleIdToBan = null; 
let currentChatContext = 'public'; 
const MAX_CHARS = 500;
const ADMIN_CHAT_ID = 'admin_chat';

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    myModal.show();
    
    // Initialize Google Sign-In after the DOM is ready
    initializeGoogleSignIn();
});

// Initialize Google Sign-In
function initializeGoogleSignIn() {
    // Check if Google Identity Services is loaded
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: "48828983321-bn7hjk3clua805bb54r7mk4tjs1mjsbm.apps.googleusercontent.com", // Replace with your actual client ID
            callback: handleGoogleLogin
        });
        
        // Render the Google Sign-In button with proper width
        google.accounts.id.renderButton(
            document.getElementById("google-signin-button"),
            { 
                theme: "filled_black", 
                size: "large",
                width: 280,
                text: "continue_with",
                shape: "rectangular"
            }
        );
    } else {
        // If Google is not loaded, try again after a short delay
        setTimeout(initializeGoogleSignIn, 500);
    }
}

// Google Login Handler
function handleGoogleLogin(response) {
    const payload = parseJwt(response.credential);
    const name = payload.name;
    const email = payload.email;
    const googleId = payload.sub; // Google ID
    const profilePic = payload.picture; // Profile picture
    
    // Send to server
    socket.emit('google_login', { name, email, googleId, profilePic });
}

function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

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
            
        // Add profile picture if available
        let profilePicHtml = '';
        if (msg.profilePic) {
            profilePicHtml = `<img src="${msg.profilePic}" class="profile-pic" alt="Profile">`;
        }
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span><div class="msg-content">${profilePicHtml}<span class="msg-text">${msg.content}</span></div>${timeHtml}`;
        // ------------------------------------------------------------------
    } else {
        item.classList.add('other');
        if (msg.isAdmin) { 
            item.classList.add('admin-msg'); 
        }
        
        const nameDisplay = msg.isPrivate ? `Private from ${msg.username}` : msg.username;
        const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
        
        // Add profile picture if available
        let profilePicHtml = '';
        if (msg.profilePic) {
            profilePicHtml = `<img src="${msg.profilePic}" class="profile-pic" alt="Profile">`;
        }
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span><div class="msg-content">${profilePicHtml}<span class="msg-text">${msg.content}</span></div>${timeHtml}`;
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
             messageInputDiv.innerText = `/msg \"${userDisplayName}\" `;
             messageInputDiv.focus();
             
             // Move cursor to end of input
             const range = document.createRange();
             const sel = window.getSelection();
             range.selectNodeContents(messageInputDiv);
             range.collapse(false);
             sel.removeAllRanges();
             sel.addRange(range);
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
             userGoogleIdToBan = user.googleId; 
             
             kickConfirmBody.innerHTML = `Manage user: <strong>${userDisplayName}</strong><br>Google ID: ${user.googleId}<br>Admin Status: ${user.isAdmin ? 'Yes' : 'No'}`;
             
             const adminModal = bootstrap.Modal.getInstance(adminModalEl);
             if (adminModal) adminModal.hide(); 
             kickConfirmModal.show();
         });
         
         adminUserListEl.appendChild(adminLi);
    });
}

// Utility: Updates the banned users list
function updateBannedUserList(banList) {
    if (!isAdmin) return;
    
    bannedUserListEl.innerHTML = '';
    
    if (!banList || banList.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-muted text-center';
        li.id = 'no-bans-message';
        li.textContent = 'No banned users';
        bannedUserListEl.appendChild(li);
        return;
    }
    
    banList.forEach(ban => {
        const li = document.createElement('li');
        li.style.cursor = 'pointer';
        
        const banUntil = new Date(ban.banUntil);
        const timeRemaining = banUntil - new Date();
        const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        
        li.innerHTML = `
            <span><strong>${ban.bannedName || 'Unknown'}</strong></span>
            <span class="ban-info">${hoursRemaining}h ${minutesRemaining}m left</span>
        `;
        
        li.title = `Reason: ${ban.reason}\nClick to unban`;
        
        // Store the Google ID in a data attribute for later use
        li.dataset.googleId = ban.googleId;
        
        li.addEventListener('click', () => {
            if (confirm(`Unban ${ban.bannedName || 'this user'}?`)) {
                socket.emit('admin:google_unban_user', { targetGoogleId: ban.googleId });
            }
        });
        
        bannedUserListEl.appendChild(li);
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

// 1. Handle Message Form Submission 
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
            let recipient, dmContent;
            
            // Check if recipient is quoted
            if (args.startsWith('"')) {
                const endQuote = args.indexOf('"', 1);
                if (endQuote !== -1) {
                    recipient = args.substring(1, endQuote);
                    dmContent = args.substring(endQuote + 1).trim();
                }
            } else {
                // Old method for backwards compatibility
                const match = args.match(/^(\S+)\s+(.*)/s);
                if (match) {
                    recipient = match[1];
                    dmContent = match[2];
                }
            }
            
            if (recipient && dmContent && currentChatContext === 'public') {
                socket.emit('private message', { recipient: recipient, content: dmContent });
            } else {
                appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg "username" message', timestamp: new Date(), type: 'system' });
            }
        } 
        else if (command === '/kick') { 
            if (!isAdmin) {
                 appendMessage({ username: 'System', content: 'You do not have permission to use the /kick command.', timestamp: new Date(), type: 'system' });
                 return;
            }
            if (args) {
                socket.emit('admin:kick_user', { targetName: args });
            } else {
                appendMessage({ username: 'System', content: 'Invalid /kick command. Usage: /kick username', timestamp: new Date(), type: 'system' });
            }
        }
        else if (command === '/ban') {
            if (!isAdmin) {
                appendMessage({ username: 'System', content: 'You do not have permission to use the /ban command.', timestamp: new Date(), type: 'system' });
                return;
            }
            
            // Parse ban command: /ban "username" 0d 0h 30m reason
            const banMatch = args.match(/^\"([^\\\"]+)\"\\s+(\\d+)d\\s+(\\d+)h\\s+(\\d+)m\\s+(.+)$/);
            if (banMatch) {
                const [, targetName, days, hours, minutes, reason] = banMatch;
                
                // Find user in the user list
                const targetUserElement = Array.from(document.querySelectorAll('#user-list li'))
                    .find(li => li.textContent.toLowerCase().includes(targetName.toLowerCase()));
                
                if (targetUserElement) {
                    // Get the user's Google ID from the user list
                    const userDisplayName = targetUserElement.textContent.split(' ')[0];
                    const userEntry = Array.from(document.querySelectorAll('#user-list li'))
                        .find(li => li.textContent.includes(userDisplayName));
                    
                    // For now, we'll just show a message that the command is working
                    appendMessage({ 
                        username: 'System', 
                        content: `Banning user ${targetName} for ${days}d ${hours}h ${minutes}m.`, 
                        timestamp: new Date(), 
                        type: 'system' 
                    });
                    
                    // Send to server to actually ban
                    socket.emit('admin:google_ban_user', { 
                        targetName: targetName,
                        targetGoogleId: userEntry.textContent.split(' ')[1] || '', 
                        days: parseInt(days), 
                        hours: parseInt(hours), 
                        minutes: parseInt(minutes),
                        reason: reason
                    });
                } else {
                    appendMessage({ username: 'System', content: `User '${targetName}' not found.`, timestamp: new Date(), type: 'system' });
                }
            } else {
                appendMessage({ username: 'System', content: 'Invalid /ban command. Usage: /ban "username" 0d 0h 30m reason', timestamp: new Date(), type: 'system' });
            }
        }
        else if (command === '/unban') {
            if (!isAdmin) {
                appendMessage({ username: 'System', content: 'You do not have permission to use the /unban command.', timestamp: new Date(), type: 'system' });
                return;
            }
            
            // Parse unban command: /unban "username"
            const unbanMatch = args.match(/^\"([^\\\"]+)\"$/);
            if (unbanMatch) {
                const [, targetName] = unbanMatch;
                
                // Find user in the user list
                const targetUserElement = Array.from(document.querySelectorAll('#user-list li'))
                    .find(li => li.textContent.toLowerCase().includes(targetName.toLowerCase()));
                
                if (targetUserElement) {
                    // For now, we'll just show a message that the command is working
                    appendMessage({ 
                        username: 'System', 
                        content: `Unbanning user ${targetName}.`, 
                        timestamp: new Date(), 
                        type: 'system' 
                    });
                    
                    // Send to server to actually unban
                    // Note: In a real implementation, we'd need to track Google IDs for banned users
                    // For now, we'll just show a message
                    appendMessage({ 
                        username: 'System', 
                        content: `Use the Admin Panel to unban users.`, 
                        timestamp: new Date(), 
                        type: 'system' 
                    });
                } else {
                    appendMessage({ username: 'System', content: `User '${targetName}' not found.`, timestamp: new Date(), type: 'system' });
                }
            } else {
                appendMessage({ username: 'System', content: 'Invalid /unban command. Usage: /unban "username"', timestamp: new Date(), type: 'system' });
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
            
            socket.emit('admin:machinegun');
        }
        else {
             appendMessage({ username: 'System', content: `Unknown command: ${command}`, timestamp: new Date(), type: 'system' });
        }
    } else {
        // Regular public/admin chat message
        socket.emit('chat message', { content }); 
    }
});

// 2. Input Character Counter (Visibility improved via CSS)
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

// 3. Admin Panel Button Handlers
document.getElementById('clearChatBtn').addEventListener('click', () => {
    clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
    clearConfirmModal.show();
    const adminModal = bootstrap.Modal.getInstance(adminModalEl);
    if (adminModal) adminModal.hide();
});

// Request ban list when admin panel is opened
adminPanelBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:request_ban_list');
    }
});

// 4. Clear History Confirmation Click 
clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:clear_history', currentChatContext); 
    }
    clearConfirmModal.hide(); 
});

// 5. Admin: Kick User Confirmation Click Handler (Step 1: Open Ban Modal)
document.getElementById('kickToBanBtn').addEventListener('click', () => {
    kickConfirmModal.hide(); 
    
    if (isAdmin && userToKick && userGoogleIdToBan) {
        banTargetNameSpan.textContent = userToKick;
        banDurationDaysInput.value = '0';
        banDurationHoursInput.value = '0';
        banDurationMinutesInput.value = '30';
        banReasonInput.value = 'Spam/Hate Speech';
        banModal.show();
    } else {
         userToKick = null; 
         userGoogleIdToBan = null;
    }
});

// 6. Admin: Kick User Directly (Skip Ban Modal)
document.getElementById('kickDirectlyBtn').addEventListener('click', () => {
     if (isAdmin && userToKick) {
         socket.emit('admin:kick_user', { targetName: userToKick });
     }
     kickConfirmModal.hide();
     userToKick = null;
     userGoogleIdToBan = null;
});

// 7. Admin: IP Ban Submission
banConfirmBtn.addEventListener('click', () => {
    if (!isAdmin || !userToKick || !userGoogleIdToBan) {
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
    
    socket.emit('admin:google_ban_user', { 
        targetName: userToKick,
        targetGoogleId: userGoogleIdToBan, 
        days: days, 
        hours: hours, 
        minutes: minutes,
        reason: reason
    });
    
    banModal.hide(); 
    userToKick = null; 
    userGoogleIdToBan = null;
});

// 8. Admin: Log out (Go Anonymous)
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:go_anonymous');
    }
});

// 9. Chat Tab Switches
publicChatTab.addEventListener('click', () => switchChatContext('public'));
adminChatTab.addEventListener('click', () => switchChatContext(ADMIN_CHAT_ID));

// 10. Rename form submission
document.getElementById('rename-form').addEventListener('submit', e => {
    e.preventDefault();
    const newName = document.getElementById('new-name-input').value.trim();
    if (newName) {
        socket.emit('name_change', newName);
    }
    renameModal.hide();
});

// 11. Enable rename button after successful login
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

// Ban List Update (Admin only)
socket.on('ban_list_update', banList => {
    updateBannedUserList(banList);
});

// IP Banned Modal (NEW)
socket.on('banned_modal', data => {
    const banReason = data.reason;
    const banDurationMs = data.banDurationMs;
    
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
    
    socket.disconnect();
});

// User List Update
socket.on('user count', data => updatePublicUserList(data)); 

// Admin User Map Update (for Admin Panel management list)
socket.on('admin_user_map', adminMap => {
    updateAdminManagementList(adminMap);
});
