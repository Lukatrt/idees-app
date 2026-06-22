import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

// Coordinate conversion: rough flat-earth approximation for small distances
function latLngToMeters(point, refPoint) {
  if (!point || !refPoint) return { x: 0, z: 0 };
  const R = 6378137;
  const dLat = (point.lat - refPoint.lat) * Math.PI / 180;
  const dLon = (point.lng - refPoint.lng) * Math.PI / 180;
  const z = -dLat * R; // North is -Z
  const x = dLon * R * Math.cos(refPoint.lat * Math.PI / 180);
  return new THREE.Vector3(x, 0, z);
}

const FENCE_COLOR = '#4a4a4a'; // Gris anthracite
const PILLAR_COLOR = '#e5e7eb'; // Gris clair / enduit
const WOOD_COLOR = '#8b5a2b'; // Bois

function FencePanel({ start, end, height }) {
  const dist = start.distanceTo(end);
  const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  // Angle: we need rotation around Y. 
  // Math.atan2(dx, dz) gives the angle.
  const angle = Math.atan2(end.x - start.x, end.z - start.z);

  return (
    <group position={[center.x, 0, center.z]} rotation={[0, angle, 0]}>
      {/* Poteaux réguliers tous les 2.5m environ */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[0.05, height, dist]} />
        <meshStandardMaterial color={FENCE_COLOR} wireframe={true} wireframeLinewidth={2} transparent opacity={0.6} />
      </mesh>
      {/* Barre supérieure */}
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[0.06, 0.04, dist]} />
        <meshStandardMaterial color={FENCE_COLOR} />
      </mesh>
      <mesh position={[0, height/2, 0]}>
        <boxGeometry args={[0.02, 0.02, dist]} />
        <meshStandardMaterial color={FENCE_COLOR} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.06, 0.04, dist]} />
        <meshStandardMaterial color={FENCE_COLOR} />
      </mesh>
    </group>
  );
}

function Gate({ center, angle, width, height, pillarHeight }) {
  const pWidth = 0.4; // Pillar thickness

  return (
    <group position={[center.x, 0, center.z]} rotation={[0, angle, 0]}>
      {/* Left Pillar */}
      <mesh position={[0, pillarHeight / 2, -width / 2 - pWidth / 2]}>
        <boxGeometry args={[pWidth, pillarHeight, pWidth]} />
        <meshStandardMaterial color={PILLAR_COLOR} roughness={0.9} />
      </mesh>
      
      {/* Right Pillar */}
      <mesh position={[0, pillarHeight / 2, width / 2 + pWidth / 2]}>
        <boxGeometry args={[pWidth, pillarHeight, pWidth]} />
        <meshStandardMaterial color={PILLAR_COLOR} roughness={0.9} />
      </mesh>

      {/* Battant Gauche */}
      <group position={[0, 0, -width / 2]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh position={[0, height / 2, width / 4]}>
          <boxGeometry args={[0.05, height, width / 2 - 0.02]} />
          <meshStandardMaterial color={FENCE_COLOR} />
        </mesh>
      </group>

      {/* Battant Droit */}
      <group position={[0, 0, width / 2]} rotation={[0, Math.PI / 4, 0]}>
        <mesh position={[0, height / 2, -width / 4]}>
          <boxGeometry args={[0.05, height, width / 2 - 0.02]} />
          <meshStandardMaterial color={FENCE_COLOR} />
        </mesh>
      </group>
    </group>
  );
}

function World({ points, gateSegmentIndex, gateWidth, pillarHeight, fenceHeight }) {
  const refPoint = points[0];
  
  const segments = useMemo(() => {
    if (!points || points.length < 2) return [];
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = latLngToMeters(points[i], refPoint);
      const p2 = latLngToMeters(points[i+1], refPoint);
      segs.push({ p1, p2, isGate: i === gateSegmentIndex });
    }
    return segs;
  }, [points, gateSegmentIndex, refPoint]);

  return (
    <group>
      {/* Sol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#3b7a57" roughness={1} />
      </mesh>

      {segments.map((seg, i) => {
        if (seg.isGate) {
          const center = new THREE.Vector3().addVectors(seg.p1, seg.p2).multiplyScalar(0.5);
          const angle = Math.atan2(seg.p2.x - seg.p1.x, seg.p2.z - seg.p1.z);
          const dist = seg.p1.distanceTo(seg.p2);
          
          // If the segment is longer than the gate, we need fence on the sides
          const gateTotalWidth = gateWidth + 0.8; // width + 2 pillars (0.4 each)
          
          return (
            <group key={i}>
              <Gate 
                center={center} 
                angle={angle} 
                width={gateWidth} 
                height={fenceHeight} 
                pillarHeight={pillarHeight} 
              />
              {/* Optional: Add fence to fill the gap if segment is long enough */}
              {dist > gateTotalWidth && (
                 // Just a simple visual indicator for now, math for exact gap filling is slightly complex for this snippet
                 null
              )}
            </group>
          );
        } else {
          return <FencePanel key={i} start={seg.p1} end={seg.p2} height={fenceHeight} />;
        }
      })}
    </group>
  );
}

export default function Scene3D({ points, gateSegmentIndex, gateWidth, pillarHeight, fenceHeight }) {
  if (!points || points.length < 2) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-300">
        <p className="text-lg mb-2">Aucun tracé défini.</p>
        <p className="text-sm">Retournez en Vue 2D pour dessiner votre clôture.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-sky-100">
      <Canvas shadows camera={{ position: [5, 5, 10], fov: 50 }}>
        <Sky sunPosition={[100, 20, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight castShadow position={[10, 10, 5]} intensity={1.5} shadow-mapSize={[1024, 1024]} />
        
        <World 
          points={points} 
          gateSegmentIndex={gateSegmentIndex} 
          gateWidth={gateWidth}
          pillarHeight={pillarHeight}
          fenceHeight={fenceHeight}
        />
        
        <ContactShadows resolution={1024} scale={50} blur={2} opacity={0.5} far={10} color="#000000" />
        <OrbitControls makeDefault />
      </Canvas>
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="bg-white/90 backdrop-blur p-4 rounded-xl shadow-lg border border-slate-100">
           <h2 className="text-sm font-bold text-slate-800">Vue 3D</h2>
           <p className="text-xs text-slate-600 mt-1">Utilisez la souris pour tourner et zoomer.</p>
        </div>
      </div>
    </div>
  );
}
