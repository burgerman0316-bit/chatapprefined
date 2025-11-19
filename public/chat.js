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

// Modal Elements for Restore Ban List
const restoreBanListModalEl = document.getElementById('restoreBanListModal');
const restoreBanListModal = new bootstrap.Modal(restoreBanListModalEl);
const restoreBanListTextarea = document.getElementById('restoreBanListTextarea');
const confirmRestoreBanListBtn = document.getElementById('confirmRestoreBanListBtn');

// Modal Elements for Restore Chat History
const restoreChatHistoryModalEl = document.getElementById('restoreChatHistoryModal');
const restoreChatHistoryModal = new bootstrap.Modal(restoreChatHistoryModalEl);
const restoreChatHistoryTextarea = document.getElementById('restoreChatHistoryTextarea');
const confirmRestoreChatHistoryBtn = document.getElementById('confirmRestoreChatHistoryBtn');

// New restore buttons in admin panel
const restoreBanListBtn = document.getElementById('restoreBanListBtn');
const restoreChatHistoryBtn = document.getElementById('restoreChatHistoryBtn');

// File upload variables
let selectedImageDataUrl = null;
const fileInput = document.getElementById('fileUpload');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');

// New constants for image resizing
const MAX_IMAGE_DIMENSION = 800; // Max width or height in pixels
const JPEG_QUALITY = 0.7; // JPEG compression quality (0.0 to 1.0)

let displayName = '';
let isAdmin = false;
let userGoogleId = null;
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
            client_id: "48828983321-bn7hjk3clua805bb54r7mk4tjs1mjsbm.apps.googleusercontent.com",
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
    const googleId = payload.sub;
    const profilePic = payload.picture;
    
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
    const timeHtml = `<span class=\"timestamp\">${timeString}</span>`; 

    if (msg.type === 'system') {
        item.classList.add('system');
        item.textContent = msg.content;
    } else if (msg.username === displayName || (msg.username === 'You' && msg.isPrivate)) {
        item.classList.add('own');
        
        const nameDisplay = (msg.username === 'You' && msg.isPrivate) 
            ? 'You' 
            : msg.username;
            
        const nameClass = (msg.isPrivate) 
            ? 'sender-name private-name' 
            : 'sender-name';
            
        let profilePicHtml = '';
        if (msg.profilePic) {
            profilePicHtml = `<img src=\"${msg.profilePic}\" class=\"profile-pic\" alt=\"Profile\">`;
        }
        
        let contentHtml = '';
        if (msg.image && msg.image.type === 'image') {
            contentHtml = `<div class=\"msg-content\">${profilePicHtml}<span class=\"msg-text\"><img src=\"${msg.image.url}\" style=\"max-width: 100%; max-height: 300px; border-radius: 8px;\"></span></div>`;
        } else {
            contentHtml = `<div class=\"msg-content\">${profilePicHtml}<span class=\"msg-text\">${msg.content}</span></div>`;
        }
        
        item.innerHTML = `<span class=\"${nameClass}\">${nameDisplay}</span>${contentHtml}${timeHtml}`;
    } else {
        item.classList.add('other');
        if (msg.isAdmin && msg.username !== 'Blake Stanley' && msg.username !== 'Ashaz Adil') { 
            item.classList.add('admin-msg'); 
        }
        
        const nameDisplay = msg.isPrivate ? `Private from ${msg.username}` : msg.username;
        const nameClass = msg.isPrivate ? 'sender-name private-name' : 'sender-name';
        
        let profilePicHtml = '';
        if (msg.profilePic) {
            profilePicHtml = `<img src=\"${msg.profilePic}\" class=\"profile-pic\" alt=\"Profile\">`;
        }
        
        let contentHtml = '';
        if (msg.image && msg.image.type === 'image') {
            contentHtml = `<div class=\"msg-content\">${profilePicHtml}<span class=\"msg-text\"><img src=\"${msg.image.url}\" style=\"max-width: 100%; max-height: 300px; border-radius: 8px;\"></span></div>`;
        } else {
            contentHtml = `<div class=\"msg-content\">${profilePicHtml}<span class=\"msg-text\">${msg.content}</span></div>`;
        }
        
        item.innerHTML = `<span class=\"${nameClass}\">${nameDisplay}</span>${contentHtml}${timeHtml}`;
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Utility: Updates the online user list for ALL clients (Public list)
function updatePublicUserList(data) {
    const userList = data.userList;
    const publicUserMap = data.usersMap;
    
    userCountEl.textContent = userList.length;
    userListEl.innerHTML = '';
    
    userList.forEach(userDisplayName => {
        const li = document.createElement('li');
        
        const userEntry = publicUserMap[userDisplayName] || {};
        
        li.textContent = userDisplayName;
        
        if (userEntry.isAdmin && userDisplayName !== 'Blake Stanley' && userDisplayName !== 'Ashaz Adil') { 
             li.textContent += ' (MOD)'; 
             li.classList.add('admin-name-list'); 
        }
        
        li.title = `Click to send private message to ${userDisplayName}`;
        li.addEventListener('click', () => {
             // FIX: Use literal quotes, not escaped backslashes, for command generation
             messageInputDiv.innerText = `/msg "${userDisplayName}" `;
             messageInputDiv.focus();
             
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
    if (!isAdmin) return;

    adminUserListEl.innerHTML = ''; 
    
    Object.keys(adminUsersMap).forEach(key => {
         const user = adminUsersMap[key];
         const userDisplayName = user.displayName;
         
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

  if (!banList || banList.length === 0) {
    const li = document.createElement("li");
    li.id = "no-bans-message";
    li.textContent = "No banned users";
    li.className = "text-muted text-center";
    bannedUserListEl.appendChild(li);
    return;
  }

  banList.forEach((ban) => {
    const li = document.createElement("li");
    li.className = "banned-user-item";
    li.style.cursor = "pointer";

    const banUntil = new Date(ban.banUntil);
    const timeRemainingMs = banUntil - new Date();
    const hours = Math.floor(timeRemainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60));

    li.innerHTML = `
      <div>
        <strong>${ban.bannedName || "Unknown"}</strong>
        <div class=\"ban-info\">\n          ${hours > 0 || minutes > 0 ? `${hours}h ${minutes}m left` : "Expired or permanent"}\n        </div>
        <div class=\"ban-reason\">Reason: ${ban.reason || "No reason"}</div>
      </div>
    `;

    li.dataset.googleId = ban.googleId;

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
    
    if (contextId === ADMIN_CHAT_ID) {
        adminChatTab.classList.add('active');
        publicChatTab.classList.remove('active');
        document.getElementById('chatTitle').textContent = 'Admin Chat';
    } else {
        adminChatTab.classList.remove('active');
        publicChatTab.classList.add('active');
        document.getElementById('chatTitle').textContent = 'Public Chat';
    }
    
    socket.emit('admin:set_context', contextId);
}

// Show copy and restore buttons only for Diesel Carter
function updateAdminPanelButtonsVisibility() {
    const copyBanListBtn = document.getElementById('copyBanListBtn');
    const copyChatHistoryBtn = document.getElementById('copyChatHistoryBtn');
    const restoreBanListBtn = document.getElementById('restoreBanListBtn');
    const restoreChatHistoryBtn = document.getElementById('restoreChatHistoryBtn');
    
    if (displayName === 'Diesel Carter' && isAdmin) {
        copyBanListBtn.style.display = 'block';
        copyChatHistoryBtn.style.display = 'block';
        restoreBanListBtn.style.display = 'block';
        restoreChatHistoryBtn.style.display = 'block';
    } else {
        copyBanListBtn.style.display = 'none';
        copyChatHistoryBtn.style.display = 'none';
        restoreBanListBtn.style.display = 'none';
        restoreChatHistoryBtn.style.display = 'none';
    }
}

// New function to resize image before converting to Data URL
function resizeImage(file, maxWidth, quality, callback) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions to fit within maxWidth/maxHeight
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxWidth) { // Using maxWidth for both dimensions for simplicity
                    width *= maxWidth / height;
                    height = maxWidth;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Convert canvas to Data URL (JPEG for better compression)
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(dataUrl);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Handle file selection
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        // Use the new resizeImage function
        resizeImage(file, MAX_IMAGE_DIMENSION, JPEG_QUALITY, (resizedDataUrl) => {
            selectedImageDataUrl = resizedDataUrl;
            displayImagePreview(selectedImageDataUrl);
        });
    } else {
        clearImagePreview();
    }
});

// Function to display image preview
function displayImagePreview(imageUrl) {
    imagePreviewContainer.innerHTML = '';
    
    const previewDiv = document.createElement('div');
    previewDiv.className = 'image-preview';
    previewDiv.innerHTML = `
        <img src=\"${imageUrl}\" alt=\"Preview\" style=\"max-width: 200px; max-height: 200px;\">
        <button type=\"button\" onclick=\"removeImagePreview()\">×</button>
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

// --- Event Listeners ---

// --- Full Message Submit Function (Fixed for Image + Text + Commands) ---
messageForm.addEventListener('submit', e => {
    e.preventDefault();

    const content = messageInputDiv.textContent.trim();

    if (!content && !selectedImageDataUrl) return;

    // --- Command handling ---
    if (content.startsWith('/')) {
        if (content.startsWith('/msg')) {
            // FIX: Updated regex to match literal / and "
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
            clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
            clearConfirmModal.show();
        } else if (content === '/machinegun' && isAdmin) {
            socket.emit('admin:machinegun');
        } else if (content.startsWith('/kick') && isAdmin) {
            // FIX: Updated regex to match literal / and optional "
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
            
            // Assuming target is quoted, or first word if not.
            // This part of the logic is more complex if we want to parse "username with spaces" without quotes.
            // For simplicity, we'll assume the user either types "username" or just username.
            // The split(' ') approach might break if the username itself has spaces and isn't quoted.
            // A more robust solution would involve a regex similar to /msg for parsing.
            // For now, we'll keep the existing split logic but clarify usage.
            
            let target = parts[1];
            let durationIndex = 2;
            let reasonIndex = 3;

            // Simple check for quoted username (e.g., /ban "John Doe" 30m reason)
            if (target.startsWith('"')) {
                const closingQuoteIndex = content.indexOf('"', 2); // Find closing quote after the first one
                if (closingQuoteIndex !== -1) {
                    target = content.substring(content.indexOf('"') + 1, closingQuoteIndex);
                    const remainingContent = content.substring(closingQuoteIndex + 1).trim();
                    const remainingParts = remainingContent.split(' ');
                    durationIndex = 0; // Duration is now the first part of remainingParts
                    reasonIndex = 1; // Reason is now the second part of remainingParts
                    parts.splice(1, parts.length - 1, target, ...remainingParts); // Reconstruct parts for easier access
                } else {
                    appendMessage({ 
                        username: 'System', 
                        content: 'Usage: /ban "username" duration reason (missing closing quote)', 
                        timestamp: new Date(), 
                        type: 'system' 
                    });
                    return;
                }
            } else {
                target = parts[1]; // No quotes, just take the first word
            }

            if (parts.length < reasonIndex + 1) { // Ensure we have enough parts after parsing target
                appendMessage({ 
                    username: 'System', 
                    content: 'Usage: /ban "username" duration reason', 
                    timestamp: new Date(), 
                    type: 'system' 
                });
                return;
            }
            
            const duration = parts[durationIndex];
            const reason = parts.slice(reasonIndex).join(' ');
            
            socket.emit('admin:google_ban_user', { 
                targetName: target,
                targetGoogleId: null, 
                days: 0, 
                hours: 0, 
                minutes: parseInt(duration) || 30,
                reason: reason
            });
        } else if (content.startsWith('/unban') && isAdmin) {
            // FIX: Updated regex to match literal / and optional "
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
            // FIX: Updated regex to match literal / and "
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
            appendMessage({ 
                username: 'System', 
                content: `Unknown command: ${content}`, 
                timestamp: new Date(), 
                type: 'system' 
            });
        }
        
        messageInputDiv.textContent = ''; 
        charCountSpan.textContent = `0/${MAX_CHARS}`;
        charCountContainer.style.color = '#ccc';
        clearImagePreview(); 
        return; 
    }

    // Normal message sending
    const messagePayload = { content: content, isPrivate: false };
    if (selectedImageDataUrl) messagePayload.image = { type:'image', url: selectedImageDataUrl };

    socket.emit('chat message', messagePayload);

    messageInputDiv.textContent = '';
    charCountSpan.textContent = `0/${MAX_CHARS}`;
    charCountContainer.style.color = '#ccc';
    clearImagePreview();
});

// Input Character Counter
messageInputDiv.addEventListener('input', () => {
  const text = messageInputDiv.innerText.trim();
  const currentLength = text.length;

  if (currentLength > MAX_CHARS) {
    messageInputDiv.innerText = text.substring(0, MAX_CHARS);
    charCountSpan.textContent = `${MAX_CHARS}/${MAX_CHARS}`;
  } else if (currentLength === 0) {
    charCountSpan.textContent = `0/${MAX_CHARS}`;
  } else {
    charCountSpan.textContent = `${currentLength}/${MAX_CHARS}`;
  }

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

// Admin Panel Button Handlers
document.getElementById('clearChatBtn').addEventListener('click', () => {
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

// Clear History Confirmation Click 
clearConfirmBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:clear_history', currentChatContext); 
    }
    clearConfirmModal.hide(); 
});

// Admin: Kick User Confirmation Click Handler
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

// Admin: Kick User Directly
document.getElementById('kickDirectlyBtn').addEventListener('click', () => {
     if (isAdmin && userToKick) {
         socket.emit('admin:kick_user', { targetName: userToKick });
     }
     kickConfirmModal.hide();
     userToKick = null;
     userGoogleIdToBan = null;
});

// Admin: IP Ban Submission
banConfirmBtn.addEventListener('click', () => {
    if (!isAdmin || !userToKick || !userGoogleIdToBan) {
        banModal.hide();
        return;
    }
    
    const days = parseInt(banDurationDaysInput.value);
    const hours = parseInt(banDurationHoursInput.value);
    const minutes = parseInt(banDurationMinutesInput.value);
    const reason = banReasonInput.value;
    
    if (isNaN(days) || isNaN(hours) || isNaN(minutes) || (days === 0 && hours === 0 && minutes === 0) || days > 999 || hours > 99 || minutes > 59) {
        alert('Invalid duration. Max: 999 days, 99 hours, 59 minutes. Duration must be > 0.');
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

// Admin: Log out (Go Anonymous)
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('admin:go_anonymous');
    }
});

// Chat Tab Switches
publicChatTab.addEventListener('click', () => switchChatContext('public'));
adminChatTab.addEventListener('click', () => switchChatContext(ADMIN_CHAT_ID));

// Rename form submission
document.getElementById('rename-form').addEventListener('submit', e => {
    e.preventDefault();
    const newName = document.getElementById('new-name-input').value.trim();
    if (newName) {
        socket.emit('name_change', newName);
    }
    renameModal.hide();
});

// Enable rename button after successful login
renameBtn.addEventListener('click', () => {
    document.getElementById('new-name-input').value = displayName;
    renameModal.show();
});

// Restore Ban List Confirmation
confirmRestoreBanListBtn.addEventListener('click', () => {
    const jsonText = restoreBanListTextarea.value.trim();
    if (!jsonText) {
        alert('Please paste JSON data into the textarea.');
        return;
    }
    try {
        const banListData = JSON.parse(jsonText);
        socket.emit('admin:restore_ban_list', banListData);
        restoreBanListModal.hide();
        restoreBanListTextarea.value = ''; // Clear textarea
    } catch (error) {
        alert('Invalid JSON format for Ban List. Please check your input.');
        console.error('Error parsing ban list JSON:', error);
    }
});

// Restore Chat History Confirmation
confirmRestoreChatHistoryBtn.addEventListener('click', () => {
    const jsonText = restoreChatHistoryTextarea.value.trim();
    if (!jsonText) {
        alert('Please paste JSON data into the textarea.');
        return;
    }
    try {
        const chatHistoryData = JSON.parse(jsonText);
        
        // Validate the structure
        if (!chatHistoryData.publicChat || !Array.isArray(chatHistoryData.publicChat)) {
            alert('Invalid format: Missing or invalid publicChat array');
            console.error('Invalid publicChat:', chatHistoryData.publicChat);
            return;
        }
        if (!chatHistoryData.adminChat || !Array.isArray(chatHistoryData.adminChat)) {
            alert('Invalid format: Missing or invalid adminChat array');
            console.error('Invalid adminChat:', chatHistoryData.adminChat);
            return;
        }
        
        console.log('Sending restore request with:', {
            publicCount: chatHistoryData.publicChat.length,
            adminCount: chatHistoryData.adminChat.length
        });
        
        socket.emit('admin:restore_chat_history', chatHistoryData);
        restoreChatHistoryModal.hide();
        restoreChatHistoryTextarea.value = ''; // Clear textarea
        
        appendMessage({ 
            username: 'System', 
            content: 'Restore request sent...', 
            timestamp: new Date(), 
            type: 'system' 
        });
    } catch (error) {
        alert('Invalid JSON format for Chat History. Please check your input.\\n\\nError: ' + error.message);
        console.error('Error parsing chat history JSON:', error);
    }
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
    
    updateAdminPanelButtonsVisibility(); // Use the updated function
    
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

// Chat Events
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

// Ban List Update
socket.on('ban_list_update', banList => {
    updateBannedUserList(banList);
});

// IP Banned Modal
socket.on('banned_modal', data => {
    const banReason = data.reason;
    const banDurationMs = data.banDurationMs;
    
    const bannedModalBody = document.getElementById('bannedModalBody');
    const bannedModal = new bootstrap.Modal(document.getElementById('bannedModal'));
    
    bannedModalBody.innerHTML = `You are BANNED from the chat.<br>Reason: <strong>${banReason}</strong><br>Time remaining: <span id=\"banTimer\"></span>`;
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
    
    socket.disconnect();
});

// User List Update
socket.on('user count', data => updatePublicUserList(data)); 

// Admin User Map Update
socket.on('admin_user_map', adminMap => {
    updateAdminManagementList(adminMap);
});

// ===== DIESEL CARTER COPY FUNCTIONALITY =====

// Copy Ban List Button Handler
document.getElementById('copyBanListBtn').addEventListener('click', () => {
    socket.emit('admin:request_full_ban_list');
});

// Copy Chat History Button Handler
document.getElementById('copyChatHistoryBtn').addEventListener('click', () => {
    socket.emit('admin:request_full_chat_history');
});

// Handle ban list copy response - Show in modal
socket.on('admin:ban_list_json', (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    
    const modalHTML = `
        <div class=\"modal fade\" id=\"copyDataModal\" tabindex=\"-1\" data-bs-backdrop=\"static\">\n            <div class=\"modal-dialog modal-lg\">\n                <div class=\"modal-content\">\n                    <div class=\"modal-header\">\n                        <h5 class=\"modal-title\">Ban List Data - Select All and Copy (Ctrl+C)</h5>\n                        <button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"modal\"></button>\n                    </div>\n                    <div class=\"modal-body\">\n                        <textarea id=\"copyDataText\" readonly style=\"width: 100%; height: 400px; background: #1e1e1e; color: #0f0; border: 1px solid #555; padding: 10px; font-family: monospace; font-size: 12px;\">${jsonStr}</textarea>\n                    </div>\n                    <div class=\"modal-footer\">\n                        <button type=\"button\" class=\"btn btn-primary\" onclick=\"document.getElementById('copyDataText').select(); document.execCommand('copy'); alert('Copied!');\">Copy to Clipboard</button>\n                        <button type=\"button\" class=\"btn btn-secondary\" data-bs-dismiss=\"modal\">Close</button>\n                    </div>\n                </div>\n            </div>\n        </div>
    `;
    
    const oldModal = document.getElementById('copyDataModal');
    if (oldModal) oldModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = new bootstrap.Modal(document.getElementById('copyDataModal'));
    modal.show();
    
    document.getElementById('copyDataModal').addEventListener('shown.bs.modal', () => {
        document.getElementById('copyDataText').select();
    });
});

// Handle chat history copy response - Show in modal
socket.on('admin:chat_history_json', (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    
    const modalHTML = `
        <div class=\"modal fade\" id=\"copyDataModal\" tabindex=\"-1\" data-bs-backdrop=\"static\">\n            <div class=\"modal-dialog modal-lg\">\n                <div class=\"modal-content\">\n                    <div class=\"modal-header\">\n                        <h5 class=\"modal-title\">Chat History Data - Select All and Copy (Ctrl+C)</h5>\n                        <button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"modal\"></button>\n                    </div>
                    <div class=\"modal-body\">\n                        <textarea id=\"copyDataText\" readonly style=\"width: 100%; height: 400px; background: #1e1e1e; color: #0f0; border: 1px solid #555; padding: 10px; font-family: monospace; font-size: 12px;\">${jsonStr}</textarea>\n                    </div>
                    <div class=\"modal-footer\">\n                        <button type=\"button\" class=\"btn btn-primary\" onclick=\"document.getElementById('copyDataText').select(); document.execCommand('copy'); alert('Copied!');\">Copy to Clipboard</button>\n                        <button type=\"button\" class=\"btn btn-secondary\" data-bs-dismiss=\"modal\">Close</button>\n                    </div>
                </div>
            </div>
        </div>
    `;
    
    const oldModal = document.getElementById('copyDataModal');
    if (oldModal) oldModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = new bootstrap.Modal(document.getElementById('copyDataModal'));
    modal.show();
    
    document.getElementById('copyDataModal').addEventListener('shown.bs.modal', () => {
        document.getElementById('copyDataText').select();
    });
});

// Restore Chat History Confirmation
confirmRestoreChatHistoryBtn.addEventListener('click', () => {
    const jsonText = restoreChatHistoryTextarea.value.trim();
    if (!jsonText) {
        alert('Please paste JSON data into the textarea.');
        return;
    }
    try {
        const chatHistoryData = JSON.parse(jsonText);
        
        // Validate the structure
        if (!chatHistoryData.publicChat || !Array.isArray(chatHistoryData.publicChat)) {
            alert('Invalid format: Missing or invalid publicChat array');
            console.error('Invalid publicChat:', chatHistoryData.publicChat);
            return;
        }
        if (!chatHistoryData.adminChat || !Array.isArray(chatHistoryData.adminChat)) {
            alert('Invalid format: Missing or invalid adminChat array');
            console.error('Invalid adminChat:', chatHistoryData.adminChat);
            return;
        }
        
        console.log('Sending restore request with:', {
            publicCount: chatHistoryData.publicChat.length,
            adminCount: chatHistoryData.adminChat.length
        });
        
        socket.emit('admin:restore_chat_history', chatHistoryData);
        restoreChatHistoryModal.hide();
        restoreChatHistoryTextarea.value = ''; // Clear textarea
        
        appendMessage({ 
            username: 'System', 
            content: 'Restore request sent...', 
            timestamp: new Date(), 
            type: 'system' 
        });
    } catch (error) {
        alert('Invalid JSON format for Chat History. Please check your input.\\n\\nError: ' + error.message);
        console.error('Error parsing chat history JSON:', error);
    }
});

