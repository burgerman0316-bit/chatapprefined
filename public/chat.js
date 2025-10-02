// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
const clearChatBtn = document.getElementById("clearChatBtn");
const usernameInput = document.getElementById("usernameInput"); 

let currentUser = {
    name: null, 
    picture: null,
    isAdmin: false 
};

// Function to update the current user's name AND check for staff access
function changeName() {
    const newName = usernameInput.value.trim();

    // *** STAFF CONFIGURATION (Case-insensitive) ***
    // Note: The system will display the full name for a Staff member.
    const STAFF_NAMES = ["ADMIN", "MODERATOR", "COACH", "OWNER"]; 

    if (newName === "") {
        alert("Please enter a name to join the chat.");
        return;
    }

    let previousAdminStatus = currentUser.isAdmin;
    
    // Check if the entered name matches a staff keyword
    currentUser.isAdmin = STAFF_NAMES.includes(newName.toUpperCase());
    
    currentUser.name = newName;

    // Show/Hide Clear Chat Button based on status
    clearChatBtn.style.display = currentUser.isAdmin ? 'inline-block' : 'none';

    // --- Announce Staff/User join or name change ---
    
    // 1. If user just became staff, announce it generally.
    if (currentUser.isAdmin && !previousAdminStatus) {
        // isAdmin is TRUE, triggering the yellow 'admin-system-msg' style
        addMessage("System", `${currentUser.name} (Staff) has joined the chat.`, new Date(), true); 
        return; 
    }
    
    // 2. If user is changing name, announce the change.
    let systemMessage = `${currentUser.name} has set their name.`;
    // If they were already staff and changed the name, the system message remains staff styled.
    addMessage("System", systemMessage, new Date(), currentUser.isAdmin);
}


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

    // Emit the command with the staff member's real name
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

  // The client always sends its *actual* username
  const messageData = {
    username: currentUser.name,
    content: text,
    timestamp: new Date(),
    isAdmin: currentUser.isAdmin
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// CRITICAL CHANGE: Logic to display the message header
function addMessage(username, content, timestamp, isAdmin = false) {
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
  
  // *** NEW DISPLAY NAME LOGIC ***
  let displayName;
  
  if (isAdmin && username !== "System") {
      // If it's a staff member's chat message, display their actual name and the (Staff) tag
      displayName = `${username} (Staff)`; 
  } else if (username === "System") {
      // System messages use "System" as the display name
      displayName = "System";
  } else {
      // All regular users display their chosen name
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
    // Display the full name of the staff member who cleared it
    addMessage("System", `Chat history cleared by ${data.username} (Staff).`, new Date(), true);
});

socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});
