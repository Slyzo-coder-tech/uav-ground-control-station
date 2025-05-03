# UAV Ground Control Station

A web-based Ground Control Station (GCS) for UAVs with real-time video streaming and mission management capabilities.

## Features

- Real-time telemetry display
- Interactive map with drone position tracking
- WebRTC video streaming
- Mission planning and execution
- Emergency controls
- Responsive design

## Technologies Used

- Node.js
- Express.js
- Socket.IO
- WebRTC
- Leaflet.js
- HTML5/CSS3/JavaScript

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/uav-ground-control-station.git
cd uav-ground-control-station
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

```
uav-ground-control-station/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── main.js
│   │   ├── webrtc.js
│   │   └── mission-manager.js
│   ├── missions/
│   │   └── sample-mission.json
│   └── index.html
├── server.js
├── package.json
└── README.md
```

## Usage

1. Connect to the drone using the "Connect" button
2. Start the camera and video stream
3. Load and execute missions from the mission panel
4. Monitor telemetry data in real-time
5. Use emergency controls if needed

## License

MIT License - See LICENSE file for details 