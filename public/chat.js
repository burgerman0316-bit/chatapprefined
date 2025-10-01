// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
let currentUser = null;

// New login logic to replace Google Sign-In
function loginUser() {
    const nameInput = document.getElementById("usernameInput").value.trim();
    const passInput = document.getElementById("passwordInput").value.trim();

    // *** IMPORTANT: SET YOUR SIMPLE PASSWORD HERE ***
    // This is the password all 8th graders must use.
    const correctPassword = "8thgradechat2025"; 

    if (nameInput === "") {
        alert("Please enter your real name.");
        return;
    }

    // Basic check to ensure a name is not just a bunch of spaces
    if (nameInput.length < 2) {
        alert("Name is too short.");
        return;
    }

    if (passInput !== correctPassword) {
        alert("Invalid password.");
        return;
    }

    // --- Successful Login ---
    currentUser = {
        name: nameInput,
        picture: null // No Google picture now
    };

    // 1. Hide the login area
    document.getElementById("loginArea").style.display = "none";

    // 2. Show the chat and input area
    messagesContainer.style.display = 'block';
    document.getElementById("inputArea").style.display = 'flex'; // Use flex to match original CSS

    // Optional: Send a welcome message to the user
    addMessage("System", `Welcome, ${currentUser.name}! You are now in the chat.`, new Date(), null);
    
    // Clear the password input for security
    document.getElementById("passwordInput").value = "";
    document.getElementById("messageInput").focus();
}

// Send a message
function sendMessage() {
  // Check if currentUser is set (i.e., if user is logged in)
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
    timestamp: new Date()
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat
function addMessage(username, content, timestamp, picture) {
  const messageElement = document.createElement("div");
  messageElement.className = "msg"; // Use the existing 'msg' class

  // Check if the message is from the current user
  if (currentUser && username === currentUser.name) {
    messageElement.classList.add("own");
  }

  // Optional: Add a special class for System messages
  if (username === "System") {
      messageElement.classList.add("system-msg");
  }


  // The full content with username and time
  const time = new Date(timestamp);
  const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageElement.innerHTML = `
    <div class="msg-header">
      <span class="msg-username">${username}</span>
      <span class="msg-timestamp">${timeString}</span>
    </div>
    <div class="msg-content">${content}</div>
  `;

  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Listen for chat events
socket.on("chat history", (msgs) => {
  // Only display history if the user has successfully logged in
  if (currentUser) {
    messagesContainer.innerHTML = "";
    msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.picture));
  }
});

socket.on("chat message", (msg) => {
  // Only display new messages if the user has successfully logged in
  if (currentUser) {
    addMessage(msg.username, msg.content, msg.timestamp, msg.picture);
  }
});

// Remove the window.handleCredentialResponse function from the global scope
window.handleCredentialResponse = undefined;
