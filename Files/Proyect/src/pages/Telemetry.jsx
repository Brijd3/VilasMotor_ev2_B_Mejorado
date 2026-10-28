import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useFleet } from '../context/FleetContext';
import { calculateStatus } from '../data/mockData';

// Mock coordinates for faenas/sucursales
const locations = {
  'Iquique': [-20.2133, -70.1503],
  'Arica': [-18.4783, -70.3126],
  'Collahuasi': [-20.9767, -68.6186],
  'Cerro Colorado': [-20.0536, -69.2558],
  'Quebrada Blanca': [-21.0028, -68.8042],
  'Taller Central': [-18.4800, -70.3000]
};

const STATUS_TEXT = { verde: 'Operativo', amarillo: 'Preventivo', rojo: 'Crítico' };

// Pines propios (sin imágenes externas): funcionan sin internet y reflejan el estado del equipo.
const pinIcons = Object.fromEntries(['verde', 'amarillo', 'rojo'].map(status => [
  status,
  L.divIcon({
    className: 'map-pin-wrapper',
    html: `<span class="map-pin map-pin-${status}"></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30]
  })
]));

const Telemetry = () => {
  const { fleet } = useFleet();
  // Center of Tarapacá / Arica region
  const center = [-19.5, -69.5];

  // Equipos que comparten ubicación se separan levemente para que ningún pin quede tapado.
  const markers = useMemo(() => {
    const seen = new Map();
    return fleet.flatMap((equipo) => {
      const base = locations[equipo.faena] || locations[equipo.sucursal];
      if (!base) return [];
      const key = base.join(',');
      const index = seen.get(key) || 0;
      seen.set(key, index + 1);
      const angle = index * 2.4;
      const radius = index === 0 ? 0 : 0.03 + 0.012 * Math.floor(index / 6);
      const position = [base[0] + Math.sin(angle) * radius, base[1] + Math.cos(angle) * radius];
      return [{ equipo, position, estado: calculateStatus(equipo.datosActuales.hrsKm, equipo.proxMantenimiento.hrsKm) }];
    });
  }, [fleet]);

  return (
    <div className="animate-fade-in telemetry-page">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>Mapa de referencia por faena / sucursal</h1>
        <p className="subtitle">Coordenadas geográficas referenciales para visualización; no corresponden a posiciones GPS de los equipos.</p>
      </div>

      <div className="glass-panel telemetry-map-panel">
        <MapContainer
          center={center}
          zoom={7}
          style={{ height: '100%', width: '100%', borderRadius: '8px' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          {markers.map(({ equipo, position, estado }) => (
            <Marker key={equipo.id} position={position} icon={pinIcons[estado] || pinIcons.verde} title={`${equipo.nInterno} · ${STATUS_TEXT[estado]}`}>
              <Popup className="custom-popup">
                <div style={{ color: '#333' }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '1rem', color: '#0E2F3E' }}>{equipo.nInterno}</h3>
                  <div style={{ fontSize: '0.875rem' }}><strong>Equipo:</strong> {equipo.marca} {equipo.modelo}</div>
                  <div style={{ fontSize: '0.875rem' }}><strong>Faena declarada:</strong> {equipo.faena}</div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>Pin de referencia; no es ubicación en tiempo real.</div>
                  <div style={{ fontSize: '0.875rem' }}><strong>Estado:</strong>
                    <span className={`status-badge ${estado}`} style={{ marginLeft: '6px' }}>{STATUS_TEXT[estado]}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default Telemetry;
