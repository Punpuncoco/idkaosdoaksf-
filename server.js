const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Expo often sends files without extensions, so detect from mimetype
    let ext = path.extname(file.originalname);
    if (!ext) {
      if (file.mimetype && file.mimetype.includes('video')) ext = '.mp4';
      else if (file.mimetype && file.mimetype.includes('image')) ext = '.jpg';
      else ext = '.bin';
    }
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    console.log(`📁 Saving file: ${uniqueName} (${file.mimetype})`);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

let latestDeviceStatus = {
  batteryLevel: null,
  isCharging: null,
  networkState: 'disconnected',
  uptime: null,
  lastUpdated: null,
  location: null
};

let uploadedFiles = [];

// Serve static frontend
const frontendPath = path.join(__dirname, 'frontend/dist');
app.use(express.static(frontendPath));

// API: Discovery/Ping
app.get('/api/ping', (req, res) => {
  res.json({ name: 'phone2-server', status: 'online' });
});

// API: Get latest status
app.get('/api/status', (req, res) => {
  res.json(latestDeviceStatus);
});

// API: List uploaded media
app.get('/api/media', (req, res) => {
  res.json(uploadedFiles);
});

// API: Update status (called by mobile)
app.post('/api/status', (req, res) => {
  const status = req.body;
  latestDeviceStatus = {
    ...latestDeviceStatus,
    ...status,
    lastUpdated: new Date().toISOString()
  };
  
  io.emit('status-update', latestDeviceStatus);
  res.status(200).json({ success: true });
});

// API: Upload Media (called by mobile)
app.post('/api/upload', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  
  const fileData = {
    id: Date.now(),
    type: req.body.type || (req.file.mimetype.startsWith('video') ? 'video' : 'photo'),
    url: `/uploads/${req.file.filename}`,
    timestamp: new Date().toISOString()
  };
  
  uploadedFiles.unshift(fileData); // Add to the beginning
  io.emit('new-media', fileData);
  res.status(200).json({ success: true, url: fileData.url });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('status-update', latestDeviceStatus);
  socket.emit('media-list', uploadedFiles);

  // Command Proxy: Relay commands from Web Dashboard to Mobile Agent
  socket.on('command', (commandData) => {
    // commandData looks like: { target: 'MOBILE', type: 'TAKE_PHOTO', direction: 'front' }
    console.log('Distributing command:', commandData);
    io.emit('mobile-command', commandData);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const axios = require('axios');

// Cloud Ready: Get port and sync key from environment variables
const PORT = process.env.PORT || 3000;
const SYNC_KEY = process.env.SYNC_KEY || 'phone2-sync-c18e8980263c4db4a6b8c141a2563045';

// Root route: Serve frontend or simple health check
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.send('<h1>📡 Phone2 Server is Online!</h1><p>Frontend not found. Please build the dashboard.</p>');
  }
});

app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 ==========================================`);
  console.log(`📡 SERVER IS RUNNING ON PORT: ${PORT}`);
  
  // Use the specific Render URL for this service
  const publicUrl = 'https://my-device-monitor.onrender.com';
  
  try {
    await axios.post(`https://api.keyvalue.xyz/${SYNC_KEY}/serverUrl`, publicUrl);
    console.log(`✨ CLOUD SYNC: Published ${publicUrl} to relay!`);
  } catch (err) {
    console.log('⚠️ Cloud Sync Error:', err.message);
  }
  
  console.log(`==========================================\n`);
  console.log(`✅ Ready to receive telemetry!`);
});
