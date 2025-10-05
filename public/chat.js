const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput");
const userCountDisplay = document.getElementById("userCountDisplay");
const nameControlButton = document.getElementById("nameControlButton");

let currentUser = {
    name: null,
    isAdmin: false,
    displayName: null
};

let isNameSet = false;

// ENTER KEY PRESS / SEND MESSAGE
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// NAME VALIDATION AND LOGIN / NAME CHANGE
function handleNameAction() {
    const newName = usernameInput.value.trim();

    if (newName === "") {
        alert("Please enter a username.");
        return;
    }

    if (!isNameSet) {
        currentUser.name = newName;
        socket.emit("check_staff_status", newName);
    } else {
        if (newName === currentUser.displayName) {
            alert("Your new name must be different from your current display name.");
            return;
        }

        socket.emit("name_change_request", {
            oldName: currentUser.name,
            newName: newName
        });
    }
}

// Server accepted the name (regular user)
socket.on('name_accepted', (displayName) => {
    currentUser.isAdmin = false;
    currentUser.displayName = displayName;
    isNameSet = true;
    staffControlsDiv.style.display = 'none';
    addPlainText(`${displayName} has joined the chat.`, new Date());
    usernameInput.disabled = false;
    nameControlButton.textContent = "Change Name";
    document.querySelector('.header-area button').disabled = false;
    messageInput.focus();
});

// Server accepted the name (staff user)
socket.on("staff_status_update", (data) => {
    if (data.secureName === currentUser.name) {
        currentUser.isAdmin = true;
        currentUser.displayName = data.displayName;
        isNameSet = true;
        staffControlsDiv.style.display = 'inline-block';
        addMessage("System", `${data.displayName} has logged in.`, new Date(), true);
        usernameInput.disabled = false;
        usernameInput.value = data.displayName;
        nameControlButton.textContent = "Change Name";
        document.querySelector('.header-area button').disabled = false;
        messageInput.focus();
    }
});

// Server rejected the name
socket.on('name_rejected', (reason) => {
    alert(reason);
    usernameInput.value = currentUser.displayName || '';
    if (!isNameSet) {
        currentUser.name = null;
        currentUser.isAdmin = false;
        currentUser.displayName = null;
    }
    staffControlsDiv.style.display = 'none';
});

// NAME CHANGE SUCCESS
socket.on('name_change_success', (data) => {
    const oldName = data.oldDisplayName;
    const newName = data.newDisplayName;

    currentUser.name = data.newSecureName;
    currentUser.displayName = newName;
    usernameInput.value = newName;

    if (!currentUser.isAdmin) {
        // regular user: server will broadcast; update UI via plain notice so it isn't a bubble
        // Optionally show a plain text notice locally (comment out if you prefer server's broadcast only)
        // addPlainText(`${oldName} is now known as ${newName}.`, data.timestamp);
    } else {
        addMessage("System", `${oldName} changed display name to ${newName}.`, data.timestamp, true);
    }

    alert(`Name successfully changed to ${newName}!`);
});

// NAME CHANGE FAILURE
socket.on('name_change_failed', (reason) => {
    alert(reason);
    usernameInput.value = currentUser.displayName;
});

// CONTROLS AND MESSAGING FUNCTIONS
function showAdminModal() {
    if (!currentUser.isAdmin) {
        alert("You must be staff to clear the chat.");
        return;
    }
    document.getElementById("adminModal").style.display = 'flex';
}

function hideAdminModal() {
    document.getElementById("adminModal").style.display = 'none';
}

function confirmClear() {
    hideAdminModal();
    socket.emit("admin:clear_history", {
        username: currentUser.name,
        timestamp: new Date()
    });
}

function sendMessage() {
  const text = messageInput.value.trim();

  if (!isNameSet) {
    alert("Please enter and set your username first.");
    return;
  }

  if (text === "") return;

  const messageData = {
    username: currentUser.name,
    content: text,
    timestamp: new Date(),
  };

  socket.emit("chat message", messageData);
  messageInput.value = "";
  messageInput.focus();
}

function addMessage(username, content, timestamp, isAdmin = false) {
  const div = document.createElement('div');

  const isOwn = (username === currentUser.displayName);

  if (username === "System" || username === "System Alert") {
      div.className = isAdmin ? 'msg admin-system-msg' : 'msg system-msg';
  } else if (isOwn) {
      div.className = `msg own ${isAdmin ? 'admin-msg' : ''}`;
  } else {
      div.className = `msg other ${isAdmin ? 'admin-msg' : ''}`;
  }

  const header = document.createElement('div');
  header.className = 'msg-header';

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

// NEW: addPlainText - inserts plain centered text into the messages area (not a message bubble)
function addPlainText(content, timestamp) {
  const div = document.createElement('div');
  div.className = 'chat-plain';
  const time = new Date(timestamp || Date.now());
  // If you prefer no timestamp shown, remove the time portion below
  div.textContent = `${content} • ${time.toLocaleTimeString()}`;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// SOCKET.IO LISTENERS

// HISTORY CLEAR LISTENERS
socket.on("history_cleared_staff", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true);
});

socket.on("history_cleared_public", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true);
});

// MESSAGING AND HISTORY
socket.on("chat history", (msgs) => {
    messagesContainer.innerHTML = "";
    msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
});

socket.on("chat message", (msg) => {
    addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
});

// STAFF PRIVATE MESSAGE LISTENER
socket.on("staff message", (msg) => {
    if (currentUser.isAdmin) {
        addMessage(msg.username, msg.content, msg.timestamp, true);
    }
});

// USER COUNT LISTENER
socket.on("user count", (count) => {
    userCountDisplay.textContent = `${count} User${count !== 1 ? 's' : ''} Online`;
});

// ERROR LISTENER
socket.on('system_error', (errorMsg) => {
    addMessage("System Alert", errorMsg, new Date(), true);
});

// NEW: plain_notice listener (server can emit 'plain_notice' for non-bubble text)
socket.on('plain_notice', (data) => {
    addPlainText(data.content, data.timestamp);
});
