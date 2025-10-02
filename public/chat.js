// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// Simple user object for tracking the name and admin status
let currentUser = {
    name: null, // Initialized to null (no default name)
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

    // 3. Provide Custom System Message
    let systemMessage = `${currentUser.name} has set their name.`;
    
    if (currentUser.isAdmin && !previousAdminStatus) {
        systemMessage = `${currentUser.name} has joined the chat (ADMIN).`;
    }

    // Use a custom system message instead of a browser alert
    addMessage("System", systemMessage, new Date(), currentUser.isAdmin);
}

// Send a message - FIX for messages not sending
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  
  // FIX: Check if a name has been set before sending
  if (!currentUser.name) {
    alert("Please enter and set your name first.");
    return;
  }
  
  if (text === "") return;

  // Read the name from the input box just before sending (safety)
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

// Add message to chat, now accepting the isAdmin flag
function addMessage(username, content, timestamp, isAdmin = false) {
  const isOwn = username === currentUser.name;

  const div = document.createElement('div');
  div.className = `msg ${isOwn ? 'own' : 'other'}`;
  
  // Add Admin styling class if applicable
  if (isAdmin) {
      div.classList.add("admin-msg");
  }
  // Add System message class if applicable
  if (username === "System") {
      div.classList.add("system-msg");
  }

  const header = document.createElement('div');
  header.className = 'msg-header';
  
  // Display (ADMIN) next to the name if the flag is true
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
socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
