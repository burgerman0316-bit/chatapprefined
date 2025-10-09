// 2. Handle Message Form Submission 
messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const content = messageInput.value.trim();
    
    messageInput.value = ''; 
    charCountSpan.textContent = `0/${MAX_CHARS}`; 
    charCountContainer.style.color = '#ccc'; // Reset color

    if (!content || content.length > MAX_CHARS) return;

    // Command Check
    if (content.startsWith('/')) {
        const parts = content.split(' ');
        const command = parts[0].toLowerCase();
        const args = content.substring(command.length).trim();

        if (command === '/msg') {
            const match = args.match(/^(\S+)\s+(.*)/s); 
            if (match) {
                const recipient = match[1];
                const dmContent = match[2];
                if (recipient && dmContent && currentChatContext === 'public') {
                    socket.emit('private message', { recipient: recipient, content: dmContent });
                } else {
                    appendMessage({ username: 'System', content: 'Invalid /msg command or only available in public chat.', timestamp: new Date(), type: 'system' });
                }
            } else {
                 appendMessage({ username: 'System', content: 'Invalid /msg command. Usage: /msg [username] [message]', timestamp: new Date(), type: 'system' });
            }
        } 
        else if (command === '/kick') { 
            if (!isAdmin) {
                 appendMessage({ username: 'System', content: 'You do not have permission to use the /kick command.', timestamp: new Date(), type: 'system' });
                 return;
            }
            if (args) {
                socket.emit('admin:kick_user', { targetName: args, adminName: displayName });
            } else {
                appendMessage({ username: 'System', content: 'Invalid /kick command. Usage: /kick [username]', timestamp: new Date(), type: 'system' });
            }
        }
        else if (command === '/ban') { // *** NEW /BAN COMMAND LOGIC ***
            if (!isAdmin) {
                 appendMessage({ username: 'System', content: 'You do not have permission to use the /ban command.', timestamp: new Date(), type: 'system' });
                 return;
            }
            const match = args.match(/^(\S+)\s*(.*)/s); 
            if (match) {
                const targetName = match[1];
                const reason = match[2] || 'Violating chat rules.';
                
                // Set default duration for console ban (e.g., 30 minutes)
                const banData = { 
                    targetName: targetName, 
                    days: 0, 
                    hours: 0, 
                    minutes: 30, // Default 30 min ban
                    reason: reason 
                };
                
                socket.emit('admin:ip_ban_user', banData);
            } else {
                appendMessage({ username: 'System', content: 'Invalid /ban command. Usage: /ban [username] [optional reason]', timestamp: new Date(), type: 'system' });
            }
        }
        else if (command === '/clear') {
            if (isAdmin) {
                 clearConfirmTargetName.textContent = currentChatContext === 'public' ? 'Public' : 'Admin';
                 clearConfirmModal.show();
            } else {
                appendMessage({ username: 'System', content: 'You do not have permission to use the /clear command.', timestamp: new Date(), type: 'system' });
            }
        } else {
             appendMessage({ username: 'System', content: `Unknown command: ${command}`, timestamp: new Date(), type: 'system' });
        }
    } else {
        // Regular public/admin chat message
        socket.emit('chat message', { content }); 
    }
});
