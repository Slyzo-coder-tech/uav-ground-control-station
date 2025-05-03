const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Secret key for JWT
const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

// Mock user database (in production, use a real database)
const users = [
    {
        id: 1,
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10) // Hashed password
    }
];

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Add CSP headers
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self' https://unpkg.com; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com; " +
        "img-src 'self' data: https://*.tile.openstreetmap.org http://localhost:3000; " +
        "connect-src 'self' ws: wss:; " +
        "font-src 'self' https://unpkg.com; " +
        "frame-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'; " +
        "upgrade-insecure-requests;"
    );
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token });
});

// Mission file handling
const missionsDir = path.join(__dirname, 'public', 'missions');

// Ensure missions directory exists
if (!fs.existsSync(missionsDir)) {
    fs.mkdirSync(missionsDir, { recursive: true });
}

// API routes
app.get('/api/missions', (req, res) => {
    fs.readdir(missionsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read missions directory' });
        }
        
        const missions = files
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const content = fs.readFileSync(path.join(missionsDir, file), 'utf8');
                const mission = JSON.parse(content);
                return {
                    id: file.replace('.json', ''),
                    name: mission.name,
                    description: mission.description
                };
            });
        
        res.json(missions);
    });
});

app.get('/api/missions/:id', (req, res) => {
    const missionFile = path.join(missionsDir, `${req.params.id}.json`);
    
    if (!fs.existsSync(missionFile)) {
        return res.status(404).json({ error: 'Mission not found' });
    }
    
    const content = fs.readFileSync(missionFile, 'utf8');
    res.json(JSON.parse(content));
});

// Socket.IO authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return next(new Error('Authentication error'));
        }
        socket.user = decoded;
        next();
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id, 'Username:', socket.user.username);

    // Track drone connection state
    let isDroneConnected = false;
    let lastTelemetryTimestamp = 0;
    let telemetryTimeout = null;

    // Handle connection errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    // Handle ping for latency check
    socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
            callback();
        }
    });

    // Handle telemetry with health check
    socket.on('telemetry', (data) => {
        lastTelemetryTimestamp = data.timestamp;
        isDroneConnected = data.connected;
        
        // Clear existing timeout and set new one
        if (telemetryTimeout) {
            clearTimeout(telemetryTimeout);
        }
        
        // Set timeout to detect telemetry interruption
        telemetryTimeout = setTimeout(() => {
            if (isDroneConnected) {
                console.warn('Telemetry timeout for drone connection:', socket.id);
                isDroneConnected = false;
                io.emit('drone_connection_lost');
            }
        }, 5000); // 5 second timeout
        
        // Broadcast telemetry to all connected clients
        socket.broadcast.emit('telemetry', data);
    });

    // Handle flight controls with validation
    socket.on('flight_controls', (controls) => {
        if (!isDroneConnected) {
            socket.emit('error', { message: 'Drone not connected' });
            return;
        }
        
        // Validate control inputs
        const validControls = {};
        ['throttle', 'yaw', 'pitch', 'roll'].forEach(control => {
            if (typeof controls[control] === 'number') {
                validControls[control] = Math.max(-100, Math.min(100, controls[control]));
            }
        });
        
        socket.broadcast.emit('flight_controls', validControls);
    });

    // Handle camera controls with validation
    socket.on('camera_control', (data) => {
        if (!isDroneConnected) {
            socket.emit('error', { message: 'Drone not connected' });
            return;
        }
        
        if (!['up', 'down', 'left', 'right'].includes(data.direction)) {
            socket.emit('error', { message: 'Invalid camera direction' });
            return;
        }
        
        socket.broadcast.emit('camera_control', data);
    });

    // Handle flight mode changes with validation
    socket.on('set_flight_mode', (data) => {
        if (!isDroneConnected) {
            socket.emit('error', { message: 'Drone not connected' });
            return;
        }
        
        const validModes = ['stabilize', 'alt_hold', 'loiter', 'auto', 'guided'];
        if (!validModes.includes(data.mode)) {
            socket.emit('error', { message: 'Invalid flight mode' });
            return;
        }
        
        socket.broadcast.emit('set_flight_mode', data);
    });

    // Handle mission management
    socket.on('load_mission', (mission) => {
        if (!isDroneConnected) {
            socket.emit('error', { message: 'Drone not connected' });
            return;
        }
        
        // Validate mission format
        if (!mission || !Array.isArray(mission.waypoints)) {
            socket.emit('error', { message: 'Invalid mission format' });
            return;
        }
        
        socket.broadcast.emit('load_mission', mission);
    });

    // Handle vehicle commands
    ['connect_drone', 'disconnect_drone', 'arm_vehicle', 'takeoff', 'land', 'emergency_stop',
     'start_mission', 'pause_mission'].forEach(command => {
        socket.on(command, () => {
            if (!isDroneConnected && command !== 'connect_drone') {
                socket.emit('error', { message: 'Drone not connected' });
                return;
            }
            socket.broadcast.emit(command);
        });
    });

    // Handle disconnection cleanup
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (telemetryTimeout) {
            clearTimeout(telemetryTimeout);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT}/login.html in your browser`);
}); 