import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Box, Share2, Circle, Settings2, BoxSelect } from 'lucide-react';

export const ContextMenu: React.FC = () => {
  const { contextMenu, setContextMenu, updateAtomRenderStyle, selectedAtomIds, stickRadius, setStickRadius } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showStickSettings, setShowStickSettings] = useState(false);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0 });
        setShowStickSettings(false);
      }
    };
    
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [setContextMenu]);

  if (!contextMenu.visible) return null;

  const handleStyleSelect = (style: string) => {
      const targetId = contextMenu.atomId;
      let idsToUpdate = [targetId];
      
      if (targetId && selectedAtomIds.includes(targetId)) {
          idsToUpdate = [...selectedAtomIds];
      } else if (targetId) {
          idsToUpdate = [targetId];
      }
      
      if (idsToUpdate.length > 0 && idsToUpdate[0]) {
           updateAtomRenderStyle(idsToUpdate.filter((id): id is string => !!id), style);
      }
      
      if (style !== 'stick') {
          setContextMenu({ visible: false, x: 0, y: 0 });
          setShowStickSettings(false);
      } else {
          // If selecting stick, show settings but don't close yet? 
          // User might want to adjust radius immediately.
          // Or just close menu.
          // User Requirement: "if choose stick style can choose to adjust bonds radius"
          setShowStickSettings(true);
      }
  };

  const handleClearSelection = () => {
      useStore.getState().setSelectedAtoms([]);
      setContextMenu({ visible: false, x: 0, y: 0 });
  };

  return (
    <div 
      ref={menuRef}
      className="fixed z-50 bg-white rounded-[24px] shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 min-w-[220px] flex flex-col animate-in fade-in zoom-in-95 duration-100 p-2"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
       <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
          Atom Style
       </div>

       {contextMenu.atomId ? (
           <div className="space-y-2 p-1">
            <button onClick={() => handleStyleSelect('vesta')} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-[24px] text-left transition-all group">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                    <Share2 size={14} className="text-gray-500 group-hover:text-[#0A1128]" />
                </div>
                <span>Classic Style</span>
            </button>
            
            <div className="relative group/stick">
                <button onClick={() => handleStyleSelect('stick')} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-[24px] text-left transition-all group">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                            <Box size={14} className="text-gray-500 group-hover:text-[#0A1128]" />
                        </div>
                        <span>Stick Style</span>
                    </div>
                    <Settings2 size={14} className="text-gray-400 opacity-50 group-hover:opacity-100" />
                </button>
                
                {showStickSettings && (
                    <div className="mx-2 mt-1 px-4 py-3 bg-gray-50 rounded-[24px]">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-gray-500 flex justify-between">
                                <span>Bond Radius</span>
                                <span>{stickRadius.toFixed(2)}</span>
                            </label>
                            <input 
                                type="range" 
                                min="0.05" 
                                max="1.0" 
                                step="0.05"
                                value={stickRadius}
                                onChange={(e) => setStickRadius(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0A1128]"
                                onClick={(e) => e.stopPropagation()} 
                            />
                        </div>
                    </div>
                )}
            </div>

            <button onClick={() => handleStyleSelect('toon')} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-[24px] text-left transition-all group">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                    <Circle size={14} className="text-gray-500 group-hover:text-[#0A1128]" />
                </div>
                <span>Toon Style</span>
            </button>
            <button onClick={() => handleStyleSelect('preview')} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-[24px] text-left transition-all group">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                    <Circle size={14} className="text-gray-500 group-hover:text-[#0A1128]" />
                </div>
                <span>Preview Style</span>
            </button>
           </div>
       ) : (
           <button onClick={handleClearSelection} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-[24px] text-left transition-all group">
               <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                   <BoxSelect size={14} className="text-red-500" />
               </div>
               <span>Clear Selection</span>
           </button>
       )}
    </div>
  );
};
