// ============================================
// CLIENT-SIDE: public/fingerprint.js
// ============================================
// Add this NEW file to generate device fingerprints

async function generateDeviceFingerprint() {
    const components = [];
    
    // 1. Canvas Fingerprint
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device Fingerprint', 2, 2);
        components.push(canvas.toDataURL());
    } catch (e) {
        components.push('canvas-error');
    }
    
    // 2. WebGL Fingerprint
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
            }
        }
    } catch (e) {
        components.push('webgl-error');
    }
    
    // 3. Screen Properties
    components.push(screen.width);
    components.push(screen.height);
    components.push(screen.colorDepth);
    components.push(screen.pixelDepth);
    
    // 4. Timezone
    components.push(new Date().getTimezoneOffset());
    
    // 5. Platform & User Agent
    components.push(navigator.platform);
    components.push(navigator.userAgent);
    components.push(navigator.language);
    components.push(navigator.languages ? navigator.languages.join(',') : '');
    
    // 6. Hardware Concurrency (CPU cores)
    components.push(navigator.hardwareConcurrency || 0);
    
    // 7. Device Memory
    components.push(navigator.deviceMemory || 0);
    
    // 8. Touch Support
    components.push(navigator.maxTouchPoints || 0);
    
    // 9. Plugins (deprecated but still useful)
    const plugins = Array.from(navigator.plugins || [])
        .map(p => p.name)
        .sort()
        .join(',');
    components.push(plugins);
    
    // 10. Audio Context Fingerprint
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const analyser = audioContext.createAnalyser();
        const gainNode = audioContext.createGain();
        const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        gainNode.gain.value = 0;
        oscillator.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(0);
        const audioFingerprint = analyser.frequencyBinCount;
        oscillator.stop();
        
        components.push(audioFingerprint);
    } catch (e) {
        components.push('audio-error');
    }
    
    // Create hash from all components
    const fingerprint = await hashComponents(components.join('|||'));
    return fingerprint;
}

async function hashComponents(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// ============================================
// CLIENT-SIDE: Update public/chat.js
// ============================================
// Add at the TOP of chat.js (after socket connection):

let deviceFingerprint = '';

// Generate fingerprint on page load
(async () => {
    deviceFingerprint = await generateDeviceFingerprint();
    console.log('Device Fingerprint Generated:', deviceFingerprint);
})();

// UPDATE the 'check_staff_status' event to include fingerprint:
socket.on('check_staff_status', enteredName => {
    const name = (enteredName || '').trim();
    if (!name) return;
    
    // Send fingerprint along with name
    socket.emit('check_staff_status', { name, fingerprint: deviceFingerprint });
});

// ============================================
// SERVER-SIDE: Update server.js
// ============================================

// REPLACE ipBanList with deviceBanList:
const deviceBanList = new Map(); // deviceFingerprint -> { banUntil: Date, reason: string }

// UPDATE users Map structure to include fingerprint:
// socket.id -> { displayName, secureName, isAdmin, ip, fingerprint, chatContext }

// UPDATE the 'connection' handler:
io.on('connection', socket => {
  const userIp = socket.handshake.address;
  console.log('Client connected:', socket.id, 'IP:', userIp);

  // Initial setup (no ban check yet - wait for fingerprint)
  socket.emit('chat history', chatHistory);
  broadcastUserCount();

  // UPDATED: Handle login with fingerprint
  socket.on('check_staff_status', data => {
    const name = (data.name || '').trim();
    const fingerprint = (data.fingerprint || '').trim();
    const lower = name.toLowerCase();

    // 0. Device Ban Check (using fingerprint)
    if (fingerprint) {
        const banEntry = deviceBanList.get(fingerprint);
        if (banEntry && banEntry.banUntil > new Date()) {
            const banDurationMs = banEntry.banUntil.getTime() - new Date().getTime();
            socket.emit('banned_modal', { 
                reason: banEntry.reason, 
                banDurationMs: banDurationMs 
            });
            return;
        }
    }

    cleanUpUser(socket.id);

    if (!name) { 
      socket.emit('name_rejected', `Please provide a name.`);
      return;
    }
    
    // --- ADMIN LOGIN ATTEMPT ---
    const staffLoginAttempt = STAFF_LIST.find(s => s.loginName === name);
    if (staffLoginAttempt) {
        const staffName = staffLoginAttempt.displayName;
        const staffLower = staffName.toLowerCase();

        if (usernamesMap.has(staffLower)) {
            socket.emit('name_rejected', `The staff display name '${staffName}' is already in use.`);
            return;
        }

        // SUCCESSFUL ADMIN LOGIN
        users.set(socket.id, { 
            displayName: staffName, 
            secureName: staffLoginAttempt.loginName, 
            isAdmin: true,
            ip: userIp,
            fingerprint: fingerprint, // Store fingerprint
            chatContext: 'public' 
        });
        usernamesMap.set(staffLower, socket.id);
        socket.join(STAFF_ROOM); 

        socket.emit('staff_status_update', { 
            isAdmin: true, 
            displayName: staffName, 
            secureName: staffLoginAttempt.loginName, 
            currentContext: 'public' 
        });
        
        const publicMsg = {
          username: 'System',
          content: `A moderator has entered the chat.`,
          timestamp: new Date(),
          isAdmin: true,
          type: 'system'
        };
        pushHistory(publicMsg, 'public');
        io.emit('chat message', publicMsg);
        broadcastUserCount();
        return;
    }

    // Name uniqueness check
    if (usernamesMap.has(lower)) {
        socket.emit('name_rejected', 'That name is already in use (Name collision).');
        return;
    }

    // Reserved/Banned name check
    if (isNameReservedOrBanned(name)) {
        socket.emit('name_rejected', 'That name is either reserved for staff or not allowed.');
        return;
    }

    // Normal User Login
    users.set(socket.id, { 
        displayName: name, 
        secureName: name, 
        isAdmin: false,
        ip: userIp,
        fingerprint: fingerprint, // Store fingerprint
        chatContext: 'public'
    });
    usernamesMap.set(lower, socket.id);
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
    broadcastUserCount();
  });

  // UPDATE: Device Ban User (replaces IP ban)
  socket.on('admin:device_ban_user', data => {
      const admin = users.get(socket.id);
      const targetName = (data.targetName || '').trim();
      const targetFingerprint = (data.targetFingerprint || '').trim();
      const days = parseInt(data.days) || 0;
      const hours = parseInt(data.hours) || 0;
      const minutes = parseInt(data.minutes) || 0;
      const reason = data.reason || 'No reason provided';
      
      if (!admin || !admin.isAdmin || !targetFingerprint) {
          socket.emit('system_error', 'Ban failed: Unauthorized or missing device fingerprint.');
          return;
      }
      if (days === 0 && hours === 0 && minutes === 0) {
          socket.emit('system_error', 'Ban duration must be greater than zero.');
          return;
      }
      
      const targetLower = targetName.toLowerCase();
      const targetSocketId = usernamesMap.get(targetLower);
      const targetUser = users.get(targetSocketId);

      if (targetUser && targetUser.isAdmin) {
          socket.emit('system_error', `Cannot ban Admin '${targetName}'.`);
          return;
      }
      
      const banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + days);
      banUntil.setHours(banUntil.getHours() + hours);
      banUntil.setMinutes(banUntil.getMinutes() + minutes);

      deviceBanList.set(targetFingerprint, { banUntil, reason });

      if (targetSocketId) {
          io.to(targetSocketId).emit('system_error', 
              `You have been DEVICE BANNED by Moderator ${admin.displayName} for ${days}d ${hours}h ${minutes}m (${reason}).`);
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) targetSocket.disconnect(true);
      }
      
      const banMsg = {
        username: 'System',
        content: `Moderator ${admin.displayName} has DEVICE BANNED ${targetName} for ${days}d ${hours}h ${minutes}m.`,
        timestamp: new Date(),
        isAdmin: true,
        type: 'system'
      };
      pushHistory(banMsg, admin.chatContext === ADMIN_CHAT_ID ? 'admin' : 'public');
      io.emit('chat message', banMsg);
      
      broadcastUserCount();
  });

  // Rest of the socket handlers remain the same...
});

// ============================================
// CLIENT-SIDE: Update HTML to include fingerprint script
// ============================================
// In public/index.html, add BEFORE chat.js:
// <script src="fingerprint.js"></script>

// ============================================
// CLIENT-SIDE: Update ban modal trigger
// ============================================
// In chat.js, update the banConfirmBtn click handler:

banConfirmBtn.addEventListener('click', () => {
    if (!isAdmin || !userToKick) {
        banModal.hide();
        return;
    }
    
    // Get the target user's fingerprint from the manage list
    const targetLower = userToKick.toLowerCase();
    const targetSocketId = usernamesMap.get(targetLower); // You'll need to track this
    
    const days = parseInt(banDurationDaysInput.value);
    const hours = parseInt(banDurationHoursInput.value);
    const minutes = parseInt(banDurationMinutesInput.value);
    const reason = banReasonInput.value;
    
    if (isNaN(days) || isNaN(hours) || isNaN(minutes) || 
        (days === 0 && hours === 0 && minutes === 0) || 
        days > 999 || hours > 99 || minutes > 99) {
        alert('Invalid duration. Max: 999 days, 99 hours, 99 minutes. Duration must be > 0.');
        return;
    }
    
    // Use fingerprint instead of IP
    socket.emit('admin:device_ban_user', { 
        targetName: userToKick,
        targetFingerprint: userFingerprintToBan, // You'll need to store this
        days: days, 
        hours: hours, 
        minutes: minutes,
        reason: reason
    });
    
    banModal.hide(); 
    userToKick = null; 
    userFingerprintToBan = null;
});
