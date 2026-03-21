import React from 'react';
import { useStore } from '../../store/useStore';
import { Activity, Zap, Box, Clock } from 'lucide-react';

export const StatusHeader: React.FC = () => {
  const { molecularData } = useStore();

  if (!molecularData) return null;

  const atomCount = molecularData.atoms.length;
  // Simple formula approximation
  const elements = [...new Set(molecularData.atoms.map(a => a.element))];
  const formula = elements.join('-');
  
  return (
    <div className="absolute top-6 left-6 flex gap-3 z-10">
      <div className="flex items-center gap-2 bg-snap-pill px-4 py-2 rounded-full shadow-soft backdrop-blur-sm bg-opacity-80">
        <div className="w-2 h-2 rounded-full bg-snap-accent animate-pulse" />
        <span className="text-xs font-semibold text-snap-text">Live</span>
      </div>

      <div className="flex items-center gap-2 bg-snap-pill px-4 py-2 rounded-full shadow-soft backdrop-blur-sm bg-opacity-80">
        <Box size={14} className="text-snap-secondary" />
        <span className="text-xs font-medium text-snap-text">{atomCount} Atoms</span>
      </div>

      <div className="flex items-center gap-2 bg-snap-pill px-4 py-2 rounded-full shadow-soft backdrop-blur-sm bg-opacity-80">
        <Zap size={14} className="text-snap-secondary" />
        <span className="text-xs font-medium text-snap-text">{formula}</span>
      </div>

       {molecularData.trajectory && (
         <div className="flex items-center gap-2 bg-snap-pill px-4 py-2 rounded-full shadow-soft backdrop-blur-sm bg-opacity-80">
           <Clock size={14} className="text-snap-secondary" />
           <span className="text-xs font-medium text-snap-text">
             Frame {molecularData.trajectory.currentFrame + 1}
           </span>
         </div>
       )}
    </div>
  );
};
