const socket = io();

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

const dmModal = document.getElementById('dmModal');
const dmCloseBtn = document.getElementById('dmCloseBtn');
const dmUserList = document.getElementById('dmUserList');

const nameErrorModal = document.getElementById('nameErrorModal');
const nameErrorText = document.getElementById('nameErrorText');
const nameErrorClose = document.getElementById('nameErrorClose');

const adminModal = document.getElementById('adminModal');
const adminCloseBtn = document.getElementById('adminCloseBtn');
const adminUserList = document.getElementById('adminUserList');
const bannedUserList = document.getElementById('bannedUserList');
const bannedIpList = document.getElementById('bannedIpList');

// Admin buttons
const adminClearHistoryBtn = document.getElementById('adminClearHistoryBtn');
const banUsernameInput = document.getElementById('banUsernameInput');
const banUsernameBtn = document.getElementById('banUsernameBtn');
const unbanUsernameInput = document.getElementById('unbanUsernameInput');
const unbanUsernameBtn = document.getElementById('unbanUsernameBtn');
const banIpInput = document.getElementById('banIpInput');
const banIpBtn = document.getElementById('banIpBtn');
const unbanIpInput = document.getElementById('unbanIpInput');
const unbanIpBtn = document.getElementById('unbanIpBtn');
const forceDisconnectInput = document.getElementById('forceDisconnectInput');
const forceDisconnectBtn = document.getElementById('forceDisconnectBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmTarget = null;

// ====== MESSAGE APPEND ======
function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');

    if(msg.isSystem) {
        item.classList.add('system');
        item.textContent = msg.content;
    } else {
        if(msg.isPrivate) item.classList.add('private');

        if(msg.username.toLowerCase() === displayName.toLowerCase()) {
            item.classList.add('own');
        } else {
            item.classList.add('other');
        }

        const header = document.createElement('div');
        header.className = 'msg-header';
        header.textContent = msg.username + (msg.isAdmin ? ' (Admin)' : '') + (msg.isPrivate ? ' (Private)' : '');
        const body = document.createElement('div');
        body.className = 'message-content';
        body.textContent = msg.content;
        const foot = document.createElement('div');
        foot.className = 'timestamp';
        foot.textContent = new Date(msg.timestamp).toLocaleTimeString();

        item.appendChild(header);
        item.appendChild(body);
        item.appendChild(foot);
    }

    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ====== MODAL HELPERS ======
function showModal(modal) {
    modal.style.display = 'flex';
}

function hideModal(modal) {
    modal.style.display = 'none';
}

// ====== USER JOIN ======
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if(name) {
        socket.emit('check_staff_status', name);
    }
});

socket.on('name_accepted', name => {
    displayName = name;
    secureName = name;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
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

socket.on('name_rejected', msg => {
    nameErrorText.textContent = msg;
    showModal(nameErrorModal);
});

// ====== CHAT MESSAGES ======
socket.on('chat message', msg => appendMessage(msg));
socket.on('private message', msg => appendMessage(msg));
socket.on('chat history', history => {
    messagesDiv.innerHTML = '';
    history.forEach(m => appendMessage(m));
});
socket.on('user count', data => {
    userCountDisplay.textContent = `${data.count} Users Online`;
});

// ====== MESSAGE SEND ======
messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const content = messageInputDiv.innerText.trim();
    if(!content || !displayName) return;

    if(content.startsWith('/msg ')) {
        const rest = content.substring(5).trim();
        if(!rest) {
            // show DM modal
            socket.emit('request_user_list');
            return;
        }
    }

    let finalMsg = content;
    let privateData = null;
    if(dmTarget) {
        privateData = { recipient: dmTarget, content };
        finalMsg = `[DM to ${dmTarget}]: ${content}`;
        dmTarget = null;
    }

    socket.emit(privateData ? 'private message' : 'chat message', privateData || { username: secureName || displayName, content: finalMsg });
    messageInputDiv.innerText = '';
});

// ====== ENTER KEY SEND ======
messageInputDiv.addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// ====== DM MODAL ======
dmCloseBtn.addEventListener('click', () => {
    hideModal(dmModal);
    messageInputDiv.innerText = '';
});

socket.on('user_list', list => {
    dmUserList.innerHTML = '';
    list.forEach(user => {
        if(user.toLowerCase() === displayName.toLowerCase()) return;
        const btn = document.createElement('button');
        btn.textContent = user;
        btn.addEventListener('click', () => {
            dmTarget = user;
            hideModal(dmModal);
            messageInputDiv.innerText = `[${user}]: `;
        });
        dmUserList.appendChild(btn);
    });
    showModal(dmModal);
});

// ====== NAME ERROR MODAL ======
nameErrorClose.addEventListener('click', () => hideModal(nameErrorModal));

// ====== ADMIN PANEL ======
adminPanelBtn.addEventListener('click', () => {
    socket.emit('request_admin_data');
    showModal(adminModal);
});
adminCloseBtn.addEventListener('click', () => hideModal(adminModal));

// ====== ADMIN BUTTONS ======
adminClearHistoryBtn.addEventListener('click', () => socket.emit('admin:clear_history', { username: displayName }));

banUsernameBtn.addEventListener('click', () => {
    const u = banUsernameInput.value.trim();
    if(u) socket.emit('admin:ban_user', u);
});
unbanUsernameBtn.addEventListener('click', () => {
    const u = unbanUsernameInput.value.trim();
    if(u) socket.emit('admin:unban_user', u);
});
banIpBtn.addEventListener('click', () => {
    const ip = banIpInput.value.trim();
    if(ip) socket.emit('admin:ban_ip', ip);
});
unbanIpBtn.addEventListener('click', () => {
    const ip = unbanIpInput.value.trim();
    if(ip) socket.emit('admin:unban_ip', ip);
});
forceDisconnectBtn.addEventListener('click', () => {
    const u = forceDisconnectInput.value.trim();
    if(u) socket.emit('admin:force_disconnect', u);
});

// ====== RECEIVE ADMIN DATA ======
socket.on('admin_data', data => {
    adminUserList.innerHTML = '';
    data.onlineUsers.forEach(u => {
        const li = document.createElement('div');
        li.textContent = u;
        adminUserList.appendChild(li);
    });

    bannedUserList.innerHTML = '';
    data.bannedUsers.forEach(u => {
        const li = document.createElement('div');
        li.textContent = u;
        bannedUserList.appendChild(li);
    });

    bannedIpList.innerHTML = '';
    data.bannedIps.forEach(ip => {
        const li = document.createElement('div');
        li.textContent = ip;
        bannedIpList.appendChild(li);
    });
});
