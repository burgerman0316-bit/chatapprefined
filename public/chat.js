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
    const ADMIN_NAMES = ["STAFF_CONTROLS1029384756"]; 

    if (newName === "") {
        alert("Please enter a name to join the chat.");
        return;
    }

    let previousAdminStatus = currentUser.isAdmin;
    currentUser.isAdmin = ADMIN_NAMES.includes(newName.toUpperCase());
    
    currentUser.name = newName;

    // Show/Hide Clear Chat Button based on status
    clearChatBtn.style.display = currentUser.isAdmin ? 'inline-block' : 'none';

    // --- Announce a generic staff join message ---
    
    // 1. If user just became a staff member, announce it generally.
    if (currentUser.isAdmin && !previousAdminStatus) {
        // isAdmin is TRUE, triggering the yellow 'admin-system-msg' style
        addMessage("System", "A staff member has joined the chat.", new Date(), true); 
        return; 
    }
    
    // 2. If user is changing name but NOT staff, announce the name change.
    if (!currentUser.isAdmin) {
        let systemMessage = `${currentUser.name} has set their name.`;
        // isAdmin is FALSE, triggering the standard blue 'system-msg' style
        addMessage("System", systemMessage, new Date(), false);
    }
}


// --- MODAL CONTROL FUNCTIONS ---

function showAdminModal() {
    if (!currentUser.isAdmin) {
        alert("You must be staff to clear the chat.");
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

// FINAL LOGIC: The logic to display the message header and apply system classes
function addMessage(username, content, timestamp, isAdmin = false) {
  const isOwn = username === currentUser.name;

  const div = document.createElement('div');
  div.className = `msg ${isOwn ? 'own' : 'other'}`;
  
  if (isAdmin) {
      div.classList.add("admin-msg");
  }
  
  if (username === "System") {
      // Apply yellow class if it's an admin-related system message
      if (isAdmin) {
          div.classList.add("admin-system-msg");
      } else {
          div.classList.add("system-msg");
      }
  }

  const header = document.createElement('div');
  header.className = 'msg-header';
  
  // *** ROLE NAME FIX: Admin names are generalized to "Staff" for display ***
  let displayName;
  
  if (isAdmin) {
      displayName = "Staff";
  } else {
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
    // This is an admin action, so isAdmin=true flags the yellow system message style
    addMessage("System", `Chat history cleared by a staff member`, new Date(), true);
});

socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});


