const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");

let currentUser = {
    name: null,       // Stores the secure login name or regular username
    isAdmin: false,
    displayName: null // Stores the final name seen in chat (essential for alignment checks)
};

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
    }
});

// Server rejected the name (reserved by staff)
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
        username: currentUser.name, // Sends the secure login name
        timestamp: new Date()
    });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  
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
  input.value = "";
}

function addMessage(username, content, timestamp, isAdmin = false) {
  const div = document.createElement('div');
  
  // FIXED ALIGNMENT LOGIC: Check if the message's display name matches the current user's display name
  const isOwn = (username === currentUser.displayName); 
  
  // Determine CSS classes for styling and alignment
  if (username === "System") {
      // System messages are centered
      div.className = isAdmin ? 'msg admin-system-msg' : 'msg system-msg';
  } else if (isOwn) {
      // All messages from the current user (staff or regular) align RIGHT
      div.className = `msg own ${isAdmin ? 'admin-msg' : ''}`;
  } else {
      // All messages from others (staff or regular) align LEFT
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


// --- Socket.IO Listeners ---

socket.on("history_cleared", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", `Chat history cleared by ${data.username}.`, new Date(), true);
});

socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
