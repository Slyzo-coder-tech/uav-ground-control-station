// Initialize socket connection
const socket = io();

// DOM elements
const statusIndicator = document.querySelector('.status-indicator');
const statusText = document.querySelector('.status-text');
const connectBtn = document.getElementById('connect-btn');
const emergencyBtn = document.getElementById('emergency-btn');
const armBtn = document.getElementById('arm-btn');
const takeoffBtn = document.getElementById('takeoff-btn');
const landBtn = document.getElementById('land-btn');
const rtlBtn = document.getElementById('rtl-btn');

// Map initialization
let map;
let droneMarker;
let pathLayer;

function initializeMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Initialize path layer
    pathLayer = L.layerGroup().addTo(map);
}

// Update telemetry display
function updateTelemetry(data) {
    document.getElementById('battery').textContent = `${data.battery}%`;
    document.getElementById('speed').textContent = `${data.speed.toFixed(2)} m/s`;
    document.getElementById('heading').textContent = `${data.heading.toFixed(1)}°`;
    document.getElementById('latitude').textContent = data.latitude.toFixed(6);
    document.getElementById('longitude').textContent = data.longitude.toFixed(6);
    document.getElementById('altitude').textContent = `${data.altitude.toFixed(1)} m`;
    document.getElementById('roll').textContent = `${data.roll.toFixed(1)}°`;
    document.getElementById('pitch').textContent = `${data.pitch.toFixed(1)}°`;
    document.getElementById('yaw').textContent = `${data.yaw.toFixed(1)}°`;
}

// Update drone position on map
function updateDronePosition(position) {
    const { latitude, longitude, heading } = position;
    
    if (!droneMarker) {
        // Create drone marker if it doesn't exist
        const droneIcon = L.divIcon({
            className: 'drone-marker',
            html: '<i class="fas fa-plane" style="color: #e74c3c; font-size: 24px;"></i>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        droneMarker = L.marker([latitude, longitude], { icon: droneIcon })
            .addTo(map);
    } else {
        // Update existing marker position and rotation
        droneMarker.setLatLng([latitude, longitude]);
        const icon = droneMarker.getElement();
        if (icon) {
            icon.style.transform = `rotate(${heading}deg)`;
        }
    }
    
    // Update map view
    map.setView([latitude, longitude], map.getZoom());
    
    // Add point to path
    L.circleMarker([latitude, longitude], {
        radius: 2,
        color: '#e74c3c',
        fillColor: '#e74c3c',
        fillOpacity: 1
    }).addTo(pathLayer);
}

// Handle connection status
function updateConnectionStatus(connected) {
    statusIndicator.className = 'status-indicator' + (connected ? ' connected' : '');
    statusText.textContent = connected ? 'Connected' : 'Disconnected';
    
    // Update button states
    const buttons = [armBtn, takeoffBtn, landBtn, rtlBtn];
    buttons.forEach(btn => btn.disabled = !connected);
}

// Event listeners
connectBtn.addEventListener('click', () => {
    socket.emit('connect_drone');
});

emergencyBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to perform an emergency stop?')) {
        socket.emit('emergency_stop');
        showNotification('Emergency stop activated', 'error');
    }
});

armBtn.addEventListener('click', () => {
    socket.emit('arm_vehicle');
    showNotification('Vehicle armed', 'success');
});

takeoffBtn.addEventListener('click', () => {
    socket.emit('takeoff');
    showNotification('Takeoff initiated', 'success');
});

landBtn.addEventListener('click', () => {
    socket.emit('land');
    showNotification('Landing initiated', 'info');
});

rtlBtn.addEventListener('click', () => {
    socket.emit('return_to_launch');
    showNotification('Return to launch initiated', 'info');
});

// Socket event handlers
socket.on('connect', () => {
    showNotification('Connected to server', 'success');
});

socket.on('disconnect', () => {
    showNotification('Disconnected from server', 'error');
    updateConnectionStatus(false);
});

socket.on('drone_status', (status) => {
    updateConnectionStatus(status.connected);
    updateTelemetry(status.telemetry);
    updateDronePosition(status.position);
});

socket.on('error', (error) => {
    showNotification(error.message, 'error');
});

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    showNotification('Ground Control Station initialized', 'info');
}); 