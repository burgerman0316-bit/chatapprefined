const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls"); // NEW

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
    
    // Temporarily store the raw input
    currentUser.name = newName; 
    
    // Ask the server to validate the name and check for staff status
    socket.emit("check_staff_status", newName); 
}

// NEW: Server accepted the name (regular user)
socket.on('name_accepted', (displayName) => {
    currentUser.isAdmin = false;
    // Hide staff controls for regular users
    staffControlsDiv.style.display = 'none'; 
    addMessage("System", `${displayName} has joined the chat.`, new Date());
    
    // Disable the name input after successful join
    usernameInput.disabled = true; 
    document.querySelector('.header-area button').disabled = true;
});

// NEW: Server accepted the name (staff user)
socket.on("staff_status_update", (data) => {
    // Only update if the received status is for the current user
    if (data.secureName === currentUser.name) {
        currentUser.isAdmin = true;
        
        // Show staff controls
        staffControlsDiv.style.display = 'flex'; 
        
        // The server sends the public display name, but we still use the secureName
        // for internal validation on message send.
        
        addMessage("System", `${data.displayName} has logged in.`, new Date(), true); 
        
        // Disable the name input after successful join
        usernameInput.disabled = true;
        document.querySelector('.header-area button').disabled = true;
    }
});

// NEW: Server rejected the name (reserved by staff)
socket.on('name_rejected', (reason) => {
    alert(reason);
    // Clear the name input so the user has to try again
    usernameInput.value = ''; 
    currentUser.name = null;
    currentUser.isAdmin = false;
    staffControlsDiv.style.display = 'none';
});


// --- MODAL & CONTROLS FUNCTIONS ---

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
        username: currentUser.name, // Sends the secure login name
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
    username: currentUser.name, 
    content: text,
    timestamp: new Date(),
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

function addMessage(username, content, timestamp, isAdmin = false) {
  const div = document.createElement('div');
  const isOwn = (username === currentUser.name) || (isAdmin && currentUser.isAdmin); // Simple logic for 'own'

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
  
  let displayName = username; // Display the name as sent by the server
  
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
    addMessage("System", `Chat history cleared by ${data.username}.`, new Date(), true);
});

socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
