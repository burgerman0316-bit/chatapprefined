// --- 1. ESTABLISH SINGLE CONNECTION ---
var socket = io(); 

// --- 2. GET DOM ELEMENTS (using new, simplified IDs) ---
var chatForm = document.getElementById('chatForm');
var chatInput = document.getElementById('chatInput');
var messages = document.getElementById('messages');

// ==========================================================
// UNIFIED CHAT LOGIC
// ==========================================================

// Handle Form Submission
chatForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (chatInput.value) {
        // Use the single 'socket' variable to emit the message
        socket.emit('chat message', chatInput.value);
        chatInput.value = '';
    }
});

// Handle Message Receive
socket.on('chat message', function(msg) {
    var item = document.createElement('li');
    item.textContent = msg; // Just show the message content
    messages.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
});

// --- 3. DEBUGGING LOGS ---
socket.on('connect', () => {
    console.log('Client: Socket connected successfully.');
});
socket.on('connect_error', (err) => {
    console.error('Client Error: Socket FAILED to connect:', err.message);
});
