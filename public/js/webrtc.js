// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCameraBtn = document.getElementById('startCamera');
const stopCameraBtn = document.getElementById('stopCamera');
const startStreamBtn = document.getElementById('startStream');
const stopStreamBtn = document.getElementById('stopStream');

// WebRTC variables
let localStream;
let peerConnection;
let isInitiator = false;

// Initialize WebRTC
async function initializeWebRTC() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });
        localVideo.srcObject = localStream;
        
        startCameraBtn.disabled = true;
        stopCameraBtn.disabled = false;
        startStreamBtn.disabled = false;
        
        showNotification('Camera started successfully', 'success');
    } catch (error) {
        console.error('Error accessing camera:', error);
        showNotification('Failed to access camera', 'error');
    }
}

// Setup peer connection
function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Handle remote stream
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate
            });
        }
    };
}

// Start streaming
async function startStreaming() {
    if (!localStream) {
        showNotification('Please start camera first', 'error');
        return;
    }
    
    setupPeerConnection();
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            sdp: peerConnection.localDescription
        });
        
        isInitiator = true;
        startStreamBtn.disabled = true;
        stopStreamBtn.disabled = false;
        
        showNotification('Streaming started', 'success');
    } catch (error) {
        console.error('Error starting stream:', error);
        showNotification('Failed to start streaming', 'error');
    }
}

// Stop streaming
function stopStreaming() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    isInitiator = false;
    startStreamBtn.disabled = false;
    stopStreamBtn.disabled = true;
    
    showNotification('Streaming stopped', 'info');
}

// Stop camera
function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;
    }
    
    stopStreaming();
    
    startCameraBtn.disabled = false;
    stopCameraBtn.disabled = true;
    startStreamBtn.disabled = true;
    stopStreamBtn.disabled = true;
    
    showNotification('Camera stopped', 'info');
}

// Handle incoming offer
async function handleOffer(offer) {
    if (!localStream) {
        showNotification('Please start camera first', 'error');
        return;
    }
    
    setupPeerConnection();
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            sdp: peerConnection.localDescription
        });
        
        showNotification('Connected to remote stream', 'success');
    } catch (error) {
        console.error('Error handling offer:', error);
        showNotification('Failed to connect to remote stream', 'error');
    }
}

// Handle incoming answer
async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        showNotification('Remote stream connected', 'success');
    } catch (error) {
        console.error('Error handling answer:', error);
        showNotification('Failed to establish connection', 'error');
    }
}

// Handle incoming ICE candidate
async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Event listeners
startCameraBtn.addEventListener('click', initializeWebRTC);
stopCameraBtn.addEventListener('click', stopCamera);
startStreamBtn.addEventListener('click', startStreaming);
stopStreamBtn.addEventListener('click', stopStreaming);

// Socket.IO event handlers
socket.on('offer', handleOffer);
socket.on('answer', handleAnswer);
socket.on('ice-candidate', handleIceCandidate);

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
} 