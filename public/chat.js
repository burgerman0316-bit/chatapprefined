// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// Updated DOM element selection based on new HTML structure
const currentUsernameDisplay = document.getElementById("currentUsername");
const nameInputArea = document.getElementById("nameInputArea");
const nameSection = document.getElementById("nameSection");

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

  // 1. Update the display text in the upper right
  currentUsernameDisplay.textContent = `Signed in as: ${currentUser.name}`;

  // 2. Hide the name input fields, showing only the display text
  nameInputArea.style.display = 'none';
  nameSection.classList.add('signed-in'); // Add class for styling

  alert(`Welcome ${currentUser.name}`);
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
    picture: currentUser.picture, 
    content: text,
    timestamp: new Date()
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat - Profile picture logic removed, bubble classes added
function addMessage(username, content, timestamp, picture) {
  const messageElement = document.createElement("div");
  messageElement.className = "message"; 
  
  const contentWrapper = document.createElement("div");
  contentWrapper.className = "message-bubble"; // Class for bubble styling

  const header = document.createElement("div");
  header.className = "message-header";
  
  const userSpan = document.createElement("span");
  userSpan.className = "message-username";
  userSpan.textContent = username;

  const time = new Date(timestamp);
  const timeSpan = document.createElement("span");
  timeSpan.className = "message-time"; // Class for smaller time text
  timeSpan.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Append username and small time text
  header.appendChild(userSpan);
  header.appendChild(timeSpan);

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
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.picture));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.picture);
});
