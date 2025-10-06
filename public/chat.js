const socket = io();

const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountDisplay = document.getElementById('userCountDisplay');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInputDiv = document.getElementById('messageInput');

const genericModal = document.getElementById('genericModal');
const genericModalText = document.getElementById('genericModalText');
const closeGenericModal = document.getElementById('closeGenericModal');

const dmModal = document.getElementById('dmModal');
const dmUserList = document.getElementById('dmUserList');
const closeDmModal = document.getElementById('closeDmModal');

let displayName = '';
let secureName = '';
let isAdmin = false;
let dmTarget = null;

// ---------------- Message Append ----------------
function appendMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('msg');
  item.classList.add(msg.username === displayName ? 'own' : 'other');
  const header = `<div class="msg-header">${msg.username}${msg.isAdmin ? ' (Admin)' : ''}</div>`;
  const body = `<div class="message-content">${msg.content}</div>`;
  const foot = `<div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>`;
  item.innerHTML = header + body + foot;
  messagesDiv.appendChild(item);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ----------------- Modal Helpers -----------------
function showGenericModal(text) {
  genericModalText.textContent = text;
  genericModal.style.display = 'flex';
}
closeGenericModal.addEventListener('click', () => { genericModal.style.display='none'; });

function showDmModal(users) {
  dmUserList.innerHTML = '';
  users.forEach(u=>{
    if(u === displayName) return;
    const btn = document.createElement('button');
    btn.textContent = u;
    btn.addEventListener('click', ()=>{
      dmTarget = u;
      insertDmTag(u);
      dmModal.style.display='none';
    });
    dmUserList.appendChild(btn);
  });
  dmModal.style.display='flex';
}
closeDmModal.addEventListener('click', ()=> { dmModal.style.display='none'; dmTarget=null; });

// ----------------- Insert Highlighted DM Tag -----------------
function insertDmTag(name){
  messageInputDiv.innerHTML='';
  const span = document.createElement('span');
  span.className='dm-highlight';
  span.contentEditable = 'false';
  span.textContent = `[${name}]: `;
  messageInputDiv.appendChild(span);
  const textNode = document.createTextNode('');
  messageInputDiv.appendChild(textNode);

  // Move cursor to end
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ----------------- Join Chat -----------------
joinBtn.addEventListener('click', ()=>{
  const name=usernameInput.value.trim();
  if(!name) return;
  socket.emit('check_staff_status', name);
});

// ----------------- Socket Events -----------------
socket.on('name_rejected', msg => showGenericModal(msg));

socket.on('name_accepted', name=>{
  displayName=name;
  secureName=name;
  usernameInput.disabled=true;
  joinBtn.disabled=true;
});

socket.on('staff_status_update', data=>{
  displayName = data.displayName;
  secureName = data.secureName;
  isAdmin = data.isAdmin;
  usernameInput.disabled = true;
  joinBtn.disabled = true;
  clearChatBtn.style.display = isAdmin ? 'inline-block':'none';
});

socket.on('chat message', appendMessage);

socket.on('private message', appendMessage);

socket.on('chat history', history=>{
  messagesDiv.innerHTML='';
  history.forEach(appendMessage);
});

socket.on('user count', data=>{
  userCountDisplay.textContent=`${data.count} Users Online`;
});

// ----------------- Message Sending -----------------
messageForm.addEventListener('submit', e=>{
  e.preventDefault();
  const content = messageInputDiv.innerText.trim();
  if(!content||!displayName) return;

  // Check for DM tag
  const dmSpan = messageInputDiv.querySelector('.dm-highlight');
  if(dmSpan){
    const targetName = dmSpan.textContent.replace(/[\[\]:]/g,'').trim();
    const messageContent = content.replace(dmSpan.textContent,'').trim();
    if(messageContent){
      socket.emit('private message',{recipient:targetName,content:messageContent});
      appendMessage({username: displayName, content:messageContent, timestamp:new Date()});
    }
    dmSpan.remove(); dmTarget=null;
    messageInputDiv.innerText='';
    return;
  }

  // Check /msg command
  if(content.starts
