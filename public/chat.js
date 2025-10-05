const socket = io();
const messagesContainer = document.getElementById("messages");
const usernameInput = document.getElementById("usernameInput");
const staffControlsDiv = document.getElementById("staffControls");
const messageInput = document.getElementById("messageInput");
const userCountDisplay = document.getElementById("userCountDisplay");
const nameControlButton = document.getElementById("nameControlButton");
const dmUserMenu = document.getElementById("dmUserMenu");
const messageFormButton = document.querySelector('#messageForm button');
const staffNameModal = document.getElementById("staffNameModal");
const staffNameModalMessage = document.getElementById("staffNameModalMessage");

let currentUser = {
    name: null,
    isAdmin: false,
    displayName: null
};

let isNameSet = false;
let onlineUsers = [];
let dmMenuHighlightedIndex = -1;

// ENTER KEY PRESS / SEND MESSAGE
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (dmUserMenu.style.display === 'flex' && dmMenuHighlightedIndex !== -1) {
            const buttons = dmUserMenu.querySelectorAll('button');
            buttons[dmMenuHighlightedIndex].click();
        } else {
            sendMessage();
        }
    }
});

// Key navigation for DM menu
messageInput.addEventListener('keydown', (e) => {
    if (dmUserMenu.style.display === 'flex') {
        const buttons = dmUserMenu.querySelectorAll('button');
        if (buttons.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                dmMenuHighlightedIndex = (dmMenuHighlightedIndex + 1) % buttons.length;
                updateDmMenuHighlight();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                dmMenuHighlightedIndex = (dmMenuHighlightedIndex - 1 + buttons.length) % buttons.length;
                updateDmMenuHighlight();
            }
        }
    }
});

// NAME VALIDATION AND LOGIN / NAME CHANGE
function handleNameAction() {
    const newName = usernameInput.value.trim();

    if (newName === "") {
        addMessage("System Alert", "Please enter a username.", new Date(), true);
        return;
    }

    if (!isNameSet) {
        currentUser.name = newName;
        socket.emit("check_staff_status", newName);
    } else {
        if (newName === currentUser.displayName) {
            addMessage("System Alert", "Your new name must be different from your current display name.", new Date(), true);
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
    messageInput.contentEditable = true;
    messageFormButton.disabled = false;
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
        messageInput.contentEditable = true;
        messageFormButton.disabled = false;
        messageInput.focus();
    }
});

// Server rejected the name
socket.on('name_rejected', (reason) => {
    showStaffNameModal(reason);
    usernameInput.value = currentUser.displayName || '';
    if (!isNameSet) {
        currentUser.name = null;
        currentUser.isAdmin = false;
        currentUser.displayName = null;
        messageInput.contentEditable = false;
        messageFormButton.disabled = true;
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
    } else {
        addMessage("System", `${oldName} changed display name to ${newName}.`, data.timestamp, true);
    }

    addMessage("System Alert", `Name successfully changed to ${newName}!`, new Date(), true);
});

// NAME CHANGE FAILURE
socket.on('name_change_failed', (reason) => {
    addMessage("System Alert", reason, new Date(), true);
    usernameInput.value = currentUser.displayName;
});

// CONTROLS AND MESSAGING FUNCTIONS
function showAdminModal() {
    if (!currentUser.isAdmin) {
        addMessage("System Alert", "You must be staff to clear the chat.", new Date(), true);
        return;
    }
    document.getElementById("adminModal").style.display = 'flex';
}

function hideAdminModal() {
    document.getElementById("adminModal").style.display = 'none';
}

function showStaffNameModal(message) {
    staffNameModalMessage.textContent = message;
    staffNameModal.style.display = 'flex';
}

function hideStaffNameModal() {
    staffNameModal.style.display = 'none';
}

function confirmClear() {
    hideAdminModal();
    socket.emit("admin:clear_history", {
        username: currentUser.name,
        timestamp: new Date()
    });
}

function sendMessage() {
    const text = messageInput.textContent.trim();

    if (!isNameSet) {
        addMessage("System Alert", "Please enter and set your username first.", new Date(), true);
        return;
    }

    if (text === "") return;

    if (text.startsWith("/msg ")) {
        // Correctly parse the command using a regular expression
        // The regex captures the first word after "/msg " and the rest of the message
        const commandParts = text.substring(5).match(/^(\S+)\s(.*)/s);

        if (!commandParts || commandParts.length < 3) {
            addMessage("System Alert", "Invalid /msg command. Usage: /msg [username] [message]", new Date(), true);
            messageInput.textContent = "";
            return;
        }

        // The first captured group (at index 1) is the recipient
        const recipient = commandParts[1];
        // The second captured group (at index 2) is the message content
        const content = commandParts[2];
        
        const messageData = {
            recipient: recipient,
            content: content,
            timestamp: new Date()
        };
        socket.emit("private message", messageData);

    } else {
        const messageData = {
            username: currentUser.name,
            content: text,
            timestamp: new Date(),
        };
        socket.emit("chat message", messageData);
    }

    messageInput.textContent = "";
    messageInput.focus();
}

messageInput.addEventListener('input', handleDmInput);

function handleDmInput() {
    const text = messageInput.textContent;
    const cursorPosition = getCursorPosition(messageInput);
    const textBeforeCursor = text.substring(0, cursorPosition);
    const msgIndex = textBeforeCursor.lastIndexOf("/msg");

    if (msgIndex !== -1 && textBeforeCursor.length >= msgIndex + 5) {
        const searchTerm = textBeforeCursor.substring(msgIndex + 5);
        showDmUserMenu(searchTerm);
    } else {
        hideDmUserMenu();
    }
}

function showDmUserMenu(searchTerm = "") {
    dmUserMenu.innerHTML = "";
    dmMenuHighlightedIndex = -1;

    const filteredUsers = onlineUsers
        .filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()) && name !== currentUser.displayName)
        .sort((a, b) => a.localeCompare(b));

    filteredUsers.slice(0, 3).forEach((user, index) => {
        const userButton = document.createElement("button");
        userButton.textContent = user;
        userButton.dataset.username = user;
        userButton.setAttribute('type', 'button');
        userButton.onclick = (e) => {
            e.preventDefault();
            const currentText = messageInput.textContent;
            const msgStart = currentText.lastIndexOf("/msg");
            if (msgStart !== -1) {
                messageInput.textContent = currentText.substring(0, msgStart + 5) + user + " ";
                setCursorToEnd(messageInput);
            }
            hideDmUserMenu();
        };
        dmUserMenu.appendChild(userButton);
    });

    if (filteredUsers.length > 0) {
        dmUserMenu.style.display = "flex";
    } else {
        hideDmUserMenu();
    }
}

function hideDmUserMenu() {
    dmUserMenu.style.display = "none";
}

function updateDmMenuHighlight() {
    const buttons = dmUserMenu.querySelectorAll('button');
    buttons.forEach((btn, index) => {
        btn.classList.toggle('highlighted', index === dmMenuHighlightedIndex);
    });
}

function getCursorPosition(element) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    }
    return 0;
}

function setCursorToEnd(el) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
}

function addMessage(username, content, timestamp, isAdmin = false, isPrivate = false) {
  const div = document.createElement('div');
  const isOwn = (username === currentUser.displayName);

  if (isPrivate) {
    div.className = isOwn ? 'msg own private' : 'msg other private';
  } else if (username === "System" || username === "System Alert") {
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
}

function addPlainText(content, timestamp) {
  const div = document.createElement('div');
  div.className = 'chat-plain';
  const time = new Date(timestamp || Date.now());
  div.textContent = `${content} • ${time.toLocaleTimeString()}`;
  messagesContainer.appendChild(div);
}

socket.on("history_cleared_staff", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on("history_cleared_public", (data) => {
    messagesContainer.innerHTML = "";
    addMessage("System", data.content, data.timestamp, true);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on("chat history", (msgs) => {
    messagesContainer.innerHTML = "";
    msgs.forEach(m => addMessage(m.username, m.content, m.timestamp, m.isAdmin));
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('chat message', (msg) => {
    addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('private message', (msg) => {
    const isOwn = (msg.sender === currentUser.displayName);
    addMessage(isOwn ? `${msg.sender} to ${msg.recipient}` : `${msg.sender} to ${msg.recipient}`, msg.content, msg.timestamp, false, true);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('system_error', (message) => {
    addMessage("System Alert", message, new Date(), true);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('user count', (data) => {
    userCountDisplay.textContent = `${data.count} Users Online`;
    onlineUsers = data.userList;
});

socket.on('staff message', (msg) => {
    if (currentUser.isAdmin) {
        addMessage(msg.username, msg.content, msg.timestamp, true);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});

socket.on('plain_notice', (data) => {
    addPlainText(data.content, data.timestamp);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

