const socket = io();

// DOM Elements
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');
const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const dmCloseBtn = document.getElementById('dmCloseBtn');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmTarget = null;

// ========== Utility ==========

function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('msg');
    if(msg.system) item.classList.add('system');
    else item.classList.add(msg.username === displayName ? 'own' : 'other');

    const header = msg.system ? '' : `<div class="msg-header">${msg.username}${msg.isAdmin ? ' (Admin)' : ''}</div>`;
    const body = `<div class="message-content">${msg.content}</div>`;
    item.innerHTML = header + body;
    messagesDiv.appendChild(item);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== Join / Staff / Name Checks ==========

joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if(!name) return;

    socket.emit('check_name', name);
});

socket.on('name_accepted', name => {
    displayName = name;
    secureName = name;
    usernameInput.disabled = true;
    joinBtn.disabled = true;
});

socket.on('name_rejected', reason => {
    alert(reason); // or could show a modal here
});

// ========== Chat / Messages ==========

messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = messageInputDiv.innerText.trim();
    if(!text) return;

    // /msg handling
    if(text.startsWith('/msg ')) {
        const rest = text.slice(5).trim();
        if(!rest) {
            // Show DM modal
            dmUserList.innerHTML = '';
            // Request current users
            socket.emit('get_user_list');
            dmModal.style.display = 'flex';
            return;
        }
    }

    // If DM highlight exists, send private
    if(dmTarget && messageInputDiv.innerText.startsWith(`[${dmTarget}]:`)) {
        const content = messageInputDiv.innerText.replace(`[${dmTarget}]: `,'');
        socket.emit('private_message', { recipient: dmTarget, content });
        appendMessage({ username: `You → ${dmTarget}`, content, system:false });
        dmTarget = null;
        messageInputDiv.innerText = '';
        return;
    }

    // Regular message
    socket.emit('chat_message', { username: secureName || displayName, content: text });
    messageInputDiv.innerText = '';
});

socket.on('chat_message', msg => appendMessage(msg));
socket.on('user_count', data => userCountDisplay.textContent = `${data.count} Users Online`);

socket.on('user_list', list => {
    dmUserList.innerHTML = '';
    list.forEach(user => {
        if(user
