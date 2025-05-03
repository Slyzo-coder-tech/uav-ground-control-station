const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

// Configuration
const config = {
    server: 'http://localhost:3000',
    auth: {
        username: 'admin',
        password: 'admin123'
    },
    reconnection: {
        attempts: 5,
        delay: 1000,
        timeout: 5000
    }
};

// Get authentication token
async function getAuthToken() {
    try {
        const response = await fetch(`${config.server}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config.auth)
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Authentication error:', error.message);
        process.exit(1);
    }
}

// Create socket connection with error handling
async function initializeSocket() {
    const token = await getAuthToken();
    
    const socket = io(config.server, {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: config.reconnection.attempts,
        reconnectionDelay: config.reconnection.delay,
        timeout: config.reconnection.timeout
    });

    socket.on('connect', () => {
        console.log('Connected to GCS server');
        console.log('Socket ID:', socket.id);
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        if (error.message.includes('Authentication')) {
            console.log('Attempting to refresh authentication...');
            getAuthToken().then(newToken => {
                socket.auth = { token: newToken };
                socket.connect();
            }).catch(err => {
                console.error('Failed to refresh authentication:', err.message);
                process.exit(1);
            });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from GCS server:', reason);
        if (reason === 'io server disconnect') {
            console.log('Server disconnected, attempting to reconnect...');
            socket.connect();
        }
    });

    return socket;
}

class DroneSimulator {
    constructor() {
        this.connected = false;
        this.armed = false;
        this.flying = false;
        this.position = {
            latitude: 37.7749,
            longitude: -122.4194,
            altitude: 0
        };
        this.attitude = {
            roll: 0,
            pitch: 0,
            yaw: 0
        };
        this.battery = 100;
        this.speed = 0;
        this.heading = 0;
        this.currentWaypoint = null;
        this.mission = null;
        this.missionRunning = false;
        this.updateInterval = null;
        this.lastTelemetryUpdate = Date.now();
        this.connectionCheckInterval = null;
    }

    connect() {
        if (!this.connected) {
            this.connected = true;
            console.log('Drone connected to GCS');
            socket.emit('drone_status', {
                connected: true,
                telemetry: this.getTelemetry(),
                position: this.position
            });
        }
    }

    disconnect() {
        if (this.connected) {
            this.connected = false;
            this.armed = false;
            this.flying = false;
            console.log('Drone disconnected from GCS');
            socket.emit('drone_status', {
                connected: false,
                telemetry: this.getTelemetry(),
                position: this.position
            });
        }
    }

    arm() {
        if (this.connected && !this.armed) {
            this.armed = true;
            console.log('Drone armed');
            socket.emit('drone_status', {
                connected: true,
                telemetry: this.getTelemetry(),
                position: this.position
            });
        }
    }

    takeoff() {
        if (this.connected && this.armed && !this.flying) {
            this.flying = true;
            this.position.altitude = 10; // Takeoff to 10 meters
            console.log('Drone taking off');
            this.startTelemetryUpdates();
        }
    }

    land() {
        if (this.flying) {
            this.flying = false;
            this.position.altitude = 0;
            console.log('Drone landing');
            this.stopTelemetryUpdates();
        }
    }

    emergencyStop() {
        this.flying = false;
        this.armed = false;
        this.position.altitude = 0;
        console.log('Emergency stop activated');
        this.stopTelemetryUpdates();
    }

    loadMission(mission) {
        this.mission = mission;
        this.currentWaypoint = 0;
        console.log('Mission loaded:', mission.name);
    }

    startMission() {
        if (this.mission && !this.missionRunning) {
            this.missionRunning = true;
            console.log('Mission started');
            this.followMission();
        }
    }

    pauseMission() {
        if (this.missionRunning) {
            this.missionRunning = false;
            console.log('Mission paused');
        }
    }

    followMission() {
        if (!this.mission || !this.missionRunning) return;

        const waypoint = this.mission.waypoints[this.currentWaypoint];
        if (!waypoint) {
            this.missionRunning = false;
            console.log('Mission completed');
            return;
        }

        // Simulate movement to waypoint
        const targetLat = waypoint.latitude;
        const targetLon = waypoint.longitude;
        const targetAlt = waypoint.altitude;
        const targetSpeed = waypoint.speed;

        // Update position gradually
        this.position.latitude += (targetLat - this.position.latitude) * 0.1;
        this.position.longitude += (targetLon - this.position.longitude) * 0.1;
        this.position.altitude += (targetAlt - this.position.altitude) * 0.1;
        this.speed = targetSpeed;

        // Calculate heading
        this.heading = this.calculateHeading(
            this.position.latitude,
            this.position.longitude,
            targetLat,
            targetLon
        );

        // Check if waypoint reached
        const distance = this.calculateDistance(
            this.position.latitude,
            this.position.longitude,
            targetLat,
            targetLon
        );

        if (distance < 0.0001) { // Approximately 10 meters
            this.currentWaypoint++;
            console.log('Waypoint reached, moving to next');
        }
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    calculateHeading(lat1, lon1, lat2, lon2) {
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const λ1 = lon1 * Math.PI/180;
        const λ2 = lon2 * Math.PI/180;

        const y = Math.sin(λ2-λ1) * Math.cos(φ2);
        const x = Math.cos(φ1)*Math.sin(φ2) -
                Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
        const θ = Math.atan2(y, x);

        return (θ*180/Math.PI + 360) % 360;
    }

    getTelemetry() {
        return {
            battery: this.battery,
            speed: this.speed,
            heading: this.heading,
            latitude: this.position.latitude,
            longitude: this.position.longitude,
            altitude: this.position.altitude,
            roll: this.attitude.roll,
            pitch: this.attitude.pitch,
            yaw: this.attitude.yaw
        };
    }

    startTelemetryUpdates() {
        this.updateInterval = setInterval(() => {
            if (this.flying) {
                this.lastTelemetryUpdate = Date.now();
                
                // Simulate battery drain
                this.battery = Math.max(0, this.battery - 0.1);
                
                // Simulate attitude changes
                this.attitude.roll = Math.sin(Date.now() / 1000) * 5;
                this.attitude.pitch = Math.cos(Date.now() / 1000) * 5;
                this.attitude.yaw = this.heading;

                if (this.missionRunning) {
                    this.followMission();
                }

                socket.emit('telemetry', {
                    timestamp: Date.now(),
                    connected: true,
                    armed: this.armed,
                    flying: this.flying,
                    position: {
                        lat: this.position.latitude,
                        lng: this.position.longitude,
                        alt: this.position.altitude
                    },
                    attitude: this.attitude,
                    battery: {
                        percentage: this.battery,
                        voltage: 12.6 * (this.battery / 100)
                    },
                    groundSpeed: this.speed,
                    gps: {
                        fix: true,
                        satellites: 8 + Math.floor(Math.random() * 5)
                    }
                });
            }
        }, 100); // Increased update rate to 10Hz

        // Start connection health check
        this.connectionCheckInterval = setInterval(() => {
            const timeSinceLastUpdate = Date.now() - this.lastTelemetryUpdate;
            if (timeSinceLastUpdate > 5000) { // 5 seconds threshold
                console.warn('Telemetry update delay detected:', timeSinceLastUpdate, 'ms');
                this.checkConnectionHealth();
            }
        }, 1000);
    }

    stopTelemetryUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }

    checkConnectionHealth() {
        if (!socket.connected) {
            console.log('Connection lost, attempting to reconnect...');
            socket.connect();
        }
        
        // Ping the server to check latency
        const start = Date.now();
        socket.emit('ping', () => {
            const latency = Date.now() - start;
            console.log('Current latency:', latency, 'ms');
            if (latency > 1000) {
                console.warn('High latency detected:', latency, 'ms');
            }
        });
    }
}

// Create and initialize
let socket;
let simulator;

async function main() {
    try {
        socket = await initializeSocket();
        simulator = new DroneSimulator();
        
        // Handle control commands
        socket.on('connect_drone', () => simulator.connect());
        socket.on('disconnect_drone', () => simulator.disconnect());
        socket.on('arm_vehicle', () => simulator.arm());
        socket.on('takeoff', () => simulator.takeoff());
        socket.on('land', () => simulator.land());
        socket.on('emergency_stop', () => simulator.emergencyStop());
        socket.on('load_mission', (mission) => simulator.loadMission(mission));
        socket.on('start_mission', () => simulator.startMission());
        socket.on('pause_mission', () => simulator.pauseMission());
        socket.on('flight_controls', (controls) => {
            if (simulator.flying) {
                // Update attitude based on controls
                simulator.attitude.roll = controls.roll || 0;
                simulator.attitude.pitch = controls.pitch || 0;
                simulator.attitude.yaw = controls.yaw || 0;
                // Update speed based on throttle
                simulator.speed = (controls.throttle || 0) * 0.5; // Max speed 50 m/s
            }
        });

        // Initial connection
        simulator.connect();
        
    } catch (error) {
        console.error('Failed to initialize drone simulator:', error);
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down drone simulator...');
    if (simulator) {
        simulator.disconnect();
        simulator.stopTelemetryUpdates();
    }
    if (socket) {
        socket.disconnect();
    }
    process.exit(0);
});

// Start the simulator
main().catch(console.error); 