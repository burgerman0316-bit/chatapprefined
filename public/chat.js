// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");
let currentUser = null;

// Google login callback
function handleCredentialResponse(response) {
  const base64Url = response.credential.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(base64));

  currentUser = {
    name: payload.name,
    email: payload.email,
    picture: payload.picture
  };

  alert("Welcome " + currentUser.name);
}

// Send a message
function sendMessage() {
  if (!currentUser) {
    alert("Please sign in with Google first.");
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
