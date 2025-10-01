// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
// New DOM elements
const currentUsernameDisplay = document.getElementById("currentUsername");
const nameInputArea = document.getElementById("nameInputArea");

let currentUser = null;

// New function to set the username
function setUsername() {
  const nameInput = document.getElementById("nameInputField");
  const name = nameInput.value.trim();

  if (name.length < 2) {
    alert("Please enter a name with at least 2 characters.");
    return;
  }

  // Set the current user object
  currentUser = {
    name: name,
    // Setting picture to null since we are not getting one from Google
    picture: null 
  };

  // 1. Update the corner display
  currentUsernameDisplay.textContent = `(Signed in as: ${currentUser.name})`;

  // 2. Hide the name input area
  nameInputArea.style.display = 'none';

  alert(`Welcome ${currentUser.name}`);
}

// Removed the old handleCredentialResponse function

// Send a message - Updated to check for name instead of Google sign-in status
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
    picture: currentUser.picture, // Will be null, but keeps structure compatible
    content: text,
    timestamp: new Date()
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat - Modified to handle missing (null) picture by showing a name initial
function addMessage(username, content, timestamp, picture) {
  const messageElement = document.createElement("div");
  messageElement.className = "message";

  // Handle user avatar: use picture if available, otherwise show a colored initial
  if (picture) {
    const img = document.createElement("img");
    img.src = picture;
    img.alt = username;
    img.style.width = "32px";
    img.style.height = "32px";
    img.style.borderRadius = "50%";
    img.style.marginRight = "8px";
    messageElement.appendChild(img);
  } else {
    // Show a colored initial if no picture is available
    const nameInitial = document.createElement("span");
    nameInitial.textContent = username.charAt(0).toUpperCase();
    nameInitial.style.cssText = `
      display: inline-flex; 
      justify-content: center; 
      align-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: #007bff; /* Example color */
      color: white;
      font-weight: bold;
      margin-right: 8px;
    `;
    messageElement.appendChild(nameInitial);
  }

  const contentWrapper = document.createElement("div");

  const header = document.createElement("div");
  header.className = "message-header";
  const time = new Date(timestamp);
  header.textContent = `${username} - ${time.toLocaleTimeString()}`;

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
  messagesContainer.innerHTML = "";
  // The 'picture' field in history might still exist for old messages, 
  // and the updated addMessage function handles null/existing pictures gracefully.
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.picture));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.picture);
});
