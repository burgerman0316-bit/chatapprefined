// ===============================================
// server.js (FULL, UNABRIDGED VERSION)
// ===============================================

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

// CRITICAL: Railway uses the PORT environment variable.
const PORT = process.env.PORT || 3000;

// Initialize Socket.IO server
const io = new Server(server);

// --- STATE MANAGEMENT (Your many constants live here) ---
let publicChatHistory = [];
let adminChatHistory = [];
// Key: socket.id, Value: { displayName, isAdmin, fpid, currentContext, ip }
let connectedUsers = {}; 
// Key: fpid, Value: { reason, banExpires }
let bannedFingerprints = {}; 

// =================================================================
// !!! ATTENTION: STAFF KEYS !!!
// THESE ARE PLACEHOLDER KEYS. YOU MUST CHANGE THEM TO YOUR OWN SECRETS.
// =================================================================
const STAFF_KEYS = {
    "YOUR_SECRET_ADMIN_KEY": "ModAdmin", 
    "YOUR_SECRET_MODERATOR_KEY": "SuperModerator" 
};
// =================================================================


// --- HELPER FUNCTIONS ---

// Get a list of all display names for the user list
function getUserList() {
    return Object.values(connectedUsers).map(user => user.displayName);
}

// Get the full user map for the admin panel
function getAdminUserMap() {
    return connectedUsers;
}

// Check if a display name is currently in use
function isNameTaken(displayName) {
    return Object.values(connectedUsers).some(user => user.displayName === displayName);
}

// Get history for the current context
function getHistory(context) {
    return context === 'admin_chat' ? adminChatHistory : publicChatHistory;
}

// Add message to history
function addToHistory(msg, context) {
    const history = getHistory(context);
    // Limit history length 
    if (history.length >= 500) {
        history.shift(); 
    }
    history.push(msg);
}

// Check ban status and clean expired bans
function checkBanStatus(fpid) {
    // Clean expired bans
    for (const id in bannedFingerprints) {
        if (bannedFingerprints[id].banExpires < Date.now()) {
            delete bannedFingerprints[id];
        }
    }
    
    // Check current ban
    const ban = bannedFingerprints[fpid];
    if (ban && ban.banExpires > Date.now()) {
        return ban;
    }
    return null;
}

// --- EXPRESS SETUP ---
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});


// --- SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
    
    // Get client IP address 
    const clientIp = socket.request.headers['x-forwarded-for'] || socket.request.socket.remoteAddress;
    
    // Store user data locally until authenticated
    let user = { 
        displayName: 'Guest', 
        isAdmin: false, 
        fpid: null, 
        currentContext: 'public', 
        ip: clientIp 
    };

    // 1. FINGERPRINT ID CHECK
    socket.on('client:send_fingerprint_id', (fpid) => {
        user.fpid = fpid;
        const banInfo = checkBanStatus(user.fpid);

        if (banInfo) {
            // User is banned, send modal and disconnect
            socket.emit('banned_modal', { reason: banInfo.reason, banDurationMs: banInfo.banExpires - Date.now() });
            socket.disconnect();
            return;
        }

        // Add the unbanned user to the connected list
        connectedUsers[socket.id] = user;
        
        // Initial user list update for side panel
        io.emit('user count', { userList: getUserList(), usersMap: connectedUsers });
        
        // Send public history by default
        socket.emit('chat history', getHistory('public'));
    });
    
    // 2. LOGIN / STAFF CHECK
    socket.on('check_staff_status', (loginAttempt) => {
        if (!user.fpid) {
            socket.emit('system_error', 'Fingerprint ID not received. Please refresh.');
            return;
        }

        const staffName = STAFF_KEYS[loginAttempt];

        if (staffName) {
            // Staff Login
            if (isNameTaken(staffName)) {
                socket.emit('name_rejected', `Staff name '${staffName}' is already logged in.`);
                return;
            }
            
            // Update user object and global list
            user.displayName = staffName;
            user.isAdmin = true;
            user.currentContext = 'admin_chat';
            connectedUsers[socket.id] = user;

            // CRITICAL: Join the admin room
            socket.join('admin_chat');

            socket.emit('staff_status_update', { displayName: staffName, currentContext: 'admin_chat' });
            
            // Send admin history and update everyone's user list/admin panel
            socket.emit('chat history', getHistory('admin_chat'));
            io.emit('user count', { userList: getUserList(), usersMap: connectedUsers });
            io.emit('admin_user_map', getAdminUserMap()); // Update admin panel
            
            // System message to admin room
            const joinMsg = { 
                username: 'System', 
                content: `${staffName} has joined the admin channel.`, 
                type: 'system', 
                timestamp: Date.now() 
            };
            addToHistory(joinMsg, 'admin_chat');
            io.to('admin_chat').emit('chat message', joinMsg);

        } else if (loginAttempt.length > 0) {
            // Regular User Login
            const displayName = loginAttempt;
            if (isNameTaken(displayName)) {
                socket.emit('name_rejected', `Username '${displayName}' is already taken.`);
                return;
            }
            
            user.displayName = displayName;
            connectedUsers[socket.id] = user;
            
            socket.emit('name_accepted', displayName);
            
            // System message to public chat
            const joinMsg = { 
                username: 'System', 
                content: `${displayName} has joined the chat.`, 
                type: 'system', 
                timestamp: Date.now() 
            };
            addToHistory(joinMsg, 'public');
            io.emit('chat message', joinMsg);
            io.emit('user count', { userList: getUserList(), usersMap: connectedUsers });
        }
    });

    // 3. CHAT MESSAGE HANDLING
    socket.on('chat message', (data) => {
        if (user.displayName === 'Guest') return;
        
        const msg = {
            username: user.displayName,
            content: data.content,
            isAdmin: user.isAdmin,
            type: 'public',
            timestamp: Date.now()
        };
        
        addToHistory(msg, data.context);
        
        // Broadcast to the correct room/context
        if (data.context === 'admin_chat' && user.isAdmin) {
            io.to('admin_chat').emit('chat message', msg);
        } else if (data.context === 'public') {
            io.emit('chat message', msg);
        }
    });
    
    // 4. PRIVATE MESSAGE HANDLING
    socket.on('private message', (data) => {
        if (user.displayName === 'Guest') return;
        
        const recipientSocketId = Object.keys(connectedUsers).find(
            id => connectedUsers[id].displayName === data.recipient
        );

        if (!recipientSocketId) {
            socket.emit('system_error', `User '${data.recipient}' not found.`);
            return;
        }

        const msgSent = {
            username: user.displayName,
            content: data.content,
            isSelf: true,
            recipient: data.recipient,
            type: 'private',
            timestamp: Date.now()
        };

        const msgReceived = {
            username: user.displayName,
            content: data.content,
            isSelf: false,
            type: 'private',
            timestamp: Date.now()
        };

        // Send to self and recipient
        socket.emit('chat message', msgSent);
        io.to(recipientSocketId).emit('chat message', msgReceived);
    });

    // 5. NAME CHANGE COMMAND
    socket.on('name_change', (newName) => {
        if (user.isAdmin) {
            socket.emit('system_error', 'Staff names cannot be changed via command.');
            return;
        }
        
        const oldName = user.displayName;

        if (isNameTaken(newName)) {
            socket.emit('system_error', `Name '${newName}' is already taken.`);
            return;
        }

        user.displayName = newName;
        
        // Broadcast name change
        const msg = { 
            username: 'System', 
            content: `${oldName} has changed their name to ${newName}.`, 
            type: 'system', 
            timestamp: Date.now() 
        };
        addToHistory(msg, 'public');
        io.emit('chat message', msg);
        
        // Update user map and send client update
        io.emit('user count', { userList: getUserList(), usersMap: connectedUsers });
        socket.emit('name_updated_ui', newName); 
    });
    
    // 6. TYPING INDICATOR
    socket.on('typing', (isTyping) => {
        if (user.displayName === 'Guest') return;
        if (isTyping) {
            // Only send typing status if user is in public chat
            socket.to('public').emit('typing_status', [user.displayName]);
        } else {
            socket.to('public').emit('typing_status', []);
        }
    });

    // --- ADMIN ACTIONS (requires user.isAdmin to be true) ---

    // 7. Admin Context Switch
    socket.on('admin:set_context', (context) => {
        if (!user.isAdmin) return;
        
        // Handle room joining/leaving
        if (context === 'admin_chat') {
            socket.join('admin_chat');
            socket.leave('public'); // Staff is always in admin_chat but leaving public just in case.
        } else if (context === 'public') {
            socket.leave('admin_chat'); 
            socket.join('public'); // Staff joins the public room
        }

        user.currentContext = context;
        connectedUsers[socket.id] = user;
        
        // Send new history for the requested context
        socket.emit('chat history', getHistory(context));
    });
    
    // 8. Admin Go Anonymous
    socket.on('admin:go_anonymous', () => {
        if (!user.isAdmin) return;
        
        const oldName = user.displayName;
        const newName = 'Guest-' + Math.floor(Math.random() * 10000);
        
        user.displayName = newName;
        user.isAdmin = false;
        user.currentContext = 'public';
        connectedUsers[socket.id] = user;
        socket.leave('admin_chat'); // Leave admin room
        
        // Update client UI
        socket.emit('name_accepted', newName); 
        
        // Broadcast update to all users
        io.emit('user count', { userList: getUserList(), usersMap: connectedUsers });
        io.emit('admin_user_map', getAdminUserMap());
        
        const msg = { 
            username: 'System', 
            content: `${oldName} has logged out of staff mode.`, 
            type: 'system', 
            timestamp: Date.now() 
        };
        addToHistory(msg, 'public');
        io.emit('chat message', msg);
    });

    // 9. Admin Kick User
    socket.on('admin:kick_user', ({ targetName }) => {
        if (!user.isAdmin) return;
        
        const targetSocketId = Object.keys(connectedUsers).find(
            id => connectedUsers[id].displayName === targetName
        );

        if (targetSocketId) {
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.emit('system_alert', `You have been kicked by ${user.displayName}.`);
                targetSocket.disconnect(true);
                
                const msg = { 
                    username: 'System', 
                    content: `${targetName} was kicked by ${user.displayName}.`, 
                    type: 'system', 
                    timestamp: Date.now() 
                };
                addToHistory(msg, 'public');
                io.emit('chat message', msg);
            }
        }
    });
    
    // 10. Admin Ban User (using Fingerprint ID)
    socket.on('admin:ip_ban_user', ({ targetName, days, hours, minutes, reason }) => {
        if (!user.isAdmin) return;
        
        const targetUser = Object.values(connectedUsers).find(u => u.displayName === targetName);

        if (targetUser && targetUser.fpid) {
            const banDurationMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
            
            bannedFingerprints[targetUser.fpid] = {
                reason: reason,
                banExpires: Date.now() + banDurationMs
            };
            
            // Immediately kick the banned user
            const targetSocketId = Object.keys(connectedUsers).find(
                id => connectedUsers[id].displayName === targetName
            );
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.emit('banned_modal', { reason: reason, banDurationMs });
                targetSocket.disconnect(true);
            }

            const msg = { 
                username: 'System', 
                content: `${targetName} was BANNED by ${user.displayName} for: ${reason}.`, 
                type: 'system', 
                timestamp: Date.now() 
            };
            addToHistory(msg, 'public');
            io.emit('chat message', msg);
        }
    });
    
    // 11. Admin Clear History
    socket.on('admin:clear_history', (targetChatId) => {
        if (!user.isAdmin) return;
        
        const clearMsg = {
            username: 'System', 
            content: `${user.displayName} cleared the ${targetChatId} chat history.`, 
            type: 'system', 
            timestamp: Date.now()
        };

        if (targetChatId === 'public') {
            publicChatHistory = [];
            publicChatHistory.push(clearMsg);
            io.emit('admin:history_cleared', { targetChatId, clearMsg });
        } else if (targetChatId === 'admin_chat') {
            adminChatHistory = [];
            adminChatHistory.push(clearMsg);
            io.to('admin_chat').emit('admin:history_cleared', { targetChatId, clearMsg });
        }
    });

    // 12. DISCONNECT
    socket.on('disconnect', () => {
        if (user.displayName === 'Guest' || !connectedUsers[socket.id]) return;
        
        const disconnectedName = user.displayName;
        delete connectedUsers[socket.id];
        
        // System message
        const msg = { 
            username: 'System', 
            content: `${disconnectedName} has left the chat.`, 
            type: 'system', 
            timestamp: Date.now() 
        };
        
        // Send leave message to the context the user was primarily in.
        if (user.isAdmin) {
            addToHistory(msg, 'admin_chat');
            io.to('admin_chat').emit('chat message', msg);
            io.emit('admin_user_map', getAdminUserMap());
        }
        
        addToHistory(msg, 'public');
        io.emit('chat message', msg);
        
        // Update user lists for everyone
        io.emit('user count', { userList: getUserList(), usersMap: connectedUsers });
    });
});


// --- START SERVER ---
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
