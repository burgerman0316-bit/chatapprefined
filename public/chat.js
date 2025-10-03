const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput");
const userCountDisplay = document.getElementById("userCountDisplay"); // DOM variable for user count

let currentUser = {
    name: null,        
    isAdmin: false,
    displayName: null
};

// ======================================================
// ENTER KEY PRESS / SEND MESSAGE
// ======================================================

// Ensure the Enter key submits the form when input is focused
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});


// ======================================================
// NAME VALIDATION AND LOGIN
// ======================================================

function changeName() {
    const newName = usernameInput.value.trim();

    if (newName === "") {
        alert("Please enter a username to join the chat.");
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
    addMessage("System", `${displayName} has joined the chat.`, new Date());
    
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

// Server rejected the name (reserved, banned, or in use)
socket.on('name_rejected', (reason) => {
    alert(reason);
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
        alert("You must be staff to clear the chat.");
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
    alert("Please enter and set your username first.");
    return;
  }
  
  if (text === "") return;

  const messageData = {
    username: currentUser.name, 
    content: text,
    timestamp: new Date(),
  };

  socket.emit("chat message", messageData);
  messageInput.value = ""; // Clear input after send
  messageInput.focus(); // Keep focus on the input field
}

function addMessage(username, content, timestamp, isAdmin = false) {
  const div = document.createElement('div');
  
  const isOwn = (username === currentUser.displayName); 
  
  if (username === "System" || username === "System Alert") {
      div.className = isAdmin ? 'msg admin-system-msg' : 'msg system-msg';
  } else if (isOwn) {
      div.className = `msg own ${isAdmin ? 'admin-msg' : ''}`;
  } else {
      div.className = `msg other ${isAdmin ? 'admin-msg' : ''}`;
  }
  
  const header = document.createElement('div');
  header.className = 'msg-header';
  
  const time = new Date(timestamp);
  header.textContent = `${username} • ${time.toLocaleTimeString()}`;

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = content;
  
  div.appendChild(header);
  div.appendChild(body);
  messagesContainer.appendChild(div);
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// ======================================================
// SOCKET.IO LISTENERS
// ======================================================

// --- HISTORY CLEAR LISTENERS (Private/Public) ---
socket.on("history_cleared_staff", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true); 
});

socket.on("history_cleared_public", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true);
});

// --- MESSAGING AND HISTORY ---
socket.on("chat history", (msgs) => {
    messagesContainer.innerHTML = "";
    msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
    addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});

// --- USER COUNT LISTENER ---
socket.on("user count", (count) => {
    userCountDisplay.textContent = `${count} User${count !== 1 ? 's' : ''} Online`;
});

// --- ERROR LISTENER ---
socket.on('system_error', (errorMsg) => {
    addMessage("System Alert", errorMsg, new Date(), true); 
});
