const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput");
const userCountDisplay = document.getElementById("userCountDisplay"); 
const nameControlButton = document.getElementById("nameControlButton"); // NEW

let currentUser = {
    name: null,        // Secure name (e.g., socket.id or loginName)
    isAdmin: false,
    displayName: null
};

let isNameSet = false; // NEW STATE TRACKER

// ======================================================
// ENTER KEY PRESS / SEND MESSAGE
// ======================================================
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// ======================================================
// NAME VALIDATION AND LOGIN / NAME CHANGE
// ======================================================
function handleNameAction() {
    const newName = usernameInput.value.trim();

    if (newName === "") {
        alert("Please enter a username.");
        return;
    }

    if (!isNameSet) {
        // --- INITIAL LOGIN ---
        currentUser.name = socket.id; // Use socket.id as secure identifier
        socket.emit("check_staff_status", newName);
    } else {
        // --- NAME CHANGE REQUEST ---
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
    currentUser.name = socket.id; // Secure identifier remains socket.id
    isNameSet = true;

    staffControlsDiv.style.display = 'none';

    addMessage("System", `${displayName} has joined the chat.`, new Date());

    // UI Updates
    usernameInput.disabled = false;
    nameControlButton.textContent = "Change Name";
    document.querySelector('.header-area button').disabled = false; // Enable button
    messageInput.focus();
});

// Staff status update
socket.on("staff_status_update", (data) => {
    if (data.secureName === currentUser.name) {
        currentUser.isAdmin = true;
        currentUser.displayName = data.displayName;
        isNameSet = true;

        staffControlsDiv.style.display = 'inline-block';

        addMessage("System", `${data.displayName} has logged in.`, new Date(), true);

        // UI Updates
        usernameInput.disabled = false;
        usernameInput.value = data.displayName;
        nameControlButton.textContent = "Change Name";

        document.querySelector('.header-area button').disabled = false;
        messageInput.focus();
    }
});

// Name rejected
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

// --- NEW: NAME CHANGE SUCCESS ---
socket.on('name_change_success', (data) => {
    const oldName = data.oldDisplayName;
    const newName = data.newDisplayName;

    // Update client-side state
    currentUser.name = data.newSecureName; // remains socket.id or unique ID
    currentUser.displayName = newName;
    usernameInput.value = newName;

    // Show system message for name change
    if (!currentUser.isAdmin) {
        // server will broadcast a message; no need to add here
    } else {
        addMessage("System", `${oldName} changed display name to ${newName}.`, data.timestamp, true);
    }

    alert(`Name successfully changed to ${newName}!`);
});

// --- NEW: NAME CHANGE FAILURE ---
socket.on('name_change_failed', (reason) => {
    alert(reason);
    usernameInput.value = currentUser.displayName; // revert input
});

// ======================================================
// CONTROLS AND MESSAGING FUNCTIONS
// ======================================================

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
    let text = messageInput.value.trim();

    // Max 500 characters
    if (text.length > 500) {
        alert("Maximum message length is 500 characters.");
        text = text.substring(0, 500);
    }

    if (!isNameSet) {
        alert("Please enter and set your username first.");
        return;
    }

    if (text === "") return;

    const messageData = {
        username: currentUser.displayName,
        content: text,
        timestamp: new Date(),
        secureName: currentUser.name // socket.id or unique secure ID
    };

    socket.emit("chat message", messageData);
    messageInput.value = "";
    messageInput.focus();
}

// Function to add messages to chat
function addMessage(username, content, timestamp, isAdmin = false, messageSecureName = null) {
    const div = document.createElement('div');

    // Determine if message is from current user
    const isOwn = messageSecureName && messageSecureName === currentUser.name;

    // Assign class based on message type
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

    // Scroll to bottom to see latest message
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ======================================================
// SOCKET.IO LISTENERS
// ======================================================

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
        addMessage(msg.username, msg.content, msg.timestamp, true);
    }
});

socket.on("user count", (count) => {
    userCountDisplay.textContent = `${count} User${count !== 1 ? 's' : ''} Online`;
});

socket.on('system_error', (errorMsg) => {
    addMessage("System Alert", errorMsg, new Date(), true);
});
