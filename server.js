const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { OAuth2Client } = require('google-auth-library'); // ⬅️ NEW IMPORT

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configure Google OAuth Client
// ⚠️ IMPORTANT: REPLACE THIS WITH YOUR ACTUAL CLIENT ID
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; 
const client = new OAuth2Client(CLIENT_ID);
const chatHistory = [];
const MAX_HISTORY = 200;

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Verifies a Google ID Token and returns the user payload.
 * @param {string} token The Google ID Token from the client.
 * @returns {object|null} The user payload (name, email, picture) or null on failure.
 */
async function verifyGoogleToken(token) {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
    };
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return null;
  }
}

io.on('connection', (socket) => {
  console.log('A user connected');
  
  // A property to store the user's details after successful login
  socket.userData = null;

  // Send chat history to new client
  socket.emit('chat history', chatHistory);

  // 1. Listen for the Google ID Token from the client
  socket.on('google login', async (token) => {
    const user = await verifyGoogleToken(token);
    
    if (user) {
        socket.userData = user;
        // Send confirmation back to the client
        socket.emit('login success', user); 
        console.log(`User logged in: ${user.name} (${user.email})`);
    } else {
        socket.emit('login failed', 'Invalid Google token.');
        socket.disconnect(true); // Disconnect unauthorized user
    }
  });

  // 2. Listen for incoming messages (only from authenticated sockets)
  socket.on('chat message', (content) => {
    if (!socket.userData) {
      console.log('Unauthorized message attempt blocked.');
      return; // Block unauthenticated messages
    }
    
    const msg = {
      username: socket.userData.name,
      email: socket.userData.email,
      picture: socket.userData.picture,
      content: content, // The client only sends the text now
      timestamp: new Date().toISOString(),
    };

    chatHistory.push(msg);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift(); 
    
    // Broadcast the fully verified message
    io.emit('chat message', msg);
  });

  // 3. Listen for clear history request
  socket.on('clear history', () => {
    // ⚠️ IMPORTANT: REPLACE WITH YOUR ADMIN EMAIL
    const ADMIN_EMAIL = "burgerman0316@gmail.com"; 
    
    if (socket.userData && socket.userData.email === ADMIN_EMAIL) {
        chatHistory.length = 0;
        io.emit('history cleared');
        console.log('Chat history cleared by admin.');
    } else {
        console.log(`Unauthorized clear attempt from: ${socket.userData ? socket.userData.email : 'Unauthenticated'}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Listen on Railway port or default 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('🎉 Use your Railway URL to access the app!');
});