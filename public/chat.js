// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// Simple user object for tracking the name and admin status
let currentUser = {
    name: "Guest", 
    picture: null,
    isAdmin: false 
};

// Function to update the current user's name AND check for admin access
function changeName() {
    const nameInput = document.getElementById("usernameInput");
    const passInput = document.getElementById("adminPasswordInput");
    
    const newName = nameInput.value.trim();
    const adminPassAttempt = passInput.value.trim();

    // *** ADMIN CONFIGURATION ***
    const ADMIN_NAMES = ["Admin", "Moderator", "Coach"]; 
    const ADMIN_PASSWORD = "your-secret-admin-pass"; 

    if (newName === "") {
        alert("Name cannot be empty. Please enter something.");
        return;
    }

    // 1. Check Admin Access (Name-based OR Password-based)
    let isNameAdmin = ADMIN_NAMES.includes(newName);
    let isPassAdmin = (adminPassAttempt === ADMIN_PASSWORD);

    let previousAdminStatus = currentUser.isAdmin;
    currentUser.isAdmin = isNameAdmin || isPassAdmin;
    
    if (adminPassAttempt !== "" && !isPassAdmin) {
        alert("Incorrect Admin Password.");
    }
    
    // 2. Set the Name
    currentUser.name = newName;

    // 3. Provide Custom System Message
    let systemMessage = `${currentUser.name} has set their name.`;
    
    if (currentUser.isAdmin && !previousAdminStatus) {
        systemMessage = `${currentUser.name} has joined the chat (ADMIN).`;
    }

    // Use a custom system message instead of a browser alert
    addMessage("System", systemMessage, new Date(), currentUser.isAdmin);

    // Clean up password field for security
    passInput.value = "";
}

// Send a message
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (text === "") return;

  // Read the name from the input box just before sending
  const nameInput = document.getElementById("usernameInput");
  currentUser.name = nameInput.value.trim() || "Anonymous";

  const messageData = {
    username: currentUser.name,
    content: text,
    timestamp: new Date(),
    isAdmin: currentUser.isAdmin // Send admin status with the message
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat, now accepting the isAdmin flag
function addMessage(username, content, timestamp, isAdmin = false) {
  const isOwn = username === currentUser.name;

  const div = document.createElement('div');
  // Use the CSS classes for styling
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
  // Ensure we pass the isAdmin flag from history if the server is saving it
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  // Ensure we receive the isAdmin flag from the server
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
