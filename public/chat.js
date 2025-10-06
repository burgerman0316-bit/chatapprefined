const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const clearChatBtn = document.getElementById('clearChatBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;
let privateRecipient = null; // for highlighting private messages

// ================= Utility Functions ===================

function createModal(title, bodyHTML) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.custom-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.classList.add('custom-modal');

    modal.innerHTML = `
        <div class="custom-modal-content">
            <div class="modal-header">
                <span class="modal-title">${title}</span>
                <button class="close-modal-btn">&times;</button>
            </div>
            <div class="modal-body">${bodyHTML}</div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());

    return modal;
}

function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');

    if (msg.isAdmin) {
        item.classList.add('admin-msg');
    } else if (msg.username.toLowerCase() === displayName.toLowerCase()) {
        item.classList.add('own');
    } else {
        item.classList.add('other');
    }

    // System messages
    if (msg.isSystem) {
        item.classList.add('system-msg');
        item.textContent = msg.content;
    } else {
        const header = document.createElement('div');
        header.classList.add('msg-header');
        header.textContent = msg.username + (msg.isAdmin ? ' (Admin)' : '');
        const body = document.createElement('div');
        body.classList.add('message-content');
        body.textContent = msg.content;
        const foot = document.createElement('div');
        foot.classList.add('timestamp');
        foot.textContent = new Date(msg.timestamp).toLocaleTimeString();
        item.append(header, body, foot);
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ================= Event Wiring ===================

// Join button
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return;

    socket.emit('check_staff_status', name);
});

// Receive name accepted
socket.on('name_accepted', name => {
    displayName = name;
    secureName = name;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
});

// Reserved staff name
socket.on('staff_name_reserved_modal', msg => {
    createModal('Name Reserved', `<p>${msg}</p>`);
});

// Name in use
socket.on('name_in_use_modal', msg => {
    createModal('Name In Use', `<p>${msg}</p>`);
});

// Staff status
socket.on('staff_status_update', data => {
    displayName = data.displayName;
    secureName = data.secureName;
    isAdmin = data.isAdmin;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
    clearChatBtn.style.display = isAdmin ? 'inline-block' : 'none';
    if (isAdmin) adminPanelBtn.style.display = 'inline-block';
});

// Chat messages
socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));
socket.on('chat history', history => {
    messagesDiv.innerHTML = '';
    history.forEach(msg => appendMessage(msg));
});
socket.on('user count', data => {
    userCountDisplay.textContent = `${data.count} Users Online`;
});

// ================== Message Sending ===================
messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const content = messageInputDiv.innerText.trim();
    if (!content || !displayName) return;

    // Private message trigger
    if (content.startsWith('/msg')) {
        const userList = Array.from(document.querySelectorAll('#user-list li')).map(li => li.textContent);
        let listHTML = '<ul class="scrollable-user-list">';
        userList.forEach(u => listHTML += `<li class="user-select">${u}</li>`);
        listHTML += '</ul>';

        const modal = createModal('Send Private Message', listHTML);
        modal.querySelectorAll('.user-select').forEach(li => {
            li.addEventListener('click', () => {
                privateRecipient = li.textContent;
                messageInputDiv.innerHTML = `[${privateRecipient}]: `;
                highlightRecipientText();
                modal.remove();
                messageInputDiv.focus();
            });
        });

        return;
    }

    // Check if currently sending to private recipient
    if (privateRecipient && content.startsWith(`[${privateRecipient}]: `)) {
        const msg = content.replace(`[${privateRecipient}]: `, '');
        socket.emit('private message', { recipient: privateRecipient, content: msg });
        privateRecipient = null;
        messageInputDiv.innerText = '';
        return;
    }

    // Regular public message
    socket.emit('chat message', { username: secureName || displayName, content });
    messageInputDiv.innerText = '';
});

// Pressing Enter sends the message
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// ================== Highlighting Private Recipient ===================
function highlightRecipientText() {
    const range = document.createRange();
    const sel = window.getSelection();
    if (messageInputDiv.firstChild) {
        range.setStart(messageInputDiv.firstChild, 0);
        range.setEnd(messageInputDiv.firstChild, messageInputDiv.firstChild.length);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// ================== Admin Panel ===================
adminPanelBtn.addEventListener('click', () => {
    if (!isAdmin) return;

    const bodyHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="adminClearChatBtn">Clear Chat</button>
            <button id="adminBanUserBtn">Ban User</button>
            <button id="adminHardwareBanBtn">Hardware Ban User</button>
        </div>
    `;

    const modal = createModal('Admin Panel', bodyHTML);

    // Clear chat
    modal.querySelector('#adminClearChatBtn').addEventListener('click', () => {
        socket.emit('admin:clear_history', { username: displayName });
        modal.remove();
    });

    // Ban user
    modal.querySelector('#adminBanUserBtn').addEventListener('click', () => {
        const userList = Array.from(document.querySelectorAll('#user-list li')).map(li => li.textContent);
        let listHTML = '<ul class="scrollable-user-list">';
        userList.forEach(u => listHTML += `<li class="ban-user">${u}</li>`);
        listHTML += '</ul>';

        const banModal = createModal('Ban User', listHTML);
        banModal.querySelectorAll('.ban-user').forEach(li => {
            li.addEventListener('click', () => {
                const usernameToBan = li.textContent;
                socket.emit('admin:ban_user', { username: usernameToBan });
                banModal.remove();
                modal.remove();
            });
        });
    });

    // Hardware ban user
    modal.querySelector('#adminHardwareBanBtn').addEventListener('click', () => {
        const userList = Array.from(document.querySelectorAll('#user-list li')).map(li => li.textContent);
        let listHTML = '<ul class="scrollable-user-list">';
        userList.forEach(u => listHTML += `<li class="hw-ban-user">${u}</li>`);
        listHTML += '</ul>';

        const hwBanModal = createModal('Hardware Ban User', listHTML);
        hwBanModal.querySelectorAll('.hw-ban-user').forEach(li => {
            li.addEventListener('click', () => {
                const usernameToHwBan = li.textContent;
                socket.emit('admin:hardware_ban', { username: usernameToHwBan });
                hwBanModal.remove();
                modal.remove();
            });
        });
    });
});
