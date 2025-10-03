// --- 1. ESTABLISH SEPARATE CONNECTIONS ---
var generalSocket = io(); 
var staffSocket = io('/staff'); 

// --- 2. GET DOM ELEMENTS ---
var generalForm = document.getElementById('generalForm');
var generalInput = document.getElementById('generalInput');
var messages = document.getElementById('messages');

var staffForm = document.getElementById('staffForm');
var staffInput = document.getElementById('staffChatInput');
var staffMessages = document.getElementById('staffMessages');

// ==========================================================
// GENERAL CHAT LOGIC
// ==========================================================

// Handle Form Submission
generalForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (generalInput.value) {
        generalSocket.emit('chat message', generalInput.value);
        generalInput.value = '';
    }
});

// Handle Message Receive
generalSocket.on('chat message', function(msg) {
    var item = document.createElement('li');
    item.textContent = 'General: ' + msg;
    messages.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
});

// ==========================================================
// STAFF CHAT LOGIC
// ==========================================================

// Handle Form Submission
staffForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (staffInput.value) {
        staffSocket.emit('staff message', staffInput.value); 
        staffInput.value = '';
    }
});

// Handle Message Receive
staffSocket.on('staff message', function(msg) {
    var item = document.createElement('li');
    item.textContent = 'STAFF: ' + msg;
    staffMessages.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
});

// --- 4. DEBUGGING LOGS (for connection confirmation) ---
generalSocket.on('connect', () => {
    console.log('Client: General Socket connected successfully.');
});
staffSocket.on('connect', () => {
    console.log('Client: Staff Socket connected successfully.');
});
generalSocket.on('connect_error', (err) => {
    console.error('Client Error: General Socket FAILED to connect:', err.message);
});
