// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// DOM elements
const currentUsernameDisplay = document.getElementById("currentUsername");
const nameInputArea = document.getElementById("nameInputArea");
const clearChatBtn = document.getElementById("clearChatBtn"); 

// Modal elements
const customModal = document.getElementById("customModal");
const modalMessage = document.getElementById("modalMessage");
const modalButtons = document.getElementById("modalButtons");

const ADMIN_NAME = "OWNER"; // The secret admin login name
let currentUser = null;

// --- POPUP FUNCTIONS ---
function showCustomAlert(message) {
    modalMessage.textContent = message;
    modalButtons.innerHTML = '';
    
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.className = 'ok-btn';
    okBtn.onclick = () => {
        customModal.style.display = 'none';
    };
    
    modalButtons.appendChild(okBtn);
    customModal.style.display = 'flex';
}

function showCustomConfirm(message, callback) {
    modalMessage.textContent = message;
    modalButtons.innerHTML = '';
    
    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes, Clear Chat';
    yesBtn.className = 'yes-btn';
    yesBtn.onclick = () => {
        customModal.style.display = 'none';
        callback(true);
    };

    const noBtn = document.createElement('button');
    noBtn.textContent = 'Cancel';
    noBtn.className = 'no-btn';
    noBtn.onclick = () => {
        customModal.style.display = 'none';
        callback(false);
    };
    
    modalButtons.appendChild(yesBtn);
    modalButtons.appendChild(noBtn);
    customModal.style.display = 'flex';
}
// --- END POPUP FUNCTIONS ---


function setUsername() {
  const nameInput = document.getElementById("nameInputField");
  const name = nameInput.value.trim();

  if (name.length < 2) {
    showCustomAlert("Please enter a name with at least 2 characters.");
    return;
  }

  currentUser = {
    name: name,
    picture: null 
  };

  nameInputArea.style.display = 'none';
  currentUsernameDisplay.textContent = `Signed in as: ${currentUser.name}`;
  currentUsernameDisplay.style.display = 'block';

  if (currentUser.name === ADMIN_NAME) {
    clearChatBtn.style.display = 'block';
  } else {
    clearChatBtn.style.display = 'none';
  }

  showCustomAlert(`Welcome ${currentUser.name}`);
}

function clearChat() {
  if (currentUser && currentUser.name === ADMIN_NAME) {
    showCustomConfirm("Are you absolutely sure you want to clear ALL chat history for everyone? This cannot be undone.", (result) => {
        if (result) {
            socket.emit("clear history");
        }
    });
  } else {
    showCustomAlert("You do not have permission to clear the chat.");
  }
}

function sendMessage() {
  if (!currentUser || !currentUser.name) {
    showCustomAlert("Please set your name first.");
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
  
  // NEW LOGIC: Change the displayed name if the user is the OWNER
  let displayName = username;
  if (username === ADMIN_NAME) {
      displayName = "ADMIN";
  }
  
  const messageElement = document.createElement("div");
  // IMPORTANT: The 'own' class check must still use the original username
  if (currentUser && currentUser.name === username) {
    messageElement.className = "msg own";
  } else {
    messageElement.className = "msg other";
  }
  
  const header = document.createElement("div");
  header.className = "msg-header";
  
  const time = new Date(timestamp);
  const timeText = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Use the determined displayName
  header.innerHTML = `${displayName} <span class="msg-time-small">${timeText}</span>`;

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

// Listen for history cleared event from server
socket.on("history cleared", () => {
    messagesContainer.innerHTML = "";
    addMessage("System", "Chat history was cleared by the administrator.", new Date());
});
