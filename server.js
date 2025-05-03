const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // WebRTC signaling
    socket.on('offer', (data) => {
        console.log('Offer received from:', socket.id);
        socket.broadcast.emit('offer', data);
    });

    socket.on('answer', (data) => {
        console.log('Answer received from:', socket.id);
        socket.broadcast.emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        console.log('ICE candidate received from:', socket.id);
        socket.broadcast.emit('ice-candidate', data);
    });

    // Mission handling
    socket.on('load_mission', (mission) => {
        console.log('Mission loaded:', mission.name);
        socket.broadcast.emit('mission_loaded', mission);
    });

    socket.on('start_mission', () => {
        console.log('Mission started by:', socket.id);
        socket.broadcast.emit('mission_started');
    });

    socket.on('pause_mission', () => {
        console.log('Mission paused by:', socket.id);
        socket.broadcast.emit('mission_paused');
    });

    // Drone control
    socket.on('connect_drone', () => {
        console.log('Drone connection requested by:', socket.id);
        socket.broadcast.emit('drone_connect');
    });

    socket.on('emergency_stop', () => {
        console.log('Emergency stop requested by:', socket.id);
        socket.broadcast.emit('drone_emergency_stop');
    });

    socket.on('arm_vehicle', () => {
        console.log('Vehicle arm requested by:', socket.id);
        socket.broadcast.emit('drone_arm');
    });

    socket.on('takeoff', () => {
        console.log('Takeoff requested by:', socket.id);
        socket.broadcast.emit('drone_takeoff');
    });

    socket.on('land', () => {
        console.log('Land requested by:', socket.id);
        socket.broadcast.emit('drone_land');
    });

    socket.on('return_to_launch', () => {
        console.log('RTL requested by:', socket.id);
        socket.broadcast.emit('drone_rtl');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
}); 