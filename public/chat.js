const socket = io();
const msgBox = document.getElementById("msgBox");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

let currentUser = null;

// Google login callback
function handleCredentialResponse(response) {
  const base64Url = response.credential.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(base64));

  currentUser = {
    name: payload.name,
    email: payload.email,
    picture: payload.picture
  };

  alert("Welcome " + currentUser.name);
}

// Send message
function sendMessage() {
  if (!currentUser) {
    alert("Please sign in with Google first.");
    return;
  }

  const text = msgInput.value.trim();
  if (!text) return;

  const msg = {
    user: currentUser.name,
    picture: currentUser.picture,
    text,
    ts: Date.now()
  };

  socket.emit("chat message", msg);
  msgInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

// Display message
function displayMessage(msg) {
  const isOwn = currentUser && msg.user === currentUser.name;
  const div = document.createElement('div');
  div.className = `msg ${isOwn ? 'own' : 'other'}`;

  if (msg.picture) {
    const img = document.createElement('img');
    img.src = msg.picture;
    img.alt = msg.user;
    div.appendChild(img);
  }

  const content = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'msg-header';
  header.textContent = `${msg.user} • ${new Date(msg.ts).toLocaleTimeString()}`;

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = msg.text;

  content.appendChild(header);
  content.appendChild(body);
  div.appendChild(content);

  msgBox.appendChild(div);
  msgBox.scrollTop = msgBox.scrollHeight;
}

// Socket.IO events
socket.on('chat history', msgs => {
  msgBox.innerHTML = '';
  msgs.forEach(displayMessage);
});

socket.on('chat message', displayMessage);

// System messages
function addSystemMessage(text) {
  const msg = { user: 'System', text, ts: Date.now() };
  displayMessage(msg);
}
