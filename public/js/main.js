// Initialize socket connection
let socket = null;
let map = null;
let droneMarker = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000; // 2 seconds

// Initialize the map
function initMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ''  // Remove attribution
    }).addTo(map);
}

// Initialize drone marker
function initDroneMarker(position) {
    if (!droneMarker) {
        droneMarker = L.marker(position).addTo(map);
    } else {
        droneMarker.setLatLng(position);
    }
    map.setView(position, 15);
}

// Update connection status UI
function updateConnectionStatus(status, message = '') {
    const statusElement = document.getElementById('status');
    const connectBtn = document.getElementById('connect-btn');
    
    statusElement.textContent = status;
    statusElement.className = 'status ' + (isConnected ? 'connected' : 'disconnected');
    
    if (message) {
        console.log(message);
    }
    
    // Update button state and text
    connectBtn.textContent = isConnected ? 'Disconnect' : 'Connect';
    connectBtn.className = isConnected ? 'connected' : '';
    
    // Update control buttons state
    const controlButtons = document.querySelectorAll('.control-buttons button:not(#connect-btn)');
    controlButtons.forEach(button => {
        button.disabled = !isConnected;
    });
}

// Initialize Socket.IO connection
function initSocket() {
    if (socket) {
        socket.close();
    }

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    socket = io({
        auth: {
            token: token
        },
        reconnection: false // We'll handle reconnection manually
    });

    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        isConnected = true;
        reconnectAttempts = 0;
        updateConnectionStatus('Connected', 'Successfully connected to the server');
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        isConnected = false;
        updateConnectionStatus('Disconnected', `Connection lost: ${reason}`);
        
        if (reason === 'io server disconnect') {
            // Server disconnected us, retry connection
            attemptReconnect();
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        isConnected = false;
        updateConnectionStatus('Connection Error', `Failed to connect: ${error.message}`);
        
        if (error.message.includes('Authentication error')) {
            // Token might be invalid
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            return;
        }
        
        attemptReconnect();
    });

    // Drone telemetry handling
    socket.on('telemetry', (data) => {
        updateTelemetry(data);
        if (data.position) {
            initDroneMarker([data.position.lat, data.position.lng]);
        }
    });

    // Mission status updates
    socket.on('mission_status', (status) => {
        updateMissionStatus(status);
    });

    // Flight mode changes
    socket.on('flight_mode_changed', (data) => {
        document.getElementById('flight-mode-select').value = data.mode;
    });
}

// Attempt to reconnect to the server
function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        updateConnectionStatus('Connection Failed', 'Maximum reconnection attempts reached');
        return;
    }

    reconnectAttempts++;
    updateConnectionStatus('Reconnecting...', `Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    
    setTimeout(() => {
        initSocket();
    }, RECONNECT_DELAY * reconnectAttempts);
}

// Update telemetry display
function updateTelemetry(data) {
    const telemetryPanel = document.getElementById('telemetry-panel');
    telemetryPanel.innerHTML = `
        <h3>Telemetry</h3>
        <div class="telemetry-item">
            <span>Altitude:</span> ${data.altitude?.toFixed(2) || 'N/A'} m
        </div>
        <div class="telemetry-item">
            <span>Ground Speed:</span> ${data.groundSpeed?.toFixed(2) || 'N/A'} m/s
        </div>
        <div class="telemetry-item">
            <span>Battery:</span> ${data.battery?.percentage || 'N/A'}%
        </div>
        <div class="telemetry-item">
            <span>GPS Fix:</span> ${data.gps?.fix ? 'Yes' : 'No'}
        </div>
        <div class="telemetry-item">
            <span>Satellites:</span> ${data.gps?.satellites || 'N/A'}
        </div>
    `;
}

// Update mission status
function updateMissionStatus(status) {
    const missionBtn = document.getElementById('mission-btn');
    missionBtn.textContent = status.active ? 'Stop Mission' : 'Load Mission';
    missionBtn.className = status.active ? 'active' : '';
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize map
    initMap();
    
    // Initialize socket connection
    initSocket();
    
    // Connect/Disconnect button handler
    document.getElementById('connect-btn').addEventListener('click', () => {
        if (isConnected) {
            socket.disconnect();
        } else {
            initSocket();
        }
    });

    // Flight controls handlers
    const controls = ['throttle', 'yaw', 'pitch', 'roll'];
    controls.forEach(control => {
        const slider = document.getElementById(control);
        slider.addEventListener('input', () => {
            if (isConnected) {
                socket.emit('flight_controls', {
                    [control]: parseFloat(slider.value)
                });
            }
        });
        
        // Reset slider to center on release
        slider.addEventListener('mouseup', () => {
            if (control !== 'throttle') {
                slider.value = 0;
                if (isConnected) {
                    socket.emit('flight_controls', {
                        [control]: 0
                    });
                }
            }
        });
    });

    // Flight mode handler
    document.getElementById('flight-mode-select').addEventListener('change', (e) => {
        if (isConnected) {
            socket.emit('set_flight_mode', {
                mode: e.target.value
            });
        }
    });

    // Camera control handlers
    const cameraButtons = ['camera-up', 'camera-down', 'camera-left', 'camera-right'];
    cameraButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        button.addEventListener('mousedown', () => {
            if (isConnected) {
                socket.emit('camera_control', {
                    direction: buttonId.replace('camera-', '')
                });
            }
        });
    });

    // Vehicle control handlers
    document.getElementById('arm-btn').addEventListener('click', () => {
        if (isConnected) socket.emit('arm_vehicle');
    });

    document.getElementById('takeoff-btn').addEventListener('click', () => {
        if (isConnected) socket.emit('takeoff');
    });

    document.getElementById('land-btn').addEventListener('click', () => {
        if (isConnected) socket.emit('land');
    });

    document.getElementById('emergency-stop-btn').addEventListener('click', () => {
        if (isConnected) socket.emit('emergency_stop');
    });

    // Mission control handler
    document.getElementById('mission-btn').addEventListener('click', () => {
        if (isConnected) {
            const isActive = document.getElementById('mission-btn').classList.contains('active');
            socket.emit(isActive ? 'stop_mission' : 'load_mission');
        }
    });
}); 