// Mission Manager
class MissionManager {
    constructor() {
        this.missionList = document.getElementById('missionList');
        this.missionDetails = document.getElementById('missionDetails');
        this.loadMissionBtn = document.getElementById('loadMission');
        this.startMissionBtn = document.getElementById('startMission');
        this.pauseMissionBtn = document.getElementById('pauseMission');
        
        this.currentMission = null;
        this.isMissionRunning = false;
        
        this.initialize();
    }
    
    async initialize() {
        await this.loadMissionFiles();
        this.setupEventListeners();
    }
    
    async loadMissionFiles() {
        try {
            const response = await fetch('/api/missions');
            const missions = await response.json();
            
            this.missionList.innerHTML = '';
            missions.forEach(mission => {
                const option = document.createElement('option');
                option.value = mission.id;
                option.textContent = mission.name;
                this.missionList.appendChild(option);
            });
            
            if (missions.length > 0) {
                this.loadMissionDetails(missions[0].id);
            }
        } catch (error) {
            console.error('Error loading missions:', error);
            showNotification('Failed to load missions', 'error');
        }
    }
    
    async loadMissionDetails(missionId) {
        try {
            const response = await fetch(`/api/missions/${missionId}`);
            const mission = await response.json();
            
            this.currentMission = mission;
            this.displayMissionDetails(mission);
            
            // Update the map with mission waypoints
            this.updateMissionOnMap(mission);
        } catch (error) {
            console.error('Error loading mission details:', error);
            showNotification('Failed to load mission details', 'error');
        }
    }
    
    displayMissionDetails(mission) {
        const details = `
            <h3>${mission.name}</h3>
            <p><strong>Description:</strong> ${mission.description}</p>
            <p><strong>Waypoints:</strong> ${mission.waypoints.length}</p>
            <p><strong>Total Distance:</strong> ${this.calculateTotalDistance(mission.waypoints).toFixed(2)} km</p>
            <p><strong>Estimated Duration:</strong> ${this.calculateEstimatedDuration(mission.waypoints)}</p>
        `;
        
        this.missionDetails.innerHTML = details;
    }
    
    updateMissionOnMap(mission) {
        // Clear existing mission path
        if (window.missionPath) {
            window.missionPath.remove();
        }
        
        // Create new path
        const waypoints = mission.waypoints.map(wp => [wp.latitude, wp.longitude]);
        window.missionPath = L.polyline(waypoints, {
            color: '#3498db',
            weight: 3,
            opacity: 0.7,
            dashArray: '5, 10'
        }).addTo(window.map);
        
        // Add waypoint markers
        mission.waypoints.forEach((wp, index) => {
            L.marker([wp.latitude, wp.longitude])
                .bindPopup(`Waypoint ${index + 1}<br>Altitude: ${wp.altitude}m<br>Speed: ${wp.speed}m/s`)
                .addTo(window.map);
        });
        
        // Fit map to mission bounds
        window.map.fitBounds(window.missionPath.getBounds());
    }
    
    calculateTotalDistance(waypoints) {
        let totalDistance = 0;
        for (let i = 1; i < waypoints.length; i++) {
            totalDistance += this.calculateDistance(
                waypoints[i-1].latitude,
                waypoints[i-1].longitude,
                waypoints[i].latitude,
                waypoints[i].longitude
            );
        }
        return totalDistance;
    }
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    toRad(degrees) {
        return degrees * (Math.PI/180);
    }
    
    calculateEstimatedDuration(waypoints) {
        const averageSpeed = 10; // m/s
        const totalDistance = this.calculateTotalDistance(waypoints) * 1000; // convert to meters
        const seconds = totalDistance / averageSpeed;
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        return `${hours}h ${minutes}m`;
    }
    
    setupEventListeners() {
        this.missionList.addEventListener('change', (e) => {
            this.loadMissionDetails(e.target.value);
        });
        
        this.loadMissionBtn.addEventListener('click', () => {
            if (this.currentMission) {
                socket.emit('load_mission', this.currentMission);
                showNotification('Mission loaded successfully', 'success');
            }
        });
        
        this.startMissionBtn.addEventListener('click', () => {
            if (this.currentMission && !this.isMissionRunning) {
                socket.emit('start_mission');
                this.isMissionRunning = true;
                this.startMissionBtn.disabled = true;
                this.pauseMissionBtn.disabled = false;
                showNotification('Mission started', 'success');
            }
        });
        
        this.pauseMissionBtn.addEventListener('click', () => {
            if (this.isMissionRunning) {
                socket.emit('pause_mission');
                this.isMissionRunning = false;
                this.startMissionBtn.disabled = false;
                this.pauseMissionBtn.disabled = true;
                showNotification('Mission paused', 'info');
            }
        });
    }
}

// Initialize mission manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.missionManager = new MissionManager();
}); 