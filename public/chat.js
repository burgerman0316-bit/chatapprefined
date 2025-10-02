// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
const clearChatBtn = document.getElementById("clearChatBtn");

let currentUser = {
    name: null, 
    picture: null,
    isAdmin: false 
};

// Function to update the current user's name AND check for admin access
function changeName() {
    const nameInput = document.getElementById("usernameInput");
    const newName = nameInput.value.trim();

    // *** NAME-BASED ADMIN CONFIGURATION (Case-insensitive, includes OWNER) ***
    const ADMIN_NAMES = ["ADMIN", "MODERATOR", "COACH", "OWNER"]; 

    if (newName === "") {
        alert("Please enter a name to join the chat.");
        return;
    }

    // 1. Check Admin Access (Case-insensitive check)
    let previousAdminStatus = currentUser.isAdmin;
    currentUser.isAdmin = ADMIN_NAMES.includes(newName.toUpperCase());
    
    // 2. Set the Name
    currentUser.name = newName;

    // 3. Show/Hide Clear Chat Button based on status
    clearChatBtn.style.display = currentUser.isAdmin ? 'inline-block' : 'none';

    // 4. Provide Custom System Message
    let systemMessage = `${currentUser.name} has set their name.`;
    
    if (currentUser.isAdmin && !previousAdminStatus) {
        systemMessage = `${currentUser.name} has joined the chat (ADMIN).`;
    }

    addMessage("System", systemMessage, new Date(), currentUser.isAdmin);
}

// FIX: Send a message
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  
  if (!currentUser.name) {
    alert("Please enter and set your name first.");
    return;
  }
  
  if (text === "") return;

  const nameInput = document.getElementById("usernameInput");
  currentUser.name = nameInput.value.trim() || "Anonymous";

  const messageData = {
    username: currentUser.name,
    content: text,
    timestamp: new Date(),
    isAdmin: currentUser.isAdmin
  };

  // This line sends the message data to the server
  socket.emit("chat message", messageData);
  input.value = "";
}


// NEW: Function to clear messages (Admin only)
function clearMessages() {
    if (!currentUser.isAdmin) {
        alert("You must be an admin to clear the chat.");
        return;
    }

    if (confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
        // This emits the admin event for the server to clear history
        socket.emit("admin:clear_history", {
            username: currentUser.name,
            timestamp: new Date()
        });
    }
}


// Add message to chat
function addMessage(username, content, timestamp, isAdmin = false) {
  const isOwn = username === currentUser.name;

  const div = document.createElement('div');
  div.className = `msg ${isOwn ? 'own' : 'other'}`;
  
  if (isAdmin) {
      div.classList.add("admin-msg");
  }
  if (username === "System") {
      div.classList.add("system-msg");
  }

  const header = document.createElement('div');
  header.className = 'msg-header';
  
  const displayName = isAdmin ? `${username} (ADMIN)` : username;
  
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


// Listen for chat events

// Listen for the specific event sent by the server after history is cleared
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
