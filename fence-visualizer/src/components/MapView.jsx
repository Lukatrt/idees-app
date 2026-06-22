import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function ClickHandler({ setPoints }) {
  useMapEvents({
    click(e) {
      setPoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    },
  });
  return null;
}

// Auto center on user location if requested or just default
function AutoCenter() {
  const map = useMap();
  useEffect(() => {
    map.locate().on('locationfound', function (e) {
      map.setView(e.latlng, map.getZoom());
    });
  }, [map]);
  return null;
}

export default function MapView({ points, setPoints, gateSegmentIndex, setGateSegmentIndex }) {
  const defaultCenter = [48.8566, 2.3522]; // Paris

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push([points[i], points[i+1]]);
  }

  return (
    <div className="w-full h-full relative">
      <MapContainer center={defaultCenter} zoom={18} className="w-full h-full" maxZoom={20} zoomControl={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
          maxZoom={20}
        />
        <AutoCenter />
        <ClickHandler setPoints={setPoints} />
        
        {segments.map((segment, index) => (
          <Polyline 
            key={index} 
            positions={segment} 
            color={index === gateSegmentIndex ? '#3b82f6' : '#ffffff'} 
            weight={6}
            opacity={0.8}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                setGateSegmentIndex(index);
              }
            }}
            className="cursor-pointer"
          />
        ))}

        {points.map((point, index) => (
          <Marker key={index} position={point} />
        ))}
      </MapContainer>
      <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur p-4 rounded-xl shadow-lg pointer-events-none border border-slate-100">
        <h2 className="text-sm font-bold text-slate-800 mb-2">Mode Dessin</h2>
        <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
          <li>Cliquez sur la carte pour tracer la clôture.</li>
          <li>Cliquez sur un segment tracé pour le définir comme <strong>Portail</strong> <span className="inline-block w-3 h-3 bg-blue-500 rounded-full ml-1 align-middle"></span></li>
        </ul>
      </div>
    </div>
  );
}
