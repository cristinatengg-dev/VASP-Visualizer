import React from 'react';
import { Sidebar } from './Sidebar';
import { StatusHeader } from '../widgets/StatusHeader';
import { AccountWidget } from '../widgets/AccountWidget';
import { StyleWidget } from '../widgets/StyleWidget';
import { PlayerWidget } from '../widgets/PlayerWidget';
import { ExportWidget } from '../widgets/ExportWidget';
import { Scene3D } from '../../components/Scene3D'; // Assuming relative path
import { AccountDropdown } from '../../components/AccountDropdown'; // We are replacing this but keeping import for reference if needed? No.

export const DashboardLayout: React.FC = () => {
  return (
    <div className="flex w-screen h-screen bg-snap-bg text-snap-text font-sans overflow-hidden">
      {/* Left Rail */}
      <Sidebar />

      {/* Main Grid */}
      <div className="flex-1 p-6 grid grid-cols-12 grid-rows-12 gap-6 h-full">
        
        {/* 3D Viewer Area (Top Left Big) */}
        <div className="col-span-9 row-span-8 relative bg-white rounded-3xl shadow-soft overflow-hidden group">
          {/* Status Pills Overlay */}
          <StatusHeader />
          
          {/* 3D Scene */}
          <div className="absolute inset-4 rounded-2xl overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100">
             <Scene3D />
          </div>

          {/* Label Tag */}
          <div className="absolute bottom-8 left-8 bg-white/80 backdrop-blur px-4 py-2 rounded-full text-xs font-bold shadow-sm">
             Living room
          </div>
        </div>

        {/* Right Panel (Widgets Stack) */}
        <div className="col-span-3 row-span-8 flex flex-col gap-6">
           <AccountWidget />
           <StyleWidget />
           {/* Placeholder for future expansion or filler */}
           <div className="flex-1 bg-white rounded-3xl p-6 shadow-soft opacity-50 flex items-center justify-center border-2 border-dashed border-gray-100">
              <span className="text-xs text-gray-400 font-medium">+ Add Widget</span>
           </div>
        </div>

        {/* Bottom Left (Player) */}
        <div className="col-span-6 row-span-4">
           <PlayerWidget />
        </div>

        {/* Bottom Right (Export) */}
        <div className="col-span-6 row-span-4">
           <ExportWidget />
        </div>

      </div>
    </div>
  );
};
