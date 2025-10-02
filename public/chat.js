// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// Simple user object for tracking the name
let currentUser = {
    name: "Guest", 
    picture: null 
};

// Function to update the current user's name when the button is clicked.
function changeName() {
    const nameInput = document.getElementById("usernameInput");
    const newName = nameInput.value.trim();

    if (newName === "") {
        alert("Name cannot be empty. Using 'Anonymous'.");
        currentUser.name = "Anonymous";
        nameInput.value = "Anonymous";
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

  // ALWAYS read the name from the input box just before sending
  const nameInput = document.getElementById("usernameInput");
  currentUser.name = nameInput.value.trim() || "Anonymous";

  const messageData = {
    username: currentUser.name,
    picture: currentUser.picture,
    content: text,
    timestamp: new Date()
  };

  socket.emit("chat message", messageData);
  input.value = "";
}

// Add message to chat (using the original logic)
function addMessage(username, content, timestamp, picture) {
  const messageElement = document.createElement("div");
  messageElement.className = "message"; 

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
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.picture));
});

socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.picture);
});
