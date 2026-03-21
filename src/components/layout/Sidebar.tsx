import React, { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { parseVASPFile } from '../../utils/fileParser';
import { Grid, Sliders, FolderOpen, PlayCircle, User } from 'lucide-react';
import { clsx } from 'clsx';

export const Sidebar: React.FC = () => {
  const { 
    showUnitCell, setShowUnitCell,
    isEditMode, setIsEditMode,
    setUploadedFile, setMolecularData, setUploadedFiles, setCurrentFileIndex
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const data = await parseVASPFile(file);
        setUploadedFile(file);
        setMolecularData(data);
        setUploadedFiles([file]);
        setCurrentFileIndex(0);
      } catch (error) {
        console.error("Error parsing file:", error);
      }
    }
  };

  const NavButton = ({ icon: Icon, active, onClick, label }: any) => (
    <button
      onClick={onClick}
      className={clsx(
        "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200",
        active ? "bg-white shadow-sm text-snap-text" : "text-snap-secondary hover:bg-white/50"
      )}
      title={label}
    >
      <Icon strokeWidth={1.5} size={20} />
    </button>
  );

  return (
    <div className="w-20 h-full bg-snap-nav flex flex-col items-center py-8 gap-8 border-r border-white/50 z-20">
      {/* Logo */}
      <div className="w-10 h-10 bg-snap-text rounded-xl flex items-center justify-center mb-4">
        <span className="text-white font-bold text-lg tracking-tighter">SS</span>
      </div>

      <div className="flex flex-col gap-6">
        <NavButton 
          icon={FolderOpen} 
          label="Open File" 
          onClick={() => fileInputRef.current?.click()} 
        />
        
        <NavButton 
          icon={Grid} 
          active={showUnitCell} 
          onClick={() => setShowUnitCell(!showUnitCell)} 
          label="Toggle Unit Cell"
        />

        <NavButton 
          icon={Sliders} 
          active={isEditMode} 
          onClick={() => setIsEditMode(!isEditMode)} 
          label="Edit Mode"
        />
      </div>

      <div className="mt-auto flex flex-col gap-6">
        <NavButton icon={User} label="Profile" />
        <div className="w-8 h-8 rounded-full bg-gray-300 overflow-hidden">
             <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=SnapSci" alt="User" />
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".vasp,POSCAR,CONTCAR"
      />
    </div>
  );
};
