// Connects automatically to the same host as the page
const socket = io();
const messagesContainer = document.getElementById("messages");

// DOM elements
const currentUsernameDisplay = document.getElementById("currentUsername");
const clearChatBtn = document.getElementById("clearChatBtn"); 
const googleSignInContainer = document.getElementById("googleSignInContainer"); 

// Modal elements
const customModal = document.getElementById("customModal");
const modalMessage = document.getElementById("modalMessage");
const modalButtons = document.getElementById("modalButtons");

const messageInput = document.getElementById("messageInput");

// Hardcoded for display purposes
const ADMIN_EMAIL = "YOUR_ADMIN_EMAIL@example.com"; // ⬅️ Must match server.js
const ADMIN_NAME_DISPLAY = "ADMIN";
let currentUser = null;

// --- POPUP FUNCTIONS (Unchanged) ---
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


// NEW: Google login callback function - SENDS TOKEN TO SERVER
window.handleCredentialResponse = function(response) {
  // Send the raw, unverified token to the server
  socket.emit('google login', response.credential);
}

// NEW: Listener for successful login from server
socket.on('login success', (user) => {
    currentUser = user;

    // Hide Google button, show user info
    googleSignInContainer.style.display = 'none';
    currentUsernameDisplay.textContent = `Signed in as: ${currentUser.name}`;
    currentUsernameDisplay.style.display = 'block';

    // Check for admin status using the user's verified email
    if (currentUser.email === ADMIN_EMAIL) {
        clearChatBtn.style.display = 'block';
        showCustomAlert(`Welcome, Administrator ${currentUser.name}!`);
    } else {
        clearChatBtn.style.display = 'none';
        showCustomAlert(`Welcome ${currentUser.name}`);
    }
});

// NEW: Listener for failed login from server
socket.on('login failed', (message) => {
    console.error("Login failed:", message);
    showCustomAlert(`Login failed: ${message}. Please try again.`);
});


function clearChat() {
  if (currentUser && currentUser.email === ADMIN_EMAIL) {
    showCustomConfirm("Are you absolutely sure you want to clear ALL chat history for everyone? This cannot be undone.", (result) => {
        if (result) {
            // Server will check email before clearing
            socket.emit("clear history"); 
        }
    });
  } else {
    showCustomAlert("You do not have permission to clear the chat.");
  }
}

function sendMessage() {
  if (!currentUser) {
    showCustomAlert("Please sign in with Google first.");
    return;
  }

  const text = messageInput.value.trim();
  if (text === "") return;

  // NEW: Only send the message content; server provides user data
  socket.emit("chat message", text);
  messageInput.value = "";
}

// Add message to chat - Handles rendering the message bubble
function addMessage(username, content, timestamp, email) {
  
  // Change the displayed name if the user is the ADMIN
  let displayName = username;
  if (email === ADMIN_EMAIL) { 
      displayName = ADMIN_NAME_DISPLAY;
  }
  
  const messageElement = document.createElement("div");
  // The 'own' class check uses the original username
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
  // History messages should include the email for client-side admin display logic
  msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.email)); 
});

// Listen for new chat messages from the server
socket.on("chat message", (msg) => {
  addMessage(msg.username, msg.content, msg.timestamp, msg.email);
});

// Listen for history cleared event from server
socket.on("history cleared", () => {
    messagesContainer.innerHTML = "";
    addMessage("System", "Chat history was cleared by the administrator.", new Date());
});


// EVENT LISTENER FOR ENTER KEY PRESS (Unchanged)
messageInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        sendMessage();
    }
});