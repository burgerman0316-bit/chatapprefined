const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// CRITICAL FIX FOR DEPLOYMENT: Use the environment port provided by Railway, or default to 3000
const PORT = process.env.PORT || 3000;
const MAX_USERNAME_LENGTH = 16;

// =================================================================
// !!! ATTENTION !!!
// THESE ARE PLACEHOLDER KEYS. YOU MUST CHANGE THEM TO YOUR OWN SECRETS.
// =================================================================
const STAFF_KEYS = {
    "hfdskLshkdgdibIdsjfkbdAshfjhsfdshfjMdjsbfhd": "Liam Stern", // Change "YOUR_SECRET_ADMIN_KEY" to a long, complex secret phrase
    "hfsdjDfhukdshjfkdIsjfhdsjEkfhdjSjkshjEdkfLh": "Diesel Carter", // Change "YOUR_SECRET_MODERATOR_KEY" to a long, complex secret phrase
    "hdufAhudsAifhudiRsfOuidsuNfdsmklfdskfdndsjk": "Aaron Ortega",
    "hbjrhfjRnjkfdvjkIfhdCnjfkdnjKjndksdjkfjdkdy": "Ricky Martinez",
    "dnjsDkfjdsOfjdNsfjdOksfjVkdAsnfNjdsnfjkdkfd": "Donovan Powell"
};
// =================================================================

// --- STATE MANAGEMENT ---
let publicHistory = [];
let adminHistory = [];
let userMap = {}; // Key: socket.id, Value: { displayName, isAdmin, fpid, currentContext, nameHistory }
let bannedFingerprints = {}; // Key: fpid, Value: { reason, until: timestamp }
let typingUsers = {}; // Key: socket.id, Value: displayName

// --- SERVER SETUP ---
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// --- HELPER FUNCTIONS ---

/**
 * Gets the current chat history for a given context.
 */
function getHistory(context) {
    return context === 'public' ? publicHistory : adminHistory;
}

/**
 * Adds a message to the history and returns the full message object.
 */
function addMessageToHistory(msg, context) {
    const message = {
        username: msg.username,
        content: msg.content,
        type: msg.type || 'user',
        isAdmin: msg.isAdmin || false,
        recipient: msg.recipient || null,
        timestamp: new Date().toISOString()
    };

    if (context === 'public') {
        publicHistory.push(message);
    } else if (context === 'admin_chat') {
        adminHistory.push(message);
    }
    
    // Cap history length (e.g., last 100 messages)
    const MAX_HISTORY = 100;
    if (publicHistory.length > MAX_HISTORY) {
        publicHistory.shift();
    }
    if (adminHistory.length > MAX_HISTORY) {
        adminHistory.shift();
    }

    return message;
}

/**
 * Broadcasts a system message to a specific chat context.
 */
function broadcastSystemMessage(content, context, skipUser = null) {
    const msg = { username: 'System', content, type: 'system' };
    addMessageToHistory(msg, context);
    io.to(context).except(skipUser).emit('chat message', msg);
}

/**
 * Gets a list of all current usernames.
 */
function getUserList() {
    return Object.values(userMap).map(u => u.displayName);
}

/**
 * Gets a map of users for the admin panel.
 */
function getAdminUserMap() {
    const adminMap = {};
    for (const [id, user] of Object.entries(userMap)) {
        adminMap[id] = {
            displayName: user.displayName,
            isAdmin: user.isAdmin,
            fpid: user.fpid
        };
    }
    return adminMap;
}

/**
 * Sends updated user list and admin map to all clients.
 */
function updateClientUsers() {
    const userList = getUserList();
    const usersMap = Object.values(userMap).reduce((acc, user) => {
        acc[user.displayName] = { isAdmin: user.isAdmin };
        return acc;
    }, {});
    io.emit('user count', { userList, usersMap });
    io.emit('admin_user_map', getAdminUserMap());
}

/**
 * Checks if a fingerprint is currently banned.
 */
function isFingerprintBanned(fpid) {
    if (!bannedFingerprints[fpid]) return false;
    
    const ban = bannedFingerprints[fpid];
    if (Date.now() < ban.until) {
        return {
            reason: ban.reason,
            until: ban.until
        };
    }
    // Ban has expired
    delete bannedFingerprints[fpid];
    return false;
}

// --- CORE SOCKET.IO LOGIC ---

io.on('connection', (socket) => {
    let currentUser = {
        displayName: null,
        isAdmin: false,
        fpid: null,
        currentContext: 'public',
        nameHistory: [] // To prevent rapid name change abuse
    };
    userMap[socket.id] = currentUser;

    console.log(`User connected: ${socket.id}`);

    // Initial check for fingerprint ID and ban status
    socket.on('client:send_fingerprint_id', (fpid) => {
        currentUser.fpid = fpid;
        const banStatus = isFingerprintBanned(fpid);

        if (banStatus) {
            const durationMs = banStatus.until - Date.now();
            socket.emit('banned_modal', { 
                reason: banStatus.reason, 
                banDurationMs: durationMs 
            });
            socket.disconnect(true);
            return;
        }

        // If not banned, load public chat history
        socket.emit('chat history', getHistory(currentUser.currentContext));
        updateClientUsers();
    });

    // --- LOGIN AND STATUS CHECK ---
    socket.on('check_staff_status', (loginAttempt) => {
        const isStaff = STAFF_KEYS.hasOwnProperty(loginAttempt);
        const newName = isStaff ? STAFF_KEYS[loginAttempt] : loginAttempt;
        
        // Validation for regular username
        if (!isStaff && newName.length > MAX_USERNAME_LENGTH) {
            return socket.emit('name_rejected', `Name must be ${MAX_USERNAME_LENGTH} characters or less.`);
        }
        if (!/^[a-zA-Z0-9_\s]+$/.test(newName) && !isStaff) {
             return socket.emit('name_rejected', 'Names can only contain letters, numbers, spaces, and underscores.');
        }

        // Check for duplicate name
        const nameTaken = Object.values(userMap).some(user => user.displayName === newName);
        if (nameTaken) {
            return socket.emit('name_rejected', `The name "${newName}" is already taken.`);
        }

        // Finalize login
        currentUser.displayName = newName;
        currentUser.isAdmin = isStaff;
        currentUser.nameHistory.push(newName);
        
        // Join rooms
        socket.join('public');
        if (isStaff) {
            socket.leave('public'); // Staff join admin chat by default
            socket.join('admin_chat');
            currentUser.currentContext = 'admin_chat';
            socket.emit('staff_status_update', { 
                displayName: newName, 
                isAdmin: true,
                currentContext: currentUser.currentContext
            });
             // Send admin history on successful staff login
            socket.emit('chat history', getHistory(currentUser.currentContext)); 
        } else {
            currentUser.currentContext = 'public';
            socket.emit('name_accepted', newName);
        }

        // Send confirmation message to all
        broadcastSystemMessage(`${newName} has joined the chat.`, 'public');
        if (isStaff) {
             broadcastSystemMessage(`${newName} has logged into staff mode.`, 'admin_chat');
        }
        
        updateClientUsers();
    });


    // --- CHAT MESSAGING ---
    socket.on('chat message', (msg) => {
        if (!currentUser.displayName) return socket.emit('system_error', 'Please log in first.');
        if (!msg.content.trim()) return;

        // Use the context provided by the client, or fall back to the user's current context
        const context = msg.context || currentUser.currentContext;

        // Security check: regular users can only send to public
        if (!currentUser.isAdmin && context === 'admin_chat') {
            return socket.emit('system_error', 'Permission denied to send to admin chat.');
        }

        const message = {
            username: currentUser.displayName,
            content: msg.content,
            isAdmin: currentUser.isAdmin,
            type: 'user'
        };

        const addedMsg = addMessageToHistory(message, context);
        io.to(context).emit('chat message', addedMsg);
    });

    socket.on('private message', (data) => {
        if (!currentUser.displayName) return socket.emit('system_error', 'Please log in first.');

        const recipientSocket = Object.entries(userMap).find(([id, user]) => user.displayName === data.recipient);

        if (!recipientSocket) {
            return socket.emit('system_alert', `User "${data.recipient}" not found or offline.`);
        }

        const [recipientId, recipientUser] = recipientSocket;

        // Message for the sender
        const senderMsg = {
            username: currentUser.displayName,
            content: data.content,
            type: 'private',
            isSelf: true,
            recipient: recipientUser.displayName
        };
        socket.emit('chat message', senderMsg);

        // Message for the recipient
        const recipientMsg = {
            username: currentUser.displayName,
            content: data.content,
            type: 'private',
            isSelf: false
        };
        io.to(recipientId).emit('chat message', recipientMsg);
        
        socket.emit('system_alert', `PM sent to ${recipientUser.displayName}`);
    });


    // --- ADMIN MODERATION ---
    
    // Admin: Kick User
    socket.on('admin:kick_user', (data) => {
        if (!currentUser.isAdmin) return socket.emit('system_error', 'Permission denied.');

        const targetSocket = Object.entries(userMap).find(([id, user]) => user.displayName === data.targetName);

        if (!targetSocket) {
            return socket.emit('system_error', `User "${data.targetName}" not found.`);
        }

        const [targetId, targetUser] = targetSocket;

        broadcastSystemMessage(`${targetUser.displayName} was kicked by ${currentUser.displayName}.`, 'public');
        broadcastSystemMessage(`${targetUser.displayName} was kicked by ${currentUser.displayName}.`, 'admin_chat', targetId);

        io.to(targetId).emit('system_alert', `You have been kicked by ${currentUser.displayName}.`);
        io.to(targetId).disconnect(true);
    });

    // Admin: IP Ban User (using FPID)
    socket.on('admin:ip_ban_user', (data) => {
        if (!currentUser.isAdmin) return socket.emit('system_error', 'Permission denied.');

        const targetSocket = Object.entries(userMap).find(([id, user]) => user.displayName === data.targetName);

        if (!targetSocket) {
            return socket.emit('system_error', `User "${data.targetName}" not found.`);
        }

        const [targetId, targetUser] = targetSocket;
        const { days, hours, minutes, reason } = data;
        
        // Calculate ban end time
        const durationMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
        const banEnd = Date.now() + durationMs;
        
        // Apply ban to FPID
        bannedFingerprints[targetUser.fpid] = {
            reason: reason,
            until: banEnd
        };
        
        const banLengthText = (days > 0 ? `${days} day(s), ` : '') + (hours > 0 ? `${hours} hour(s), ` : '') + `${minutes} minute(s)`;

        broadcastSystemMessage(`${targetUser.displayName} was banned by ${currentUser.displayName} for ${banLengthText}. Reason: ${reason}`, 'public');
        broadcastSystemMessage(`${targetUser.displayName} was banned by ${currentUser.displayName} for ${banLengthText}. Reason: ${reason} (FPID: ${targetUser.fpid.substring(0, 8)}...)`, 'admin_chat', targetId);

        io.to(targetId).emit('system_alert', `You have been banned by ${currentUser.displayName}. Reason: ${reason}`);
        
        // Disconnect the user
        io.to(targetId).emit('banned_modal', { 
            reason: reason, 
            banDurationMs: durationMs 
        });
        io.to(targetId).disconnect(true);
    });

    // Admin: Clear History
    socket.on('admin:clear_history', (targetChatId) => {
        if (!currentUser.isAdmin) return socket.emit('system_error', 'Permission denied.');

        if (targetChatId === 'public') {
            publicHistory = [];
        } else if (targetChatId === 'admin_chat') {
            adminHistory = [];
        } else {
            return socket.emit('system_error', 'Invalid chat ID for clearing history.');
        }

        const chatName = targetChatId === 'public' ? 'Public' : 'Admin';
        const clearMsg = { username: 'System', content: `${chatName} chat history cleared by ${currentUser.displayName}.`, type: 'system' };
        
        io.to(targetChatId).emit('admin:history_cleared', { targetChatId, clearMsg });
        // Add the clear message back to the history
        addMessageToHistory(clearMsg, targetChatId);
    });

    // Admin: Switch Chat Context (for fetching history)
    socket.on('admin:set_context', (context) => {
        if (!currentUser.isAdmin) return;
        currentUser.currentContext = context;
        socket.emit('chat history', getHistory(context));
    });
    
    // Admin: Go Anonymous
    socket.on('admin:go_anonymous', () => {
        if (!currentUser.isAdmin) return;
        
        const oldName = currentUser.displayName;
        
        // Check if the current display name is a staff key value
        const isDefaultStaffName = Object.values(STAFF_KEYS).includes(oldName);
        
        currentUser.isAdmin = false;
        currentUser.displayName = isDefaultStaffName ? `Guest_${Math.floor(Math.random() * 1000)}` : oldName; 
        currentUser.currentContext = 'public';
        
        socket.leave('admin_chat');
        socket.emit('name_accepted', currentUser.displayName); // Re-initializes client as a guest
        
        broadcastSystemMessage(`${oldName} has logged out of staff mode.`, 'admin_chat');
        broadcastSystemMessage(`${oldName} has left the chat.`, 'public'); // Treat as leaving/rejoining
        
        // Re-join as guest
        socket.join('public');
        broadcastSystemMessage(`${currentUser.displayName} has joined the chat.`, 'public');
        
        // Update history and user list
        socket.emit('chat history', getHistory('public')); 
        updateClientUsers();
    });


    // --- OTHER ACTIONS ---
    
    // Name Change
    socket.on('name_change', (newName) => {
        if (!currentUser.displayName) return socket.emit('system_error', 'Please log in first.');
        
        const trimmedName = newName.trim();

        if (trimmedName.length > MAX_USERNAME_LENGTH) {
            return socket.emit('system_error', `Name must be ${MAX_USERNAME_LENGTH} characters or less.`);
        }
        if (currentUser.nameHistory.includes(trimmedName)) {
            return socket.emit('system_error', 'You have recently used that name.');
        }
        if (!/^[a-zA-Z0-9_\s]+$/.test(trimmedName)) {
             return socket.emit('system_error', 'Names can only contain letters, numbers, spaces, and underscores.');
        }
        const nameTaken = Object.values(userMap).some(user => user.displayName === trimmedName);
        if (nameTaken) {
            return socket.emit('system_error', `The name "${trimmedName}" is already taken.`);
        }

        const oldName = currentUser.displayName;
        currentUser.displayName = trimmedName;
        currentUser.nameHistory.push(trimmedName);
        
        // Simple name change history limit (e.g., last 5 names)
        if (currentUser.nameHistory.length > 5) {
            currentUser.nameHistory.shift();
        }

        socket.emit('name_updated_ui', trimmedName);
        
        broadcastSystemMessage(`${oldName} is now known as ${trimmedName}.`, 'public');
        if (currentUser.isAdmin) {
            broadcastSystemMessage(`${oldName} is now known as ${trimmedName}.`, 'admin_chat');
        }
        
        updateClientUsers();
        
        // Update typing list immediately
        if (typingUsers[socket.id]) {
            typingUsers[socket.id] = trimmedName;
            io.emit('typing_status', Object.values(typingUsers));
        }
    });

    // Typing Indicator
    socket.on('typing', (isTyping) => {
        if (!currentUser.displayName) return;

        if (isTyping) {
            if (!typingUsers[socket.id]) {
                typingUsers[socket.id] = currentUser.displayName;
            }
        } else {
            delete typingUsers[socket.id];
        }
        
        // Only send names currently typing
        io.emit('typing_status', Object.values(typingUsers));
    });


    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const disconnectedUser = userMap[socket.id];
        
        if (disconnectedUser && disconnectedUser.displayName) {
            const name = disconnectedUser.displayName;
            // Only send leaving message if they were in the public room or admin room
            if (disconnectedUser.currentContext === 'public' || !disconnectedUser.isAdmin) {
                 broadcastSystemMessage(`${name} has left the chat.`, 'public');
            }
            if (disconnectedUser.isAdmin) {
                 broadcastSystemMessage(`${name} has disconnected from admin mode.`, 'admin_chat');
            }
        }

        delete userMap[socket.id];
        delete typingUsers[socket.id];
        
        updateClientUsers();
        io.emit('typing_status', Object.values(typingUsers));
        
        console.log(`User disconnected: ${socket.id}`);
    });
});


// --- START SERVER ---
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
