import React, { useRef, useState } from 'react';
import { useStore, resetTempAtomPositions } from '../store/useStore';
import { Upload, RefreshCw, Download, Layers, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Monitor, Image as ImageIcon, Loader2, Square, Palette, Sliders, Sun, Grid, MousePointer2, RotateCcw, RotateCw, Trash2, Link2, Link2Off, Maximize, Move, Play, Pause, SkipBack, SkipForward, Video, Crown, CreditCard, LogOut, BoxSelect, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useNavigate } from 'react-router-dom';
import { parseVolumetricData, parseVolumetricDataDownsample } from '../utils/volumetricParser';
import { getAtomProperties, isMetal, getVESTABondThreshold } from '../utils/atomData';
import { clearModifications, getModifications, DELETE_MARKER } from '../utils/storage';
import { PaymentModal } from './PaymentModal';
import { API_BASE_URL } from '../config';
import { getStableFileId } from '../utils/fileId';

export const ControlPanel: React.FC = () => {
  const navigate = useNavigate();
  const { 
    uploadedFile, 
    uploadedFiles,
    currentFileIndex,
    showUnitCell,
    showBonds,
    isPerspective,
    tidySurface,
    materialStyle,
    materialParams,
    lightSettings,
    selectedAtomIds,
    styleConfig,
    molecularData, // Destructure molecularData
    volumetricData,
    isosurfaceLevel,
    isosurfaceOpacity,
    isosurfaceColorPos,
    isosurfaceColorNeg,
    setVolumetricData,
    setIsosurfaceLevel,
    setIsosurfaceOpacity,
    setIsosurfaceColorPos,
    setIsosurfaceColorNeg,
    setUploadedFile, 
    setUploadedFiles,
    setCurrentFileIndex,
    setMolecularData, 
    setCameraView,
    triggerRotation,
    setExportScale,
    setShowUnitCell,
    setShowBonds,
    setIsPerspective,
    setTidySurface,
    setMaterialStyle,
    stickRadius,
    setStickRadius,
    setMaterialParams,
    setLightSettings,
    toggleSelectedAtomId,
    clearSelection,
    updateAtomElement,
    updateAtomRenderStyle,
    deleteSelectedAtoms,
    applyStyleConfig,
    setTriggerSquareExport,
    setTriggerBatchExport,
    isBatchExporting,
    setIsBatchExporting,
    batchProgress,
    setBatchProgress,
    isEditMode,
    setIsEditMode,
    isBoxSelectionMode,
    setIsBoxSelectionMode,
    selectionMessage,
    supercellParams,
    setSupercellParams,
    generateSupercell,
    resetAtomPositions,
    setTrajectoryFrame,
    toggleTrajectoryPlay,
    setTriggerVideoExport,
    isVideoExporting,
    videoExportFPS,
    setVideoExportFPS,
    videoExportMode,
    setVideoExportMode,
    videoExportStep,
    setVideoExportStep,
    videoExportProgress,
    user,
    setUser,
    login,
    logout,
    saveSnapshot,
    restoreSnapshot,
    clearSnapshot,
    globalElementSettings,
    isParsing,
    setIsParsing
  } = useStore();

  const userIsoMin = 0.001;
  const userIsoMax = 0.005;
  const userIsoStep = 0.0001;

  const [paymentState, setPaymentState] = useState<{ show: boolean, cost: number, type: 'img' | 'vid' | 'batch', count?: number }>({ show: false, cost: 0, type: 'img' });
  const [isovalueInput, setIsovalueInput] = useState<string>('');
  const parseCacheRef = useRef(new Map<string, { status: 'parsing' | 'done' | 'error'; promise?: Promise<any>; result?: any; error?: string }>());
  const preparseSessionRef = useRef(0);
  const [preparseProgress, setPreparseProgress] = useState<{ active: boolean; total: number; done: number; errors: number }>({ active: false, total: 0, done: 0, errors: 0 });
  const [newElementInput, setNewElementInput] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string>('');

  const handleSelectedStyleChange = (style: string) => {
    setSelectedStyle(style);
    updateAtomRenderStyle(selectedAtomIds, style);
  };

  const handleApplyElementChange = () => {
    if (!newElementInput || selectedAtomIds.length === 0) return;
    
    // Convert IDs to indices
    const indicesToUpdate = new Set<number>();
    
    selectedAtomIds.forEach(id => {
       const parts = id.split('-');
       const idx = parseInt(parts[1]);
       if (!isNaN(idx)) {
         indicesToUpdate.add(idx);
       }
    });
    
    updateAtomElement(Array.from(indicesToUpdate), newElementInput);
    setNewElementInput('');
  };
  
  // Bond tolerance local state (mirrors styleConfig.bondTolerance)
  const [bondTolerance, setBondToleranceLocal] = React.useState(styleConfig.bondTolerance ?? 0.4);
  const [usePBCLocal, setUsePBCLocal] = React.useState(styleConfig.usePBC ?? false);

  // Helper: generate VESTA-style bond rules (ionic + covalent dual rules)
  const calcVESTABondRules = (elements: string[], tolerance: number): string => {
    if (elements.length === 0) return '';
    const bondList: string[] = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i; j < elements.length; j++) {
        const el1 = elements[i];
        const el2 = elements[j];
        const dist = getVESTABondThreshold(el1, el2, tolerance);
        bondList.push(`${el1}/${el2}/${dist.toFixed(2)}`);
      }
    }
    return bondList.join('\n');
  };

  const generateDefaultStyles = (data: any, toleranceOverride?: number, usePBCOverride?: boolean) => {
    if (!data || !data.atoms) return;
    
    const tol = toleranceOverride !== undefined ? toleranceOverride : (styleConfig.bondTolerance ?? 0.4);

    // Global Settings Source of Truth
    // Merge existing global settings with any new elements found in the file
    const currentElements = Object.keys(globalElementSettings);
    const fileElements = Array.from(new Set(data.atoms.map((a: any) => a.element))) as string[];
    const allElements = Array.from(new Set([...currentElements, ...fileElements])).sort();
    
    // Construct Colors String
    const newColors = allElements.map(el => {
        // Priority: Global Setting > Default
        const saved = globalElementSettings[el];
        const defaultProps = getAtomProperties(el);
        return `${el}/0/0/${saved?.color || defaultProps.color}`;
    }).join('\n');

    // Construct Radii String
    const newRadii = allElements.map(el => {
        const saved = globalElementSettings[el];
        if (saved?.radius !== undefined) {
            return `${el}/0/0/${saved.radius}`;
        }
        
        // Generate default if not in global settings
        let r = 0.8;
        if (materialStyle === 'vesta' || materialStyle === 'stick') {
            r = getAtomProperties(el).radius;
        } else if (el === 'H') r = 0.45;
        else if (isMetal(el)) r = 1.2;
        
        return `${el}/0/0/${r}`;
    }).join('\n');

    // Bond Logic: VESTA-style (covalent radii + tolerance)
    let newBonds = '';
    
    if (data.atoms.length > 50000) {
        // Skip bonds for very large systems
        newBonds = '';
    } else {
        const uniqueFileElements = Array.from(new Set(data.atoms.map((a: any) => a.element))) as string[];
        // Use VESTA formula: d(A-B) <= r_cov(A) + r_cov(B) + tolerance
        newBonds = calcVESTABondRules(uniqueFileElements, tol);
    }
    
    setAtomColors(newColors);
    setAtomRadii(newRadii);
    setBondDistances(newBonds);
    
    // Apply to store (Updates globalElementSettings and styleConfig)
    applyStyleConfig(newColors, newRadii, newBonds, usePBCOverride);
  };

  // Recalculate bond rules from covalent radii with current tolerance (keeps atom colors/radii unchanged)
  const handleRecalcBonds = () => {
    if (!molecularData) return;
    const uniqueElements = Array.from(new Set(molecularData.atoms.map((a: any) => a.element))) as string[];
    const newBonds = calcVESTABondRules(uniqueElements, bondTolerance);
    setBondDistances(newBonds);
    applyStyleConfig(atomColors, atomRadii, newBonds);
  };

  // Sync local state with globalElementSettings on mount
  React.useEffect(() => {
      if (Object.keys(globalElementSettings).length > 0) {
          const sortedElements = Object.keys(globalElementSettings).sort();
          const colorsStr = sortedElements.map(el => `${el}/0/0/${globalElementSettings[el].color}`).join('\n');
          const radiiStr = sortedElements.map(el => `${el}/0/0/${globalElementSettings[el].radius}`).join('\n');
          setAtomColors(colorsStr);
          setAtomRadii(radiiStr);
      }
  }, []); // Run once on mount (or add globalElementSettings dependency if we want 2-way sync)


  // Update styles when material style changes
  React.useEffect(() => {
      if (molecularData) {
          generateDefaultStyles(molecularData);
      }
  }, [materialStyle]);

  const loadMolecularData = (data: any) => {
      const atomCount = data.atoms.length;
      if (atomCount > 100 || data.trajectory) {
          console.log(`[Performance] System detected ${atomCount} atoms or trajectory. Auto-bonding disabled.`);
          setShowBonds(false);
          setTidySurface(false);
      }
      setMolecularData(data);
      setUsePBCLocal(false);
      generateDefaultStyles(data, undefined, false);
  };

  const handleResetModifications = async () => {
    if (!uploadedFile) return;
    const fileId = await getFileId(uploadedFile);
    clearModifications(fileId);
    clearSnapshot(fileId);
    try {
      resetTempAtomPositions();
      const isDensityFile = isDensityFilename(uploadedFile.name);
      if (isDensityFile) {
          const isChgDiff = isChgDiffFilename(uploadedFile.name);
          const { parseVASPFile } = await import('../utils/fileParser');
          const [data, serverVol] = await Promise.all([
              parseVASPFile(uploadedFile),
              fetchVolumetricFromServer(uploadedFile)
          ]);
          loadMolecularData(data);
          let volData: any = serverVol;
          if (!volData) {
              const text = await uploadedFile.text();
              volData = parseVolumetricData(text);
              if (volData) volData.normalizeByCellVolume = !isChgDiff;
          }
          if (!volData) throw new Error('Failed to parse volumetric data');
          setVolumetricData(volData);
          setIsosurfaceLevel(0.002);
          setIsovalueInput('');
      } else {
          const { parseVASPFile } = await import('../utils/fileParser');
          const data = await parseVASPFile(uploadedFile);
          loadMolecularData(data);
          setVolumetricData(null);
      }
      clearSelection();
      setCameraView('front');
    } catch (error) {
      console.error("Error reloading file:", error);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Removed multiFileInputRef as we consolidate to one input
  const [isSingleExporting, setIsSingleExporting] = useState(false);
  
  const [atomColors, setAtomColors] = React.useState(
    `Ce/0/0/#F3E8C8
O/0/0/#C94040
Pt/0/0/#5D8AA8
Mo/0/0/#5F9EA0
S/0/0/#DA70D6
H/0/0/#FFFFFF`
  );
  const [atomRadii, setAtomRadii] = React.useState(
    `Ce/0/0/1.2
O/0/0/0.8
Pt/0/0/1.2
Mo/0/0/1.2
H/0/0/0.45
C/0/0/0.8`
  );
  const [bondDistances, setBondDistances] = React.useState(
    `Ce/O/2.5
O/H/1.2
Pt/O/2.2
Mo/O/2.2
C/C/1.6
C/H/1.2`
  );

  const handleApplyConfig = () => {
    applyStyleConfig(atomColors, atomRadii, bondDistances, usePBCLocal);
  };

  const [batchConfirmState, setBatchConfirmState] = useState<{ show: boolean, total: number, type: 'trial' | 'vip' | 'pay', cost: number } | null>(null);

  const payBatch = useStore(state => state.payBatch);

  const handleBatchExport = async () => {
    if (uploadedFiles.length === 0) return;
    if (!user) return;

    const total = uploadedFiles.length;
    let type: 'trial' | 'vip' | 'pay' = 'pay';
    let cost = 0;

    // Logic for Pre-check
    if (user.tier === 'vip' || user.tier === 'svip') {
        type = 'vip';
    } else if (user.trial_img_left >= total) {
        type = 'trial';
    } else {
        type = 'pay';
        cost = total * 10; 
    }

    setBatchConfirmState({ show: true, total, type, cost });
  };

  const confirmBatchExport = () => {
      setBatchConfirmState(null);
      setTriggerBatchExport(true);
  };

  const initiateBatchPayment = () => {
      if (!batchConfirmState) return;
      setBatchConfirmState(null);
      setPaymentState({ 
          show: true, 
          cost: batchConfirmState.cost, 
          type: 'batch',
          count: batchConfirmState.total
      });
  };

  const handleExportClick = (type: 'img' | 'vid') => {
      if (!user) return;
      let cost = type === 'img' ? 10 : 50;
      let isFree = false;

      if (user.tier === 'vip' || user.tier === 'svip') isFree = true;
      else if (type === 'img' && user.trial_img_left > 0) isFree = true;
      else if (type === 'vid' && user.trial_vid_left > 0) isFree = true;

      if (isFree) {
          if (type === 'img') setTriggerSquareExport(true);
          else setTriggerVideoExport(true);
      } else {
          setPaymentState({ show: true, cost, type });
      }
  };

  const confirmExport = () => {
      setPaymentState(prev => ({ ...prev, show: false }));
      if (paymentState.type === 'img') {
          setTriggerSquareExport(true);
      } else if (paymentState.type === 'batch') {
          setTriggerBatchExport(true);
      } else {
          setTriggerVideoExport(true);
      }
  };

  const handleExportImage = async () => {
    const canvas = document.querySelector('canvas');
    if (canvas && !isSingleExporting) {
      setIsSingleExporting(true);
      
      // Calculate scale to ensure at least 300 DPI quality (target ~4000px width)
      const targetWidth = 4096;
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width > 0 ? Math.max(4, Math.ceil(targetWidth / rect.width)) : 4;
      
      setExportScale(scale);
      
      // Wait for render to update with new resolution AND transparent background
      await new Promise(resolve => setTimeout(resolve, 600));
      
      try {
        const link = document.createElement('a');
        link.download = `SCI_Visualizer_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
      } catch (err) {
        console.error("Export failed", err);
      } finally {
        setExportScale(1);
        setIsSingleExporting(false);
      }
    }
  };

  const handleSquareExport = () => {
    setTriggerSquareExport(true);
  };

  const isDensityFilename = (name: string) => {
      const upper = name.toUpperCase();
      const keys = ['CHGCAR', 'LOCPOT', 'PARCHG', 'ELFCAR', 'CHGDIFF'];
      return keys.some(k => upper === k || upper.endsWith(k) || upper.includes(k));
  };

  const isChgDiffFilename = (name: string) => name.toUpperCase().includes('CHGDIFF');

  const fetchVolumetricFromServer = async (file: File) => {
      try {
          const formData = new FormData();
          formData.append('file', file);
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 180000);
          const res = await fetch(`${API_BASE_URL}/parse-volumetric`, { method: 'POST', body: formData, signal: controller.signal, headers: { 'Accept': 'application/octet-stream' } })
              .finally(() => window.clearTimeout(timeoutId));
          if (!res.ok) return null;
          
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/octet-stream')) {
              const ngx = Number(res.headers.get('x-volumetric-ngx'));
              const ngy = Number(res.headers.get('x-volumetric-ngy'));
              const ngz = Number(res.headers.get('x-volumetric-ngz'));
              const min = Number(res.headers.get('x-volumetric-min'));
              const max = Number(res.headers.get('x-volumetric-max'));
              const maxAbs = Number(res.headers.get('x-volumetric-maxabs'));
              const normalizeByCellVolume = res.headers.get('x-volumetric-normalizebycellvolume') === '1';
              const buf = await res.arrayBuffer();
              const floatData = new Float32Array(buf);
              if (!Number.isFinite(ngx) || !Number.isFinite(ngy) || !Number.isFinite(ngz) || floatData.length !== ngx * ngy * ngz) return null;
              return { ngx, ngy, ngz, data: floatData, min, max, maxAbs, normalizeByCellVolume };
          }

          const json = await res.json();
          if (!json?.success || !json?.data?.dataB64 || json.data.encoding !== 'gzip-base64-f32') return null;

          if (typeof (window as any).DecompressionStream === 'undefined') return null;

          const binary = atob(json.data.dataB64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          const ds = new (window as any).DecompressionStream('gzip');
          const decompressed = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
          const floatData = new Float32Array(decompressed);

          return {
              ngx: json.data.ngx,
              ngy: json.data.ngy,
              ngz: json.data.ngz,
              data: floatData,
              min: json.data.min,
              max: json.data.max,
              maxAbs: json.data.maxAbs,
              normalizeByCellVolume: json.data.normalizeByCellVolume
          };
      } catch (e) {
          return null;
      }
  };

  const ensureParsed = async (file: File) => {
      const fileId = await getStableFileId(file);
      const cached = parseCacheRef.current.get(fileId);
      if (cached?.status === 'done') return cached.result;
      if (cached?.status === 'parsing' && cached.promise) return cached.promise;

      const isDensityFile = isDensityFilename(file.name);
      const isChgDiff = isChgDiffFilename(file.name);

      const promise = (async () => {
          const { parseVASPFile } = await import('../utils/fileParser');
          if (!isDensityFile) {
              const structure = await parseVASPFile(file);
              return { fileId, isDensityFile: false as const, structure, volData: null };
          }

          const [structure, serverVol] = await Promise.all([
              parseVASPFile(file),
              fetchVolumetricFromServer(file)
          ]);

          let volData: any = serverVol;
          if (!volData) {
              const text = await file.text();
              volData = parseVolumetricData(text) || parseVolumetricDataDownsample(text);
              if (volData) volData.normalizeByCellVolume = !isChgDiff;
          }
          if (!volData) throw new Error('Failed to parse volumetric data');
          return { fileId, isDensityFile: true as const, structure, volData };
      })();

      parseCacheRef.current.set(fileId, { status: 'parsing', promise });
      try {
          const result = await promise;
          parseCacheRef.current.set(fileId, { status: 'done', result });
          return result;
      } catch (e: any) {
          parseCacheRef.current.set(fileId, { status: 'error', error: e?.message || String(e) });
          throw e;
      }
  };

  const startPreparseQueue = async (files: File[]) => {
      const session = (preparseSessionRef.current += 1);
      setPreparseProgress({ active: files.length > 1, total: files.length, done: 0, errors: 0 });
      for (let i = 0; i < files.length; i++) {
          if (preparseSessionRef.current !== session) return;
          try {
              await ensureParsed(files[i]);
              if (preparseSessionRef.current !== session) return;
              setPreparseProgress(prev => ({ ...prev, done: Math.min(prev.total, prev.done + 1) }));
          } catch {
              if (preparseSessionRef.current !== session) return;
              setPreparseProgress(prev => ({ ...prev, done: Math.min(prev.total, prev.done + 1), errors: prev.errors + 1 }));
          }
      }
      if (preparseSessionRef.current === session) {
          setPreparseProgress(prev => ({ ...prev, active: false }));
      }
  };

  const autoSetIsosurfaceLevel = (maxAbs?: number) => {
      if (!maxAbs || !Number.isFinite(maxAbs) || maxAbs <= 0) return;
      const suggested = Math.max(maxAbs * 0.1, maxAbs / 200);
      const clamped = Math.min(Math.max(suggested, 1e-7), maxAbs);
      setIsosurfaceLevel(clamped);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
        resetTempAtomPositions();
        const fileArray = Array.from(files);
        // 先重置状态，再设置文件
        setUploadedFiles(fileArray);
        setUploadedFile(fileArray[0]);
        setIsParsing(true);
        
        try {
            const targetFile = fileArray[0];
            const parsed = await ensureParsed(targetFile);
            loadMolecularData(parsed.structure);
            setVolumetricData(parsed.volData);
            if (parsed.isDensityFile) {
                setIsosurfaceLevel(0.002);
                setIsovalueInput('');
            }

            setCurrentFileIndex(0);
            setCameraView('front');
            if (fileArray.length > 1) {
                void startPreparseQueue(fileArray);
            }
        } catch (error) {
            console.error("Error parsing file:", error);
            const rawMessage = error instanceof Error ? error.message : "Failed to parse file. Please ensure it's a valid VASP or CIF file.";
            const hint = (
                rawMessage.includes('parse-structure') ||
                rawMessage.includes('structure') ||
                rawMessage.includes('结构') ||
                rawMessage.includes('atom count') ||
                rawMessage.includes('atom') ||
                rawMessage.includes('Failed to extract structure section')
            )
                ? '\n\nHint: If you upload CHGCAR/CHGDIFF/ELFCAR volumetric files, the system must extract the structure header first. If it still fails, check file integrity, or upload the corresponding POSCAR/CONTCAR before the volumetric file.'
                : '';
            alert(`${rawMessage}${hint}`);
        } finally {
            setIsParsing(false);
        }
    }
    // Reset input value to allow re-uploading same files
    if (event.target) event.target.value = '';
  };

  const trajectoryInputRef = useRef<HTMLInputElement>(null);

  const handleTrajectoryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Clean up old data to free memory
      if (molecularData?.trajectory) {
          // Help GC
          molecularData.trajectory.frames = []; 
          setMolecularData({ ...molecularData, trajectory: undefined });
      }

      setIsBatchExporting(true); // Reuse loading state for spinner
      setBatchProgress('Parsing XDATCAR...');

      // Use Worker
      const worker = new Worker('/xdatcar.worker.js');
      const cleanup = () => {
          setIsBatchExporting(false);
          setBatchProgress("");
          worker.terminate();
      };
      const timeoutId = window.setTimeout(() => {
          cleanup();
          alert('XDATCAR parsing timed out.');
      }, 120000);
      
      worker.onerror = (err) => {
          window.clearTimeout(timeoutId);
          console.error("Worker Error:", err);
          cleanup();
          alert('Failed to parse XDATCAR.');
      };
      worker.onmessageerror = (err) => {
          window.clearTimeout(timeoutId);
          console.error("Worker Message Error:", err);
          cleanup();
          alert('Failed to parse XDATCAR.');
      };
      
      worker.onmessage = async (e) => {
          try {
              const { success, data, error } = e.data;
              if (!success) {
                  throw new Error(error || 'Failed to parse XDATCAR');
              }

              const { frames, atomElements, lattice } = data;
              if (!frames || !Array.isArray(frames) || frames.length === 0) {
                  throw new Error('XDATCAR parsed but no frames found');
              }
              const firstFrame = frames[0];
              if (!firstFrame || firstFrame.length < atomElements.length * 3) {
                  throw new Error('XDATCAR first frame is incomplete');
              }

              let atoms = atomElements.map((el: string, idx: number) => {
                  const props = getAtomProperties(el);
                  return {
                      id: `atom-${idx}`,
                      element: el,
                      position: { 
                          x: firstFrame[idx * 3 + 0], 
                          y: firstFrame[idx * 3 + 1], 
                          z: firstFrame[idx * 3 + 2] 
                      },
                      radius: props.radius,
                      color: props.color
                  };
              });

              const fileId = await getStableFileId(file);
              const mods = getModifications(fileId);
              atoms = atoms.filter((atom: any, idx: number) => {
                  if (mods[idx] === DELETE_MARKER) return false;
                  if (mods[idx]) {
                      atom.element = mods[idx];
                      const props = getAtomProperties(atom.element);
                      atom.color = props.color;
                      atom.radius = props.radius;
                  }
                  return true;
              });
              
              let minX = Infinity, minY = Infinity, minZ = Infinity;
              let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
              for (let i = 0; i < atoms.length; i++) {
                  const p = atoms[i].position;
                  minX = Math.min(minX, p.x);
                  minY = Math.min(minY, p.y);
                  minZ = Math.min(minZ, p.z);
                  maxX = Math.max(maxX, p.x);
                  maxY = Math.max(maxY, p.y);
                  maxZ = Math.max(maxZ, p.z);
              }

              const trajData = {
                  id: `traj-${Date.now()}`,
                  filename: file.name,
                  atoms: atoms,
                  bonds: [],
                  boundingBox: {
                      min: { x: minX, y: minY, z: minZ },
                      max: { x: maxX, y: maxY, z: maxZ }
                  },
                  latticeVectors: lattice,
                  trajectory: {
                      frames: frames,
                      currentFrame: 0,
                      totalFrames: frames.length,
                      isPlaying: false
                  }
              };
              loadMolecularData(trajData);
              setUploadedFile(file);
              setCameraView('front');
          } catch (err: any) {
              console.error("XDATCAR parse failed:", err);
              alert(`Failed to parse XDATCAR: ${err?.message || String(err)}`);
          } finally {
              window.clearTimeout(timeoutId);
              cleanup();
          }
      };
      
      worker.postMessage(file);
  };

  const handleMultiFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      // Deprecated in favor of consolidated handleFileUpload
      handleFileUpload(event);
  };

  const getFileId = (file: File) => getStableFileId(file);

  const handleSwitchFile = async (index: number) => {
    if (index >= 0 && index < uploadedFiles.length) {
      resetTempAtomPositions();
      // 1. Save current state to snapshot
      if (uploadedFile) {
        const fileId = await getFileId(uploadedFile);
        console.log(`[ControlPanel] Saving snapshot for ${uploadedFile.name} (ID: ${fileId})`);
        saveSnapshot(fileId);
      }
      
      setCurrentFileIndex(index);
      const file = uploadedFiles[index];
      setUploadedFile(file);
      setIsParsing(true);
      
      try {
        const parsed = await ensureParsed(file);
        loadMolecularData(parsed.structure);
        setVolumetricData(parsed.volData);
        if (parsed.isDensityFile) {
            setIsosurfaceLevel(0.002);
            setIsovalueInput('');
        }
        
        // 2. Restore state from snapshot if exists
        const fileIdToRestore = await getFileId(file);
        console.log(`[ControlPanel] Restoring snapshot for ${file.name} (ID: ${fileIdToRestore})`);
        const snapshot = restoreSnapshot(fileIdToRestore);
        
        if (snapshot) {
            // Restore local state variables to match snapshot
            // For Global Persistence, we DO NOT restore Atom Colors/Radii from snapshot
            // They should remain synchronized with the global settings
            // setAtomColors(snapshot.styleConfig.atomColorsRaw); 
            // setAtomRadii(snapshot.styleConfig.atomRadiiRaw);
            
            // Bonds are structural/local, so we can restore them
            setBondDistances(snapshot.styleConfig.bondDistancesRaw);
            
            // Also ensure the UI toggles match
            // (These are store states, so they should be fine, but local inputs might need sync)
            if (snapshot.materialStyle === 'stick') {
                setStickRadius(snapshot.stickRadius);
            }
        }
        
      } catch (error) {
        console.error("Error parsing file:", error);
        const message = error instanceof Error ? error.message : "Failed to parse file during switch.";
        alert(message);
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      resetTempAtomPositions();
      const fileArray = Array.from(files);
      setUploadedFiles(fileArray);
      setUploadedFile(fileArray[0]);
      setCurrentFileIndex(0);
      setIsParsing(true);
       try {
        const targetFile = fileArray[0];
        const parsed = await ensureParsed(targetFile);
        loadMolecularData(parsed.structure);
        setVolumetricData(parsed.volData);
        if (parsed.isDensityFile) {
            setIsosurfaceLevel(0.002);
            setIsovalueInput('');
        }
      } catch (error) {
        console.error("Error parsing file:", error);
        const message = error instanceof Error ? error.message : "Failed to parse file.";
        alert(message);
      } finally {
        setIsParsing(false);
      }
    }
  };



  const handleSupercell = () => {
    generateSupercell(supercellParams.x, supercellParams.y, supercellParams.z);
  };

  return (
    <div className="w-80 bg-white flex flex-col h-full overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.05)] z-10 rounded-[24px] ring-1 ring-black/5">
      
      <div className="px-6 py-4 border-b border-gray-100">
        <h1 className="text-sm font-bold text-[#0A1128] uppercase tracking-widest">SCI VISUALIZER</h1>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">FILE UPLOAD</h2>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
          />
          
          <input
            type="file"
            ref={trajectoryInputRef}
            onChange={handleTrajectoryUpload}
            className="hidden"
          />

          <div 
            className="border-2 border-dashed border-gray-200 rounded-[24px] p-8 text-center hover:border-[#0A1128]/50 hover:bg-gray-50 transition-all cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-[#0A1128] group-hover:text-white flex items-center justify-center mx-auto mb-3 transition-colors text-gray-400">
                <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm text-gray-600 font-semibold group-hover:text-gray-900">Click or Drag File</p>
            <p className="text-[10px] text-gray-400 mt-1">.vasp, POSCAR, CONTCAR, .cif</p>
          </div>

          {isParsing && (
            <div className="mt-3 p-4 bg-blue-50 border border-blue-100 rounded-[24px] flex items-center justify-center gap-3 animate-pulse">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="text-sm font-medium text-blue-700">Parsing on server...</span>
            </div>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-[32px] text-gray-700 hover:bg-gray-100 transition-colors mt-3 text-sm font-medium"
          >
            <Layers className="w-4 h-4 text-gray-500" />
            <span>Upload Multiple Files</span>
          </button>

          {uploadedFiles.length > 0 && (
             <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
               <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-gray-600">Files ({uploadedFiles.length})</span>
                  <span className="text-xs text-gray-400">{currentFileIndex + 1} / {uploadedFiles.length}</span>
               </div>
               
               <div className="flex items-center gap-2">
                  <button 
                    disabled={currentFileIndex <= 0}
                    onClick={() => handleSwitchFile(currentFileIndex - 1)}
                    className="p-1 rounded-[32px] hover:bg-gray-200 disabled:opacity-30 flex-shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  
                  <select
                    value={currentFileIndex}
                    onChange={(e) => handleSwitchFile(parseInt(e.target.value))}
                    className="flex-1 py-1 px-2 bg-white border border-gray-200 rounded-[24px] text-xs font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
                  >
                    {uploadedFiles.map((file, index) => (
                      <option key={index} value={index}>
                        {index + 1}. {file.name}
                      </option>
                    ))}
                  </select>

                  <button 
                    disabled={currentFileIndex >= uploadedFiles.length - 1}
                    onClick={() => handleSwitchFile(currentFileIndex + 1)}
                    className="p-1 rounded-[32px] hover:bg-gray-200 disabled:opacity-30 flex-shrink-0"
                  >
                    <ArrowRight className="w-4 h-4 text-gray-600" />
                  </button>
               </div>
               {preparseProgress.active && (
                 <div className="mt-2 text-[10px] text-gray-500 flex justify-between">
                   <span>Parsing {preparseProgress.done}/{preparseProgress.total}</span>
                   {preparseProgress.errors > 0 && <span>Errors: {preparseProgress.errors}</span>}
                 </div>
               )}
             </div>
          )}

          {molecularData && molecularData.trajectory && (
              <div className="mt-4 p-3 bg-gray-50 rounded-[24px] border border-gray-200">
                   <div className="flex items-center justify-between mb-2">
                       <span className="text-xs font-semibold text-[#0A1128]">Trajectory</span>
                       <span className="text-xs text-gray-500 font-mono">
                           Frame: {molecularData.trajectory.currentFrame + 1} / {molecularData.trajectory.totalFrames}
                       </span>
                   </div>
                   
                   <div className="flex items-center gap-2 mb-2">
                       <button 
                           onClick={() => toggleTrajectoryPlay()}
                           className="p-1.5 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors"
                       >
                           {molecularData.trajectory.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                       </button>
                       
                       <input 
                           type="range"
                           min="0"
                           max={molecularData.trajectory.totalFrames - 1}
                           value={molecularData.trajectory.currentFrame}
                           onChange={(e) => setTrajectoryFrame(parseInt(e.target.value))}
                           className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0A1128]"
                       />
                   </div>
                   
                   <div className="flex justify-between text-gray-600">
                       <button onClick={() => setTrajectoryFrame(Math.max(0, molecularData.trajectory!.currentFrame - 1))} className="p-1 hover:bg-gray-200 rounded-[32px]">
                           <SkipBack className="w-3 h-3" />
                       </button>
                       <button onClick={() => setTrajectoryFrame(Math.max(0, molecularData.trajectory!.currentFrame - 10))} className="text-[10px] font-mono hover:underline">-10</button>
                       <button onClick={() => setTrajectoryFrame(Math.min(molecularData.trajectory!.totalFrames - 1, molecularData.trajectory!.currentFrame + 10))} className="text-[10px] font-mono hover:underline">+10</button>
                       <button onClick={() => setTrajectoryFrame(Math.min(molecularData.trajectory!.totalFrames - 1, molecularData.trajectory!.currentFrame + 1))} className="p-1 hover:bg-gray-200 rounded-[32px]">
                           <SkipForward className="w-3 h-3" />
                       </button>
                   </div>
                   <div className="mt-2 pt-2 border-t border-gray-200 flex flex-col gap-2">
                       <div className="flex items-center justify-between text-xs text-gray-600">
                           <span>Export Video</span>
                           <div className="flex gap-2">
                               <select 
                                   value={videoExportMode}
                                   onChange={(e) => setVideoExportMode(e.target.value as any)}
                                   className="bg-white border border-gray-200 rounded-[24px] px-1 py-0.5 text-xs focus:outline-none focus:border-[#0A1128]"
                                   disabled={isVideoExporting}
                                   title="Export mode: Local (this machine) or Cloud (fast)"
                               >
                                   <option value="local">Local</option>
                                   <option value="cloud">Cloud</option>
                               </select>
                               <select 
                                   value={videoExportStep}
                                   onChange={(e) => setVideoExportStep(Number(e.target.value))}
                                   className="bg-white border border-gray-200 rounded-[24px] px-1 py-0.5 text-xs focus:outline-none focus:border-[#0A1128]"
                                   disabled={isVideoExporting}
                               >
                                   <option value={1}>1x (Full)</option>
                                   <option value={2}>2x (Fast)</option>
                                   <option value={5}>5x (Turbo)</option>
                                   <option value={10}>10x (Max)</option>
                                   <option value={50}>50x (Hyper)</option>
                                   <option value={100}>100x (Instant)</option>
                               </select>
                               <select 
                                   value={videoExportFPS}
                                   onChange={(e) => setVideoExportFPS(Number(e.target.value))}
                                   className="bg-white border border-gray-200 rounded-[24px] px-1 py-0.5 text-xs focus:outline-none focus:border-[#0A1128]"
                                   disabled={isVideoExporting}
                               >
                                   <option value={10}>10 FPS</option>
                                   <option value={24}>24 FPS</option>
                                   <option value={30}>30 FPS</option>
                                   <option value={60}>60 FPS</option>
                               </select>
                           </div>
                       </div>
                       
                       <button 
                           onClick={() => handleExportClick('vid')}
                           disabled={isVideoExporting}
                           className={clsx(
                               "w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-[32px] text-xs font-medium transition-colors relative overflow-hidden",
                               isVideoExporting 
                                   ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                                   : "bg-[#0A1128] text-white hover:bg-[#162044] shadow-sm"
                           )}
                       >
                           {isVideoExporting && (
                               <div 
                                   className="absolute left-0 top-0 bottom-0 bg-[#0A1128] opacity-10 transition-all duration-300 ease-linear"
                                   style={{ width: `${videoExportProgress}%` }}
                               />
                           )}
                           
                           {isVideoExporting ? (
                               <div className="flex items-center gap-2 relative z-10">
                                   <Loader2 className="w-3 h-3 animate-spin" />
                                   <span>Encoding {videoExportProgress}%</span>
                               </div>
                           ) : (
                               <div className="flex items-center gap-2 relative z-10">
                                   <Video className="w-3 h-3" />
                                   <span>Export Video (MP4)</span>
                                   {user?.trial_vid_left > 0 && (
                                        <span className="bg-white/20 text-white text-[9px] px-1 py-0.5 rounded font-bold uppercase ml-1">
                                            Trial
                                        </span>
                                   )}
                               </div>
                           )}
                       </button>
                   </div>
              </div>
          )}

          <button
            onClick={() => trajectoryInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-[32px] text-[#0A1128] hover:bg-gray-100 transition-colors mt-2"
          >
            <Play className="w-4 h-4" />
            <span className="text-sm font-medium">Upload XDATCAR (Trajectory)</span>
          </button>

          {uploadedFile && uploadedFiles.length === 0 && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-gray-50 text-[#0A1128] rounded-[24px] border border-gray-200">
              <div className="w-2 h-2 rounded-full bg-[#0A1128] animate-pulse" />
              <span className="text-sm truncate font-medium">{uploadedFile.name}</span>
            </div>
          )}

        </div>
        
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-4">CAMERA VIEWS</h2>
        <div className="grid grid-cols-3 gap-2">
           <button 
             onClick={() => triggerRotation(Math.PI / 4)}
             className="flex flex-col items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 rounded-[32px] border border-gray-200"
             title="Rotate Left 45°"
           >
             <RotateCcw className="w-4 h-4 mb-1" />
             <span className="text-[10px]">Rotate Left</span>
           </button>
           <button 
             onClick={() => setCameraView('top')}
             className="flex flex-col items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 rounded-[32px] border border-gray-200"
             title="Top View"
           >
             <ArrowUp className="w-4 h-4 mb-1" />
             <span className="text-[10px]">Top</span>
           </button>
           <button 
             onClick={() => triggerRotation(-Math.PI / 4)}
             className="flex flex-col items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 rounded-[32px] border border-gray-200"
             title="Rotate Right 45°"
           >
             <RotateCw className="w-4 h-4 mb-1" />
             <span className="text-[10px]">Rotate Right</span>
           </button>
           
           <button 
             onClick={() => setCameraView('left')}
             className="flex flex-col items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 rounded-[32px] border border-gray-200"
             title="Left View"
           >
             <ArrowLeft className="w-4 h-4 mb-1" />
             <span className="text-[10px]">Left</span>
           </button>
           <button 
             onClick={() => setCameraView('front')}
             className="flex flex-col items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 rounded-[32px] border border-gray-200"
             title="Front View"
           >
             <Monitor className="w-4 h-4 mb-1" />
             <span className="text-[10px]">Front</span>
           </button>
           <button 
             onClick={() => setCameraView('right')}
             className="flex flex-col items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 rounded-[32px] border border-gray-200"
             title="Right View"
           >
             <ArrowRight className="w-4 h-4 mb-1" />
             <span className="text-[10px]">Right</span>
           </button>
           
           <div />
           <button 
             onClick={() => setCameraView('bottom')}
             className="flex flex-col items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 rounded-[32px] border border-gray-200"
             title="Bottom View"
           >
             <ArrowDown className="w-4 h-4 mb-1" />
             <span className="text-[10px]">Bottom</span>
           </button>
           <div />
        </div>

        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-4">DISPLAY</h2>
        
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowUnitCell(!showUnitCell)}
            className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-[32px] text-sm transition-all duration-300",
              showUnitCell 
                ? "bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 font-semibold" 
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            )}
          >
            <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                showUnitCell ? "bg-[#0A1128] text-white" : "bg-gray-200 text-gray-400"
            )}>
                <Square className="w-4 h-4" />
            </div>
            {showUnitCell ? 'Unit cell shown' : 'Show unit cell'}
          </button>

          {materialStyle !== 'vesta' && (
             <button
                onClick={() => setShowBonds(!showBonds)}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-[32px] text-sm transition-all duration-300",
                  showBonds 
                    ? "bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 font-semibold" 
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                )}
             >
                <div className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                    showBonds ? "bg-[#0A1128] text-white" : "bg-gray-200 text-gray-400"
                )}>
                    {showBonds ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
                </div>
                {showBonds ? 'Bonds shown' : 'Show bonds'}
             </button>
          )}

          <button
            onClick={() => setTidySurface(!tidySurface)}
            className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-[32px] text-sm transition-all duration-300",
              tidySurface 
                ? "bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 font-semibold" 
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            )}
          >
            <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                tidySurface ? "bg-[#0A1128] text-white" : "bg-gray-200 text-gray-400"
            )}>
                <Grid className="w-4 h-4" />
            </div>
            {tidySurface ? 'Surface tidy' : 'Tidy surface'}
          </button>

          <button
            onClick={() => setIsPerspective(!isPerspective)}
            className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-[32px] text-sm transition-all duration-300",
              isPerspective 
                ? "bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 font-semibold" 
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            )}
          >
            <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                isPerspective ? "bg-[#0A1128] text-white" : "bg-gray-200 text-gray-400"
            )}>
                <Maximize className="w-4 h-4" />
            </div>
            {isPerspective ? 'Perspective' : 'Orthographic'}
          </button>
        </div>

        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-4">STYLE</h2>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Palette className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
            <select
              value={materialStyle}
              onChange={(e) => setMaterialStyle(e.target.value as any)}
              className="w-full pl-12 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-[24px] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="preview">Preview (Default)</option>
              <option value="vesta">Classic</option>
              <option value="stick">Stick</option>
              <option value="matte">Matte</option>
              <option value="metallic">Metallic</option>
              <option value="glass">Glass / Transparent</option>
              <option value="toon">Toon</option>
            </select>
          </div>
          
          {materialStyle === 'stick' && (
             <div className="bg-gray-50 p-3 rounded-md border border-gray-200 space-y-3 mt-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sliders className="w-3 h-3 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase">STICK PARAMS</span>
                </div>
                
                <div>
                   <div className="flex justify-between mb-1">
                     <label className="text-xs text-gray-600">Bond radius</label>
                     <span className="text-xs text-gray-400">{stickRadius.toFixed(2)}</span>
                   </div>
                   <input 
                     type="range" 
                     min="0.05" 
                     max="0.8" 
                     step="0.05"
                     value={stickRadius}
                     onChange={(e) => setStickRadius(parseFloat(e.target.value))}
                     className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                   />
                </div>
             </div>
          )}

          {materialStyle === 'metallic' && (
             <div className="bg-gray-50 p-3 rounded-md border border-gray-200 space-y-3 mt-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sliders className="w-3 h-3 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase">METALLIC PARAMS</span>
                </div>
                
                <div>
                   <div className="flex justify-between mb-1">
                     <label className="text-xs text-gray-600">Metalness</label>
                     <span className="text-xs text-gray-400">{materialParams.metalness.toFixed(2)}</span>
                   </div>
                   <input 
                     type="range" 
                     min="0" 
                     max="1" 
                     step="0.05"
                     value={materialParams.metalness}
                     onChange={(e) => setMaterialParams({ metalness: parseFloat(e.target.value) })}
                     className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                   />
                </div>

                <div>
                   <div className="flex justify-between mb-1">
                     <label className="text-xs text-gray-600">Roughness</label>
                     <span className="text-xs text-gray-400">{materialParams.roughness.toFixed(2)}</span>
                   </div>
                   <input 
                     type="range" 
                     min="0" 
                     max="1" 
                     step="0.05"
                     value={materialParams.roughness}
                     onChange={(e) => setMaterialParams({ roughness: parseFloat(e.target.value) })}
                     className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                   />
                </div>
             </div>
          )}

          {materialStyle === 'glass' && (
             <div className="bg-gray-50 p-3 rounded-md border border-gray-200 space-y-3 mt-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sliders className="w-3 h-3 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase">GLASS PARAMS</span>
                </div>
                
                <div>
                   <div className="flex justify-between mb-1">
                     <label className="text-xs text-gray-600">Transmission</label>
                     <span className="text-xs text-gray-400">{materialParams.transmission.toFixed(2)}</span>
                   </div>
                   <input 
                     type="range" 
                     min="0" 
                     max="1" 
                     step="0.05"
                     value={materialParams.transmission}
                     onChange={(e) => setMaterialParams({ transmission: parseFloat(e.target.value) })}
                     className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                   />
                </div>

                <div>
                   <div className="flex justify-between mb-1">
                     <label className="text-xs text-gray-600">Thickness</label>
                     <span className="text-xs text-gray-400">{materialParams.thickness.toFixed(2)}</span>
                   </div>
                   <input 
                     type="range" 
                     min="0" 
                     max="3" 
                     step="0.1"
                     value={materialParams.thickness}
                     onChange={(e) => setMaterialParams({ thickness: parseFloat(e.target.value) })}
                     className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                   />
                </div>

                <div>
                   <div className="flex justify-between mb-1">
                     <label className="text-xs text-gray-600">IOR</label>
                     <span className="text-xs text-gray-400">{materialParams.ior.toFixed(2)}</span>
                   </div>
                   <input 
                     type="range" 
                     min="1" 
                     max="2.5" 
                     step="0.05"
                     value={materialParams.ior}
                     onChange={(e) => setMaterialParams({ ior: parseFloat(e.target.value) })}
                     className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                   />
                </div>
             </div>
          )}
        </div>

        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-4">LIGHTING</h2>
        <div className="flex flex-col gap-2">
           <div className="relative">
             <Sun className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
             <select
               value={lightSettings.direction}
               onChange={(e) => setLightSettings({ direction: e.target.value as any })}
               className="w-full pl-12 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-[24px] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
             >
               <option value="top-left">Top Left</option>
               <option value="top-right">Top Right</option>
               <option value="bottom-left">Bottom Left</option>
               <option value="bottom-right">Bottom Right</option>
               <option value="top">Top</option>
               <option value="bottom">Bottom</option>
             </select>
           </div>
           
           <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
             <div className="flex justify-between mb-1">
               <label className="text-xs text-gray-600">Intensity</label>
               <span className="text-xs text-gray-400">{lightSettings.intensity.toFixed(1)}</span>
             </div>
             <input 
               type="range" 
               min="0" 
               max="3" 
               step="0.1"
               value={lightSettings.intensity}
               onChange={(e) => setLightSettings({ intensity: parseFloat(e.target.value) })}
               className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
             />
           </div>
        </div>

        {volumetricData && (
            <div className="mt-4">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-4">VOLUMETRIC</h2>
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                    <div className="flex justify-between mb-1">
                        <label className="text-xs text-gray-600">Isosurface level</label>
                        <input
                            type="number"
                            inputMode="decimal"
                            min={userIsoMin}
                            max={userIsoMax}
                            step={userIsoStep}
                            value={isovalueInput || String(isosurfaceLevel)}
                            onChange={(e) => setIsovalueInput(e.target.value)}
                            onBlur={() => {
                                const v = Number(isovalueInput);
                                if (Number.isFinite(v)) {
                                    const clamped = Math.min(userIsoMax, Math.max(userIsoMin, v));
                                    setIsosurfaceLevel(clamped);
                                }
                                setIsovalueInput('');
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                                if (e.key === 'Escape') {
                                    setIsovalueInput('');
                                    (e.currentTarget as HTMLInputElement).blur();
                                }
                            }}
                            className="text-xs text-gray-400 bg-transparent text-right w-24 outline-none"
                        />
                    </div>
                    <input 
                        type="range" 
                        min={userIsoMin}
                        max={userIsoMax}
                        step={userIsoStep}
                        value={isosurfaceLevel}
                        onChange={(e) => setIsosurfaceLevel(parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>
                
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200 mt-2">
                    <div className="flex justify-between mb-1">
                        <label className="text-xs text-gray-600">Opacity</label>
                        <span className="text-xs text-gray-400">{isosurfaceOpacity.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="1.0" 
                        step="0.1"
                        value={isosurfaceOpacity}
                        onChange={(e) => setIsosurfaceOpacity(parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>

                <div className="bg-gray-50 p-3 rounded-md border border-gray-200 mt-2">
                    <label className="text-xs text-gray-600 block mb-2">Isosurface colors</label>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] text-gray-400 block mb-1">Charge (+)</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="color" 
                                    value={isosurfaceColorPos}
                                    onChange={(e) => setIsosurfaceColorPos(e.target.value)}
                                    className="w-6 h-6 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                                />
                                <input 
                                    type="text" 
                                    value={isosurfaceColorPos}
                                    onChange={(e) => setIsosurfaceColorPos(e.target.value)}
                                    className="w-full text-xs p-1 border border-gray-200 rounded"
                                />
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] text-gray-400 block mb-1">Charge (-)</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="color" 
                                    value={isosurfaceColorNeg}
                                    onChange={(e) => setIsosurfaceColorNeg(e.target.value)}
                                    className="w-6 h-6 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                                />
                                <input 
                                    type="text" 
                                    value={isosurfaceColorNeg}
                                    onChange={(e) => setIsosurfaceColorNeg(e.target.value)}
                                    className="w-full text-xs p-1 border border-gray-200 rounded"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-4">STYLE CONFIG</h2>
        
        {/* Edit Mode Toggle Removed - Now Seamless */}
        
        {/* Supercell Generation */}
        <div className="mb-4">
             <div className="flex items-center gap-2 mb-2 text-sm text-gray-600 font-medium">
                 <Grid className="w-4 h-4" />
                 Supercell
             </div>
             <div className="flex items-center gap-2 mb-2">
                 {[
                     { label: 'x', val: supercellParams.x, setter: (v: number) => setSupercellParams({ ...supercellParams, x: v }) },
                     { label: 'y', val: supercellParams.y, setter: (v: number) => setSupercellParams({ ...supercellParams, y: v }) },
                     { label: 'z', val: supercellParams.z, setter: (v: number) => setSupercellParams({ ...supercellParams, z: v }) }
                 ].map(({ label, val, setter }) => (
                     <div key={label} className="flex-1 flex items-center gap-1">
                         <span className="text-xs text-gray-500 font-mono">{label}</span>
                         <input 
                             type="number" 
                             min="1" 
                             max="10"
                             value={val}
                             onChange={(e) => setter(Math.max(1, parseInt(e.target.value) || 1))}
                             className="w-full px-2 py-1 text-xs border rounded-[24px] focus:ring-1 focus:ring-blue-500 outline-none text-center"
                         />
                     </div>
                 ))}
             </div>
             <button
                 onClick={handleSupercell}
                 className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[#0A1128] text-white rounded-[32px] text-xs hover:bg-[#162044] transition-colors shadow-sm"
             >
                 <Grid className="w-3 h-3" />
                 Generate supercell
             </button>
        </div>
        
        {selectedAtomIds.length > 0 && (
           <div className="bg-blue-50 p-3 rounded-md border border-blue-200 mb-3">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <MousePointer2 className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-blue-700">
                    {selectedAtomIds.length} atoms selected
                  </span>
                </div>
                <button 
                  onClick={() => clearSelection()}
                  className="text-xs text-blue-400 hover:text-blue-600"
                >
                  Clear
                </button>
              </div>
              
              {selectionMessage && (
                <div className="mb-2 px-2 py-1.5 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                    {selectionMessage}
                </div>
              )}
              
              <div className="mb-2">
                <label className="text-xs text-gray-600 block mb-1">Change element</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newElementInput}
                    onChange={(e) => setNewElementInput(e.target.value)}
                    placeholder="Symbol (e.g. Au)"
                    className="flex-1 p-1 border border-gray-300 rounded-[24px] text-xs"
                  />
                  <button
                    onClick={handleApplyElementChange}
                    className="px-2 py-1 bg-blue-600 text-white rounded-[32px] text-xs hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
              
              <div className="flex gap-2">
                 <button 
                   onClick={() => deleteSelectedAtoms()}
                   className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 bg-red-50 text-red-600 rounded-[32px] text-xs hover:bg-red-100 border border-red-200"
                 >
                   <Trash2 className="w-3 h-3" />
                   Delete selected
                 </button>
                 
                 <button 
                   onClick={handleResetModifications}
                   className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 bg-gray-100 text-gray-600 rounded-[32px] text-xs hover:bg-gray-200"
                   title="Reset Elements & Positions"
                 >
                   <RotateCcw className="w-3 h-3" />
                   Reset all
                   </button>
              </div>

              <div className="mt-2 pt-2 border-t border-blue-200">
                <label className="text-xs text-gray-600 block mb-1">Selected atom style</label>
                <select
                    className="w-full text-xs p-1 border border-gray-300 rounded-[24px] bg-white"
                    onChange={(e) => handleSelectedStyleChange(e.target.value)}
                    value={selectedStyle}
                >
                    <option value="" disabled>Choose style...</option>
                    <option value="default">Use global style (reset)</option>
                    <option value="preview">Preview (Default)</option>
                    <option value="vesta">Classic</option>
                    <option value="stick">Stick</option>
                    <option value="matte">Matte</option>
                    <option value="metallic">Metallic</option>
                    <option value="glass">Glass / Transparent</option>
                    <option value="toon">Toon</option>
                </select>

                {selectedStyle === 'stick' && (
                    <div className="bg-white p-2 rounded-md border border-gray-200 space-y-2 mt-2">
                        <div className="flex items-center gap-2 mb-1">
                            <Sliders className="w-3 h-3 text-gray-400" />
                            <span className="text-xs font-medium text-gray-500 uppercase">Selected Stick Params</span>
                        </div>
                        
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-xs text-gray-600">Bond radius</label>
                                <span className="text-xs text-gray-400">{stickRadius.toFixed(2)}</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.05" 
                                max="0.8" 
                                step="0.05"
                                value={stickRadius}
                                onChange={(e) => setStickRadius(parseFloat(e.target.value))}
                                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>
                )}
              </div>
           </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Atom colors</label>
            <textarea
              className="w-full h-20 p-3 text-xs border border-gray-100 rounded-[24px] font-mono custom-scrollbar focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600"
              placeholder="Fe: #FFA500&#10;O: #FF0000"
              value={atomColors}
              onChange={(e) => setAtomColors(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Atom radii</label>
            <textarea
              className="w-full h-20 p-3 text-xs border border-gray-100 rounded-[24px] font-mono custom-scrollbar focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600"
              placeholder="Fe: 1.5&#10;O: 0.8"
              value={atomRadii}
              onChange={(e) => setAtomRadii(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Bond rules (Max distance)</label>
            </div>

            <textarea
              className="w-full h-20 p-3 text-xs border border-gray-100 rounded-[24px] font-mono custom-scrollbar focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600"
              placeholder="Fe/O/2.5&#10;C/H/1.2"
              value={bondDistances}
              onChange={(e) => setBondDistances(e.target.value)}
            />

            {/* PBC Toggle */}
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={usePBCLocal}
                onChange={(e) => setUsePBCLocal(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              <span className="text-xs text-gray-600">Enable periodic boundary conditions (PBC)</span>
            </label>
          </div>

           <button 
               className="w-full px-3 py-2 bg-[#0A1128] text-white rounded-[32px] text-sm hover:bg-[#162044] transition-colors shadow-sm"
               onClick={handleApplyConfig}
             >
             Apply style
           </button>
        </div>
      </div>
      
      <div className="mt-auto space-y-2 px-6 pb-6">
        {uploadedFiles.length > 0 && (
          <button 
             className={clsx(
               "w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-[32px] transition-all text-sm font-medium shadow-[0_4px_15px_rgba(26,42,78,0.2)] active:scale-95",
               isBatchExporting 
                 ? "bg-[#1A2A4E] cursor-not-allowed opacity-80" 
                 : "bg-[#1A2A4E] hover:bg-[#24365E]"
             )}
             onClick={handleBatchExport}
             disabled={isBatchExporting}
          >
            {isBatchExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {batchProgress || 'Exporting...'}
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                Batch Export All
              </>
            )}
          </button>
        )}

        <button
           onClick={() => handleExportClick('img')}
           className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#2E4A8E] text-white rounded-[32px] hover:bg-[#3D5BA6] transition-all shadow-[0_4px_15px_rgba(46,74,142,0.3)] active:scale-95"
        >
           <ImageIcon className="w-4 h-4" />
           <span className="font-medium">Export Image (HQ)</span>
           {user?.trial_img_left > 0 && (
               <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ml-2">
                   Trial
               </span>
           )}
        </button>

        <button 
           className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-600 rounded-[32px] hover:bg-gray-200 transition-colors text-sm font-medium"
           onClick={() => {
             setUploadedFile(null);
             setMolecularData(null);
             if (fileInputRef.current) fileInputRef.current.value = '';
           }}
        >
          <RefreshCw className="w-4 h-4" />
          Reset View
        </button>

        <button 
           className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 text-gray-600 rounded-[32px] hover:bg-gray-50 transition-colors text-sm font-medium"
           onClick={() => navigate('/manual')}
        >
          <BookOpen className="w-4 h-4" />
          Help / Manual
        </button>
      </div>
      {paymentState.show && (
          <PaymentModal 
              cost={paymentState.cost}
              type={paymentState.type}
              onClose={() => setPaymentState(prev => ({ ...prev, show: false }))}
              onConfirm={confirmExport}
          />
      )}

      {batchConfirmState && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
                <h3 className="text-xl font-bold text-[#0A1128] mb-4">Batch Export Confirmation</h3>
                
                <div className="space-y-4 mb-8">
                    <p className="text-gray-600 text-sm leading-relaxed">
                        You are about to export <strong className="text-[#0A1128]">{batchConfirmState.total}</strong> images.
                    </p>
                    
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                        {batchConfirmState.type === 'trial' && (
                            <div className="flex items-center gap-3 text-emerald-700 font-medium">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                    <ImageIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-wide opacity-70">Consumes</div>
                                    <div>{batchConfirmState.total} trial credits</div>
                                </div>
                            </div>
                        )}
                        
                        {batchConfirmState.type === 'vip' && (
                            <div className="flex items-center gap-3 text-[#0A1128] font-medium">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                                    <Crown className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-wide opacity-70">Membership</div>
                                    <div>Included</div>
                                </div>
                            </div>
                        )}
                        
                        {batchConfirmState.type === 'pay' && (
                            <div className="flex items-center gap-3 text-amber-700 font-medium">
                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                    <CreditCard className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-wide opacity-70">Total</div>
                                    <div>Insufficient credits</div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {batchConfirmState.type === 'pay' && (
                        <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">
                            Your trial credits are insufficient for this batch export. Please upgrade or top up.
                        </p>
                    )}
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={() => setBatchConfirmState(null)}
                        className="flex-1 py-3 px-4 rounded-[24px] border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    {batchConfirmState.type === 'pay' ? (
                         <button 
                            onClick={initiateBatchPayment}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[24px] bg-[#0A1128] text-white font-bold hover:bg-[#162044] transition-colors shadow-lg"
                         >
                            <CreditCard className="w-4 h-4" />
                            <span>Pay ¥{batchConfirmState.cost}</span>
                         </button>
                    ) : (
                        <button 
                            onClick={confirmBatchExport}
                            className="flex-1 py-3 px-4 rounded-[24px] bg-[#0A1128] text-white font-bold hover:bg-[#162044] transition-colors shadow-lg"
                        >
                            Continue
                        </button>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
