// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
let currentUser = null;

// New login logic to replace Google Sign-In
function loginUser() {
    const nameInput = document.getElementById("usernameInput").value.trim();
    const adminPassInput = document.getElementById("adminPasswordInput").value.trim();

    // *** IMPORTANT: SET YOUR ADMIN PASSWORD HERE ***
    const adminPassword = "your-secret-admin-pass"; 

    if (nameInput === "") {
        alert("Please enter your name.");
        return;
    }

    // Determine if the user is an admin
    let isAdmin = false;
    if (adminPassInput === adminPassword) {
        isAdmin = true;
        alert("Admin access granted!");
    } else if (adminPassInput !== "") {
        // Only alert if they tried to enter a password, but it was wrong
        alert("Incorrect Admin Password. Joining as a regular user.");
    }

    // --- Successful Login ---
    currentUser = {
        name: nameInput,
        picture: null, // No Google picture now
        isAdmin: isAdmin // New property to track admin status
    };

    // 1. Hide the login area
    document.getElementById("loginArea").style.display = "none";

    // 2. Show the chat and input area
    messagesContainer.style.display = 'block';
    document.getElementById("inputArea").style.display = 'flex';

    // Optional: Send a welcome message to the user
    const welcomeMsg = isAdmin 
        ? `Welcome, ${currentUser.name}! (Admin)`
        : `Welcome, ${currentUser.name}!`;
        
    addMessage("System", welcomeMsg, new Date(), null, isAdmin);
    
    // Clear the password input for security
    document.getElementById("adminPasswordInput").value = "";
    document.getElementById("messageInput").focus();
}

// Send a message
function sendMessage() {
  if (!currentUser) {
    alert("Please join the chat first.");
    return;
  }

  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (text === "") return;

  const messageData = {
    username: currentUser.name,
    picture: currentUser.picture,
    content: text,
    timestamp: new Date(),
    isAdmin: currentUser.isAdmin // Include admin status in message data
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat
function addMessage(username, content, timestamp, picture, isAdmin) {
  const messageElement = document.createElement("div");
  // The original message class from your provided style.css was "message"
  messageElement.className = "message";

  // Add a class for admin messages for custom styling
  if (isAdmin) {
      messageElement.classList.add("admin-msg");
  }

  if (picture) {
    const img = document.createElement("img");
    img.src = picture;
    img.alt = username;
    img.style.width = "32px";
    img.style.height = "32px";
    img.style.borderRadius = "50%";
    img.style.marginRight = "8px";
    messageElement.appendChild(img);
  }

  const contentWrapper = document.createElement("div");

  const header = document.createElement("div");
  header.className = "message-header";
  const time = new Date(timestamp);
  
  // Display (ADMIN) next to the name if they are an admin
  const displayName = isAdmin ? `${username} (ADMIN)` : username;

  header.textContent = `${displayName} - ${time.toLocaleTimeString()}`;

  const body = document.createElement("div");
  body.className = "message-content";
  body.textContent = content;

  contentWrapper.appendChild(header);
  contentWrapper.appendChild(body);
  messageElement.appendChild(contentWrapper);

  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Listen for chat events
socket.on("chat history", (msgs) => {
  if (currentUser) {
    messagesContainer.innerHTML = "";
    // Pass isAdmin to addMessage for proper display
    msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.picture, m.isAdmin));
  }
});

socket.on("chat message", (msg) => {
  if (currentUser) {
    // Pass isAdmin to addMessage for proper display
    addMessage(msg.username, msg.content, msg.timestamp, msg.picture, msg.isAdmin);
  }
});
