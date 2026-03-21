import React from 'react';
import { useStore } from '../../store/useStore';
import { Box, Share2, Circle } from 'lucide-react';
import { clsx } from 'clsx';

export const StyleWidget: React.FC = () => {
  const { materialStyle, setMaterialStyle } = useStore();

  const styles = [
    { id: 'vesta', label: 'Classic', icon: Share2 }, // Ball & Stick
    { id: 'stick', label: 'Stick', icon: Box },      // Stick
    { id: 'toon', label: 'Toon', icon: Circle },     // CPK/Toonish
  ];

  return (
    <div className="bg-white rounded-3xl p-6 shadow-soft flex-1">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-snap-text">Render Style</h3>
        <span className="text-xs text-snap-secondary bg-snap-pill px-2 py-1 rounded-full">3 Modes</span>
      </div>

      <div className="flex flex-col gap-3">
        {styles.map((style) => {
          const isActive = materialStyle === style.id;
          const Icon = style.icon;

          return (
            <button
              key={style.id}
              onClick={() => setMaterialStyle(style.id as any)}
              className={clsx(
                "flex items-center justify-between p-4 rounded-2xl transition-all duration-200",
                isActive ? "bg-snap-bg shadow-inner-soft" : "hover:bg-snap-pill"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  isActive ? "bg-white shadow-sm" : "bg-transparent"
                )}>
                  <Icon size={16} className={isActive ? "text-snap-text" : "text-snap-secondary"} />
                </div>
                <span className={clsx("text-sm font-medium", isActive ? "text-snap-text" : "text-snap-secondary")}>
                  {style.label}
                </span>
              </div>
              
              {isActive && (
                <div className="w-2 h-2 rounded-full bg-snap-text" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
