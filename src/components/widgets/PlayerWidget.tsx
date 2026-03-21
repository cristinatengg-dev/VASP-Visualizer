import React from 'react';
import { useStore } from '../../store/useStore';
import { Play, Pause, SkipBack, SkipForward, Clock, Activity } from 'lucide-react';
import { clsx } from 'clsx';

export const PlayerWidget: React.FC = () => {
  const { molecularData, toggleTrajectoryPlay, setTrajectoryFrame } = useStore();
  const traj = molecularData?.trajectory;

  if (!traj) {
    return (
       <div className="bg-white rounded-3xl p-6 shadow-soft h-full flex flex-col justify-center items-center text-center opacity-50">
           <Activity size={32} className="text-snap-secondary mb-2" />
           <p className="text-sm font-medium text-snap-secondary">No Trajectory Loaded</p>
           <p className="text-xs text-gray-400 mt-1">Upload XDATCAR to play</p>
       </div>
    );
  }

  const progress = (traj.currentFrame / (traj.totalFrames - 1)) * 100;

  return (
    <div className="bg-white rounded-3xl p-6 shadow-soft h-full flex flex-col justify-between">
      <div className="flex justify-between items-start">
        <div>
           <h3 className="font-semibold text-snap-text">Trajectory</h3>
           <p className="text-xs text-snap-secondary">XDATCAR Simulation</p>
        </div>
        <div className="bg-snap-pill px-2 py-1 rounded-full text-[10px] font-bold text-snap-secondary uppercase tracking-wider">
           Auto-Play
        </div>
      </div>

      <div className="flex items-center justify-center my-4 relative">
         {/* Circular Progress (Simplified as just a large ring or center UI) */}
         <div className="w-32 h-32 rounded-full border-4 border-snap-pill flex items-center justify-center relative">
            <svg className="absolute inset-0 transform -rotate-90 w-full h-full p-0.5">
               <circle 
                  cx="62" cy="62" r="58" 
                  stroke="currentColor" 
                  strokeWidth="4" 
                  fill="transparent" 
                  className="text-snap-pill"
               />
               <circle 
                  cx="62" cy="62" r="58" 
                  stroke="currentColor" 
                  strokeWidth="4" 
                  fill="transparent" 
                  strokeDasharray={365}
                  strokeDashoffset={365 - (365 * progress) / 100}
                  className="text-snap-text transition-all duration-300 ease-linear"
               />
            </svg>
            <div className="text-center">
                <span className="text-2xl font-bold text-snap-text">{Math.round(progress)}%</span>
                <p className="text-[10px] text-snap-secondary uppercase">Progress</p>
            </div>
         </div>
      </div>

      <div className="flex items-center justify-between gap-4">
         <div className="flex flex-col">
             <span className="text-xs text-snap-secondary flex items-center gap-1">
                <Clock size={10} /> Frame
             </span>
             <span className="text-sm font-bold text-snap-text">
                {traj.currentFrame + 1} <span className="text-gray-400 text-xs font-normal">/ {traj.totalFrames}</span>
             </span>
         </div>
         
         <div className="flex items-center gap-2">
             <button 
                onClick={() => setTrajectoryFrame(Math.max(0, traj.currentFrame - 10))}
                className="w-10 h-10 rounded-full bg-snap-pill flex items-center justify-center text-snap-secondary hover:bg-snap-nav"
             >
                <SkipBack size={16} />
             </button>
             
             <button 
                onClick={() => toggleTrajectoryPlay()}
                className="w-14 h-14 rounded-full bg-snap-text flex items-center justify-center text-white shadow-lg hover:opacity-90 transition-opacity"
             >
                {traj.isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
             </button>

             <button 
                onClick={() => setTrajectoryFrame(Math.min(traj.totalFrames - 1, traj.currentFrame + 10))}
                className="w-10 h-10 rounded-full bg-snap-pill flex items-center justify-center text-snap-secondary hover:bg-snap-nav"
             >
                <SkipForward size={16} />
             </button>
         </div>
      </div>
    </div>
  );
};
