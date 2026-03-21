import React from 'react';
import { useStore } from '../store/useStore';

export const SelectionOverlay: React.FC = () => {
  const { selectionRect } = useStore();

  if (!selectionRect) return null;

  return (
    <div 
      className="transition-opacity duration-200 ease-out"
      style={{
        position: 'fixed',
        left: selectionRect.left,
        top: selectionRect.top,
        width: selectionRect.width,
        height: selectionRect.height,
        border: '1px solid rgba(100, 150, 255, 0.8)',
        backgroundColor: 'rgba(100, 150, 255, 0.2)',
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: 1
      }}
    />
  );
};
