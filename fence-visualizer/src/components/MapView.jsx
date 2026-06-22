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

export default function MapView({ points, setPoints, gateSegmentIndex, setGateSegmentIndex, gatePositionFraction, gateWidth }) {
  const defaultCenter = [43.7916675, 2.1124263]; // 14 rue des violettes, Laboutarié

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push([points[i], points[i+1]]);
  }

  return (
    <div className="w-full h-full relative">
      <MapContainer center={defaultCenter} zoom={19} className="w-full h-full" maxZoom={20} zoomControl={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
          maxZoom={20}
        />
        <ClickHandler setPoints={setPoints} />
        
        {segments.map((segment, index) => {
          const isGateSeg = index === gateSegmentIndex;
          if (isGateSeg) {
            const p1 = segment[0];
            const p2 = segment[1];
            
            // Calculate distance in meters between p1 and p2 (approximate)
            const R = 6378137;
            const dLat = (p2.lat - p1.lat) * Math.PI / 180;
            const dLon = (p2.lng - p1.lng) * Math.PI / 180;
            const dy = dLat * R;
            const dx = dLon * R * Math.cos(p1.lat * Math.PI / 180);
            const dist = Math.hypot(dx, dy);
            
            const gateSpan = gateWidth + 0.8;
            
            if (dist > gateSpan) {
              // Interpolate gate center
              const cLat = p1.lat + (p2.lat - p1.lat) * gatePositionFraction;
              const cLng = p1.lng + (p2.lng - p1.lng) * gatePositionFraction;
              
              // Direction vector
              const len = Math.hypot(dx, dy);
              const dirY = dy / len;
              const dirX = dx / len;
              
              // Half gate span in degrees
              const halfGateSpan = gateSpan / 2;
              const halfGateSpanLat = (halfGateSpan * dirY) / R * 180 / Math.PI;
              const halfGateSpanLng = (halfGateSpan * dirX) / (R * Math.cos(p1.lat * Math.PI / 180)) * 180 / Math.PI;
              
              const leftPillar = { lat: cLat - halfGateSpanLat, lng: cLng - halfGateSpanLng };
              const rightPillar = { lat: cLat + halfGateSpanLat, lng: cLng + halfGateSpanLng };
              
              return (
                <React.Fragment key={index}>
                  {/* Left fence segment */}
                  <Polyline 
                    positions={[p1, leftPillar]} 
                    color="#ffffff" 
                    weight={6} 
                    opacity={0.8}
                    eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); setGateSegmentIndex(index); } }}
                    className="cursor-pointer"
                  />
                  {/* Gate segment */}
                  <Polyline 
                    positions={[leftPillar, rightPillar]} 
                    color="#3b82f6" 
                    weight={8} 
                    opacity={0.9}
                    eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); setGateSegmentIndex(index); } }}
                    className="cursor-pointer"
                  />
                  {/* Right fence segment */}
                  <Polyline 
                    positions={[rightPillar, p2]} 
                    color="#ffffff" 
                    weight={6} 
                    opacity={0.8}
                    eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); setGateSegmentIndex(index); } }}
                    className="cursor-pointer"
                  />
                </React.Fragment>
              );
            }
          }
          
          return (
            <Polyline 
              key={index} 
              positions={segment} 
              color={isGateSeg ? '#3b82f6' : '#ffffff'} 
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
          );
        })}

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
