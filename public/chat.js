const socket = io();
const messagesContainer = document.getElementById("messages");
const clearChatBtn = document.getElementById("clearChatBtn");
const usernameInput = document.getElementById("usernameInput"); 

// currentUser now stores the SECURE name the staff entered 
let currentUser = {
    name: null, 
    isAdmin: false 
};

// --- AUTHENTICATION & LOGIN ---

function changeName() {
    const newName = usernameInput.value.trim();

    if (newName === "") {
        alert("Please enter a username to join the chat.");
        return;
    }
    
    // Store the raw input as the current user's name (could be secure login or regular name)
    currentUser.name = newName;
    
    // We emit the entered name to the server for validation
    socket.emit("check_staff_status", newName); 

    // Announce the connection (the server will correct the name if it's staff)
    addMessage("System", `${newName} is connecting...`, new Date(), false);
    
    // A regular user is just assumed to be logged in
    currentUser.isAdmin = false;
    clearChatBtn.style.display = 'none';
}

// NEW: Server tells the client if they are staff
socket.on("staff_status_update", (data) => {
    // Only update if the received status is for the current user
    if (data.secureName === currentUser.name) {
        currentUser.isAdmin = data.isAdmin;
        
        // Update the clear chat button visibility based on the server's response
        clearChatBtn.style.display = currentUser.isAdmin ? 'inline-block' : 'none';
        
        // Announce the final connection with the public display name from the server
        addMessage("System", `${data.displayName} (Staff) has joined the chat.`, new Date(), true); 
    }
});


// --- MODAL CONTROL FUNCTIONS ---

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

    // Emit the SECURE username for the server to validate
    socket.emit("admin:clear_history", {
        username: currentUser.name, // Sends the secure username
        timestamp: new Date()
    });
}


// --- MESSAGING FUNCTIONS ---

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  
  if (!currentUser.name) {
    alert("Please enter and set your username first.");
    return;
  }
  
  if (text === "") return;

  // The client always sends the raw entered name (secure or public)
  const messageData = {
    username: currentUser.name, // Sends the secure username or public username
    content: text,
    timestamp: new Date(),
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// CRITICAL CHANGE: The server sends the FINAL name to display
function addMessage(username, content, timestamp, isAdmin = false) {
  // NOTE: 'username' here is already the CORRECT display name (secure login name is hidden)
  const isOwn = username === currentUser.name;

  const div = document.createElement('div');
  div.className = `msg ${isOwn ? 'own' : 'other'}`;
  
  if (isAdmin) {
      div.classList.add("admin-msg");
  }
  
  if (username === "System") {
      if (isAdmin) {
          div.classList.add("admin-system-msg");
      } else {
          div.classList.add("system-msg");
      }
  }

  const header = document.createElement('div');
  header.className = 'msg-header';
  
  // *** NEW DISPLAY NAME LOGIC (Simplified) ***
  let displayName;
  
  if (isAdmin && username !== "System") {
      // If it's a staff member's chat message, display their actual name and the (Staff) tag
      displayName = `${username} (Staff)`; 
  } else {
      // All other users or system messages display the name as received
      displayName = username;
  }
  
  const time = new Date(timestamp);
  header.textContent = `${displayName} • ${time.toLocaleTimeString()}`;

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
    // The server sends the public staff name who cleared it
    addMessage("System", `Chat history cleared by ${data.username} (Staff).`, new Date(), true);
});

socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  // The server sends the correct public name here
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
