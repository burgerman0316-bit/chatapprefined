// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
const clearChatBtn = document.getElementById("clearChatBtn");
// Get the modal element
const adminModal = document.getElementById("adminModal"); 

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

    let previousAdminStatus = currentUser.isAdmin;
    currentUser.isAdmin = ADMIN_NAMES.includes(newName.toUpperCase());
    
    currentUser.name = newName;

    // Show/Hide Clear Chat Button based on status
    clearChatBtn.style.display = currentUser.isAdmin ? 'inline-block' : 'none';

    // --- SECURITY FIX: DO NOT ANNOUNCE ADMIN LOGIN TO THE CHAT ---
    if (currentUser.isAdmin) {
        // Log to the console for the admin's eyes only (if they open the console)
        console.log(`[Admin Login]: Logged in as ${currentUser.name}`);
        return; 
    }
    
    // 4. Provide Custom System Message for NON-ADMIN users
    let systemMessage = `${currentUser.name} has set their name.`;
    addMessage("System", systemMessage, new Date(), false); // Ensure it's not marked as admin message
}


// --- MODAL CONTROL FUNCTIONS ---

function showAdminModal() {
    if (!currentUser.isAdmin) {
        alert("You must be an admin to clear the chat.");
        return;
    }
    adminModal.style.display = 'flex'; // Display the pop-up
}

function hideAdminModal() {
    adminModal.style.display = 'none';
}

function confirmClear() {
    // 1. Hide the modal immediately
    hideAdminModal();

    // 2. Emit the command to the server
    socket.emit("admin:clear_history", {
        username: currentUser.name,
        timestamp: new Date()
    });
}


// --- MESSAGING FUNCTIONS ---

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

  socket.emit("chat message", messageData);
  input.value = "";
}

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


// --- Socket.IO Listeners ---

socket.on("history_cleared", (data) => {
    messagesContainer.innerHTML = "";
    // Display the custom system message confirming the action
    addMessage("System", `Chat history cleared by ${data.username}.`, new Date(), true);
});

socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
