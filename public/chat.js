const socket = io();
const messagesContainer = document.getElementById("messages"); 
const staffMessagesContainer = document.getElementById("staffMessages"); 
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput"); 
const staffMessageInput = document.getElementById("staffMessageInput"); 
const publicMessageForm = document.getElementById("messageForm"); 
const staffMessageForm = document.getElementById("staffMessageForm"); 
const chatModeToggleBtn = document.getElementById("chatModeToggle");
const chatModeIndicator = document.getElementById("chatModeIndicator");
const customAlertModal = document.getElementById("customAlertModal");
const customAlertMessage = document.getElementById("customAlertMessage");

// NEW DM VARIABLES
const dmUserList = document.getElementById("dmUserList");
let allUsers = []; // Array to store all connected users (display names)
let isDMMode = false;
let selectedDMUserIndex = -1; 

let currentUser = {
    name: null,        
    isAdmin: false,
    displayName: null
};

let currentChatMode = 'public'; 

// ======================================================
// CUSTOM ALERT FUNCTIONS
// ======================================================

function showCustomAlert(message) {
    customAlertMessage.textContent = message;
    customAlertModal.style.display = 'flex';
}

function hideCustomAlert() {
    customAlertModal.style.display = 'none';
}

// ======================================================
// DM AUTOCOMPLETE LOGIC (NEW)
// ======================================================

// Function to update the list of connected users from the server
socket.on('online_users', (users) => {
    // Filter out the current user and store the display names
    allUsers = users
        .filter(name => name.toLowerCase() !== currentUser.displayName?.toLowerCase())
        .sort((a, b) => a.localeCompare(b));
    // Re-check the input field in case DM mode is active
    checkDMInput(messageInput.value); 
});

function displayDMUserList(filteredUsers) {
    dmUserList.innerHTML = '';
    
    if (filteredUsers.length === 0 || !isDMMode) {
        dmUserList.style.display = 'none';
        return;
    }
    
    dmUserList.style.display = 'block';
    selectedDMUserIndex = 0; // Reset selection to the first item

    const maxItems = Math.min(filteredUsers.length, 5);
    
    for (let i = 0; i < maxItems; i++) {
        const name = filteredUsers[i];
        const item = document.createElement('div');
        item.className = 'dm-user-item';
        if (i === selectedDMUserIndex) {
            item.classList.add('selected');
        }
        item.textContent = name;
        item.dataset.username = name;
        
        // Handle click event to select a user
        item.addEventListener('click', () => selectDMUser(name));
        
        dmUserList.appendChild(item);
    }
}

function checkDMInput(inputValue) {
    if (!inputValue.startsWith('/?')) {
        isDMMode = false;
        dmUserList.style.display = 'none';
        return;
    }
    
    isDMMode = true;
    
    const colonIndex = inputValue.indexOf(':');
    let filterText = '';
    
    if (colonIndex === -1) {
        // No colon yet, the filter is everything after '/?'
        filterText = inputValue.substring(2).trim().toLowerCase();
    } else {
        // Colon found, the filter is everything between '/?' and ':'
        filterText = inputValue.substring(2, colonIndex).trim().toLowerCase();
    }

    // Filter the users
    const filteredUsers = allUsers.filter(user => 
        user.toLowerCase().startsWith(filterText)
    );
    
    // Display the filtered list
    displayDMUserList(filteredUsers);
}

function selectDMUser(username) {
    const colonIndex = messageInput.value.indexOf(':');
    let baseText = '/?';
    
    // If a colon already exists, preserve the message after it
    if (colonIndex !== -1) {
        const messagePart = messageInput.value.substring(colonIndex);
        baseText = messagePart;
    } else {
        baseText = " ";
    }
    
    // Replace the entire filter part with the selected username and a colon
    messageInput.value = `/?${username}:${baseText.trim() === ' ' ? ' ' : baseText}`;
    dmUserList.style.display = 'none';
    messageInput.focus();
    isDMMode = false;
}

// Event listener for typing in the message box
messageInput.addEventListener('input', (e) => {
    // Only proceed if public chat form is visible
    if (publicMessageForm.style.display === 'flex') {
        checkDMInput(e.target.value);
    }
});

// Event listener for keyboard navigation (up/down/enter)
messageInput.addEventListener('keydown', (e) => {
    if (!isDMMode || dmUserList.style.display === 'none') return;

    const items = dmUserList.querySelectorAll('.dm-user-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault(); 
    } else {
        return;
    }
    
    items[selectedDMUserIndex]?.classList.remove('selected');

    if (e.key === 'ArrowDown') {
        selectedDMUserIndex = (selectedDMUserIndex + 1) % items.length;
    } else if (e.key === 'ArrowUp') {
        selectedDMUserIndex = (selectedDMUserIndex - 1 + items.length) % items.length;
    } else if (e.key === 'Enter') {
        const selectedName = items[selectedDMUserIndex].dataset.username;
        selectDMUser(selectedName);
        return;
    }
    
    items[selectedDMUserIndex].classList.add('selected');
    items[selectedDMUserIndex].scrollIntoView({ block: 'nearest' });
});


// ======================================================
// CHAT MODE SWITCHING
// ======================================================

function toggleChatMode(mode) {
    if (!currentUser.isAdmin) return;

    if (mode === currentChatMode) return;

    currentChatMode = mode;

    if (mode === 'private') {
        messagesContainer.style.display = 'none';
        staffMessagesContainer.style.display = 'flex'; 
        publicMessageForm.style.display = 'none';
        staffMessageForm.style.display = 'flex';
        chatModeToggleBtn.textContent = 'Public Chat';
        chatModeToggleBtn.onclick = () => toggleChatMode('public');
        chatModeIndicator.textContent = 'Staff Chat (Private)';
        staffMessageInput.focus();
        dmUserList.style.display = 'none'; // Hide DM list in staff chat
    } else {
        messagesContainer.style.display = 'flex';
        staffMessagesContainer.style.display = 'none';
        publicMessageForm.style.display = 'flex';
        staffMessageForm.style.display = 'none';
        chatModeToggleBtn.textContent = 'Staff Chat';
        chatModeToggleBtn.onclick = () => toggleChatMode('private');
        chatModeIndicator.textContent = 'Public Chat';
        messageInput.focus();
    }
    const activeContainer = mode === 'private' ? staffMessagesContainer : messagesContainer;
    activeContainer.scrollTop = activeContainer.scrollHeight;
}

// ======================================================
// NAME VALIDATION AND LOGIN
// ======================================================

function changeName() {
    const newName = usernameInput.value.trim();

    if (newName === "") {
        showCustomAlert("Please enter a username to join the chat.");
        return;
    }
    
    currentUser.name = newName; 
    socket.emit("check_staff_status", newName); 
}

// Server accepted the name (regular user)
socket.on('name_accepted', (displayName) => {
    currentUser.isAdmin = false;
    currentUser.displayName = displayName;
    
    staffControlsDiv.style.display = 'none'; 
    
    usernameInput.disabled = true; 
    document.querySelector('.header-area button').disabled = true;
    messageInput.focus(); 
});

// Server accepted the name (staff user)
socket.on("staff_status_update", (data) => {
    if (data.secureName === currentUser.name) {
        currentUser.isAdmin = true;
        currentUser.displayName = data.displayName;
        
        staffControlsDiv.style.display = 'inline-block'; 
        
        addMessage("System", `${data.displayName} has logged in.`, new Date(), true); 
        
        usernameInput.value = ''; // SECURITY: Immediately clear secure login name
        
        usernameInput.disabled = true;
        document.querySelector('.header-area button').disabled = true;
        messageInput.focus(); 
    }
});

// Server rejected the name 
socket.on('name_rejected', (reason) => {
    showCustomAlert(reason); 
    usernameInput.value = ''; 
    currentUser.name = null;
    currentUser.isAdmin = false;
    currentUser.displayName = null;
    staffControlsDiv.style.display = 'none';
});


// ======================================================
// CONTROLS AND MESSAGING FUNCTIONS
// ======================================================

function showAdminModal() {
    if (!currentUser.isAdmin) {
        showCustomAlert("You must be staff to clear the chat."); 
        return;
    }
    document.getElementById("adminModal").style.display = 'flex'; 
}

function hideAdminModal() {
    document.getElementById("adminModal").style.display = 'none';
}

function confirmClear() {
    hideAdminModal();
    socket.emit("admin:clear_history", {
        username: currentUser.name, 
        timestamp: new Date()
    });
}

function sendMessage() {
    const fullText = messageInput.value.trim(); 
  
    if (!currentUser.name) {
        showCustomAlert("Please enter and set your username first."); 
        return;
    }
  
    if (fullText === "") return;
  
    // --- DM LOGIC START ---
    if (fullText.startsWith('/?')) {
        const parts = fullText.substring(2).split(':');
        const targetUser = parts[0].trim();
        const dmContent = parts.slice(1).join(':').trim();
        
        if (!targetUser || !dmContent) {
            showCustomAlert("DM format error. Use: /? [Name]: [Message]");
            return;
        }
        
        if (targetUser.toLowerCase() === currentUser.displayName.toLowerCase()) {
            showCustomAlert("You cannot send a direct message to yourself.");
            return;
        }

        // Send to server as a direct message
        socket.emit("direct message", {
            from: currentUser.displayName, 
            to: targetUser,
            content: dmContent,
            timestamp: new Date()
        });
        
        // Immediately display the message in the sender's own public chat view
        addMessage(
            targetUser, 
            dmContent, 
            new Date(), 
            currentUser.isAdmin, 
            false, 
            'dm-sent' 
        );
        
        messageInput.value = ""; 
        dmUserList.style.display = 'none';
        return; 
    }
    // --- DM LOGIC END ---

    // PUBLIC CHAT MESSAGE
    const messageData = {
        username: currentUser.name, 
        content: fullText,
        timestamp: new Date(),
    };

    socket.emit("chat message", messageData);
    messageInput.value = ""; 
    messageInput.focus(); 
}

function sendStaffMessage() {
    const text = staffMessageInput.value.trim(); 

    if (!currentUser.isAdmin) {
        showCustomAlert("You must be staff to use the private chat."); 
        return;
    }
    
    if (text === "") return;

    const messageData = {
        username: currentUser.name, 
        content: text,
        timestamp: new Date(),
    };

    socket.emit("staff message", messageData);
    staffMessageInput.value = "";
    staffMessageInput.focus();
}


function addMessage(username, content, timestamp, isAdmin = false, isStaffChat = false, type = 'public') {
    const container = isStaffChat ? staffMessagesContainer : messagesContainer;
    const div = document.createElement('div');
    
    const isOwn = (type === 'dm-sent' || username.toLowerCase() === currentUser.displayName.toLowerCase()); 
    
    if (username === "System") {
        div.className = isAdmin ? 'msg admin-system-msg' : 'msg system-msg';
    } else if (type === 'dm-received') {
        div.className = `msg other dm-received ${isAdmin ? 'admin-msg' : ''}`;
        username = `DM from ${username}`; // Change display name for clarity
    } else if (type === 'dm-sent') {
        div.className = `msg own dm-sent ${isAdmin ? 'admin-msg' : ''}`;
        username = `DM to ${username}`; // Change display name for clarity
    } else if (isOwn) {
        div.className = `msg own ${isAdmin ? 'admin-msg' : ''}`;
    } else {
        div.className = `msg other ${isAdmin ? 'admin-msg' : ''}`;
    }

    const header = document.createElement('div');
    header.className = 'msg-header';
    const time = new Date(timestamp);
    header.textContent = `${username}${isStaffChat ? ' (STAFF)' : ''} • ${time.toLocaleTimeString()}`;

    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = content;
    
    div.appendChild(header);
    div.appendChild(body);
    container.appendChild(div);
    
    container.scrollTop = container.scrollHeight;
}


// --- Socket.IO Listeners ---

socket.on("history_cleared", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", `Chat history cleared by ${data.username}.`, new Date(), true, false);
});

socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin, false));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin, false);
});

socket.on("staff message", (msg) => {
    if (currentUser.isAdmin) {
        addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin, true);
    }
});

// NEW: DM Received Listener
socket.on("direct message", (msg) => {
    // Only add if we are NOT in staff chat, and it's addressed to our display name
    if (currentChatMode === 'public' && msg.to.toLowerCase() === currentUser.displayName.toLowerCase()) {
        addMessage(
            msg.from, 
            msg.content, 
            msg.timestamp, 
            msg.isAdmin, 
            false, 
            'dm-received'
        );
    }
});
