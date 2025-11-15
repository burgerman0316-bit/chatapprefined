// chat.js - Complete fixed version with working /unban and /rename commands

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

// File upload variables
let selectedImageDataUrl = null;
const fileInput = document.getElementById('fileUpload');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');

let displayName = '';
let isAdmin = false;
let userToKick = null; 
let userGoogleIdToBan = null; 
let currentChatContext = 'public'; 
const MAX_CHARS = 2000;
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
        
        // Handle image messages
        let contentHtml = '';
        if (msg.image && msg.image.type === 'image') {
            contentHtml = `<div class="msg-content">${profilePicHtml}<span class="msg-text"><img src="${msg.image.url}" style="max-width: 100%; max-height: 300px; border-radius: 8px;"></span></div>`;
        } else {
            contentHtml = `<div class="msg-content">${profilePicHtml}<span class="msg-text">${msg.content}</span></div>`;
        }
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${contentHtml}${timeHtml}`;
        // ------------------------------------------------------------------
    } else {
        item.classList.add('other');
        // Don't add admin-msg class for Blake Stanley and Ashaz Adil
        if (msg.isAdmin && msg.username !== 'Blake Stanley' && msg.username !== 'Ashaz Adil') { 
            item.classList.add('admin-msg'); 
        }
        
        const nameDisplay = msg.isPrivate ? `Private from ${msg.username}` : msg.username;
        const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
        
        // Add profile picture if available
        let profilePicHtml = '';
        if (msg.profilePic) {
            profilePicHtml = `<img src="${msg.profilePic}" class="profile-pic" alt="Profile">`;
        }
        
        // Handle image messages
        let contentHtml = '';
        if (msg.image && msg.image.type === 'image') {
            contentHtml = `<div class="msg-content">${profilePicHtml}<span class="msg-text"><img src="${msg.image.url}" style="max-width: 100%; max-height: 300px; border-radius: 8px;"></span></div>`;
        } else {
            contentHtml = `<div class="msg-content">${profilePicHtml}<span class="msg-text">${msg.content}</span></div>`;
        }
        
        item.innerHTML = `<span class="${nameClass}">${nameDisplay}</span>${contentHtml}${timeHtml}`;
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
        
        // FIX: Display MOD tag in the public list ONLY for actual admins
        if (userEntry.isAdmin && userDisplayName !== 'Blake Stanley' && userDisplayName !== 'Ashaz Adil') { 
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
  const bannedUserListEl = document.getElementById("banned-user-list");
  if (!bannedUserListEl) return;
  bannedUserListEl.innerHTML = "";

  // No banned users message
  if (!banList || banList.length === 0) {
    const li = document.createElement("li");
    li.id = "no-bans-message";
    li.textContent = "No banned users";
    li.className = "text-muted text-center";
    bannedUserListEl.appendChild(li);
    return;
  }

  // Loop over banned users
  banList.forEach((ban) => {
    const li = document.createElement("li");
    li.className = "banned-user-item";
    li.style.cursor = "pointer";

    // Add display content
    const banUntil = new Date(ban.banUntil);
    const timeRemainingMs = banUntil - new Date();
    const hours = Math.floor(timeRemainingMs / (1000 * 60 * 60));
    const minutes = Math.floor(
      (timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60)
    );

    li.innerHTML = `
      <div>
        <strong>${ban.bannedName || "Unknown"}</strong>
        <div class="ban-info">
          ${hours > 0 || minutes > 0
            ? `${hours}h ${minutes}m left`
            : "Expired or permanent"}
        </div>
        <div class="ban-reason">Reason: ${ban.reason || "No reason"}</div>
      </div>
    `;

    // Store Google ID for server operation
    li.dataset.googleId = ban.googleId;

    // Add click unban handler
    li.addEventListener("click", () => {
      const name = ban.bannedName || "this user";
      if (confirm(`Unban ${name}?`)) {
        socket.emit("admin:google_unban_user", {
          targetGoogleId: li.dataset.googleId,
        });
      }
    });

    bannedUserListEl.appendChild(li);
  });
}


// Utility: Switches the chat window (Public vs Admin)
function switchChatContext(contextId) {
    if (contextId === currentChatContext) return;
    if (!isAdmin && contextId === ADMIN_CHAT_ID) return;
    
    // Check if user can access admin chat
    if (contextId === ADMIN_CHAT_ID && (displayName === 'Blake Stanley' || displayName === 'Ashaz Adil')) {
        appendMessage({ 
            username: 'System', 
            content: 'You are not authorized to access admin chat.', 
            timestamp: new Date(), 
            type: 'system' 
        });
        return;
    }
    
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

// Handle file selection
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            selectedImageDataUrl = event.target.result;
            displayImagePreview(selectedImageDataUrl);
        }
        reader.readAsDataURL(file);
    } else {
        // Clear preview if invalid file type
        clearImagePreview();
    }
});

// Function to display image preview
function displayImagePreview(imageUrl) {
    // Clear previous previews
    imagePreviewContainer.innerHTML = '';
    
    const previewDiv = document.createElement('div');
    previewDiv.className = 'image-preview';
    previewDiv.innerHTML = `
        <img src="${imageUrl}" alt="Preview" style="max-width: 200px; max-height: 200px;">
        <button type="button" onclick="removeImagePreview()">×</button>
    `;
    
    imagePreviewContainer.appendChild(previewDiv);
}

// Function to remove image preview
function removeImagePreview() {
    selectedImageDataUrl = null;
    imagePreviewContainer.innerHTML = '';
    fileInput.value = '';
}

// Function to clear image preview
function clearImagePreview() {
    selectedImageDataUrl = null;
    imagePreviewContainer.innerHTML = '';
    fileInput.value = '';
}

// Fallback clipboard copy function
function copyToClipboardFallback(text, itemName) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            appendMessage({ 
                username: 'System', 
                content: `${itemName} copied to clipboard!`, 
                timestamp: new Date(), 
                type: 'system' 
            });
        } else {
            appendMessage({ 
                username: 'System', 
                content: `Failed to copy ${itemName}. Please try again.`, 
                timestamp: new Date(), 
                type: 'system' 
            });
        }
    } catch (err) {
        appendMessage({ 
            username: 'System', 
            content: `Copy failed: ${err.message}. Data has been logged to console.`, 
            timestamp: new Date(), 
            type: 'system' 
        });
        console.log(`${itemName}:`, text);
    } finally {
        document.body.removeChild(textArea);
    }
}

// --- Event Listeners ---

// --- Full Message Submit Function (Fixed for Image + Text) ---
// --- Full Message Submit Function (Fixed for Image + Text) ---
messageForm.addEventListener('submit', e => {
    e.preventDefault();

    // 1. Use textContent for cleaner input from contenteditable div
    const content = messageInputDiv.textContent.trim();

    // 2. Cancel if empty AND no image
    if (!content && !selectedImageDataUrl) return;

    // --- Command handling ---
    if (content.startsWith('/')) {
        // Handle commands
        if (content.startsWith('/msg')) {
            // FIX: Better parsing to handle quoted usernames
            const msgRegex = /^\/msg\s+"([^"]+)"\s+(.+)$/;
            const match = content.match(msgRegex);
            
            if (!match) {
                appendMessage({ 
                    username: 'System', 
                    content: 'Usage: /msg "username" message', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
                messageInputDiv.textContent = ''; 
                charCountSpan.textContent = `0/${MAX_CHARS}`;
                charCountContainer.style.color = '#ccc';
                clearImagePreview(); 
                return;
            }
            
            const recipient = match[1];
            const message = match[2];
            socket.emit('private message', { recipient, content: message });
        } else if (content === '/clear' && isAdmin) {
            // Show confirmation modal for clear command
            clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
            clearConfirmModal.show();
        } else if (content === '/machinegun' && isAdmin) {
            socket.emit('admin:machinegun');
        } else if (content.startsWith('/kick') && isAdmin) {
            // FIX: Better parsing for kick command with quoted names
            const kickRegex = /^\/kick\s+"?([^"]+)"?$/;
            const match = content.match(kickRegex);
            
            if (match) {
                socket.emit('admin:kick_user', { targetName: match[1].trim() });
            } else {
                appendMessage({ 
                    username: 'System', 
                    content: 'Usage: /kick "username"', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
            }
        } else if (content.startsWith('/ban') && isAdmin) {
            const parts = content.split(' ');
            if (parts.length < 4) {
                appendMessage({ 
                    username: 'System', 
                    content: 'Usage: /ban "username" duration reason', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
                return;
            }
            
            const target = parts[1].replace(/"/g, '');
            const duration = parts[2];
            const reason = parts.slice(3).join(' ');
            
            socket.emit('admin:google_ban_user', { 
                targetName: target,
                targetGoogleId: null, 
                days: 0, 
                hours: 0, 
                minutes: parseInt(duration) || 30,
                reason: reason
            });
        } else if (content.startsWith('/unban') && isAdmin) {
            // FIX: Better parsing for unban command with quoted names
            const unbanRegex = /^\/unban\s+"?([^"]+)"?$/;
            const match = content.match(unbanRegex);
            
            if (match) {
                socket.emit('admin:google_unban_user', { 
                    targetName: match[1].trim()
                });
            } else {
                appendMessage({ 
                    username: 'System', 
                    content: 'Usage: /unban "username"', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
            }
        } else if (content.startsWith('/rename') && isAdmin) {
            // FIX: Better parsing for rename command with quoted names
            const renameRegex = /^\/rename\s+"([^"]+)"\s+"([^"]+)"$/;
            const match = content.match(renameRegex);
            
            if (match) {
                const oldName = match[1];
                const newName = match[2];
                socket.emit('admin:rename_user', { oldName, newName });
            } else {
                appendMessage({ 
                    username: 'System', 
                    content: 'Usage: /rename "oldname" "newname"', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
            }
        } else {
            // Unknown command
            appendMessage({ 
                username: 'System', 
                content: `Unknown command: ${content}`, 
                timestamp: new Date(), 
                type: 'system' 
            });
        }
        
        // Clear input after command
        messageInputDiv.textContent = ''; 
        charCountSpan.textContent = `0/${MAX_CHARS}`;
        charCountContainer.style.color = '#ccc';
        clearImagePreview(); 
        return; 
    }

    // 3. --- Normal message sending (text + optional image) ---
    const messagePayload = { content: content, isPrivate: false };
    if (selectedImageDataUrl) messagePayload.image = { type:'image', url: selectedImageDataUrl };

    socket.emit('chat message', messagePayload);

    // 4. Clear input
    messageInputDiv.textContent = '';
    charCountSpan.textContent = `0/${MAX_CHARS}`;
    charCountContainer.style.color = '#ccc';
    clearImagePreview();
});

// 2. Input Character Counter (Visibility improved via CSS)
messageInputDiv.addEventListener('input', () => {
  const text = messageInputDiv.innerText.trim(); // Trim invisible newline & spaces
  const currentLength = text.length;

  if (currentLength > MAX_CHARS) {
    // Limit to max
    messageInputDiv.innerText = text.substring(0, MAX_CHARS);
    charCountSpan.textContent = `${MAX_CHARS}/${MAX_CHARS}`;
  } else if (currentLength === 0) {
    // Properly show 0 when blank
    charCountSpan.textContent = `0/${MAX_CHARS}`;
  } else {
    charCountSpan.textContent = `${currentLength}/${MAX_CHARS}`;
  }

  // Style color near limit
  if (currentLength >= MAX_CHARS * 0.9) {
    charCountContainer.style.color = "#ff4d4d";
  } else {
    charCountContainer.style.color = "#ccc";
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
    // Check if user can access admin chat
    if (currentChatContext === ADMIN_CHAT_ID && (displayName === 'Blake Stanley' || displayName === 'Ashaz Adil')) {
        appendMessage({ 
            username: 'System', 
            content: 'You are not authorized to clear admin chat.', 
            timestamp: new Date(), 
            type: 'system' 
        });
        return;
    }
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

// Copy Ban List Button
// Download Ban List Button
document.getElementById('copyBanListBtn').addEventListener('click', () => {
    socket.emit('admin:request_full_ban_list');
});

// Download Chat History Button
document.getElementById('copyChatHistoryBtn').addEventListener('click', () => {
    socket.emit('admin:request_full_chat_history');
});

// Helper function to download JSON as file
function downloadJSON(data, filename) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

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

    updateCopyButtonsVisibility();
    
    if (isAdmin && currentChatContext === ADMIN_CHAT_ID) {
        switchChatContext(ADMIN_CHAT_ID);
    } else {
        switchChatContext('public');
    }
}

// Show copy buttons only for Diesel Carter
function updateCopyButtonsVisibility() {
    const copyBanListBtn = document.getElementById('copyBanListBtn');
    const copyChatHistoryBtn = document.getElementById('copyChatHistoryBtn');
    
    if (displayName === 'Diesel Carter' && isAdmin) {
        copyBanListBtn.style.display = 'block';
        copyChatHistoryBtn.style.display = 'block';
    } else {
        copyBanListBtn.style.display = 'none';
        copyChatHistoryBtn.style.display = 'none';
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

// Handle admin chat messages
socket.on('admin chat message', msg => {
    if (currentChatContext === ADMIN_CHAT_ID || msg.isPrivate) {
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

// Handle copy responses with fallback
socket.on('admin:ban_list_json', (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(jsonStr)
            .then(() => {
                appendMessage({ 
                    username: 'System', 
                    content: 'Ban list copied to clipboard!', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
            })
            .catch(() => {
                // Fallback to legacy method
                copyToClipboardFallback(jsonStr, 'ban list');
            });
    } else {
        // Use fallback method directly
        copyToClipboardFallback(jsonStr, 'ban list');
    }
});

socket.on('admin:chat_history_json', (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(jsonStr)
            .then(() => {
                appendMessage({ 
                    username: 'System', 
                    content: 'Chat history copied to clipboard!', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
            })
            .catch(() => {
                // Fallback to legacy method
                copyToClipboardFallback(jsonStr, 'chat history');
            });
    } else {
        // Use fallback method directly
        copyToClipboardFallback(jsonStr, 'chat history');
    }
});

// ===== DIESEL CARTER COPY FUNCTIONALITY =====

// Better clipboard copy function
function copyTextToClipboard(text, itemName) {
    // Create a temporary textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make it invisible but ensure it's in the viewport
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    // For iOS compatibility
    textArea.setSelectionRange(0, 99999);
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            appendMessage({ 
                username: 'System', 
                content: `${itemName} copied to clipboard! (${text.length} characters)`, 
                timestamp: new Date(), 
                type: 'system' 
            });
        } else {
            throw new Error('Copy command returned false');
        }
    } catch (err) {
        // Last resort: show modal with text to manually copy
        showCopyModal(text, itemName);
    } finally {
        document.body.removeChild(textArea);
    }
}

// Modal fallback if all else fails
function showCopyModal(text, itemName) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.backgroundColor = '#2c2c2c';
    modal.style.padding = '20px';
    modal.style.border = '2px solid #555';
    modal.style.borderRadius = '8px';
    modal.style.zIndex = '10000';
    modal.style.maxWidth = '80%';
    modal.style.maxHeight = '80%';
    modal.style.overflow = 'auto';
    
    modal.innerHTML = `
        <h3 style="color: #fff; margin-top: 0;">Copy ${itemName}</h3>
        <p style="color: #ccc;">Press Ctrl+C (or Cmd+C on Mac) to copy:</p>
        <textarea readonly style="width: 100%; height: 300px; background: #1e1e1e; color: #fff; border: 1px solid #555; padding: 10px; font-family: monospace;">${text}</textarea>
        <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 10px 20px; background: #585858; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    `;
    
    document.body.appendChild(modal);
    modal.querySelector('textarea').select();
}

// Copy Ban List Button Handler
document.getElementById('copyBanListBtn').addEventListener('click', () => {
    socket.emit('admin:request_full_ban_list');
});

// Copy Chat History Button Handler
document.getElementById('copyChatHistoryBtn').addEventListener('click', () => {
    socket.emit('admin:request_full_chat_history');
});

// Handle ban list copy response
socket.on('admin:ban_list_json', (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    copyTextToClipboard(jsonStr, 'Ban list');
});

// Handle chat history copy response
socket.on('admin:chat_history_json', (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    copyTextToClipboard(jsonStr, 'Chat history');
});
