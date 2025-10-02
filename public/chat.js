// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// Simple user object for tracking the name
let currentUser = {
    name: "Guest", 
    picture: null // Not used in this version, but good practice to keep
};

// Function to update the current user's name when the button is clicked.
function changeName() {
    const nameInput = document.getElementById("usernameInput");
    const newName = nameInput.value.trim();

    if (newName === "") {
        alert("Name cannot be empty. Please enter something.");
        return;
    }

    // Update the local currentUser object
    currentUser.name = newName;
    alert("Name set to: " + currentUser.name);
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
    timestamp: new Date()
    // Note: No 'picture' or 'isAdmin' in this simple version
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat, using the new CSS classes (.msg, .msg-header, .msg-body)
function addMessage(username, content, timestamp) {
  const isOwn = username === currentUser.name;

  const div = document.createElement('div');
  // Use the CSS classes for styling
  div.className = `msg ${isOwn ? 'own' : 'other'}`;

  const header = document.createElement('div');
  header.className = 'msg-header';
  // Format the time using the structure from the Firebase script
  const time = new Date(timestamp);
  header.textContent = `${username} • ${time.toLocaleTimeString()}`;

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
  // The history messages only contain username, content, and timestamp
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp);
});
