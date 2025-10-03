// public/chat.js
const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput");
const userCountDisplay = document.getElementById("userCountDisplay");
const nameControlButton = document.getElementById("nameControlButton");

let currentUser = {
    name: null,        // secure identifier
    isAdmin: false,
    displayName: null
};
let isNameSet = false;

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
});

function handleNameAction() {
    const newName = usernameInput.value.trim();
    if (newName === "") { alert("Please enter a username."); return; }
    if (!isNameSet) {
        currentUser.name = newName;
        socket.emit("check_staff_status", newName);
    } else {
        if (newName === currentUser.displayName) { alert("Your new name must be different from your current display name."); return; }
        socket.emit("name_change_request", { oldName: currentUser.name, newName: newName });
    }
}

socket.on('name_accepted', (displayName) => {
    currentUser.isAdmin = false;
    currentUser.displayName = displayName;
    currentUser.name = displayName;
    isNameSet = true;
    staffControlsDiv.style.display = 'none';
    addMessage("System", `${displayName} has joined the chat.`, new Date(), true);
    usernameInput.disabled = false;
    nameControlButton.textContent = "Change Name";
    document.querySelector('.header-area button').disabled = false;
    messageInput.focus();
});

socket.on("staff_status_update", (data) => {
    if (data.secureName === currentUser.name || data.secureName === usernameInput.value.trim()) {
        currentUser.isAdmin = true;
        currentUser.displayName = data.displayName;
        currentUser.name = data.secureName;
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

socket.on('name_rejected', (reason) => {
    alert(reason);
    usernameInput.value = currentUser.displayName || '';
    if (!isNameSet) { currentUser.name = null; currentUser.isAdmin = false; currentUser.displayName = null; }
    staffControlsDiv.style.display = 'none';
});

socket.on('name_change_success', (data) => {
    const oldName = data.oldDisplayName;
    const newName = data.newDisplayName;
    currentUser.displayName = newName;
    currentUser.name = data.newSecureName;
    usernameInput.value = newName;
    if (currentUser.isAdmin) {
        addMessage("System", `${oldName} changed display name to ${newName}.`, data.timestamp, true);
    }
    alert(`Name successfully changed to ${newName}!`);
});

socket.on('name_change_failed', (reason) => {
    alert(reason);
    usernameInput.value = currentUser.displayName;
});

function showAdminModal() { if (!currentUser.isAdmin) { alert("You must be staff to clear the chat."); return; } document.getElementById("adminModal").style.display = 'flex'; }
function hideAdminModal() { document.getElementById("adminModal").style.display = 'none'; }
function confirmClear() {
    hideAdminModal();
    socket.emit("admin:clear_history", { username: currentUser.name, timestamp: new Date() });
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!isNameSet) { alert("Please enter and set your username first."); return; }
  if (text === "") return;
  const messageData = {
    username: currentUser.displayName,
    secureName: currentUser.name,
    content: text,
    timestamp: new Date()
  };
  socket.emit("chat message", messageData);
  messageInput.value = "";
  messageInput.focus();
}

function addMessage(username, content, timestamp, isAdmin = false, secureName) {
  const div = document.createElement('div');
  const isOwn = (secureName && currentUser.name) ? (secureName === currentUser.name) : (username === currentUser.displayName);
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

socket.on("history_cleared_staff", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true);
});
socket.on("history_cleared_public", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true);
});
socket.on("chat history", (msgs) => {
    messagesContainer.innerHTML = "";
    msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin, m.secureName));
});
socket.on("chat message", (msg) => {
    addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin, msg.secureName);
});
socket.on("staff message", (msg) => {
    if (currentUser.isAdmin) {
        addMessage(msg.username, msg.content, msg.timestamp, true, msg.secureName);
    }
});
socket.on("user count", (count) => {
    userCountDisplay.textContent = `${count} User${count !== 1 ? 's' : ''} Online`;
});
socket.on('system_error', (errorMsg) => {
    addMessage("System Alert", errorMsg, new Date(), true);
});
