// === In server.js (Node.js/Socket.IO Server File) ===

let messages = []; // Your message array

io.on('connection', (socket) => {
    // 1. Send existing history to the new client
    socket.emit('chat history', messages);

    // 2. FIX: Handle Incoming Chat Messages (This is what makes sending work)
    socket.on('chat message', (msg) => {
        messages.push(msg);
        io.emit('chat message', msg); // Broadcast to all clients
    });
    
    // 3. NEW: Handle Admin Clear Chat Request
    socket.on('admin:clear_history', (data) => {
        if (!data.username) return; // Basic safety check

        // CLEAR THE SERVER-SIDE ARRAY
        messages = []; 

        // Announce the action to everyone
        io.emit('history_cleared', {
            username: data.username
        });
    });

    // ... (Your existing 'disconnect' handler can remain here)
});
