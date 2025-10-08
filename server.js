const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --- SETTINGS & DATA STRUCTURES ---
const STAFF_ROOM = 'staff_room';
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler', 'admin', 'mod'];
const CONTENT_MAX_CHARS = 256; 
const BANNED_WORDS = ['swear', 'badword', 'spam'];

// Staff accounts - NOTE: LoginName is the SECURE password/key
const STAFF_LIST = [
  { loginName: 'hfdskLshkdgdibIdsjfkbdAshfjhsfdshfjMdjsbfhd', displayName: 'Liam Stern' },
  { loginName: 'hfsdjDfhukdshjfkdIsjfhdsjEkfhdjSjkshjEdkfLh', displayName: 'Diesel Carter' },
  { loginName: 'hbjrhfjRnjkfdvjkIfhdCnjfkdnjKjndksdjkfjdkdy', displayName: 'Ricky Martinez' },
  { loginName: 'hdufAhudsAifhudiRsfOuidsuNfdsmklfdskfdndsjk', displayName: 'Aaron Ortega' },
  { loginName: 'dnjsDkfjdsOfjdNsfjdOksfjVkdAsnfNjdsnfjkdkfd', displayName: 'Donovan Powell' }
];

const chatHistory = [];
const usernamesMap = new Map(); // lowercasedDisplayName -> socket.id
const socketsMap = new Map();    // socket.id → { displayName, secureName, isAdmin }

// --- STATIC FILE SERVING ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- HELPER FUNCTIONS ---
function cleanUpUser(socketId) {
    const name = socketsMap.get(socketId)?.displayName;
    if (!name) return;

    const lower = name.toLowerCase();
    
    if (usernamesMap.has(lower) && usernamesMap.get(lower) === socketId) {
        usernamesMap.delete(lower);
    }
    
    socketsMap.delete(socketId);
}

function isNameReservedOrBanned(name) { 
    if (!name) return true;
    const lower = name.trim().toLowerCase();
    
    // 1. Check for banned words
    if (BANNED_NAMES.some(banned => lower.includes(banned.toLowerCase()))) {
        return true;
    }
    
    // 2. Check for staff display names (Prevents regular users from taking 'Liam Stern')
    if (STAFF_LIST.some(s => s.displayName.toLowerCase() === lower)) {
        return true;
    }
    
    return false;
}

function isContentBanned(content) {
    if (!content) return false; 
    const lower = content.trim().toLowerCase();
    return BANNED_WORDS.some(banned => lower.includes(banned.toLowerCase()));
}

function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory.shift();
  }
}

function broadcastUserCount() {
  const userList = Array.from(socketsMap.values())
    .map(user => user.displayName)
    .sort();
    
  io.emit('user count', userList);
}

// --- SOCKET LOGIC ---
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  // Initial setup
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // 1. Name check & Login
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();

    cleanUpUser(socket.id); 

    if (!name) { 
      socket.emit('name_rejected', `Please provide a name.`);
      return;
    }
    
    // --- ADMIN LOGIN ATTEMPT (Requires secure key) ---
    const staffLoginAttempt = STAFF_LIST.find(s => s.loginName === name);
    if (staffLoginAttempt) {
        const staffName = staffLoginAttempt.displayName;
        const staffLower = staffName.toLowerCase();

        if (usernamesMap.has(staffLower)) {
            socket.emit('name_rejected', `The staff display name '${staffName}' is already in use.`);
            return;
        }

        // SUCCESSFUL ADMIN LOGIN
        socketsMap.set(socket.id, { 
            displayName: staffName, 
            secureName: staffLoginAttempt.loginName, 
            isAdmin: true 
        });
        usernamesMap.set(staffLower, socket.id);
        socket.join(STAFF_ROOM); 

        socket.emit('staff_status_update', { isAdmin: true, displayName: staffName });
        const publicMsg = {
          username: 'System',
          content: `A moderator has entered the chat.`,
          timestamp: new Date(),
          isAdmin: true
        };
        pushHistory(publicMsg);
        io.emit('chat message', publicMsg);
        broadcastUserCount();
        return;
    }
    // --- END ADMIN LOGIN ATTEMPT ---

    // Name uniqueness check (after admin attempt fails)
    if (usernamesMap.has(lower)) {
        socket.emit('name_rejected', 'That name is already in use (Name collision).');
        return;
    }

    // Reserved/Banned name check (Non-admin name)
    if (isNameReservedOrBanned(name)) {
        socket.emit('name_rejected', 'That name is either reserved for staff or not allowed.');
        return;
    }

    // Normal User Login Logic
    socketsMap.set(socket.id, { 
        displayName: name, 
        secureName: name, 
        isAdmin: false 
    });
    usernamesMap.set(lower, socket.id);
    socket.emit('name_accepted', name);

    const joinMsg = {
      username: 'System',
      content: `${name} has joined the chat.`,
      timestamp: new Date(),
      isAdmin: false
    };
    pushHistory(joinMsg);
    io.emit('chat message', joinMsg);
    broadcastUserCount();
  });

  // 2. Normal Chat Messages
  socket.on('chat message', msg => {
    const info = socketsMap.get(socket.id);
    if (!info) {
        socket.emit('system_error', 'You must set a name first.');
        return;
    }
    const content = (msg.content || '').trim();
    if (!content || content.length > CONTENT_MAX_CHARS) return;
    if (isContentBanned(content)) {
        socket.emit('system_alert', 'Your message contains banned language and was not sent.');
        return;
    }
    
    const messageData = {
      username: info.displayName,
      content: content,
      timestamp: new Date(),
      isAdmin: info.isAdmin
    };
    
    pushHistory(messageData);
    io.emit('chat message', messageData);
    broadcastUserCount();
  });

  // 3. Private Message
  socket.on('private message', msg => {
    const sender = socketsMap.get(socket.id);
    if (!sender) {
      socket.emit('system_error', 'You must set a name first.');
      return;
    }

    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();
    if (!recipient || !content || content.length > CONTENT_MAX_CHARS) {
      socket.emit('system_error', 'Invalid /msg command. Usage: /msg [username] [message]');
      return;
    }
    if (isContentBanned(content)) {
        socket.emit('system_alert', 'Your message contains banned language and was not sent.');
        return;
    }

    if (recipient.toLowerCase() === sender.displayName.toLowerCase()) {
      socket.emit('system_alert', 'You cannot send a private message to yourself.');
      return;
    }

    const recLower = recipient.toLowerCase();
    const recSocketId = usernamesMap.get(recLower);

    if (recSocketId) {
      const messageData = {
        username: sender.displayName,
        content: content,
        timestamp: new Date(),
        isPrivate: true,
        recipient: recipient
      };
      io.to(recSocketId).emit('private message', messageData); 
      socket.emit('private message', {
        ...messageData,
        username: 'You', 
      }); 
    } else {
      socket.emit('system_error', `User '${recipient}' not found or offline.`);
    }
  });

  // 4. Admin: Clear History
  socket.on('admin:clear_history', () => {
    const info = socketsMap.get(socket.id);
    if (!info || !info.isAdmin) {
      socket.emit('system_error', 'Unauthorized: Admin privileges required.');
      return;
    }

    chatHistory.length = 0; 
    
    const clearMsg = {
      username: 'System',
      content: `Moderator ${info.displayName} cleared chat history.`,
      timestamp: new Date(),
      isAdmin: true
    };
    
    pushHistory(clearMsg);
    io.emit('admin:history_cleared', clearMsg);
  });
  
  // 5. Admin: Kick User (/kick, Button)
  socket.on('admin:kick_user', targetName => {
      const info = socketsMap.get(socket.id);
      if (!info || !info.isAdmin) {
          socket.emit('system_error', 'Unauthorized: Admin privileges required.');
          return;
      }
      
      const targetLower = targetName.toLowerCase();
      const targetSocketId = usernamesMap.get(targetLower);
      
      if (!targetSocketId) {
          socket.emit('system_error', `Kick failed: User '${targetName}' not found or offline.`);
          return;
      }
      
      io.to(targetSocketId).emit('system_error', `You have been KICKED by Moderator ${info.displayName}.`);
      
      const kickMsg = {
        username: 'System',
        content: `Moderator ${info.displayName} has kicked ${targetName} from the chat.`,
        timestamp: new Date(),
        isAdmin: true
      };
      pushHistory(kickMsg);
      io.emit('chat message', kickMsg);
      
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
          targetSocket.disconnect(true);
      }
  });

  // 6. Disconnect 
  socket.on('disconnect', () => {
    const user = socketsMap.get(socket.id);
    if (!user) return;

    cleanUpUser(socket.id);

    const leaveMsg = {
      username: 'System',
      content: `${user.displayName} has left the chat.`,
      timestamp: new Date(),
      isAdmin: user.isAdmin
    };
    
    pushHistory(leaveMsg);
    io.emit('chat message', leaveMsg);
    broadcastUserCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
