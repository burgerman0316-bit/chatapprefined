
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Settings
const STAFF_ROOM = 'staff_room';
const MAX_HISTORY = 100;
const BANNED_NAMES = ['hitler', 'admin', 'mod'];
const STAFF_LIST = [
  { loginName: 'STAFF_CONTROLS-LIAM', displayName: 'Liam Stern' },
  { loginName: 'STAFF_CONTROLS-DIESEL', displayName: 'Diesel Carter' },
  { loginName: 'STAFF_CONTROLS-RICKY', displayName: 'Ricky Martinez' }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();    // socket.id → displayName
const usernamesMap = new Map();  // lowercased displayName → socket.id

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper functions
function isNameReserved(name) {
    if (!name) return false;
    const lower = name.trim().toLowerCase();

    if (STAFF_LIST.some(s => s.displayName.toLowerCase() === lower)) {
        return true; 
    }
    if (BANNED_NAMES.some(b => lower.includes(b.toLowerCase()))) {
        return true;
    }
    return false;
}

function getStaffDisplayInfo(enteredName) {
    const secure = enteredName.trim();
    const staff = STAFF_LIST.find(s => 
        s.loginName === secure || s.displayName.toLowerCase() === secure.toLowerCase()
    );
    if (staff) {
        return { isAdmin: true, username: staff.displayName, secureName: staff.loginName };
    }
    return { isAdmin: false, username: secure, secureName: secure };
}

function pushHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory.shift();
  }
}

function broadcastUserCount() {
  const list = Array.from(socketsMap.values()).sort();
  io.emit('user count', { count: namesInUse.size, userList: list });
}

// Socket logic
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // Name check 
  socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    const lower = name.toLowerCase();

    if (!name) {
      socket.emit('name_rejected', 'Please provide a name.');
      return;
    }

    // 1. Check if the name is already in use
    if (namesInUse.has(lower)) {
        const existingSocketId = usernamesMap.get(lower);

        if (existingSocketId && existingSocketId !== socket.id) {
             socket.emit('name_in_use_modal', 'Someone is already using that name.');
             return;
        }
        
        // Proactively remove the old state for the same user trying to reconnect (refresh fix)
        namesInUse.delete(lower);
        usernamesMap.delete(lower);
    }

    // 2. Clear any old, stale name mappings for this new socket ID
    const oldName = socketsMap.get(socket.id);
    if (oldName) {
        namesInUse.delete(oldName.toLowerCase()); 
        usernamesMap.delete(oldName.toLowerCase());
        socketsMap.delete(socket.id); 
    }
    
    // 3. Reserved names check
    if (isNameReserved(name)) {
      socket.emit('staff_name_reserved_modal', 'That name is reserved for staff.');
      return;
    }

    // 4. Staff Login Logic
    const staffInfo = STAFF_LIST.find(s => s.loginName === name);
    if (staffInfo) {
      namesInUse.add(name.toLowerCase());
      socketsMap.set(socket.id, staffInfo.displayName);
      usernamesMap.set(staffInfo.displayName.toLowerCase(), socket.id);
      socket.join(STAFF_ROOM);

      socket.emit('staff_status_update', { isAdmin: true, displayName: staffInfo.displayName, secureName: staffInfo.loginName });
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

    // 5. Normal User Login Logic
    namesInUse.add(lower);
    socketsMap.set(socket.id, name);
    usernamesMap.set(name.toLowerCase(), socket.id);
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

  // Public chat messages
  socket.on('chat message', msg => {
    if (!msg.content) return;

    const info = getStaffDisplayInfo(msg.username);
    const messageData = {
      username: info.username,
      content: msg.content,
      timestamp: new Date(),
      isAdmin: info.isAdmin
    };
    pushHistory(messageData);
    io.emit('chat message', messageData);
  });

  // Private message
  socket.on('private message', msg => {
    const sender = socketsMap.get(socket.id);
    if (!sender) {
      socket.emit('system_error', 'You must set a name first.');
      return;
    }

    const recipient = (msg.recipient || '').trim();
    const content = (msg.content || '').trim();
    if (!recipient || !content) {
      socket.emit('system_error', 'Invalid /msg command. Usage: /msg [username] [message]');
      return;
    }

    if (recipient.toLowerCase() === sender.toLowerCase()) {
      socket.emit('system_alert', 'You cannot send a private message to yourself.');
      return;
    }

    const recLower = recipient.toLowerCase();
    const recSocketId = usernamesMap.get(recLower);

    if (recSocketId) {
      const messageData = {
        sender: sender,
        recipient: recipient,
        content: content,
        timestamp: new Date(),
        isPrivate: true
      };
      io.to(recSocketId).emit('private message', messageData);
      socket.emit('private message', messageData); // Send copy to sender
    } else {
      socket.emit('system_error', `User '${recipient}' not found or offline.`);
    }
  });

  // Clear history (admin only)
  socket.on('admin:clear_history', data => {
    const info = getStaffDisplayInfo(data.username);
    
    console.log(`[ADMIN DEBUG] Attempting to clear history by: ${data.username} (Is Admin: ${info.isAdmin})`);
    
    if (!info.isAdmin) {
      socket.emit('system_error', 'Unauthorized: Admin privileges required.');
      console.log(`[ADMIN DEBUG] History clear DENIED for ${data.username}.`);
      return;
    }

    // CRITICAL: Clear the server's master history array
    chatHistory.length = 0; 
    
    const clearMsg = {
      username: 'System',
      content: `Moderator ${info.username} cleared chat history.`,
      timestamp: new Date(),
      isAdmin: true
    };
    pushHistory(clearMsg);
    
    // Broadcast the command to ALL clients to clear their UI
    io.emit('admin:history_cleared', clearMsg);
    
    console.log(`[ADMIN DEBUG] History cleared and 'admin:history_cleared' broadcast sent.`);
  });
  
  // Kick User (admin only)
  socket.on('admin:kick_user', data => {
      const adminName = data.adminName;
      const targetName = data.targetName;
      
      const info = getStaffDisplayInfo(adminName);
      if (!info.isAdmin) {
          socket.emit('system_error', 'Unauthorized: Admin privileges required.');
          return;
      }
      
      const targetLower = targetName.toLowerCase();
      const targetSocketId = usernamesMap.get(targetLower);
      
      if (!targetSocketId) {
          socket.emit('system_error', `Kick failed: User '${targetName}' not found or offline.`);
          return;
      }
      
      io.to(targetSocketId).emit('system_error', `You have been KICKED by Moderator ${info.username}.`);
      
      const kickMsg = {
        username: 'System',
        content: `Moderator ${info.username} has kicked ${targetName} from the chat.`,
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

  // Disconnect 
  socket.on('disconnect', () => {
    const name = socketsMap.get(socket.id);
    if (!name) return;

    const lower = name.toLowerCase();
    
    if (usernamesMap.get(lower) === socket.id) {
        namesInUse.delete(lower);
        usernamesMap.delete(lower);
    }
    socketsMap.delete(socket.id);

    const leaveMsg = {
      username: 'System',
      content: `${name} has left the chat.`,
      timestamp: new Date(),
      isAdmin: false
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
