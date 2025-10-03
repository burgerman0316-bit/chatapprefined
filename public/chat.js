const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput");
const userCountDisplay = document.getElementById("userCountDisplay");
const nameControlButton = document.getElementById("nameControlButton");

// User state
let currentUser = {
    name: null,           // will be socket.id after login
    isAdmin: false,
    displayName: null
};
let isNameSet = false; // Track if user has set a name

// Send message on Enter key
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// Handle name/join button
function handleNameAction() {
    const newName = usernameInput.value.trim();
    if (newName === "") {
        alert("Please enter a username.");
        return;
    }

    if (!isNameSet) {
        // Set secureName as socket.id
        currentUser.name = socket.id;
        socket.emit("check_staff_status", newName);
    } else {
        // Change name
        if (newName === currentUser.displayName) {
            alert("Your new name must be different.");
            return;
        }
        socket.emit("name_change_request", {
            oldName: currentUser.name,
            newName: newName
        });
    }
}

// Handle server responses
socket.on('name_accepted', (displayName) => {
    currentUser.isAdmin = false;
    currentUser.displayName = displayName;
    // secureName remains socket.id
    isNameSet = true;
    staffControlsDiv.style.display = 'none';
    addMessage("System", `${displayName} has joined.`, new Date());
    // UI updates
    document.querySelector('.header-area button').disabled = false;
    usernameInput.disabled = false;
    nameControlButton.textContent = "Change Name";
    messageInput.focus();
});

socket.on("staff_status_update", (data) => {
    if (data.secureName === currentUser.name) {
        currentUser.isAdmin = true;
        currentUser.displayName = data.displayName;
        isNameSet = true;
        staffControlsDiv.style.display = 'inline-block';
        addMessage("System", `${data.displayName} logged in.`, new Date(), true);
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
    if (!isNameSet) {
        currentUser.name = null;
        currentUser.isAdmin = false;
        currentUser.displayName = null;
    }
    staffControlsDiv.style.display = 'none';
});

socket.on('name_change_success', (data) => {
    const oldName = data.oldDisplayName;
    const newName = data.newDisplayName;
    currentUser.name = data.newSecureName;
    currentUser.displayName = newName;
    usernameInput.value = newName;
    // Show name change message
    if (!currentUser.isAdmin) {
        // server broadcasts message; no need here
    } else {
        addMessage("System", `${oldName} changed name to ${newName}.`, data.timestamp, true);
    }
    alert(`Name changed to ${newName}`);
});

socket.on('name_change_failed', (reason) => {
    alert(reason);
    usernameInput.value = currentUser.displayName;
});

// Send message
function sendMessage() {
    let text = messageInput.value.trim();
    if (text.length > 500) {
        alert("Max 500 characters");
        text = text.substring(0, 500);
    }
    if (!isNameSet) {
        alert("Set your username first");
        return;
    }
    if (text === "") return;

    const msgData = {
        username: currentUser.displayName,
        content: text,
        timestamp: new Date(),
        secureName: currentUser.name
    };
    socket.emit('chat message', msgData);
    messageInput.value = '';
    messageInput.focus();
}

// Add message to chat
function addMessage(username, content, timestamp, isAdmin=false, messageSecureName=null) {
    const div = document.createElement('div');

    const isOwn = messageSecureName && messageSecureName === currentUser.name;

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

    // Scroll to bottom after DOM update
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 0);
}

// =======================
// Socket Listeners
// =======================
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
