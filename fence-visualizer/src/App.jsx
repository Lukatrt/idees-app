import React, { useState } from 'react';
import { Map, Layers, Settings, PenTool } from 'lucide-react';
import MapView from './components/MapView';
import Scene3D from './components/Scene3D';

function App() {
  const [viewMode, setViewMode] = useState('2d'); // '2d' or '3d'
  
  // Shared State
  const [points, setPoints] = useState([]); // Array of {lat, lng}
  const [gateSegmentIndex, setGateSegmentIndex] = useState(null); // Index of the segment holding the gate
  const [gateWidth, setGateWidth] = useState(3.0); // meters
  const [pillarHeight, setPillarHeight] = useState(1.6); // meters
  const [fenceHeight, setFenceHeight] = useState(1.5); // meters
  const [gatePositionFraction, setGatePositionFraction] = useState(0.5); // 0.0 to 1.0 along the segment

  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden text-slate-800 font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-white shadow-xl flex flex-col z-[1000] relative border-r border-slate-200">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2 tracking-tight">
            <Layers className="text-blue-600" />
            Configurateur Extérieur
          </h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">Visualisation 2D / 3D</p>
        </div>

        <div className="p-4 border-b border-slate-100">
          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner">
            <button
              onClick={() => setViewMode('2d')}
              className={`flex-1 flex justify-center items-center gap-2 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${viewMode === '2d' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
            >
              <Map size={16} /> Dessin 2D
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`flex-1 flex justify-center items-center gap-2 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${viewMode === '3d' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
            >
              <Layers size={16} /> Rendu 3D
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-8">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
              <PenTool size={16} className="text-slate-400" /> Outils
            </h3>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              Tracez d'abord votre clôture sur la carte 2D en cliquant pour ajouter des poteaux.
            </p>
            {points.length > 0 && (
              <button 
                onClick={() => { setPoints([]); setGateSegmentIndex(null); setGatePositionFraction(0.5); }}
                className="w-full py-2 bg-red-50 text-red-600 rounded text-sm font-medium hover:bg-red-100 transition-colors"
              >
                Effacer le tracé
              </button>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
              <Settings size={16} className="text-slate-400" /> Paramètres
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Portail (Battant Gris)</label>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm text-slate-700 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span>Largeur</span>
                    <span className="font-mono bg-white px-2 py-1 border rounded text-xs">{gateWidth} m</span>
                  </div>
                  <input type="range" min="2" max="5" step="0.1" value={gateWidth} onChange={(e) => setGateWidth(parseFloat(e.target.value))} className="w-full" />
                  
                  {gateSegmentIndex !== null && (
                    <>
                      <div className="flex justify-between items-center mt-2 border-t pt-2 border-slate-200">
                        <span>Position sur clôture</span>
                        <span className="font-mono bg-white px-2 py-1 border rounded text-xs">{Math.round(gatePositionFraction * 100)} %</span>
                      </div>
                      <input type="range" min="0.1" max="0.9" step="0.05" value={gatePositionFraction} onChange={(e) => setGatePositionFraction(parseFloat(e.target.value))} className="w-full" />
                    </>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Clôture (Grillage Rigide)</label>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm text-slate-700 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span>Hauteur</span>
                    <span className="font-mono bg-white px-2 py-1 border rounded text-xs">{fenceHeight} m</span>
                  </div>
                  <input type="range" min="1" max="2.5" step="0.1" value={fenceHeight} onChange={(e) => setFenceHeight(parseFloat(e.target.value))} className="w-full" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Piliers (au portail)</label>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm text-slate-700 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span>Hauteur piliers</span>
                    <span className="font-mono bg-white px-2 py-1 border rounded text-xs">{pillarHeight} m</span>
                  </div>
                  <input type="range" min="1.5" max="2.5" step="0.1" value={pillarHeight} onChange={(e) => setPillarHeight(parseFloat(e.target.value))} className="w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative bg-slate-200">
        {viewMode === '2d' ? (
          <MapView 
            points={points} 
            setPoints={setPoints} 
            gateSegmentIndex={gateSegmentIndex}
            setGateSegmentIndex={setGateSegmentIndex}
            gatePositionFraction={gatePositionFraction}
            gateWidth={gateWidth}
          />
        ) : (
          <Scene3D 
            points={points}
            gateSegmentIndex={gateSegmentIndex}
            gateWidth={gateWidth}
            pillarHeight={pillarHeight}
            fenceHeight={fenceHeight}
            gatePositionFraction={gatePositionFraction}
          />
        )}
      </div>
    </div>
  );
}

export default App;
