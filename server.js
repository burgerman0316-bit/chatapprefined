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
const ADMIN_CHAT_ID = 'admin_chat'; 
const MAX_HISTORY = 100;
const CONTENT_MAX_CHARS = 500; 
const BANNED_WORDS = ['hitler', 'swear', 'badword', 'bannedword', 'spam', 'adminchat']; // Simple filter

// Staff accounts - NOTE: LoginName is the SECURE password/key
const STAFF_LIST = [
  { loginName: 'hfdskLshkdgdibIdsjfkbdAshfjhsfdshfjMdjsbfhd', displayName: 'Liam Stern' },
  { loginName: 'hfsdjDfhukdshjfkdIsjfhdsjEkfhdjSjkshjEdkfLh', displayName: 'Diesel Carter' },
  { loginName: 'hbjrhfjRnjkfdvjkIfhdCnjfkdnjKjndksdjkfjdkdy', displayName: 'Ricky Martinez' },
  { loginName: 'hdufAhudsAifhudiRsfOuidsuNfdsmklfdskfdndsjk', displayName: 'Aaron Ortega' },
  { loginName: 'dnjsbdjsgDfhjfhdsTsfdfhdslfsdjkfhfjhdsRfs', displayName: 'Staff-Test' }
];

// Main data structures
const users = new Map(); // socket.id -> { displayName, isAdmin, fpid, ip, chatContext, socket }
const publicHistory = [];
const adminHistory = [];
const fpBanList = new Map(); // fpid -> { banUntil: Date, reason: string }

// --- HELPER FUNCTIONS ---

function pushHistory(msg, context = 'public') {
    const history = context === 'admin' ? adminHistory : publicHistory;
    history.push(msg);
    if (history.length > MAX_HISTORY) {
        history.shift();
    }
}

function broadcastUserCount() {
    // List for public display
    const publicUserList = Array.from(users.values())
        .filter(u => u.chatContext === 'public')
        .map(u => u.displayName)
        .sort((a, b) => a.localeCompare(b));

    const publicUsersMap = Array.from(users.values())
        .filter(u => u.chatContext === 'public')
        .reduce((acc, u) => {
             acc[u.displayName] = { isAdmin: u.isAdmin };
             return acc;
        }, {});
        
    // Full user map for Admin Panel
    const adminUsersMap = Array.from(users.values()).reduce((acc, u) => {
        acc[u.socket.id] = { 
            displayName: u.displayName, 
            isAdmin: u.isAdmin, 
            ip: u.ip, 
            chatContext: u.chatContext 
        };
        return acc;
    }, {});


    io.emit('user count', { userList: publicUserList, usersMap: publicUsersMap });
    io.to(STAFF_ROOM).emit('admin_user_map', adminUsersMap);
}

function sanitiseContent(content) {
    if (!content || typeof content !== 'string') return '';
    content = content.substring(0, CONTENT_MAX_CHARS);
    
    const regex = new RegExp(BANNED_WORDS.join('|'), 'gi');
    return content.replace(regex, (match) => '*'.repeat(match.length));
}

function cleanUpUser(socketId) {
    const user = users.get(socketId);
    if (!user) return;
    
    if (user.isAdmin) {
        io.sockets.sockets.get(socketId)?.leave(STAFF_ROOM);
    }
    if (user.chatContext === ADMIN_CHAT_ID) {
        io.sockets.sockets.get(socketId)?.leave(ADMIN_CHAT_ID);
    }
    
    users.delete(socketId);
}

// --- EXPRESS SETUP ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- SOCKET.IO CONNECTION ---
io.on('connection', (socket) => {
    const userIp = socket.handshake.address; 
    let fpid = 'unknown'; 

    // 1. Initial user setup (temporary)
    users.set(socket.id, { 
        displayName: `Guest-${socket.id.substring(0, 4)}`, 
        isAdmin: false, 
        fpid: fpid,
        ip: userIp,
        chatContext: 'public', 
        socket: socket 
    });
    
    // 2. Client sends Fingerprint ID (CRITICAL FOR BAN PERSISTENCE)
    socket.on('client:send_fingerprint_id', (clientFpid) => {
        if (!clientFpid || clientFpid === 'no_fingerprint_id') return;
        fpid = clientFpid;
        const user = users.get(socket.id);
        if (user) {
            user.fpid = fpid;
            users.set(socket.id, user); 
        }

        // Check ban list
        const banEntry = fpBanList.get(fpid);
        if (banEntry) {
            if (banEntry.banUntil > new Date()) {
                // User is banned
                const banDurationMs = banEntry.banUntil.getTime() - new Date().getTime();
                const banData = {
                    reason: banEntry.reason || 'Banned by Moderator.',
                    banDurationMs: banDurationMs
                };
                // Send the ban modal event and immediately disconnect
                socket.emit('banned_modal', banData); 
                socket.disconnect(true);
                return;
            } else {
                // Ban expired
                fpBanList.delete(fpid);
                socket.emit('system_alert', 'Your previous ban has expired. Welcome back.');
            }
        }
    });

    // 3. User attempts to join/check staff status
    socket.on('check_staff_status', (loginAttempt) => {
        let user = users.get(socket.id);
        if (!user) return; 

        const staffEntry = STAFF_LIST.find(s => s.loginName === loginAttempt);
        const isAdminLogin = !!staffEntry;

        if (isAdminLogin) {
            // Staff Login Success
            user.displayName = staffEntry.displayName;
            user.isAdmin = true;
            user.staffKey = staffEntry.loginName; 
            users.set(socket.id, user); 

            socket.join(STAFF_ROOM);
            socket.emit('staff_status_update', { 
                displayName: user.displayName, 
                isAdmin: true,
                currentContext: user.chatContext 
            });

            const joinMsg = {
                username: 'System',
                content: `${user.displayName} (MOD) has connected.`,
                timestamp: new Date(),
                isAdmin: true,
                type: 'system'
            };
            pushHistory(joinMsg, 'public');
            io.emit('chat message', joinMsg);
            
            socket.emit('admin chat message', { username: 'System', content: 'You are now in Admin Mode. The admin chat is private.', timestamp: new Date(), type: 'system' });
            socket.emit('chat history', publicHistory);
        } else {
            // Regular User Login
            const name = loginAttempt.substring(0, 16);
            
            const nameTaken = Array.from(users.values()).some(u => u.displayName === name);
            if (nameTaken) {
                 socket.emit('name_rejected', `The name "${name}" is already in use.`);
                 return;
            }

            user.displayName = name;
            users.set(socket.id, user); 
            
            socket.emit('name_accepted', name);
            
            const joinMsg = {
                username: 'System',
                content: `${name} has joined the chat.`,
                timestamp: new Date(),
                isAdmin: false,
                type: 'system'
            };
            pushHistory(joinMsg, 'public');
            io.emit('chat message', joinMsg);
            
            socket.emit('chat history', publicHistory);
        }
        
        broadcastUserCount();
    });

    // 4. Name Change
    socket.on('name_change', (newName) => {
        let user = users.get(socket.id);
        if (!user || user.isAdmin) return; 
        
        const oldName = user.displayName;
        const finalNewName = newName.substring(0, 16); 
        
        const nameTaken = Array.from(users.values()).some(u => u.displayName === finalNewName && u.displayName !== oldName);
        if (nameTaken) {
             socket.emit('system_error', `The name "${finalNewName}" is already in use.`);
             return;
        }

        user.displayName = finalNewName;
        users.set(socket.id, user);

        socket.emit('name_updated_ui', finalNewName);
        
        const changeMsg = {
            username: 'System',
            content: `${oldName} changed their name to ${finalNewName}.`,
            timestamp: new Date(),
            isAdmin: user.isAdmin,
            type: 'system'
        };
        pushHistory(changeMsg, 'public');
        io.emit('chat message', changeMsg);
        
        broadcastUserCount();
    });

    // 5. Chat Messages (Public or Admin)
    socket.on('chat message', (data) => {
        const user = users.get(socket.id);
        if (!user) return; 

        const safeContent = sanitiseContent(data.content);
        if (!safeContent) return; 

        const msg = {
            username: user.displayName,
            content: safeContent,
            timestamp: new Date(),
            isAdmin: user.isAdmin,
            type: 'user'
        };
        
        if (user.chatContext === ADMIN_CHAT_ID) {
            pushHistory(msg, 'admin');
            io.to(ADMIN_CHAT_ID).emit('admin chat message', msg);
        } else {
            pushHistory(msg, 'public');
            io.emit('chat message', msg);
        }
    });
    
    // 6. Private Messages
    socket.on('private message', (data) => {
        const sender = users.get(socket.id);
        if (!sender) return; 

        const recipientUser = Array.from(users.values()).find(u => u.displayName === data.recipient);
        
        if (!recipientUser || recipientUser.displayName === sender.displayName) {
            socket.emit('system_error', `User '${data.recipient}' not found or cannot message self.`);
            return;
        }
        
        const safeContent = sanitiseContent(data.content);
        if (!safeContent) return; 

        const msg = {
            username: sender.displayName,
            content: safeContent,
            timestamp: new Date(),
            isAdmin: sender.isAdmin,
            type: 'private',
            isPrivate: true
        };
        
        io.to(recipientUser.socket.id).emit('chat message', msg);
        
        const confirmationMsg = {
             username: 'You',
             content: safeContent,
             timestamp: new Date(),
             isAdmin: false,
             type: 'private',
             isPrivate: true,
             recipient: recipientUser.displayName
        };
        socket.emit('chat message', confirmationMsg);
    });

    // 7. Admin: Set Chat Context (Public/Admin)
    socket.on('admin:set_context', (contextId) => {
        const user = users.get(socket.id);
        if (!user) return;

        if (user.chatContext === ADMIN_CHAT_ID) {
            socket.leave(ADMIN_CHAT_ID);
        }
        
        user.chatContext = contextId;
        users.set(socket.id, user);

        if (contextId === ADMIN_CHAT_ID && user.isAdmin) {
            socket.join(ADMIN_CHAT_ID);
            socket.emit('chat history', adminHistory);
        } else {
            socket.emit('chat history', publicHistory);
        }
        
        socket.emit('admin_context_switched', contextId);
        broadcastUserCount();
    });
    
    // 8. Admin: Clear History
    socket.on('admin:clear_history', (contextId) => {
        const admin = users.get(socket.id);
        if (!admin || !admin.isAdmin) return;

        const targetHistory = contextId === 'admin_chat' ? adminHistory : publicHistory;
        targetHistory.length = 0; 

        const clearMsg = {
            username: 'System',
            content: `Chat history cleared by Moderator ${admin.displayName}.`,
            timestamp: new Date(),
            isAdmin: true,
            type: 'system'
        };

        targetHistory.push(clearMsg);
        
        io.emit('admin:history_cleared', { targetChatId: contextId, clearMsg: clearMsg });
    });

    // 9. Admin: Go Anonymous
    socket.on('admin:go_anonymous', () => {
        let user = users.get(socket.id);
        if (!user || !user.isAdmin) return;

        const oldName = user.displayName;
        
        user.displayName = `Guest-${socket.id.substring(0, 4)}`;
        user.isAdmin = false;
        user.staffKey = null; 
        users.set(socket.id, user); 
        
        socket.leave(STAFF_ROOM);
        
        socket.emit('name_updated_ui', user.displayName);
        
        const anonMsg = {
            username: 'System',
            content: `${oldName} has logged out of Admin Mode.`,
            timestamp: new Date(),
            isAdmin: true, 
            type: 'system'
        };
        
        pushHistory(anonMsg, 'public');
        io.emit('chat message', anonMsg);
        broadcastUserCount();
    });
    
    // 10. Admin: Kick User
    socket.on('admin:kick_user', ({ targetName }) => {
        const admin = users.get(socket.id);
        if (!admin || !admin.isAdmin) return;

        let targetSocketId = null;

        for (const [id, user] of users) {
            if (user.displayName === targetName) {
                targetSocketId = id;
                break;
            }
        }

        if (!targetSocketId) {
            socket.emit('system_error', `User '${targetName}' not found.`);
            return;
        }
        
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
             io.to(targetSocketId).emit('system_error', `You have been KICKED by Moderator ${admin.displayName}.`);
             targetSocket.disconnect(true);
        }

        const kickMsg = {
          username: 'System',
          content: `Moderator ${admin.displayName} has KICKED ${targetName}.`,
          timestamp: new Date(),
          isAdmin: true,
          type: 'system'
        };
        
        pushHistory(kickMsg, 'public');
        io.emit('chat message', kickMsg);
        
        broadcastUserCount();
    });

    // 11. Admin: Ban User by FPID (HANDLES /BAN COMMAND AND MODAL BAN)
    socket.on('admin:ip_ban_user', ({ targetName, days, hours, minutes, reason }) => {
        const admin = users.get(socket.id);
        if (!admin || !admin.isAdmin) return;
        
        // 1. Find the target user's FPID using their display name
        let targetSocketId = null;
        let targetFpid = null;

        for (const [id, user] of users) {
            if (user.displayName === targetName) {
                targetSocketId = id;
                targetFpid = user.fpid;
                break;
            }
        }

        if (!targetFpid) {
            socket.emit('system_error', `User '${targetName}' not found or FPID unavailable.`);
            return;
        }

        // 2. Calculate ban duration
        const banDurationMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
        const banUntil = new Date(Date.now() + banDurationMs);

        // 3. Add ban to the persistent list
        fpBanList.set(targetFpid, { banUntil, reason });

        // 4. If user is currently connected, send ban modal and disconnect
        if (targetSocketId) {
            const banData = {
                reason: reason,
                banDurationMs: banDurationMs
            };
            io.to(targetSocketId).emit('banned_modal', banData);
            
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) targetSocket.disconnect(true);
        }
        
        // 5. Broadcast system message
        const banMsg = {
            username: 'System',
            content: `Moderator ${admin.displayName} has FPID BANNED ${targetName} for ${days}d ${hours}h ${minutes}m. Reason: ${reason}.`,
            timestamp: new Date(),
            isAdmin: true,
            type: 'system'
        };
        
        const targetChat = admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public';
        pushHistory(banMsg, targetChat);

        if (targetChat === 'admin') {
            io.to(ADMIN_CHAT_ID).emit('admin chat message', banMsg);
        } else {
            io.emit('chat message', banMsg);
        }

        broadcastUserCount();
    });

    // 12. Disconnect 
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (!user || user.displayName.startsWith('Guest-')) return;

        const leaveMsg = {
            username: 'System',
            content: `${user.displayName} has left the chat.`,
            timestamp: new Date(),
            isAdmin: user.isAdmin,
            type: 'system'
        };
        
        pushHistory(leaveMsg, 'public');
        io.emit('chat message', leaveMsg);
        
        cleanUpUser(socket.id);
        broadcastUserCount();
    });

    broadcastUserCount();
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
