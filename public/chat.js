const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const messagesDiv = document.getElementById('messages');
const messageInputDiv = document.getElementById('messageInput');

let displayName = '';
let secureName = '';
let isAdmin = false;
let privateRecipient = null;

// ========== Utility Functions ==========

function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');

    // System messages centered
    if (msg.username === 'System') {
        item.classList.add('system-msg');
    } else {
        if (msg.isPrivate) {
            item.classList.add('private');
        }
        if (msg.username.toLowerCase() === displayName.toLowerCase()) {
            item.classList.add('own');
        } else {
            item.classList.add('other');
        }
    }

    const header = `<div class="msg-header">${msg.username}${msg.isAdmin ? ' (Admin)' : ''}${msg.isPrivate ? ' (Private)' : ''}</div>`;
    const body = `<div class="message-content">${msg.content}</div>`;
    const foot = `<div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;
    item.innerHTML = header + body + foot;
    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Modal creation helper
function createModal(title, bodyHTML, buttons = []) {
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h5>${title}</h5>
                <button class="close-modal">X</button>
            </div>
            <div class="modal-body">${bodyHTML}</div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
    });

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.addEventListener('click', () => {
            btn.onClick(modal);
        });
        modal.querySelector('.modal-body').appendChild(button);
    });

    return modal;
}

// ========== Event Listeners ==========

joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return;
    socket.emit('check_staff_status', name);
});

socket.on('name_accepted', name => {
    displayName = name;
    secureName = name;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
});

socket.on('staff_name_reserved_modal', msg => {
    createModal('Name Reserved', `<p>${msg}</p>`);
});

socket.on('name_in_use_modal', msg => {
    createModal('Name In Use', `<p>${msg}</p>`);
});

socket.on('staff_status_update', data => {
    displayName = data.displayName;
    secureName = data.secureName;
    isAdmin = data.isAdmin;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
    clearChatBtn.style.display = isAdmin ? 'inline-block' : 'none';
    adminPanelBtn.style.display = isAdmin ? 'inline-block' : 'none';
});

socket.on('chat message', appendMessage);
socket.on('private message', appendMessage);
socket.on('chat history', history => {
    messagesDiv.innerHTML = '';
    history.forEach(appendMessage);
});

// ========== Message Sending ==========

function sendMessage() {
    const content = messageInputDiv.innerText.trim();
    if (!content) return;

    if (privateRecipient) {
        socket.emit('private message', { recipient: privateRecipient, content });
        privateRecipient = null;
        messageInputDiv.innerHTML = '';
        return;
    }

    socket.emit('chat message', { username: secureName || displayName, content });
    messageInputDiv.innerHTML = '';
}

// Press Enter to send
messageInputDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Clear Chat button
clearChatBtn.addEventListener('click', () => {
    if (!isAdmin) return;
    socket.emit('admin:clear_history', { username: displayName });
});

// Admin Panel button
adminPanelBtn.addEventListener('click', () => {
    if (!isAdmin) return;

    const bodyHTML = `<p>Admin Controls Here</p>`;
    createModal('Admin Panel', bodyHTML);
});

// /msg typing trigger
messageInputDiv.addEventListener('input', () => {
    const text = messageInputDiv.innerText;
    if (text.startsWith('/msg ')) {
        const usersList = Array.from(document.querySelectorAll('#user-list li')).map(li => li.textContent);
        let listHTML = '<ul style="max-height:200px;overflow-y:auto;">';
        usersList.forEach(u => listHTML += `<li class="dm-user">${u}</li>`);
        listHTML += '</ul>';

        const modal = createModal('Select Recipient', listHTML);
        modal.querySelectorAll('.dm-user').forEach(li => {
            li.addEventListener('click', () => {
                privateRecipient = li.textContent;
                messageInputDiv.innerHTML = `[${privateRecipient}]: `;
                modal.remove();
            });
        });
    }
});
