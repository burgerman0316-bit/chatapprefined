const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ======================================================
// 1. CONFIGURATION 
// ======================================================
const STAFF_ROOM = 'staff_room'; // Staff chat channel
const STAFF_LIST = [
    {  
        loginName: "STAFF_CONTROLS-LIAM", 
        displayName: "Liam Stern"   
    },
    {  
        loginName: "STAFF_CONTROLS-DIESEL",
        displayName: "Diesel Carter"
    },
    {  
        loginName: "STAFF_CONTROLS-RICKY",
        displayName: "Ricky Martinez"
    },
    {  
        loginName: "STAFF_CONTROLS-AARON",
        displayName: "Aaron Ortega"
    },{  
        loginName: "STAFF_CONTROLS-DONOVAN",
        displayName: "Donovan Powell"
    }
    // ADD ALL YOUR STAFF MEMBERS HERE
];

const chatHistory = [];
const MAX_HISTORY = 100;

// Map to store { display_name.toLowerCase(): socket_id } for DM routing
const usersOnline = new Map(); 
const socketsMap = new Map(); // Map { socket.id: display_name.toLowerCase() } for disconnect

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ======================================================
// 2. HELPER FUNCTIONS
// ======================================================

/**
 * Checks if the entered name matches a secure login name OR a public display name.
 * Used to block regular users from using reserved names.
 */
function isStaffNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim().toLowerCase();
    
    return STAFF_LIST.some(staff => 
        // Block if it matches the secure login name
        staff.loginName.toLowerCase() === checkName || 
        // Block if it matches the public display name
        staff.displayName.toLowerCase() === checkName
    );
}

/**
 * Determines admin status based ONLY on the secure login name.
 */
function getStaffDisplayInfo(enteredUsername) {
    const secureUsername = enteredUsername.trim();
    
    // 1. Check for secure loginName match (GRANTS ADMIN ACCESS)
    const staffMemberByLogin = STAFF_LIST.find(staff => 
        staff.loginName === secureUsername
    );

    if (staffMemberByLogin) {
        return {
            isAdmin: true,
            // Return the case-sensitive display name for the chat UI
            displayName: staffMemberByLogin.displayName 
        };
    }

    // 2. Check for staff display name match (DOES NOT GRANT ADMIN)
    const staffMemberByDisplay = STAFF_LIST.find(staff => 
        staff.displayName.toLowerCase() === secureUsername.toLowerCase()
    );

    if (staffMemberByDisplay) {
         return {
            isAdmin: false, 
            displayName: staffMemberByDisplay.displayName
        };
    }

    // 3. Regular user: return the name as entered
    return {
        isAdmin: false,
        displayName: secureUsername
    };
}

/**
 * Adds a system-generated message to the chat history.
 */
function addSystemMessageToHistory(content, isAdmin = false) {
    const messageData = {
        username: "System",
        content: content,
        timestamp: new Date(),
        isAdmin: isAdmin
    };
    
    chatHistory.push(messageData);
    while (chatHistory.length > MAX_HISTORY) {
        chatHistory.shift();
    }
    return messageData;
}

/**
 * Broadcasts the current list of online users (display names) to all clients.
 */
function emitOnlineUsers() {
    const userDisplayNames = Array.from(usersOnline.keys()).map(nameLower => {
        // Retrieve the case-sensitive display name from the staff list or use the stored name
        const staffMember = STAFF_LIST.find(s => s.displayName.toLowerCase() === nameLower);
        if (staffMember) return staffMember.displayName;
        
        // For regular users, we rely on the name they provided (nameLower) and try to capitalize 
        return nameLower.charAt(0).toUpperCase() + nameLower.slice(1);
    });
    
    // Broadcast the list to ALL connected sockets
    io.emit('online_users', userDisplayNames.sort((a, b) => a.localeCompare(b)));
}


// ======================================================
// 3. SOCKET.IO CONNECTION HANDLING
// ======================================================

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.emit('chat history', chatHistory);
    emitOnlineUsers(); // Send the current list upon connection

    // NAME VALIDATION AND STAFF CHECK
    socket.on('check_staff_status', (enteredName) => {
        const trimmedName = enteredName.trim();
        const lowerName = trimmedName.toLowerCase();

        // 1. Check if name is already in use
        if (usersOnline.has(lowerName)) { 
            socket.emit('name_rejected', 'That name is already in use. Please choose another name.');
            return;
        }

        const staffInfo = getStaffDisplayInfo(trimmedName);
        
        if (staffInfo.isAdmin) {
            // Staff login success (used secure login name)
            const staffDisplayNameLower = staffInfo.displayName.toLowerCase();
            
            usersOnline.set(staffDisplayNameLower, socket.id); 
            socketsMap.set(socket.id, staffDisplayNameLower);
            
            socket.join(STAFF_ROOM); 

            const privateMsg = addSystemMessageToHistory(`Staff member ${staffInfo.displayName} connected.`, true);
            socket.to(STAFF_ROOM).emit('staff message', privateMsg); 
            
            socket.emit('staff_status_update', {
                isAdmin: true,
                displayName: staffInfo.displayName,
                secureName: trimmedName
            });
            
            emitOnlineUsers(); 
            
        } else if (isStaffNameReserved(trimmedName)) {
            // Regular user tried to use a reserved staff name (secure login or public display)
            socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
            return;

        } else {
            // Regular user login success:
            const userDisplayNameLower = trimmedName.toLowerCase();
            
            usersOnline.set(userDisplayNameLower, socket.id); 
            socketsMap.set(socket.id, userDisplayNameLower);
            
            socket.emit('name_accepted', trimmedName);
            
            const msg = addSystemMessageToHistory(`${trimmedName} has joined the chat.`);
            io.emit('chat message', msg); 
            
            emitOnlineUsers(); 
        }
    });

    // PUBLIC MESSAGE HANDLING
    socket.on('chat message', (msg) => {
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // Basic security check to ensure the user is logged in
        if (!usersOnline.has(msg.username.toLowerCase())) {
            console.log(`SECURITY REJECTION: Message from unauthorized user: ${msg.username}`);
            return; 
        }

        const messageData = {
            username: staffInfo.displayName, // Use case-sensitive display name
            content: msg.content,
            timestamp: new Date(),
            isAdmin: staffInfo.isAdmin
        };
        
        chatHistory.push(messageData);
        while (chatHistory.length > MAX_HISTORY) {
            chatHistory.shift();
        }

        io.emit('chat message', messageData);
    });

    // DIRECT MESSAGE HANDLING
    socket.on('direct message', (data) => {
        const fromNameLower = data.from.toLowerCase();
        // CRITICAL FIX: Convert recipient name to lowercase for map lookup
        const toNameLower = data.to.toLowerCase(); 

        // 1. Check if sender is online (security check)
        if (!usersOnline.has(fromNameLower)) {
            console.log(`DM error: Sender ${data.from} not online.`);
            return;
        }
        
        const targetSocketId = usersOnline.get(toNameLower); 
        
        // 2. Check if recipient is online
        if (!targetSocketId) {
            // Emit a failure message back to the sender
            const senderSocketId = usersOnline.get(fromNameLower);
            if (senderSocketId) {
                 io.to(senderSocketId).emit('chat message', addSystemMessageToHistory(`DM failed: User "${data.to}" not found or offline.`, false));
            }
            console.log(`DM error: Target ${data.to} not online or name mismatch in map.`);
            return;
        }
        
        const staffInfo = getStaffDisplayInfo(data.from);

        const messageData = {
            from: data.from,
            to: data.to,
            content: data.content,
            timestamp: new Date(),
            isAdmin: staffInfo.isAdmin 
        };

        // 3. Emit the message ONLY to the target socket ID
        io.to(targetSocketId).emit('direct message', messageData);
        
        console.log(`DM sent from ${data.from} to ${data.to}`);
    });

    // STAFF MESSAGE HANDLING (Private Chat)
    socket.on('staff message', (msg) => { 
        const staffInfo = getStaffDisplayInfo(msg.username);
        
        // Security Check: Must be a staff member and in the staff room
        if (!staffInfo.isAdmin || !socket.rooms.has(STAFF_ROOM)) {
            console.log(`SECURITY REJECTION: Non-staff user tried to send staff message: ${msg.username}`);
            return;
        }

        const messageData = {
            username: staffInfo.displayName, // Use case-sensitive display name
            content: msg.content,
            timestamp: new Date(),
            isAdmin: true 
        };

        // Send the message only to the staff room
        io.to(STAFF_ROOM).emit('staff message', messageData);
    });

    // ADMIN CONTROL HANDLING
    socket.on('admin:clear_history', (data) => {
        const staffInfo = getStaffDisplayInfo(data.username);
        
        if (staffInfo.isAdmin) {
            chatHistory.length = 0;
            
            const msg = addSystemMessageToHistory(`Chat history cleared by ${staffInfo.displayName}.`, true);
            
            io.emit('history_cleared', {
                username: staffInfo.displayName,
                timestamp: msg.timestamp
            });
        }
    });

    // USER DISCONNECTION
    socket.on('disconnect', () => {
        const nameLower = socketsMap.get(socket.id);
        
        if (nameLower) {
            
            // Determine the case-sensitive display name for system messages
            const isStaff = STAFF_LIST.some(s => s.displayName.toLowerCase() === nameLower);
            const staffMember = STAFF_LIST.find(s => s.displayName.toLowerCase() === nameLower);
            
            const displayName = isStaff 
                ? staffMember.displayName
                : nameLower.charAt(0).toUpperCase() + nameLower.slice(1); // Basic capitalization for regular users
            
            // Remove from the tracking map
            usersOnline.delete(nameLower); 
            socketsMap.delete(socket.id); 

            // Handle staff disconnect message
            if (socket.rooms.has(STAFF_ROOM) && isStaff) {
                const privateMsg = addSystemMessageToHistory(`Staff member ${displayName} disconnected.`, true);
                io.to(STAFF_ROOM).emit('staff message', privateMsg); 
            }
            
            // Regular user disconnect message
            if (!isStaff) {
                 const msg = addSystemMessageToHistory(`${displayName} has left the chat.`);
                 io.emit('chat message', msg); 
            }
            
            console.log(`User disconnected. Name ${displayName} released.`);
            emitOnlineUsers(); 
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
