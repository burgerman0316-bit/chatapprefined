// ============================================
// CLIENT-SIDE: public/fingerprint
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
