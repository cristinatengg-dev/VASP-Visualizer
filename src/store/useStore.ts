import { create } from 'zustand';
import * as THREE from 'three';
import { MolecularStructure, Atom } from '../types';
import { VolumetricData } from '../utils/volumetricParser';
import { getAtomProperties } from '../utils/atomData';
import { API_BASE_URL } from '../config';



// --- 新增：瞬态位置缓存 (不触发 React 更新，专治拖拽卡顿) ---
export const tempAtomPositions = new Map<string, {x: number, y: number, z: number}>();

export const getTempAtomPosition = (id: string) => tempAtomPositions.get(id);

export const updateTempAtomPositionFast = (id: string, pos: {x: number, y: number, z: number}) => {
    tempAtomPositions.set(id, pos);
};

export const resetTempAtomPositions = () => {
    tempAtomPositions.clear();
};

// Optimized deduplication using spatial hashing (O(N))
const deduplicateAtoms = (atoms: Atom[], threshold = 0.001): Atom[] => {
    // If system is small, use naive check (more accurate for edge cases)
    if (atoms.length < 1000) {
        const uniqueAtoms: Atom[] = [];
        for (const atom of atoms) {
            const isDuplicate = uniqueAtoms.some(u => 
                Math.abs(u.position.x - atom.position.x) < threshold &&
                Math.abs(u.position.y - atom.position.y) < threshold &&
                Math.abs(u.position.z - atom.position.z) < threshold
            );
            if (!isDuplicate) {
                uniqueAtoms.push(atom);
            }
        }
        return uniqueAtoms;
    }

    // Large system: Use Spatial Map
    // Key: quantized coordinates
    const map = new Map<string, Atom>();
    // Inverse threshold for quantization
    const scale = 1 / threshold; 
    
    // For VASP/DFT data, atoms are usually grid-aligned or well-separated.
    // Simple quantization is usually enough to detect EXACT duplicates from supercell generation.
    // If we need to merge atoms that are *slightly* off, we might need to check neighbors,
    // but typically "duplicate atoms" in this context means "stacked atoms at same fractional coord".
    
    // Using a slightly coarser grid to catch floats
    const quantize = (v: number) => Math.round(v * 1000); 

    for (const atom of atoms) {
        const k = `${quantize(atom.position.x)}_${quantize(atom.position.y)}_${quantize(atom.position.z)}`;
        if (!map.has(k)) {
            map.set(k, atom);
        }
    }
    
    return Array.from(map.values());
};

interface StyleConfig {
  atomColorsRaw: string;
  atomRadiiRaw: string;
  bondDistancesRaw: string;
  customColors: Record<string, string>;
  customRadii: Record<string, number>;
  bondRules: Array<{ atomA: string, atomB: string, threshold: number }>;
  bondTolerance: number; // VESTA-style tolerance (Å), default 0.4
  usePBC: boolean;       // Use periodic boundary conditions for bond detection
}

export interface GlobalElementSettings {
  [element: string]: { color: string; radius: number };
}

export interface User {
  id: string;
  email: string;
  tier: 'trial' | 'personal' | 'academic' | 'enterprise';
  trial_img_left: number;
  trial_vid_left: number;
  prepaid_img?: number;
  prepaid_vid?: number;
  used_img: number;
  used_vid: number;
  associated_ips: string[];
}

// Helper to enforce SVIP for specific user
const enforceSvip = (user: User | null): User | null => {
    return user;
};

interface FileSnapshot {
  cameraView: 'default' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' | 'front-left' | 'front-right';
  exportScale: number;
  showUnitCell: boolean;
  showBonds: boolean;
  tidySurface: boolean;
  materialStyle: 'preview' | 'publication' | 'matte' | 'metallic' | 'glass' | 'toon' | 'vesta' | 'stick';
  stickRadius: number;
  materialParams: AppState['materialParams'];
  lightSettings: AppState['lightSettings'];
  styleConfig: StyleConfig;
  selectedAtomIds: string[];
  supercellParams: { x: number, y: number, z: number };
  // Camera Position and Target for precise restoration
  cameraPosition?: { x: number, y: number, z: number };
  cameraTarget?: { x: number, y: number, z: number };
  // Store geometric data (modified atoms)
  modifiedAtoms?: Atom[];
  isosurfaceOpacity: number;
}

interface AppState {
  // Snapshot System
  fileSnapshots: Record<string, FileSnapshot>;
  saveSnapshot: (fileId: string, cameraState?: { position: THREE.Vector3, target: THREE.Vector3 }) => void;
  restoreSnapshot: (fileId: string) => FileSnapshot | null;
  clearSnapshot: (fileId: string) => void;

  undoStack: Array<{ molecularData: MolecularStructure; selectedAtomIds: string[] }>;
  pushUndo: () => void;
  undo: () => void;
  
  // User System
  user: User | null;
  setUser: (user: User | null) => void;
  login: (email: string, code: string) => Promise<User | null>;
  logout: () => void;
  checkExport: (type: 'img' | 'vid') => Promise<{ cost: number, status: string }>;
  deductExport: (type: 'img' | 'vid') => Promise<boolean>;
  payBatch: (count: number, amount: number) => Promise<boolean>;
  subscribe: (tier: string) => Promise<void>;
  redeemCode: (code: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
  createPayment: (type: string, tier?: string, count?: number) => Promise<{ success: boolean, orderId?: string, qrCode?: string, amount?: number, free?: boolean, mock?: boolean } | null>;
  pollPayment: (orderId: string) => Promise<boolean>;
  
  // File & Data
  uploadedFile: File | null;
  uploadedFiles: File[];
  currentFileIndex: number;
  molecularData: MolecularStructure | null;
  
  // View Settings
  cameraView: 'default' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' | 'front-left' | 'front-right';
  rotationTrigger: { angle: number, id: number } | null;
  triggerRotation: (angle: number) => void;
  currentCameraState: { position: {x:number, y:number, z:number}, target: {x:number, y:number, z:number} } | null;
  exportScale: number;
  showUnitCell: boolean;
  showBonds: boolean;
  tidySurface: boolean;
  
  // Style Settings
  materialStyle: 'preview' | 'publication' | 'matte' | 'metallic' | 'glass' | 'toon' | 'vesta' | 'stick';
  isPerspective: boolean;
  setIsPerspective: (isPers: boolean) => void;
  stickRadius: number;
  materialParams: {
    metalness: number;
    roughness: number;
    transmission: number;
    thickness: number;
    ior: number;
    toonSteps?: number;
  };
  lightSettings: {
    direction: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom';
    intensity: number;
  };
  styleConfig: StyleConfig;
  globalElementSettings: GlobalElementSettings;
  
  // Interaction & State
  selectedAtomIds: string[];
  hoveredAtom: { id: string, element: string, index: number } | null;
  isEditMode: boolean;
  isBoxSelectionMode: boolean;
  isDraggingAtom: boolean;
  isBoxSelecting: boolean;
  contextMenu: { visible: boolean, x: number, y: number, atomId?: string };
  selectionRect: { left: number, top: number, width: number, height: number } | null;
  selectionMessage: string;
  supercellParams: { x: number, y: number, z: number };
  
  // Measurement Info (bond length / angle)
  measurementInfo: {
    type: 'bond' | 'angle' | 'bond-click' | null;
    value: number | null;   // Å for bond, degrees for angle
    labelA?: string;
    labelB?: string;
    labelC?: string;
  } | null;
  setMeasurementInfo: (info: AppState['measurementInfo']) => void;
  
  // Export State
  triggerSquareExport: boolean;
  triggerBatchExport: boolean;
  isBatchExporting: boolean;
  batchProgress: string;
  isParsing: boolean;
  setIsParsing: (isParsing: boolean) => void;
  triggerVideoExport: boolean;
  videoExportFPS: number;
  videoExportMode: 'local' | 'cloud';
  videoExportStep: number;
  isVideoExporting: boolean;
  videoExportProgress: number;

  // Volumetric Data
  volumetricData: VolumetricData | null;
  isosurfaceMeshPos: { positions: Float32Array; normals: Float32Array; indices: Uint32Array } | null;
  isosurfaceMeshNeg: { positions: Float32Array; normals: Float32Array; indices: Uint32Array } | null;
  isosurfaceMeshReady: boolean;
  isosurfaceLevel: number;
  isosurfaceColorPos: string;
  isosurfaceColorNeg: string;
  isosurfaceOpacity: number;

  setVolumetricData: (data: VolumetricData | null) => void;
  setIsosurfaceMeshes: (meshes: { pos: AppState['isosurfaceMeshPos']; neg: AppState['isosurfaceMeshNeg'] }) => void;
  setIsosurfaceMeshReady: (ready: boolean) => void;
  setIsosurfaceLevel: (level: number) => void;
  setIsosurfaceColorPos: (color: string) => void;
  setIsosurfaceColorNeg: (color: string) => void;
  setIsosurfaceOpacity: (opacity: number) => void;

  // Actions
  setUploadedFile: (file: File | null) => void;
  setUploadedFiles: (files: File[]) => void;
  setCurrentFileIndex: (index: number) => void;
  setMolecularData: (data: MolecularStructure | null) => void;
  setCameraView: (view: 'default' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' | 'front-left' | 'front-right') => void;
  setCurrentCameraState: (state: { position: {x:number, y:number, z:number}, target: {x:number, y:number, z:number} } | null) => void;
  setExportScale: (scale: number) => void;
  setShowUnitCell: (show: boolean) => void;
  setShowBonds: (show: boolean) => void;
  setTidySurface: (tidy: boolean) => void;
  setMaterialStyle: (style: 'preview' | 'publication' | 'matte' | 'metallic' | 'glass' | 'toon' | 'vesta' | 'stick') => void;
  setStickRadius: (radius: number) => void;
  setMaterialParams: (params: Partial<AppState['materialParams']>) => void;
  setLightSettings: (settings: Partial<AppState['lightSettings']>) => void;
  
  setTriggerSquareExport: (trigger: boolean) => void;
  setTriggerBatchExport: (trigger: boolean) => void;
  setIsBatchExporting: (exporting: boolean) => void;
  setBatchProgress: (progress: string) => void;
  setTriggerVideoExport: (trigger: boolean) => void;
  setVideoExportFPS: (fps: number) => void;
  setVideoExportMode: (mode: 'local' | 'cloud') => void;
  setVideoExportStep: (step: number) => void;
  setIsVideoExporting: (exporting: boolean) => void;
  setVideoExportProgress: (progress: number) => void;
  
  setIsEditMode: (isEdit: boolean) => void;
  setIsBoxSelectionMode: (isBox: boolean) => void;
  setIsDraggingAtom: (isDragging: boolean) => void;
  setIsBoxSelecting: (isSelecting: boolean) => void;
  setContextMenu: (menu: { visible: boolean, x: number, y: number, atomId?: string }) => void;
  setSelectionRect: (rect: { left: number, top: number, width: number, height: number } | null) => void;
  setSelectionMessage: (msg: string) => void;
  setSupercellParams: (params: { x: number, y: number, z: number }) => void;
  
  generateSupercell: (nx: number, ny: number, nz: number) => void;
  updateAtomPosition: (atomId: string, newPos: {x: number, y: number, z: number}) => void;
  resetAtomPositions: () => void;
  setTrajectoryFrame: (frame: number) => void;
  toggleTrajectoryPlay: (isPlaying?: boolean) => void;
  
  toggleSelectedAtomId: (id: string, multiSelect: boolean) => void;
  setSelectedAtoms: (ids: string[]) => void;
  clearSelection: () => void;
  setHoveredAtom: (atom: { id: string, element: string, index: number } | null) => void;
  updateAtomElement: (atomIndices: number[], newElement: string) => void;
  updateAtomRenderStyle: (atomIds: string[], style: string) => void;
  deleteSelectedAtoms: () => void;
  applyStyleConfig: (atomColors: string, atomRadii: string, bondDistances: string, usePBCOverride?: boolean) => void;
  updateElementColor: (element: string, color: string) => void;
  updateElementRadius: (element: string, radius: number) => void;
}

export const useStore = create<AppState>((set, get) => ({
  fileSnapshots: {},
  undoStack: [],
  
  saveSnapshot: (fileId, cameraState) => {
    const state = get();
    // Deep copy atoms to ensure we capture the exact state at this moment
    const atomsToSave = state.molecularData?.atoms ? JSON.parse(JSON.stringify(state.molecularData.atoms)) : undefined;
    
    console.log(`[Store] Saving snapshot for ${fileId}`, { 
        hasMolecularData: !!state.molecularData,
        atomsCount: atomsToSave?.length,
        firstAtom: atomsToSave?.[0]
    });
    
    // Deep copy styleConfig to prevent reference mutations
    const styleConfigCopy = JSON.parse(JSON.stringify(state.styleConfig));
    
    const snapshot: FileSnapshot = {
      cameraView: state.cameraView,
      exportScale: state.exportScale,
      showUnitCell: state.showUnitCell,
      showBonds: state.showBonds,
      tidySurface: state.tidySurface,
      materialStyle: state.materialStyle,
      stickRadius: state.stickRadius,
      materialParams: { ...state.materialParams },
      lightSettings: { ...state.lightSettings },
      styleConfig: styleConfigCopy,
      selectedAtomIds: [...state.selectedAtomIds],
      supercellParams: { ...state.supercellParams },
      cameraPosition: cameraState?.position ? { x: cameraState.position.x, y: cameraState.position.y, z: cameraState.position.z } : undefined,
      cameraTarget: cameraState?.target ? { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z } : undefined,
      modifiedAtoms: atomsToSave, // Save deep copied atoms
      isosurfaceOpacity: state.isosurfaceOpacity
    };
    
    set((prev) => ({
      fileSnapshots: { ...prev.fileSnapshots, [fileId]: snapshot }
    }));
  },
  
  restoreSnapshot: (fileId) => {
    const snapshot = get().fileSnapshots[fileId];
    if (!snapshot) {
        console.warn(`[Store] Snapshot not found for ${fileId}`);
        return null;
    }
    
    console.log(`[Store] Restoring snapshot for ${fileId}`, {
        hasModifiedAtoms: !!snapshot.modifiedAtoms,
        modifiedAtomsCount: snapshot.modifiedAtoms?.length,
        firstAtom: snapshot.modifiedAtoms?.[0]
    });
    
    set((state) => {
        // Construct new molecular data if atoms exist in snapshot
        let newMolecularData = state.molecularData;
        if (snapshot.modifiedAtoms && state.molecularData) {
            newMolecularData = {
                ...state.molecularData,
                atoms: JSON.parse(JSON.stringify(snapshot.modifiedAtoms)) // Deep copy on restore too
            };
        }

        return {
          //cameraView: snapshot.cameraView,
          //currentCameraState: snapshot.cameraPosition && snapshot.cameraTarget ? {
          //    position: snapshot.cameraPosition,
          //   target: snapshot.cameraTarget
          //} : null,
          exportScale: snapshot.exportScale,
          showUnitCell: snapshot.showUnitCell,
          showBonds: snapshot.showBonds,
          tidySurface: snapshot.tidySurface,
          materialStyle: snapshot.materialStyle,
          stickRadius: snapshot.stickRadius,
          materialParams: { ...snapshot.materialParams },
          lightSettings: { ...snapshot.lightSettings },
          styleConfig: snapshot.styleConfig,
          selectedAtomIds: [...snapshot.selectedAtomIds],
          supercellParams: { ...snapshot.supercellParams },
          isosurfaceOpacity: snapshot.isosurfaceOpacity,
          molecularData: newMolecularData
        };
    });
    
    return snapshot;
  },

  clearSnapshot: (fileId) => {
    set((state) => {
      if (!state.fileSnapshots[fileId]) return {};
      const next = { ...state.fileSnapshots };
      delete next[fileId];
      return { fileSnapshots: next };
    });
  },

  pushUndo: () => {
    const state = get();
    if (!state.molecularData) return;
    const cloned = JSON.parse(JSON.stringify(state.molecularData)) as MolecularStructure;
    set((prev) => {
      const next = [...prev.undoStack, { molecularData: cloned, selectedAtomIds: [...prev.selectedAtomIds] }];
      if (next.length > 50) next.splice(0, next.length - 50);
      return { undoStack: next };
    });
  },

  undo: () => {
    set((state) => {
      if (state.undoStack.length === 0) return {};
      const next = [...state.undoStack];
      const last = next.pop();
      if (!last) return {};
      return {
        undoStack: next,
        molecularData: last.molecularData,
        selectedAtomIds: last.selectedAtomIds
      };
    });
  },

  user: null,
  setUser: (user) => set({ user: enforceSvip(user) }),
  
  refreshUser: async () => {
    const userId = localStorage.getItem('vasp_user_id');
    const token = localStorage.getItem('vasp_token');
    if (!userId || !token) return;
    try {
        const res = await fetch(`${API_BASE_URL}/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        // 修改后：这里必须加上 enforceSvip
        if (data.success) set({ user: enforceSvip(data.user) });
    } catch (e) { console.error("Failed to refresh user", e); }
},

  redeemCode: async (code) => {
      const { user } = get();
      if (!user) return false;
      try {
          const res = await fetch(`${API_BASE_URL}/auth/redeem`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.email, code })
          });
          const data = await res.json();
          if (data.success) {
              await get().refreshUser();
              return true;
          }
          throw new Error(data.error || 'Redemption failed');
      } catch (e) { throw e; }
  },

  login: async (email, code) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code })
        });
        const data = await res.json();
        if (data.success) {
            // 修改后：这里加上 enforceSvip
            const vipUser = enforceSvip(data.user);
            set({ user: vipUser });
            
            localStorage.setItem('vasp_token', data.token);
            localStorage.setItem('vasp_user_id', vipUser.email);
            return vipUser; // 返回处理后的用户
        }
        throw new Error(data.error);
    } catch (e) { throw e; }
},
  
  logout: () => {
      const token = localStorage.getItem('vasp_token');
      const userId = localStorage.getItem('vasp_user_id');
      if (token && userId) {
          fetch(`${API_BASE_URL}/clear-cache`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ userId })
          }).catch(() => {});
      }
      set({
          user: null,
          uploadedFile: null,
          uploadedFiles: [],
          currentFileIndex: -1,
          molecularData: null,
          volumetricData: null,
          isosurfaceMeshPos: null,
          isosurfaceMeshNeg: null,
          isosurfaceMeshReady: true,
          selectedAtomIds: [],
          hoveredAtom: null,
          contextMenu: { visible: false, x: 0, y: 0, atomId: undefined },
          selectionRect: null,
          selectionMessage: '',
          fileSnapshots: {},
          undoStack: [],
          isosurfaceLevel: 0.002
      });
      localStorage.removeItem('vasp_token');
      localStorage.removeItem('vasp_user_id');
  },
  
  checkExport: async (type) => {
      const { user } = get();
      if (!user) return { cost: 0, status: 'error' };
      try {
          const res = await fetch(`${API_BASE_URL}/check-export`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vasp_token')}` },
              body: JSON.stringify({ userId: user.email, type })
          });
          return await res.json();
      } catch (e) { return { cost: 0, status: 'error' }; }
  },
  
  deductExport: async (type) => {
      const { user } = get();
      if (!user) return false;
      try {
          const res = await fetch(`${API_BASE_URL}/deduct-export`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vasp_token')}` },
              body: JSON.stringify({ userId: user.email, type })
          });
          const data = await res.json();
          if (data.success) {
              set({ user: enforceSvip(data.user) });
              return true;
          }
          return false;
      } catch (e) { return false; }
  },

  payBatch: async (count, amount) => {
      const { user } = get();
      if (!user) return false;
      try {
          const res = await fetch(`${API_BASE_URL}/pay-batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vasp_token')}` },
              body: JSON.stringify({ userId: user.email, count, amount })
          });
          const data = await res.json();
          if (data.success) {
              set({ user: enforceSvip(data.user) });
              return true;
          }
          return false;
      } catch (e) { return false; }
  },
  
  subscribe: async (tier) => {
      const { user } = get();
      if (!user) return;
      try {
          const res = await fetch(`${API_BASE_URL}/subscribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vasp_token')}` },
              body: JSON.stringify({ userId: user.email, tier })
          });
          const data = await res.json();
          if (data.success) set({ user: enforceSvip(data.user) });
      } catch (e) { console.error(e); }
  },

  createPayment: async (type, tier?, count?) => {
      const { user } = get();
      if (!user) return null;
      try {
          const res = await fetch(`${API_BASE_URL}/payment/create`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vasp_token')}` },
              body: JSON.stringify({ userId: user.email, type, tier, count })
          });
          return await res.json();
      } catch (e) {
          console.error('[Payment] createPayment error:', e);
          return null;
      }
  },

  pollPayment: async (orderId) => {
      const { user } = get();
      if (!user) return false;
      try {
          const res = await fetch(`${API_BASE_URL}/payment/check`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vasp_token')}` },
              body: JSON.stringify({ orderId })
          });
          const data = await res.json();
          if (data.paid && data.user) {
              set({ user: enforceSvip(data.user) });
          }
          return !!data.paid;
      } catch (e) {
          console.error('[Payment] pollPayment error:', e);
          return false;
      }
  },

  uploadedFile: null,
  uploadedFiles: [],
  currentFileIndex: -1,
  molecularData: null,
  cameraView: 'default',
  currentCameraState: null,
  exportScale: 1,
  showUnitCell: true,
  showBonds: false,
  tidySurface: false,
  materialStyle: 'preview',
  isPerspective: false,
  setIsPerspective: (isPers) => set({ isPerspective: isPers }),
  stickRadius: 0.15,
   triggerSquareExport: false,
  triggerBatchExport: false,
  isBatchExporting: false,
  batchProgress: '',
  isParsing: false,
  setIsParsing: (val) => set({ isParsing: val }),
  triggerVideoExport: false,
  videoExportFPS: 30,
    videoExportMode: 'local',
    videoExportStep: 1,
  isVideoExporting: false,
  videoExportProgress: 0,
  isEditMode: false,
  isBoxSelectionMode: false,
  isDraggingAtom: false,
  isBoxSelecting: false,
  contextMenu: { visible: false, x: 0, y: 0 },
  selectionRect: null,
  selectionMessage: '',
  supercellParams: { x: 1, y: 1, z: 1 },
  materialParams: {
    metalness: 0.0,
    roughness: 0.15,
    transmission: 0.0,
    thickness: 0.0,
    ior: 1.5,
  },
  lightSettings: {
    direction: 'top-right',
    intensity: 1.5,
  },
  selectedAtomIds: [],
  hoveredAtom: null,
  measurementInfo: null,
  setMeasurementInfo: (info) => set({ measurementInfo: info }),
  styleConfig: {
    atomColorsRaw: '',
    atomRadiiRaw: '',
    bondDistancesRaw: '',
    customColors: {},
    customRadii: {},
    bondRules: [],
    bondTolerance: 0.4,
    usePBC: false,
  },
  globalElementSettings: {},
  
  // Volumetric Init
  volumetricData: null,
  isosurfaceMeshPos: null,
  isosurfaceMeshNeg: null,
  isosurfaceMeshReady: true,
  isosurfaceLevel: 0.002,
  isosurfaceColorPos: '#FFFF00', // Yellow
  isosurfaceColorNeg: '#00FFFF', // Cyan
  isosurfaceOpacity: 0.6,
  
  setVolumetricData: (data) => set({ volumetricData: data, isosurfaceMeshPos: null, isosurfaceMeshNeg: null, isosurfaceMeshReady: data ? false : true }),
  setIsosurfaceMeshes: (meshes) => set({ isosurfaceMeshPos: meshes.pos, isosurfaceMeshNeg: meshes.neg, isosurfaceMeshReady: true }),
  setIsosurfaceMeshReady: (ready) => set({ isosurfaceMeshReady: ready }),
  setIsosurfaceLevel: (level) => set({ isosurfaceLevel: level }),
  setIsosurfaceColorPos: (color) => set({ isosurfaceColorPos: color }),
  setIsosurfaceColorNeg: (color) => set({ isosurfaceColorNeg: color }),
  setIsosurfaceOpacity: (opacity) => set({ isosurfaceOpacity: opacity }),

  setUploadedFile: (file) => set({
      uploadedFile: file,
      isDraggingAtom: false,
      isBoxSelecting: false,
      isBoxSelectionMode: false,
      selectionRect: null,
      selectedAtomIds: [], // Reset selection
      contextMenu: { visible: false, x: 0, y: 0, atomId: undefined }
  }),
  setUploadedFiles: (files) => set({
      uploadedFiles: files,
      currentFileIndex: files.length > 0 ? 0 : -1,
      isDraggingAtom: false,
      isBoxSelecting: false,
      isBoxSelectionMode: false,
      selectionRect: null,
      selectedAtomIds: [], // Reset selection
      contextMenu: { visible: false, x: 0, y: 0, atomId: undefined }
  }),
  setCurrentFileIndex: (index) => set({
      currentFileIndex: index,
      isDraggingAtom: false,
      isBoxSelecting: false,
      isBoxSelectionMode: false,
      selectionRect: null,
      selectedAtomIds: [], // Reset selection on file switch
      contextMenu: { visible: false, x: 0, y: 0, atomId: undefined }
  }),
  
  setMolecularData: (data) => set((state) => {
      if (!data) return { molecularData: null, selectedAtomIds: [], hoveredAtom: null };
      
      const uniqueAtoms = deduplicateAtoms(data.atoms);
      if (uniqueAtoms.length < data.atoms.length) {
          console.warn(`Removed ${data.atoms.length - uniqueAtoms.length} duplicate atoms on load.`);
      }
      
      return { 
          molecularData: { ...data, atoms: uniqueAtoms }, 
          selectedAtomIds: [], // Reset selection on new data load (Snapshot logic will override this if needed)
          hoveredAtom: null 
      };
  }),
  
  rotationTrigger: null,
  triggerRotation: (angle) => set({ rotationTrigger: { angle, id: Date.now() } }),

  setCameraView: (view) => set({ cameraView: view, currentCameraState: null }),
  setCurrentCameraState: (state) => set({ currentCameraState: state }),
  setExportScale: (scale) => set({ exportScale: scale }),
  setShowUnitCell: (show) => set({ showUnitCell: show }),
  setShowBonds: (show) => set({ showBonds: show }),
  setTidySurface: (tidy) => set({ tidySurface: tidy }),
  setMaterialStyle: (style) => set((state) => {
      // Auto-update material params to match preset defaults
      let newParams = { ...state.materialParams };
      let nextShowBonds = state.showBonds;
      let nextStickRadius = state.stickRadius;
      switch (style) {
          case 'preview':
              newParams = { ...newParams, metalness: 0.0, roughness: 0.15 };
              break;
          case 'matte':
              newParams = { ...newParams, metalness: 0.0, roughness: 0.8 };
              break;
          case 'metallic':
              newParams = { ...newParams, metalness: 0.45, roughness: 0.45 };
              break;
          case 'glass':
              newParams = { ...newParams, metalness: 0.0, roughness: 0.1, transmission: 0.9, thickness: 0.5, ior: 1.5 };
              break;
          case 'vesta':
              newParams = { ...newParams, metalness: 0.1, roughness: 0.2 };
              nextShowBonds = true;
              break;
          case 'stick':
              newParams = { ...newParams, metalness: 0.1, roughness: 0.5 };
              nextShowBonds = true;
              if (state.stickRadius >= 0.12) nextStickRadius = 0.06;
              break;
          case 'toon':
              newParams = { ...newParams, toonSteps: 3 }; // Default to 3 tones
              break;
      }
      
      // Sync style to all loaded file snapshots
      const updatedSnapshots = { ...state.fileSnapshots };
      Object.keys(updatedSnapshots).forEach(key => {
          if (updatedSnapshots[key]) {
              updatedSnapshots[key] = {
                  ...updatedSnapshots[key],
                  showBonds: nextShowBonds,
                  materialStyle: style,
                  materialParams: { ...newParams },
                  stickRadius: nextStickRadius
              };
          }
      });

      return { 
          showBonds: nextShowBonds,
          materialStyle: style, 
          materialParams: newParams,
          stickRadius: nextStickRadius,
          fileSnapshots: updatedSnapshots
      };
  }),
  setStickRadius: (radius) => set({ stickRadius: radius }),
  setMaterialParams: (params) => set((state) => ({ materialParams: { ...state.materialParams, ...params } })),
  setLightSettings: (settings) => set((state) => ({ lightSettings: { ...state.lightSettings, ...settings } })),
  
  setTriggerSquareExport: (trigger) => set({ triggerSquareExport: trigger }),
  setTriggerBatchExport: (trigger) => set({ triggerBatchExport: trigger }),
  setIsBatchExporting: (exporting) => set({ isBatchExporting: exporting }),
  setBatchProgress: (progress) => set({ batchProgress: progress }),
  setTriggerVideoExport: (trigger) => set({ triggerVideoExport: trigger }),
  setVideoExportFPS: (fps) => set({ videoExportFPS: fps }),
  setVideoExportMode: (mode) => set({ videoExportMode: mode }),
  setVideoExportStep: (step) => set({ videoExportStep: step }),
  setIsVideoExporting: (exporting) => set({ isVideoExporting: exporting }),
  setVideoExportProgress: (progress) => set({ videoExportProgress: progress }),
  
  setIsEditMode: (isEdit) => set({ isEditMode: isEdit }),
  setIsBoxSelectionMode: (isBox) => set({ isBoxSelectionMode: isBox }),
  setIsDraggingAtom: (isDragging) => set({ isDraggingAtom: isDragging }),
  setIsBoxSelecting: (isSelecting) => set({ isBoxSelecting: isSelecting }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  setSelectionRect: (rect) => set({ selectionRect: rect }),
  setSelectionMessage: (msg) => set({ selectionMessage: msg }),
  setSupercellParams: (params) => set({ supercellParams: params }),
  
  generateSupercell: (nx, ny, nz) => set((state) => {
    if (!state.molecularData || !state.molecularData.latticeVectors) return {};
    
    const { atoms, latticeVectors } = state.molecularData;
    const [v1, v2, v3] = latticeVectors;
    
    const newV1 = [v1[0] * nx, v1[1] * nx, v1[2] * nx];
    const newV2 = [v2[0] * ny, v2[1] * ny, v2[2] * ny];
    const newV3 = [v3[0] * nz, v3[1] * nz, v3[2] * nz];
    
    const newAtoms: Atom[] = [];
    const vec1 = new THREE.Vector3(v1[0], v1[1], v1[2]);
    const vec2 = new THREE.Vector3(v2[0], v2[1], v2[2]);
    const vec3 = new THREE.Vector3(v3[0], v3[1], v3[2]);
    
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            for (let k = 0; k < nz; k++) {
                const translation = new THREE.Vector3()
                    .addScaledVector(vec1, i)
                    .addScaledVector(vec2, j)
                    .addScaledVector(vec3, k);
                
                for (const atom of atoms) {
                    const originalPos = new THREE.Vector3(atom.position.x, atom.position.y, atom.position.z);
                    const newPos = originalPos.add(translation);
                    
                    newAtoms.push({
                        ...atom,
                        id: `${atom.id}_${i}_${j}_${k}`,
                        position: { x: newPos.x, y: newPos.y, z: newPos.z }
                    });
                }
            }
        }
    }
    
    const uniqueAtoms = deduplicateAtoms(newAtoms);
    return {
        molecularData: {
            ...state.molecularData,
            atoms: uniqueAtoms,
            latticeVectors: [newV1, newV2, newV3]
        },
        selectedAtomIds: [] 
    };
  }),

  updateAtomPosition: (atomId, newPos) => set((state) => {
    if (!state.molecularData) return {};
    const atomIndex = state.molecularData.atoms.findIndex(a => a.id === atomId);
    if (atomIndex === -1) return {};
    const undoEntry = { molecularData: JSON.parse(JSON.stringify(state.molecularData)) as MolecularStructure, selectedAtomIds: [...state.selectedAtomIds] };
    
    const newAtoms = [...state.molecularData.atoms];
    newAtoms[atomIndex] = { ...newAtoms[atomIndex], position: newPos };
    
    const nextUndo = [...state.undoStack, undoEntry];
    if (nextUndo.length > 50) nextUndo.splice(0, nextUndo.length - 50);
    return {
        undoStack: nextUndo,
        molecularData: { ...state.molecularData, atoms: newAtoms }
    };
  }),

  resetAtomPositions: () => set((state) => ({})), // Handled by reloading file

  setTrajectoryFrame: (frame) => set((state) => {
    if (!state.molecularData || !state.molecularData.trajectory) return {};
    return {
        molecularData: {
            ...state.molecularData,
            trajectory: {
                ...state.molecularData.trajectory,
                currentFrame: frame
            }
        }
    };
  }),

  toggleTrajectoryPlay: (isPlaying) => set((state) => {
      if (!state.molecularData || !state.molecularData.trajectory) return {};
      const newIsPlaying = isPlaying !== undefined ? isPlaying : !state.molecularData.trajectory.isPlaying;
      return {
          molecularData: {
              ...state.molecularData,
              trajectory: {
                  ...state.molecularData.trajectory,
                  isPlaying: newIsPlaying
              }
          }
      };
  }),

  toggleSelectedAtomId: (id, multiSelect) => set((state) => {
    if (!state.molecularData) return {};
    
    const targetAtom = state.molecularData.atoms.find(a => a.id === id);
    if (!targetAtom) return {};
    
    const overlappingAtoms = state.molecularData.atoms.filter(a => 
        Math.abs(a.position.x - targetAtom.position.x) < 0.001 &&
        Math.abs(a.position.y - targetAtom.position.y) < 0.001 &&
        Math.abs(a.position.z - targetAtom.position.z) < 0.001
    );
    
    const overlappingIds = overlappingAtoms.map(a => a.id);
    const overlapCount = overlappingIds.length;
    let message = '';
    
    if (overlapCount > 1) {
        message = `已选中 ${overlapCount} 个重叠原子`;
    }
    
    const isTargetSelected = state.selectedAtomIds.includes(id);
    let newSelectedIds = [...state.selectedAtomIds];
    
    if (multiSelect) {
        if (isTargetSelected) {
            newSelectedIds = newSelectedIds.filter(aid => !overlappingIds.includes(aid));
        } else {
            overlappingIds.forEach(oid => {
                if (!newSelectedIds.includes(oid)) newSelectedIds.push(oid);
            });
        }
    } else {
        newSelectedIds = [...overlappingIds];
    }
    
    return { 
        selectedAtomIds: newSelectedIds,
        selectionMessage: message
    };
  }),
  
  setSelectedAtoms: (ids) => set({ selectedAtomIds: ids }),
  clearSelection: () => set({ selectedAtomIds: [] }),
  setHoveredAtom: (atom) => set({ hoveredAtom: atom }),
  
  updateAtomElement: (atomIndices, newElement) => set((state) => {
    if (!state.molecularData) return {};
    const undoEntry = atomIndices.length > 0 ? { molecularData: JSON.parse(JSON.stringify(state.molecularData)) as MolecularStructure, selectedAtomIds: [...state.selectedAtomIds] } : null;
    const { customColors, customRadii } = state.styleConfig;
    const newAtoms = [...state.molecularData.atoms];
    let changed = false;
    
    atomIndices.forEach(idx => {
       const targetIndex = newAtoms.findIndex(a => a.id === `atom-${idx}`);
       if (targetIndex !== -1) {
         const atom = { ...newAtoms[targetIndex] };
         atom.element = newElement;
         const defaultProps = getAtomProperties(newElement);
         atom.color = customColors[newElement] || defaultProps.color;
         atom.radius = customRadii[newElement] || defaultProps.radius;
         newAtoms[targetIndex] = atom;
         changed = true;
         // saveModification(state.molecularData!.filename, idx, newElement); // Disabled persistence
       }
    });

    if (!changed) return {};
    const nextUndo = undoEntry ? [...state.undoStack, undoEntry] : state.undoStack;
    if (nextUndo.length > 50) nextUndo.splice(0, nextUndo.length - 50);
    return {
       undoStack: nextUndo,
       molecularData: { ...state.molecularData, atoms: newAtoms }
    };
  }),
  
  updateAtomRenderStyle: (atomIds, style) => set((state) => {
    if (!state.molecularData) return {};
    const newAtoms = state.molecularData.atoms.map(atom => {
        if (atomIds.includes(atom.id)) return { ...atom, renderStyle: style };
        return atom;
    });
    return { molecularData: { ...state.molecularData, atoms: newAtoms } };
  }),
  
  deleteSelectedAtoms: () => set((state) => {
    if (!state.molecularData || state.selectedAtomIds.length === 0) return {};
    const undoEntry = { molecularData: JSON.parse(JSON.stringify(state.molecularData)) as MolecularStructure, selectedAtomIds: [...state.selectedAtomIds] };

    const idsToDelete = new Set(state.selectedAtomIds);
    const filename = state.molecularData.filename;
    const selectedPositions: {x:number, y:number, z:number}[] = [];
    state.molecularData.atoms.forEach(atom => {
        if (idsToDelete.has(atom.id)) selectedPositions.push(atom.position);
    });

    const isAtSelectedPosition = (pos: {x:number, y:number, z:number}) => {
        return selectedPositions.some(p => 
            Math.abs(p.x - pos.x) < 0.001 && 
            Math.abs(p.y - pos.y) < 0.001 && 
            Math.abs(p.z - pos.z) < 0.001
        );
    };

    state.molecularData.atoms.forEach(atom => {
       if (idsToDelete.has(atom.id) || isAtSelectedPosition(atom.position)) {
           const parts = atom.id.split('-');
           const originalIndex = parseInt(parts[1]);
           if (!isNaN(originalIndex)) {
              // saveModification(filename, originalIndex, DELETE_MARKER); // Disabled persistence
           }
       }
    });

    const newAtoms = state.molecularData.atoms.filter(atom => {
        const shouldDelete = idsToDelete.has(atom.id) || isAtSelectedPosition(atom.position);
        return !shouldDelete;
    });

    const nextUndo = [...state.undoStack, undoEntry];
    if (nextUndo.length > 50) nextUndo.splice(0, nextUndo.length - 50);
    return {
      undoStack: nextUndo,
      molecularData: { ...state.molecularData, atoms: newAtoms },
      selectedAtomIds: []
    };
  }),
  
  applyStyleConfig: (atomColors, atomRadii, bondDistances, usePBCOverride?: boolean) => {
    const customColors: Record<string, string> = {};
    atomColors.split('\n').forEach(line => {
      const parts = line.trim().split('/');
      if (parts.length >= 4) {
        const [element, , , color] = parts;
        if (element && color) customColors[element.trim()] = color.trim();
      }
    });

    const customRadii: Record<string, number> = {};
    atomRadii.split('\n').forEach(line => {
      const parts = line.trim().split('/');
      if (parts.length >= 4) {
        const [element, , , radiusStr] = parts;
        const radius = parseFloat(radiusStr);
        if (element && !isNaN(radius)) customRadii[element.trim()] = radius;
      }
    });

    const bondRules: Array<{ atomA: string, atomB: string, threshold: number }> = [];
    bondDistances.split('\n').forEach(line => {
      const parts = line.trim().split('/');
      if (parts.length >= 3) {
        const [atomA, atomB, thresholdStr] = parts;
        const threshold = parseFloat(thresholdStr);
        if (atomA && atomB && !isNaN(threshold)) {
          bondRules.push({ atomA: atomA.trim().charAt(0).toUpperCase() + atomA.trim().slice(1).toLowerCase(), atomB: atomB.trim().charAt(0).toUpperCase() + atomB.trim().slice(1).toLowerCase(), threshold });
        }
      }
    });

    set((state) => {
      const newStyleConfig: StyleConfig = {
          atomColorsRaw: atomColors,
          atomRadiiRaw: atomRadii,
          bondDistancesRaw: bondDistances,
          customColors,
          customRadii,
          bondRules,
          // Preserve existing tolerance and PBC settings
          bondTolerance: state.styleConfig.bondTolerance,
          usePBC: usePBCOverride !== undefined ? usePBCOverride : state.styleConfig.usePBC,
      };

      // Update globalElementSettings based on the text input
      const newGlobalSettings = { ...state.globalElementSettings };
      
      // Merge colors
      Object.entries(customColors).forEach(([el, color]) => {
          if (!newGlobalSettings[el]) {
              newGlobalSettings[el] = { color, radius: 0.5 }; // Default radius if missing
          } else {
              newGlobalSettings[el].color = color;
          }
      });
      
      // Merge radii
      Object.entries(customRadii).forEach(([el, radius]) => {
          if (!newGlobalSettings[el]) {
              newGlobalSettings[el] = { color: '#ff00ff', radius }; // Default color if missing
          } else {
              newGlobalSettings[el].radius = radius;
          }
      });

      return {
          styleConfig: newStyleConfig,
          globalElementSettings: newGlobalSettings
      };
    });
  },

  updateElementColor: (element, color) => set((state) => {
      const newSettings = { ...state.globalElementSettings };
      if (!newSettings[element]) {
          newSettings[element] = { color, radius: 0.5 };
      } else {
          newSettings[element] = { ...newSettings[element], color };
      }
      return { globalElementSettings: newSettings };
  }),

  updateElementRadius: (element, radius) => set((state) => {
      const newSettings = { ...state.globalElementSettings };
      if (!newSettings[element]) {
          newSettings[element] = { color: '#ffffff', radius };
      } else {
          newSettings[element] = { ...newSettings[element], radius };
      }
      return { globalElementSettings: newSettings };
  })
}));
