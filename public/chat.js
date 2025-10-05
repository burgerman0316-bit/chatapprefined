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

// Function to safely get cursor position in a contenteditable div
function getCursorPosition(element) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        return preCaretRange.toString().length;
    }
    return 0;
}

// Function to add a message to the UI
function addMessage(username, content, timestamp, isSystem = false, isAdmin = false, isPrivate = false) {
    const msgEl = document.createElement("div");
    msgEl.classList.add("msg");

    const isOwn = username === currentUser.displayName || username === currentUser.name;

    if (isOwn) {
        msgEl.classList.add("own");
    } else {
        msgEl.classList.add("other");
    }

    if (isSystem) {
        msgEl.classList.add("system-msg");
        if (isAdmin) {
            msgEl.classList.add("admin-system-msg");
        }
    } else if (isAdmin) {
        msgEl.classList.add("admin-msg");
    }

    if (isPrivate) {
        msgEl.classList.add("private");
    }
    
    if (username && !isSystem) {
        const headerEl = document.createElement("div");
        headerEl.classList.add("msg-header");
        headerEl.textContent = isPrivate ? `(Private) ${username}` : username;
        msgEl.appendChild(headerEl);
    }

    const contentEl = document.createElement("div");
    contentEl.textContent = content;
    msgEl.appendChild(contentEl);

    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to add plain text messages (e.g., join/leave announcements)
function addPlainText(content, timestamp) {
    const plainEl = document.createElement("div");
    plainEl.classList.add("chat-plain");
    plainEl.textContent = content;
    messagesContainer.appendChild(plainEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle key presses for sending messages and DM menu navigation
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
            } else if (e.key === 'Tab') {
                e.preventDefault();
                if (dmMenuHighlightedIndex !== -1) {
                    buttons[dmMenuHighlightedIndex].click();
                }
            }
        }
    }
});

function updateDmMenuHighlight() {
    const buttons = dmUserMenu.querySelectorAll('button');
    buttons.forEach((btn, index) => {
        if (index === dmMenuHighlightedIndex) {
            btn.classList.add('highlighted');
        } else {
            btn.classList.remove('highlighted');
        }
    });
}

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

socket.on('name_change_success', (data) => {
    const oldName = data.oldDisplayName;
    const newName = data.newDisplayName;
    currentUser.name = data.newSecureName;
    currentUser.displayName = newName;
    usernameInput.value = newName;

    if (!currentUser.isAdmin) {
        addPlainText(`${oldName} is now known as ${newName}.`, data.timestamp);
    } else {
        addMessage("System", `${oldName} changed display name to ${newName}.`, data.timestamp, true);
    }
    addMessage("System Alert", `Name successfully changed to ${newName}!`, new Date(), true);
});

socket.on('name_change_failed', (reason) => {
    addMessage("System Alert", reason, new Date(), true);
    usernameInput.value = currentUser.displayName;
});

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
        const commandParts = text.substring(5).match(/^(\S+)\s(.*)/s);

        if (!commandParts || commandParts.length < 3) {
            addMessage("System Alert", "Invalid /msg command. Usage: /msg [username] [message]", new Date(), true);
            messageInput.textContent = "";
            return;
        }

        const recipient = commandParts[1];
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
        const button = document.createElement("button");
        button.textContent = user;
        button.onclick = () => {
            const currentContent = messageInput.textContent;
            const msgIndex = currentContent.lastIndexOf("/msg");
            if (msgIndex !== -1) {
                const prefix = currentContent.substring(0, msgIndex + 5);
                const newContent = `${prefix}${user} `;
                messageInput.textContent = newContent;
                setCursorToEnd(messageInput);
                hideDmUserMenu();
            }
        };
        dmUserMenu.appendChild(button);
    });

    dmUserMenu.style.display = filteredUsers.length > 0 ? 'flex' : 'none';
}

function hideDmUserMenu() {
    dmUserMenu.style.display = 'none';
}

function setCursorToEnd(element) {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    element.focus();
}

// SOCKET LISTENERS
socket.on('chat message', (msg) => {
    addMessage(msg.username, msg.content, msg.timestamp, msg.isAdmin, false, false);
});

socket.on('private message', (msg) => {
    const sender = msg.sender;
    const content = msg.content;
    const isOwn = sender === currentUser.displayName;

    addMessage(sender, content, msg.timestamp, false, false, true);
});

socket.on('staff message', (msg) => {
    // Add messages received from the staff room
});

socket.on('chat history', (history) => {
    messagesContainer.innerHTML = '';
    history.forEach(msg => {
        addMessage(msg.username, msg.content, msg.timestamp, false, msg.isAdmin, false);
    });
});

socket.on('user count', (data) => {
    userCountDisplay.textContent = `${data.count} Users Online`;
    onlineUsers = data.userList;
});

socket.on('system_error', (message) => {
    addMessage("System Error", message, new Date(), true);
});
