// File: server.js

// ... (inside io.on('connection', (socket) => { ... }) )

    // NAME VALIDATION AND STAFF CHECK (INITIAL LOGIN)
    socket.on('check_staff_status', (enteredName) => {
        // ... (Existing validation logic) ...
        
        // Check for banned words or reserved staff names
        if (isNameReserved(trimmedName)) {
            
            // Staff login attempt (requires correct loginName for success)
            if (STAFF_LIST.some(staff => staff.loginName.toLowerCase() === lowerName || staff.displayName.toLowerCase() === lowerName)) {
                const staffInfo = getStaffDisplayInfo(trimmedName);
                if (!staffInfo.isAdmin) {
                    socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.');
                    return;
                }
                
                // === START UPDATED STAFF LOGIN SUCCESS LOGIC ===
                const staffDisplayNameLower = staffInfo.username.toLowerCase();
                namesInUse.add(staffDisplayNameLower);
                socketsMap.set(socket.id, staffDisplayNameLower);
                socket.join(STAFF_ROOM);
                
                // 1. Private Announcement to Staff
                const privateMsg = addSystemMessageToHistory(`Staff member ${staffInfo.username} connected.`, true);
                socket.to(STAFF_ROOM).emit('staff message', privateMsg); 
                
                // 2. Public Announcement to Everyone (Generic Message)
                const publicMsg = addSystemMessageToHistory(`A moderator has entered the chat.`, true); // true for alert styling
                io.emit('chat message', publicMsg);
                
                socket.emit('staff_status_update', {
                    isAdmin: true,
                    displayName: staffInfo.username,
                    secureName: trimmedName
                });
                // === END UPDATED STAFF LOGIN SUCCESS LOGIC ===
                
            } else {
                // Name is rejected because it contains a banned word
                 socket.emit('name_rejected', 'That name contains forbidden words. Please choose another name.');
                return;
            }
        } else {
            // Regular user login success:
            namesInUse.add(lowerName);
            socketsMap.set(socket.id, lowerName);
            socket.emit('name_accepted', trimmedName);
            
            const msg = addSystemMessageToHistory(`${trimmedName} has joined the chat.`);
            io.emit('chat message', msg); 
        }
        
        // Broadcast the updated count AFTER successful login
        broadcastUserCount();
    });
