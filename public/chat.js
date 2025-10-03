const socket = io();
const messagesContainer = document.getElementById("messages"); // Public container
const staffMessagesContainer = document.getElementById("staffMessages"); // New private container
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput"); // Public input
const staffMessageInput = document.getElementById("staffMessageInput"); // New private input
const publicMessageForm = document.getElementById("messageForm"); // Public form
const staffMessageForm = document.getElementById("staffMessageForm"); // New private form
const chatModeToggleBtn = document.getElementById("chatModeToggle");
const chatModeIndicator = document.getElementById("chatModeIndicator");
// NEW: Custom Alert Modal elements
const customAlertModal = document.getElementById("customAlertModal");
const customAlertMessage = document.getElementById("customAlertMessage");


let currentUser = {
    name: null,        
    isAdmin: false,
    displayName: null
};

let currentChatMode = 'public'; // 'public' or 'private'

// ======================================================
// NEW: CUSTOM ALERT FUNCTIONS (REPLACE alert())
// ======================================================

function showCustomAlert(message) {
    customAlertMessage.textContent = message;
    customAlertModal.style.display = 'flex';
}

function hideCustomAlert() {
    customAlertModal.style.display = 'none';
}

// ======================================================
// CHAT MODE SWITCHING
// ======================================================

function toggleChatMode(mode) {
    if (!currentUser.isAdmin) return;
    // ... (rest of toggleChatMode remains the same)
    
    if (mode === currentChatMode) return;

    currentChatMode = mode;

    if (mode === 'private') {
        messagesContainer.style.display = 'none';
        staffMessagesContainer.style.display = 'flex'; // Use flex for message alignment
        publicMessageForm.style.display = 'none';
        staffMessageForm.style.display = 'flex';
        chatModeToggleBtn.textContent = 'Public Chat';
        chatModeToggleBtn.onclick = () => toggleChatMode('public');
        chatModeIndicator.textContent = 'Staff Chat (Private)';
        staffMessageInput.focus();
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
    // Scroll to the bottom of the active chat
    const activeContainer = mode === 'private' ? staffMessagesContainer : messagesContainer;
    activeContainer.scrollTop = activeContainer.scrollHeight;
}

// ======================================================
// NAME VALIDATION AND LOGIN
// ======================================================

function changeName() {
    const newName = usernameInput.value.trim();

    if (newName === "") {
        showCustomAlert("Please enter a username to join the chat."); // <--- REPLACED ALERT
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
        
        usernameInput.disabled = true;
        document.querySelector('.header-area button').disabled = true;
        messageInput.focus(); 
    }
});

// Server rejected the name (reserved by staff)
socket.on('name_rejected', (reason) => {
    showCustomAlert(reason); // <--- REPLACED ALERT
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
        showCustomAlert("You must be staff to clear the chat."); // <--- REPLACED ALERT
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
  const text = messageInput.value.trim(); 
  
  if (!currentUser.name) {
    showCustomAlert("Please enter and set your username first."); // <--- REPLACED ALERT
    return;
  }
  
  if (text === "") return;

  const messageData = {
    username: currentUser.name, 
    content: text,
    timestamp: new Date(),
  };

  socket.emit("chat message", messageData);
  messageInput.value = ""; 
  messageInput.focus(); 
}

// NEW: Staff Chat Send Function
function sendStaffMessage() {
    const text = staffMessageInput.value.trim(); 

    if (!currentUser.isAdmin) {
        showCustomAlert("You must be staff to use the private chat."); // <--- REPLACED ALERT
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


function addMessage(username, content, timestamp, isAdmin = false, isStaffChat = false) {
    const container = isStaffChat ? staffMessagesContainer : messagesContainer;
    const div = document.createElement('div');
    
    const isOwn = (username === currentUser.displayName); 
    
    if (username === "System") {
        div.className = isAdmin ? 'msg admin-system-msg' : 'msg system-msg';
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
