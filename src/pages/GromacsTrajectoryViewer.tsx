import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Box,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Expand,
  FileArchive,
  FileAxis3D,
  FileCode2,
  Film,
  Focus,
  Gauge,
  Loader2,
  Pause,
  Play,
  Route,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import {
  Selection,
  Shape,
  Stage,
  StructureComponent,
  TrajectoryPlayer,
  WidelineBuffer,
  type Component,
} from 'ngl';

type FileRole = 'gro' | 'xtc' | 'tpr' | 'top';
type RepresentationStyle = 'cartoon' | 'ball+stick' | 'licorice' | 'spacefill' | 'line';
type TrailResolution = '250' | '500' | '1000' | 'all';

interface SelectedFiles {
  gro: File | null;
  xtc: File | null;
  tpr: File | null;
  top: File | null;
}

interface IndexedTrajectory {
  atomCount: number;
  frameCount: number;
  timeOffset: number;
  deltaTime: number;
  duration: number;
  times: Float64Array;
}

interface ViewerStats extends IndexedTrajectory {
  structureName: string;
  trajectoryName: string;
}

interface FrameWorkerResponse {
  type: 'frame';
  sessionId: number;
  requestId: number;
  frameIndex: number;
  coordinates: Float32Array;
  box: Float32Array;
  time: number;
}

interface TrailWorkerResponse {
  type: 'trail';
  sessionId: number;
  requestId: number;
  position1: Float32Array;
  position2: Float32Array;
  sampleCount: number;
  trackCount: number;
}

interface WorkerErrorResponse {
  type: 'error';
  sessionId: number;
  requestId?: number;
  message: string;
}

type FrameCallback = (frame: number, box: Float32Array, coordinates: Float32Array, frameCount: number) => void;
type CountCallback = (frameCount: number) => void;
type TrajectoryRequestCallback = (callback: FrameCallback | CountCallback, frame?: number) => void;
type NglTrajectory = ReturnType<StructureComponent['addTrajectory']>['trajectory'];

interface IndexProgressWorkerResponse {
  type: 'index-progress';
  sessionId: number;
  progress: number;
  frameCount: number;
}

interface IndexedWorkerResponse extends IndexedTrajectory {
  type: 'indexed';
  sessionId: number;
}

interface TrailProgressWorkerResponse {
  type: 'trail-progress';
  sessionId: number;
  requestId: number;
  progress: number;
}

type XtcWorkerResponse =
  | IndexProgressWorkerResponse
  | IndexedWorkerResponse
  | FrameWorkerResponse
  | TrailWorkerResponse
  | TrailProgressWorkerResponse
  | WorkerErrorResponse;

const EMPTY_FILES: SelectedFiles = { gro: null, xtc: null, tpr: null, top: null };
const MAX_TRAIL_ATOMS = 120;

const FILE_META: Record<FileRole, {
  label: string;
  extension: string;
  note: string;
  required: boolean;
  icon: LucideIcon;
}> = {
  gro: {
    label: 'Initial Structure',
    extension: '.gro',
    note: 'Atoms, residues, and initial coordinates',
    required: true,
    icon: FileAxis3D,
  },
  xtc: {
    label: 'Trajectory File',
    extension: '.xtc',
    note: 'Decode frames on demand',
    required: true,
    icon: Film,
  },
  tpr: {
    label: 'Run Input',
    extension: '.tpr',
    note: 'Optional, records run information',
    required: false,
    icon: FileArchive,
  },
  top: {
    label: 'Topology File',
    extension: '.top',
    note: 'Optional, records topology source',
    required: false,
    icon: FileCode2,
  },
};

const REPRESENTATIONS: Array<{ value: RepresentationStyle; label: string }> = [
  { value: 'cartoon', label: 'NewCartoon' },
  { value: 'ball+stick', label: 'Ball & Stick' },
  { value: 'licorice', label: 'Licorice' },
  { value: 'spacefill', label: 'Spacefill' },
  { value: 'line', label: 'Lines' },
];

const TRAIL_SELECTIONS = [
  { label: 'Protein Cα', value: 'protein and .CA' },
  { label: 'Backbone', value: 'backbone and not hydrogen' },
  { label: 'Ligand', value: 'ligand and not hydrogen' },
  { label: 'All heavy atoms', value: 'not hydrogen' },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / (1024 ** unit);
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatTime(ps: number) {
  if (!Number.isFinite(ps)) return '--';
  if (Math.abs(ps) >= 1000) return `${(ps / 1000).toFixed(3)} ns`;
  return `${ps.toFixed(2)} ps`;
}

function classifyFiles(files: File[]) {
  const next: Partial<SelectedFiles> = {};
  files.forEach((file) => {
    const extension = file.name.toLowerCase().split('.').pop() as FileRole | undefined;
    if (extension && extension in FILE_META) next[extension] = file;
  });
  return next;
}

const FileSlot: React.FC<{
  role: FileRole;
  file: File | null;
  onRemove: () => void;
}> = ({ role, file, onRemove }) => {
  const meta = FILE_META[role];
  const Icon = meta.icon;
  return (
    <div className={`rounded-[16px] border p-3 transition-colors ${
      file ? 'border-[#0A1128]/15 bg-white' : 'border-gray-100 bg-gray-50'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] ${
          file ? 'bg-[#0A1128] text-white' : 'bg-gray-200 text-gray-400'
        }`}>
          {file ? <Check size={15} /> : <Icon size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-[#0A1128]">
              {file?.name || `${meta.label} ${meta.extension}`}
            </p>
            {meta.required && !file && (
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase text-gray-400">Required</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-gray-400">
            {file ? `${formatBytes(file.size)} · ${meta.note}` : meta.note}
          </p>
        </div>
        {file && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label={`Remove ${file.name}`}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

const Toggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}> = ({ checked, onChange, label, description }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-3 py-1.5 text-left"
  >
    <span>
      <span className="block text-[11px] font-semibold text-gray-700">{label}</span>
      {description && <span className="block text-[9px] leading-4 text-gray-400">{description}</span>}
    </span>
    <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#0A1128]' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </span>
  </button>
);

const GromacsTrajectoryViewer: React.FC = () => {
  const navigate = useNavigate();
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const structureRef = useRef<StructureComponent | null>(null);
  const trajectoryRef = useRef<NglTrajectory | null>(null);
  const playerRef = useRef<TrajectoryPlayer | null>(null);
  const trailComponentRef = useRef<Component | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const sessionIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const frameCountRef = useRef(0);
  const timesRef = useRef<Float64Array>(new Float64Array(0));
  const desiredFrameRef = useRef(0);
  const indexResolverRef = useRef<{
    sessionId: number;
    resolve: (value: IndexedTrajectory) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const frameCallbacksRef = useRef(new Map<number, FrameCallback>());
  const trailResolversRef = useRef(new Map<number, {
    resolve: (value: TrailWorkerResponse) => void;
    reject: (error: Error) => void;
  }>());

  const [files, setFiles] = useState<SelectedFiles>(EMPTY_FILES);
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(20);
  const [playbackStep, setPlaybackStep] = useState(1);
  const [representation, setRepresentation] = useState<RepresentationStyle>('cartoon');
  const [displaySelection, setDisplaySelection] = useState('all');
  const [selectionDraft, setSelectionDraft] = useState('all');
  const [showSolvent, setShowSolvent] = useState(false);
  const [centerPbc, setCenterPbc] = useState(false);
  const [repairMolecules, setRepairMolecules] = useState(false);
  const [superpose, setSuperpose] = useState(false);
  const [trailSelection, setTrailSelection] = useState('protein and .CA');
  const [trailResolution, setTrailResolution] = useState<TrailResolution>('500');
  const [unwrapTrailPbc, setUnwrapTrailPbc] = useState(true);
  const [trailLoading, setTrailLoading] = useState(false);
  const [trailProgress, setTrailProgress] = useState(0);
  const [trailInfo, setTrailInfo] = useState<{ tracks: number; samples: number; sourceAtoms: number } | null>(null);
  const activeTrailRequestRef = useRef<number | null>(null);

  const hasRequiredFiles = Boolean(files.gro && files.xtc);
  const currentTime = stats
    ? (timesRef.current[previewFrame] ?? (stats.timeOffset + previewFrame * stats.deltaTime))
    : 0;

  const addFiles = useCallback((incoming: File[]) => {
    const classified = classifyFiles(incoming);
    if (Object.keys(classified).length === 0) {
      setError('Please select a .gro, .xtc, .tpr, or .top file.');
      return;
    }
    setError(null);
    setFiles((previous) => ({ ...previous, ...classified }));
  }, []);

  useEffect(() => {
    if (!viewerElementRef.current) return undefined;

    const viewerElement = viewerElementRef.current;
    // React StrictMode mounts effects twice in development. NGL owns the
    // canvases it appends, so clear a disposed stage before creating another.
    viewerElement.replaceChildren();
    const stage = new Stage(viewerElement, {
      backgroundColor: '#070A12',
      quality: 'medium',
      impostor: true,
      sampleLevel: 0,
      cameraType: 'perspective',
      tooltip: true,
    });
    stageRef.current = stage;

    const worker = new Worker(new URL('../workers/xtc.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<XtcWorkerResponse>) => {
      const message = event.data;
      if (message.sessionId !== sessionIdRef.current) return;

      if (message.type === 'index-progress') {
        setLoadingLabel(`Indexing frames... Found ${message.frameCount} frames`);
        setLoadingProgress(message.progress);
        return;
      }

      if (message.type === 'indexed') {
        const resolver = indexResolverRef.current;
        if (resolver && resolver.sessionId === message.sessionId) {
          const value: IndexedTrajectory = {
            atomCount: message.atomCount,
            frameCount: message.frameCount,
            timeOffset: message.timeOffset,
            deltaTime: message.deltaTime,
            duration: message.duration,
            times: message.times,
          };
          timesRef.current = message.times;
          frameCountRef.current = message.frameCount;
          resolver.resolve(value);
          indexResolverRef.current = null;
        }
        return;
      }

      if (message.type === 'frame') {
        const response = message as FrameWorkerResponse;
        const callback = frameCallbacksRef.current.get(response.requestId);
        if (callback) {
          frameCallbacksRef.current.delete(response.requestId);
          callback(response.frameIndex, response.box, response.coordinates, frameCountRef.current);
        }
        return;
      }

      if (message.type === 'trail-progress') {
        if (message.requestId === activeTrailRequestRef.current) setTrailProgress(message.progress);
        return;
      }

      if (message.type === 'trail') {
        const response = message as TrailWorkerResponse;
        const resolver = trailResolversRef.current.get(response.requestId);
        if (resolver) {
          trailResolversRef.current.delete(response.requestId);
          resolver.resolve(response);
        }
        return;
      }

      if (message.type === 'error') {
        const response = message as WorkerErrorResponse;
        const failure = new Error(response.message || 'XTC decoding failed.');
        if (response.requestId !== undefined) {
          const trailResolver = trailResolversRef.current.get(response.requestId);
          if (trailResolver) {
            trailResolversRef.current.delete(response.requestId);
            trailResolver.reject(failure);
            return;
          }

          const callback = frameCallbacksRef.current.get(response.requestId);
          if (callback) {
            frameCallbacksRef.current.delete(response.requestId);
            const position = structureRef.current?.structure.getAtomData({ what: { position: true } }).position;
            if (position) callback(currentFrame, new Float32Array(9), new Float32Array(position), frameCountRef.current);
          }
        } else {
          const resolver = indexResolverRef.current;
          if (resolver) {
            indexResolverRef.current = null;
            resolver.reject(failure);
          }
        }
        setError(failure.message);
      }
    };

    worker.onerror = (event) => {
      const failure = new Error(event.message || 'Trajectory decoding thread error.');
      indexResolverRef.current?.reject(failure);
      indexResolverRef.current = null;
      setError(failure.message);
      setLoading(false);
      setTrailLoading(false);
    };

    const resizeObserver = new ResizeObserver(() => stage.handleResize());
    resizeObserver.observe(viewerElement);

    return () => {
      resizeObserver.disconnect();
      playerRef.current?.pause();
      worker.terminate();
      stage.dispose();
      viewerElement.replaceChildren();
      workerRef.current = null;
      stageRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveSelection = useMemo(() => {
    const selection = displaySelection.trim() || 'all';
    return showSolvent ? selection : `(${selection}) and not water`;
  }, [displaySelection, showSolvent]);

  const applyRepresentation = useCallback(() => {
    const component = structureRef.current;
    if (!component) return;

    try {
      component.removeAllRepresentations();
      const proteinAtoms = component.structure.getAtomIndices(new Selection(`protein and (${effectiveSelection})`)) || [];
      if (representation === 'cartoon' && proteinAtoms.length > 0) {
        component.addRepresentation('cartoon', {
          sele: `protein and (${effectiveSelection})`,
          colorScheme: 'chainname',
          quality: 'medium',
          aspectRatio: 4.5,
          radiusScale: 0.8,
        });
        component.addRepresentation('ball+stick', {
          sele: `(${effectiveSelection}) and not protein`,
          colorScheme: 'element',
          quality: 'medium',
          radiusScale: 1.25,
          aspectRatio: 1.8,
        });
      } else {
        component.addRepresentation(representation === 'cartoon' ? 'ball+stick' : representation, {
          sele: effectiveSelection,
          colorScheme: representation === 'line' ? 'chainname' : 'element',
          quality: representation === 'line' ? 'low' : 'medium',
          radiusScale: representation === 'spacefill' ? 0.75 : 1,
          multipleBond: 'symmetric',
        });
      }

      if (showSolvent && displaySelection === 'all' && representation === 'cartoon') {
        component.addRepresentation('line', {
          sele: 'water',
          colorScheme: 'element',
          opacity: 0.42,
        });
      }
      setError(null);
    } catch (representationError) {
      setError(`Display selection could not be applied:${representationError instanceof Error ? representationError.message : String(representationError)}`);
    }
  }, [displaySelection, effectiveSelection, representation, showSolvent]);

  useEffect(() => {
    if (ready) applyRepresentation();
  }, [applyRepresentation, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !stats) return;
    player.setParameters({
      step: playbackStep,
      timeout: Math.max(16, Math.round(1000 / fps)),
      start: 0,
      end: Math.max(0, stats.frameCount - 1),
      mode: 'loop',
      direction: 'forward',
      interpolateType: '',
    });
  }, [fps, playbackStep, stats]);

  useEffect(() => {
    const trajectory = trajectoryRef.current;
    if (!trajectory) return;
    trajectory.setParameters({
      centerPbc,
      removePbc: repairMolecules,
      superpose,
    });
  }, [centerPbc, repairMolecules, superpose]);

  const clearTrail = useCallback(() => {
    if (activeTrailRequestRef.current !== null) {
      workerRef.current?.postMessage({
        type: 'cancel-trail',
        requestId: activeTrailRequestRef.current,
        sessionId: sessionIdRef.current,
      });
      activeTrailRequestRef.current = null;
    }
    if (trailComponentRef.current && stageRef.current) {
      stageRef.current.removeComponent(trailComponentRef.current);
      trailComponentRef.current = null;
    }
    setTrailInfo(null);
    setTrailLoading(false);
    setTrailProgress(0);
  }, []);

  const resetViewer = useCallback(() => {
    playerRef.current?.pause();
    setIsPlaying(false);
    clearTrail();
    stageRef.current?.removeAllComponents();
    structureRef.current = null;
    trajectoryRef.current = null;
    playerRef.current = null;
    frameCallbacksRef.current.clear();
    trailResolversRef.current.clear();
    timesRef.current = new Float64Array(0);
    frameCountRef.current = 0;
    desiredFrameRef.current = 0;
    setStats(null);
    setReady(false);
    setCurrentFrame(0);
    setPreviewFrame(0);
  }, [clearTrail]);

  const loadTrajectory = useCallback(async () => {
    const stage = stageRef.current;
    const worker = workerRef.current;
    if (!stage || !worker || !files.gro || !files.xtc) return;

    resetViewer();
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    setLoading(true);
    setLoadingProgress(0.03);
    setLoadingLabel('Reading initial GRO structure...');
    setError(null);

    try {
      const loaded = await stage.loadFile(files.gro, {
        ext: 'gro',
        name: files.gro.name,
        defaultRepresentation: false,
      });
      if (sessionId !== sessionIdRef.current) return;
      if (!(loaded instanceof StructureComponent)) throw new Error('GRO file failed to parse into a molecular structure.');
      structureRef.current = loaded;
      setLoadingProgress(0.12);
      setLoadingLabel('Scanning XTC to build a random-access frame index...');

      const indexed = await new Promise<IndexedTrajectory>((resolve, reject) => {
        indexResolverRef.current = { sessionId, resolve, reject };
        worker.postMessage({ type: 'init', file: files.xtc, sessionId });
      });
      if (sessionId !== sessionIdRef.current) return;

      if (loaded.structure.atomCount !== indexed.atomCount) {
        throw new Error(
          `Atom count mismatch:${files.gro.name} contains ${loaded.structure.atomCount} atoms,${files.xtc.name} contains ${indexed.atomCount} atoms.`,
        );
      }

      frameCountRef.current = indexed.frameCount;
      timesRef.current = indexed.times;
      const requestCallback: TrajectoryRequestCallback = (callback, frame) => {
        if (frame === undefined) {
          (callback as CountCallback)(indexed.frameCount);
          return;
        }
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        frameCallbacksRef.current.set(requestId, callback as FrameCallback);
        worker.postMessage({
          type: 'frame',
          requestId,
          frameIndex: frame,
          sessionId,
        });
      };

      const addCallbackTrajectory = loaded.addTrajectory.bind(loaded) as unknown as (
        source: TrajectoryRequestCallback,
        params: Record<string, unknown>,
      ) => ReturnType<StructureComponent['addTrajectory']>;
      const trajectoryElement = addCallbackTrajectory(requestCallback, {
        initialFrame: 0,
        timeOffset: indexed.timeOffset,
        deltaTime: indexed.deltaTime,
        centerPbc,
        removePbc: repairMolecules,
        superpose,
      });
      const trajectory = trajectoryElement.trajectory;
      trajectoryRef.current = trajectory;
      const player = new TrajectoryPlayer(trajectory, {
        step: playbackStep,
        timeout: Math.max(16, Math.round(1000 / fps)),
        start: 0,
        end: indexed.frameCount - 1,
        mode: 'loop',
        direction: 'forward',
        interpolateType: '',
      });
      trajectory.setPlayer(player);
      playerRef.current = player;

      trajectory.signals.frameChanged.add((frame: number) => {
        if (sessionId !== sessionIdRef.current || frame < 0) return;
        setCurrentFrame(frame);
        setPreviewFrame(frame);
        desiredFrameRef.current = frame;

        const cache = trajectory.frameCache as Record<string, Float32Array>;
        const keys = Object.keys(cache);
        if (keys.length > 12) {
          keys.forEach((key) => {
            if (Number(key) !== frame) delete cache[key];
          });
        }
      });
      player.signals.startedRunning.add(() => setIsPlaying(true));
      player.signals.haltedRunning.add(() => setIsPlaying(false));

      setStats({
        ...indexed,
        structureName: files.gro.name,
        trajectoryName: files.xtc.name,
      });
      setReady(true);
      setLoadingProgress(1);
      setLoadingLabel('Trajectory ready');
      applyRepresentation();
      const proteinAtomCount = loaded.structure.getAtomIndices(new Selection('protein'))?.length || 0;
      if (proteinAtomCount > 0) loaded.autoView('protein', 0);
      else loaded.autoView(0);
    } catch (loadError) {
      resetViewer();
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (sessionId === sessionIdRef.current) setLoading(false);
    }
  }, [
    applyRepresentation,
    centerPbc,
    files.gro,
    files.xtc,
    fps,
    playbackStep,
    repairMolecules,
    resetViewer,
    superpose,
  ]);

  const requestFrame = useCallback((requestedFrame: number) => {
    const trajectory = trajectoryRef.current;
    if (!trajectory || !stats) return;
    const frame = Math.max(0, Math.min(stats.frameCount - 1, Math.round(requestedFrame)));
    desiredFrameRef.current = frame;
    setPreviewFrame(frame);
    playerRef.current?.pause();
    trajectory.setFrame(frame);
  }, [stats]);

  const togglePlayback = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.toggle();
  }, []);

  const buildCompleteTrail = useCallback(async () => {
    const component = structureRef.current;
    const stage = stageRef.current;
    const worker = workerRef.current;
    if (!component || !stage || !worker || !stats) return;

    try {
      setError(null);
      setTrailLoading(true);
      setTrailProgress(0);
      if (trailComponentRef.current) {
        stage.removeComponent(trailComponentRef.current);
        trailComponentRef.current = null;
      }

      const selected = component.structure.getAtomIndices(new Selection(trailSelection)) || [];
      if (selected.length === 0) throw new Error(`Atom selection "${trailSelection}" did not match any atoms.`);
      const stride = Math.max(1, Math.ceil(selected.length / MAX_TRAIL_ATOMS));
      const tracked = selected.filter((_, index) => index % stride === 0).slice(0, MAX_TRAIL_ATOMS);
      const maxSamples = trailResolution === 'all' ? 0 : Number(trailResolution);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      activeTrailRequestRef.current = requestId;

      const response = await new Promise<TrailWorkerResponse>((resolve, reject) => {
        trailResolversRef.current.set(requestId, { resolve, reject });
        worker.postMessage({
          type: 'trail',
          requestId,
          atomIndices: tracked,
          maxSamples,
          unwrapPbc: unwrapTrailPbc,
          sessionId: sessionIdRef.current,
        });
      });
      if (requestId !== activeTrailRequestRef.current) return;

      const segmentCount = response.position1.length / 3;
      const color = new Float32Array(segmentCount * 3);
      const color2 = new Float32Array(segmentCount * 3);
      const timeSegments = Math.max(1, response.sampleCount - 1);
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const progress = Math.floor(segment / response.trackCount) / timeSegments;
        const nextProgress = Math.min(1, progress + 1 / timeSegments);
        const offset = segment * 3;
        color[offset] = 0.18 + progress * 0.76;
        color[offset + 1] = 0.42 + progress * 0.12;
        color[offset + 2] = 0.82 - progress * 0.55;
        color2[offset] = 0.18 + nextProgress * 0.76;
        color2[offset + 1] = 0.42 + nextProgress * 0.12;
        color2[offset + 2] = 0.82 - nextProgress * 0.55;
      }

      const shape = new Shape('Complete GROMACS trajectory');
      shape.addBuffer(new WidelineBuffer({
        position1: response.position1,
        position2: response.position2,
        color,
        color2,
      }, {
        linewidth: 2,
        opacity: 0.72,
        depthWrite: false,
        disablePicking: true,
      }));
      const shapeComponent = stage.addComponentFromObject(shape, { name: 'Full Trajectory' });
      if (!shapeComponent) throw new Error('Unable to create full trajectory layer.');
      shapeComponent.addRepresentation('buffer', { opacity: 0.72 });
      trailComponentRef.current = shapeComponent;
      setTrailInfo({
        tracks: response.trackCount,
        samples: response.sampleCount,
        sourceAtoms: selected.length,
      });
      setTrailProgress(1);
    } catch (trailError) {
      setError(trailError instanceof Error ? trailError.message : String(trailError));
    } finally {
      setTrailLoading(false);
      activeTrailRequestRef.current = null;
    }
  }, [stats, trailResolution, trailSelection, unwrapTrailPbc]);

  const exportImage = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || !ready) return;
    try {
      const image = await stage.makeImage({ factor: 2, antialias: true, transparent: false });
      saveAs(image, `gromacs-frame-${currentFrame + 1}.png`);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Screenshot export failed.');
    }
  }, [currentFrame, ready]);

  return (
    <div className="flex h-screen min-h-[720px] flex-col overflow-hidden bg-[#F5F5F0] text-[#0A1128]">
      <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-gray-100 bg-white px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/agent/modeling')}
            className="flex items-center gap-2 rounded-[32px] border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft size={13} />
            Modeling
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-[16px] bg-[#0A1128] text-white">
            <Waves size={17} />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Modeling · Molecular Dynamics</p>
            <h1 className="text-sm font-bold tracking-tight">GROMACS TRAJECTORY VIEWER</h1>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <span className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-500">
            Rotate · Left drag
          </span>
          <span className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-500">
            Pan · Right drag
          </span>
          <span className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-500">
            Zoom · Wheel
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <aside className="custom-scrollbar w-[356px] shrink-0 overflow-y-auto rounded-[24px] bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">1 · Simulation files</h2>
              {Object.values(files).some(Boolean) && (
                <button
                  type="button"
                  onClick={() => {
                    resetViewer();
                    setFiles(EMPTY_FILES);
                    setError(null);
                  }}
                  className="text-[10px] font-medium text-gray-400 hover:text-red-500"
                >
                  Clear
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".gro,.xtc,.tpr,.top"
              className="hidden"
              onChange={(event) => {
                addFiles(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(Array.from(event.dataTransfer.files));
              }}
              className="mb-3 flex w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center transition-colors hover:border-[#0A1128]/30 hover:bg-white"
            >
              <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm">
                <Upload size={17} />
              </span>
              <span className="text-xs font-semibold text-gray-700">Drag and drop complete GROMACS file set</span>
              <span className="mt-1 text-[10px] text-gray-400">Select at least GRO + XTC; TPR / TOP can be included simultaneously</span>
            </button>

            <div className="grid gap-2">
              {(Object.keys(FILE_META) as FileRole[]).map((role) => (
                <FileSlot
                  key={role}
                  role={role}
                  file={files[role]}
                  onRemove={() => setFiles((previous) => ({ ...previous, [role]: null }))}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={loadTrajectory}
              disabled={!hasRequiredFiles || loading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-[32px] bg-[#0A1128] px-4 py-3 text-xs font-bold text-white shadow-[0_4px_15px_rgba(10,17,40,0.2)] transition-colors hover:bg-[#162044] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
              {loading ? 'Loading trajectory...' : ready ? 'Reload File' : 'Open Trajectory Viewer'}
            </button>

            {loading && (
              <div className="mt-3 rounded-[16px] border border-gray-100 bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] text-gray-500">
                  <span className="truncate pr-2">{loadingLabel}</span>
                  <span className="font-mono">{Math.round(loadingProgress * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-[#0A1128] transition-all" style={{ width: `${Math.max(3, loadingProgress * 100)}%` }} />
                </div>
              </div>
            )}
          </section>

          <div className="my-5 border-t border-gray-100" />

          <section className={!ready ? 'pointer-events-none opacity-40' : ''}>
            <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">2 · VMD-style representation</h2>
            <label className="mb-1.5 block text-[10px] font-semibold text-gray-500">Drawing method</label>
            <select
              value={representation}
              onChange={(event) => setRepresentation(event.target.value as RepresentationStyle)}
              className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 outline-none focus:border-gray-300"
            >
              {REPRESENTATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>

            <label className="mb-1.5 mt-3 block text-[10px] font-semibold text-gray-500">Selected atoms · NGL selection</label>
            <div className="flex gap-2">
              <input
                value={selectionDraft}
                onChange={(event) => setSelectionDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setDisplaySelection(selectionDraft.trim() || 'all');
                }}
                placeholder="protein / ligand / :A / not hydrogen"
                className="min-w-0 flex-1 rounded-[16px] border border-gray-200 px-3 py-2 text-[11px] font-mono text-gray-600 outline-none focus:border-gray-300"
              />
              <button
                type="button"
                onClick={() => setDisplaySelection(selectionDraft.trim() || 'all')}
                className="rounded-[32px] bg-gray-100 px-3 text-[10px] font-bold text-gray-600 hover:bg-gray-200"
              >
                Apply
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['all', 'protein', 'ligand', 'not hydrogen'].map((selection) => (
                <button
                  key={selection}
                  type="button"
                  onClick={() => {
                    setSelectionDraft(selection);
                    setDisplaySelection(selection);
                  }}
                  className={`rounded-full border px-2 py-1 text-[9px] font-medium ${
                    displaySelection === selection
                      ? 'border-[#0A1128] bg-[#0A1128] text-white'
                      : 'border-gray-100 bg-gray-50 text-gray-500'
                  }`}
                >
                  {selection}
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-gray-100 pt-2">
              <Toggle checked={showSolvent} onChange={setShowSolvent} label="Show Water & Solvents" description="Turning off for large systems significantly improves playback smoothness" />
            </div>
          </section>

          <div className="my-5 border-t border-gray-100" />

          <section className={!ready ? 'pointer-events-none opacity-40' : ''}>
            <div className="mb-3 flex items-center gap-2">
              <Settings2 size={13} className="text-gray-400" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">3 · Periodic boundary</h2>
            </div>
            <div className="space-y-1">
              <Toggle checked={centerPbc} onChange={setCenterPbc} label="Center PBC" description="Center on backbone periodic mean position" />
              <Toggle checked={repairMolecules} onChange={setRepairMolecules} label="Repair molecules" description="Attempt to connect molecules across periodic boundaries" />
              <Toggle checked={superpose} onChange={setSuperpose} label="Align backbone" description="Align backbone to highlight conformational changes" />
            </div>
            <div className="mt-3 flex gap-2 rounded-[16px] border border-gray-100 bg-gray-50 p-3 text-[9px] leading-4 text-gray-500">
              <CircleAlert size={13} className="mt-0.5 shrink-0 text-gray-400" />
              <span>Browser corrections are suitable for quick viewing. Formal analysis should still use <b>gmx trjconv -pbc mol -center -ur compact</b> to generate a corrected trajectory.</span>
            </div>
          </section>

          <div className="my-5 border-t border-gray-100" />

          <section className={!ready ? 'pointer-events-none opacity-40' : ''}>
            <div className="mb-3 flex items-center gap-2">
              <Route size={13} className="text-gray-400" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">4 · Complete trajectory</h2>
            </div>
            <p className="mb-3 text-[10px] leading-4 text-gray-500">
              Overlay the motion paths of selected atoms from start to end in the same scene. To maintain readability, a maximum of {MAX_TRAIL_ATOMS} atom paths are displayed.
            </p>
            <label className="mb-1.5 block text-[10px] font-semibold text-gray-500">Trail atoms</label>
            <select
              value={trailSelection}
              onChange={(event) => setTrailSelection(event.target.value)}
              className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 outline-none"
            >
              {TRAIL_SELECTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1.5 block text-[10px] font-semibold text-gray-500">Time samples</span>
                <select
                  value={trailResolution}
                  onChange={(event) => setTrailResolution(event.target.value as TrailResolution)}
                  className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-2.5 py-2 text-[10px] text-gray-700 outline-none"
                >
                  <option value="250">Fast · 250</option>
                  <option value="500">Standard · 500</option>
                  <option value="1000">Fine · 1000</option>
                  <option value="all">Every frame</option>
                </select>
              </label>
              <div>
                <span className="mb-1.5 block text-[10px] font-semibold text-gray-500">PBC path</span>
                <button
                  type="button"
                  onClick={() => setUnwrapTrailPbc((value) => !value)}
                  className={`w-full rounded-[16px] border px-2.5 py-2 text-[10px] font-semibold ${
                    unwrapTrailPbc ? 'border-[#0A1128] bg-[#0A1128] text-white' : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  {unwrapTrailPbc ? 'Unwrap ON' : 'Raw path'}
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={buildCompleteTrail}
                disabled={trailLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-[32px] bg-[#2E4A8E] px-3 py-2.5 text-[10px] font-bold text-white hover:bg-[#3D5BA6] disabled:opacity-50"
              >
                {trailLoading ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />}
                {trailLoading ? `${Math.round(trailProgress * 100)}%` : 'Show Full Trajectory'}
              </button>
              <button
                type="button"
                onClick={clearTrail}
                disabled={!trailInfo && !trailLoading}
                className="rounded-[32px] border border-gray-200 bg-gray-50 px-3 text-[10px] font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            {trailInfo && (
              <p className="mt-2 rounded-[16px] bg-gray-50 px-3 py-2 text-[9px] leading-4 text-gray-500">
                Full time range covered:{trailInfo.tracks} paths × {trailInfo.samples} time samples
                {trailInfo.sourceAtoms > trailInfo.tracks ? `(evenly sampled from ${trailInfo.sourceAtoms} matching atoms)` : ''}
              </p>
            )}
          </section>
        </aside>

        <section className="relative min-w-0 flex-1 overflow-hidden rounded-[24px] bg-[#070A12] shadow-[0_4px_30px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
          <div ref={viewerElementRef} className="absolute inset-0" />

          {!ready && !loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="max-w-md px-8 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] border border-white/10 bg-white/5 text-white/70">
                  <Film size={28} />
                </div>
                <h2 className="text-xl font-semibold text-white/90">Load GROMACS Dynamics Simulation</h2>
                <p className="mt-2 text-sm leading-6 text-white/40">
                  After uploading the initial GRO structure and XTC trajectory, you can rotate the system, step through frames, play continuously, and overlay full motion paths just like in VMD.
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#070A12]/75">
              <div className="w-[340px] rounded-[24px] border border-white/10 bg-[#111622] p-6 text-center shadow-2xl">
                <Loader2 size={24} className="mx-auto animate-spin text-white/80" />
                <p className="mt-4 text-sm font-semibold text-white/90">{loadingLabel}</p>
                <p className="mt-1 text-[10px] leading-4 text-white/40">Large files generate only a lightweight index; coordinates are decoded on demand during playback or frame scrubbing.</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${Math.max(3, loadingProgress * 100)}%` }} />
                </div>
              </div>
            </div>
          )}

          {ready && stats && (
            <>
              <div className="pointer-events-none absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <div className="rounded-[16px] border border-gray-100 bg-white px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">System</p>
                    <p className="mt-0.5 max-w-[220px] truncate text-[10px] font-semibold text-[#0A1128]">{stats.structureName}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-100 bg-white px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Atoms</p>
                    <p className="mt-0.5 font-mono text-[10px] font-semibold text-[#0A1128]">{stats.atomCount.toLocaleString()}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-100 bg-white px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Duration</p>
                    <p className="mt-0.5 font-mono text-[10px] font-semibold text-[#0A1128]">{formatTime(stats.duration)}</p>
                  </div>
                  {trailInfo && (
                    <div className="rounded-[16px] border border-gray-100 bg-white px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Full trail</p>
                      <p className="mt-0.5 font-mono text-[10px] font-semibold text-[#0A1128]">{trailInfo.tracks} paths</p>
                    </div>
                  )}
                </div>

                <div className="pointer-events-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => stageRef.current?.autoView(300)}
                    className="flex h-9 w-9 items-center justify-center rounded-[16px] border border-gray-100 bg-white text-gray-600 shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:bg-gray-50"
                    title="Reset View"
                  >
                    <Focus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => stageRef.current?.setSpin(!stageRef.current.spinAnimation.paused)}
                    className="flex h-9 w-9 items-center justify-center rounded-[16px] border border-gray-100 bg-white text-gray-600 shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:bg-gray-50"
                    title="Auto Rotate"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={exportImage}
                    className="flex h-9 w-9 items-center justify-center rounded-[16px] border border-gray-100 bg-white text-gray-600 shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:bg-gray-50"
                    title="Export Screenshot of Current Frame"
                  >
                    <Camera size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => viewerElementRef.current && stageRef.current?.toggleFullscreen(viewerElementRef.current)}
                    className="flex h-9 w-9 items-center justify-center rounded-[16px] border border-gray-100 bg-white text-gray-600 shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:bg-gray-50"
                    title="Fullscreen"
                  >
                    <Expand size={14} />
                  </button>
                </div>
              </div>

              <div className="absolute bottom-4 left-4 right-4 rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.16)]">
                <div className="mb-3 flex items-center gap-3">
                  <div className="w-[100px] shrink-0">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Simulation time</p>
                    <p className="mt-0.5 font-mono text-xs font-bold text-[#0A1128]">{formatTime(currentTime)}</p>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, stats.frameCount - 1)}
                    value={previewFrame}
                    onChange={(event) => {
                      const frame = Number(event.target.value);
                      setPreviewFrame(frame);
                      requestFrame(frame);
                    }}
                    className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#0A1128]"
                    aria-label="Trajectory Frame"
                  />
                  <div className="w-[116px] shrink-0 text-right">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Frame</p>
                    <p className="mt-0.5 font-mono text-xs font-bold text-[#0A1128]">{previewFrame + 1} / {stats.frameCount}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => requestFrame(0)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100" title="First Frame">
                      <SkipBack size={13} />
                    </button>
                    <button type="button" onClick={() => requestFrame(currentFrame - playbackStep)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100" title="Previous Frame">
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={togglePlayback}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0A1128] text-white shadow-[0_4px_15px_rgba(10,17,40,0.22)] hover:bg-[#162044]"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="translate-x-px" />}
                    </button>
                    <button type="button" onClick={() => requestFrame(currentFrame + playbackStep)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100" title="Next Frame">
                      <ChevronRight size={14} />
                    </button>
                    <button type="button" onClick={() => requestFrame(stats.frameCount - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100" title="Last Frame">
                      <SkipForward size={13} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                      <Gauge size={12} />
                      FPS
                      <select value={fps} onChange={(event) => setFps(Number(event.target.value))} className="rounded-[16px] border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-[10px] text-gray-600 outline-none">
                        {[10, 20, 30, 60].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                      Step
                      <select value={playbackStep} onChange={(event) => setPlaybackStep(Number(event.target.value))} className="rounded-[16px] border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-[10px] text-gray-600 outline-none">
                        {[1, 2, 5, 10, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <div className="hidden items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-[9px] text-gray-500 xl:flex">
                      <Box size={11} />
                      {stats.trajectoryName}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="absolute left-1/2 top-20 flex max-w-xl -translate-x-1/2 items-start gap-2 rounded-[16px] border border-red-100 bg-white px-4 py-3 text-xs text-red-600 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              <span className="leading-5">{error}</span>
              <button type="button" onClick={() => setError(null)} className="ml-2 text-gray-300 hover:text-gray-500" aria-label="Dismiss Error">×</button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default GromacsTrajectoryViewer;
