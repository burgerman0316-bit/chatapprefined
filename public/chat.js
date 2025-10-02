// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
const clearChatBtn = document.getElementById("clearChatBtn");

let currentUser = {
    name: null, 
    picture: null,
    isAdmin: false 
};

// NEW STATE: Tracks if the admin has initiated the clear process
let isConfirmingClear = false;

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

// Function to send a message
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  
  if (!currentUser.name) {
    alert("Please enter and set your name first.");
    return;
  }
  
  if (text === "") return;

  // NEW FIX: If the user types a confirmation message, execute the clear!
  if (isConfirmingClear && currentUser.isAdmin && text.toUpperCase() === 'YES') {
      confirmClear();
      input.value = "";
      return; // Stop here, don't send "YES" as a regular message
  }
  
  // Reset confirmation state if the user typed something else
  isConfirmingClear = false;

  const nameInput = document.getElementById("usernameInput");
  currentUser.name = nameInput.value.trim() || "Anonymous";

  const messageData = {
    username: currentUser.name,
    content: text,
    timestamp: new Date(),
    isAdmin: currentUser.isAdmin
  };

  socket.emit("chat message", messageData);
  input.value = "";
}


// Function for Admin to clear messages (Step 1: Initiate Confirmation)
function clearMessages() {
    if (!currentUser.isAdmin) {
        alert("You must be an admin to clear the chat.");
        return;
    }

    // Set the state flag
    isConfirmingClear = true;

    // Display the custom confirmation prompt in the chat log
    addMessage("System", 
        "ADMIN ACTION: To confirm clearing the entire chat history, type **YES** and hit Send. Otherwise, type anything else or wait.", 
        new Date(), true);
}


// NEW: Function to execute the clear (Step 2: Final Confirmation)
function confirmClear() {
    // This is run after the admin types 'YES'
    isConfirmingClear = false; // Reset the state

    // Emit the admin event for the server to clear history
    socket.emit("admin:clear_history", {
        username: currentUser.name,
        timestamp: new Date()
    });
}


// Function to append a message to the chat container
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
  // Note: Simple markdown like **bold** is displayed literally here, 
  // but it makes the prompt clear in the source code.
  body.textContent = content; 

  div.appendChild(header);
  div.appendChild(body);
  messagesContainer.appendChild(div);
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// --- Socket.IO Listeners ---

// Server confirms history has been cleared
socket.on("history_cleared", (data) => {
    messagesContainer.innerHTML = "";
    // Display the custom system message confirming the action
    addMessage("System", `Chat history cleared by ${data.username}.`, new Date(), true);
});

// Load initial chat history upon connection
socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

// Receive a new chat message broadcast
socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
