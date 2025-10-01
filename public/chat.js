// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// DOM elements
const currentUsernameDisplay = document.getElementById("currentUsername");
const nameInputArea = document.getElementById("nameInputArea");
const clearChatBtn = document.getElementById("clearChatBtn"); // NEW

// NEW: Secret Name
const ADMIN_NAME = "OWNER";

let currentUser = null;

function setUsername() {
  const nameInput = document.getElementById("nameInputField");
  const name = nameInput.value.trim();

  if (name.length < 2) {
    alert("Please enter a name with at least 2 characters.");
    return;
  }

  currentUser = {
    name: name,
    picture: null 
  };

  // 1. Hide the input area
  nameInputArea.style.display = 'none';

  // 2. Show the display span and set the username
  currentUsernameDisplay.textContent = `Signed in as: ${currentUser.name}`;
  currentUsernameDisplay.style.display = 'block';

  // NEW: Check for admin name and show the clear button
  if (currentUser.name === ADMIN_NAME) {
    clearChatBtn.style.display = 'block';
  } else {
    clearChatBtn.style.display = 'none';
  }

  alert(`Welcome ${currentUser.name}`);
}

// NEW: Function to emit clear chat request
function clearChat() {
  if (currentUser && currentUser.name === ADMIN_NAME) {
    if (confirm("Are you absolutely sure you want to clear ALL chat history for everyone? This cannot be undone.")) {
      socket.emit("clear history");
    }
  } else {
    alert("You do not have permission to clear the chat.");
  }
}

// Send a message
function sendMessage() {
  if (!currentUser || !currentUser.name) {
    alert("Please set your name first.");
    return;
  }

  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (text === "") return;

  const messageData = {
    username: currentUser.name,
    content: text,
    timestamp: new Date()
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat - Handles rendering the message bubble
function addMessage(username, content, timestamp) {
  const messageElement = document.createElement("div");
  if (currentUser && currentUser.name === username) {
    messageElement.className = "msg own";
  } else {
    messageElement.className = "msg other";
  }
  
  const header = document.createElement("div");
  header.className = "msg-header";
  
  const time = new Date(timestamp);
  const timeText = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  header.innerHTML = `${username} <span class="msg-time-small">${timeText}</span>`;

  const body = document.createElement("div");
  body.className = "msg-body";
  body.textContent = content;

  messageElement.appendChild(header);
  messageElement.appendChild(body);

  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// Listen for chat history on connection
socket.on("chat history", (msgs) => {
  messagesContainer.innerHTML = "";
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp));
});

// Listen for new chat messages from the server
socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp);
});

// NEW: Listen for history cleared event from server
socket.on("history cleared", () => {
    messagesContainer.innerHTML = "";
    // Optionally add a system message to the empty chat
    addMessage("System", "Chat history was cleared by the administrator.", new Date());
});
