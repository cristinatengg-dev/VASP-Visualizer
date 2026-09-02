/**
 * agents/rendering/index.tsx — Scientific Cover Agent Main Page
 *
 * Workflow steps:
 *   1. input           → Five-section input panel
 *   2. parsing         → Gemini API extracting science entities
 *   3. plan-selection  → Three visual plan cards
 *   4. prompt-review   → Compiled prompt display + confirm
 *   5. base-generation → Gemini generates HD images (direct export)
 *   6. export          → Download result
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, ChevronRight, Sparkles, BarChart3,
  AlertCircle, Download, RefreshCw, ImageIcon, Wand2, X,
  Brush, Eraser, RotateCcw,
} from 'lucide-react';

import InputPanel from './components/InputPanel';
import PlanCards from './components/PlanCards';
import FigureMode from './FigureMode';

import {
  StylePreferences,
  AdvancedSwitches,
  OutputParams,
  WorkflowStep,
  PlanCard,
  ParsedScience,
  CompiledPrompt,
  RenderKind,
} from './types';

import {
  parseScience,
  parsePdf,
  editBaseImage,
  generateBaseImages,
  generateVisualPlans,
  compilePlanAPrompt,
} from './promptCompiler';

// ─── Default State Values ─────────────────────────────────────────────────────

const DEFAULT_STYLE_PREFS: StylePreferences = {
  cinematic: 50,
  macro: 40,
  abstract: 20,
  realistic: 60,
  glass: 20,
  metallic: 15,
};

const DEFAULT_SWITCHES: AdvancedSwitches = {
  strictChemicalStructure: false,
  prioritizeAccuracy: true,
  prioritizeArt: false,
  useReferenceConstraint: false,
  publishExportMode: true,
};

const DEFAULT_OUTPUT_PARAMS: OutputParams = {
  aspectRatio: '3:4',
  customWidth: 4800,
  customHeight: 6400,
  journal: 'Nature Catalysis',
  ultraHD: true,
  watermarkReserve: false,
};

// ─── Step Indicator ──────────────────────────────────────────────────────────

const STEPS: { id: WorkflowStep; label: string }[] = [
  { id: 'input', label: 'Input' },
  { id: 'plan-selection', label: 'Visual Plans' },
  { id: 'prompt-review', label: 'Prompt' },
  { id: 'base-generation', label: 'Generate' },
  { id: 'export', label: 'Export' },
];

const STEP_ORDER: WorkflowStep[] = [
  'input', 'plan-selection', 'prompt-review', 'base-generation', 'export',
];

const StepIndicator: React.FC<{ currentStep: WorkflowStep }> = ({ currentStep }) => {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-1">
              <div className={`
                w-5 h-5 rounded-full flex items-center justify-center
                text-[8px] font-bold transition-all duration-200
                ${isDone ? 'bg-emerald-500 text-white' :
                  isCurrent ? 'bg-[#0A1128] text-white' : 'bg-gray-100 text-gray-400'}
              `}>
                {isDone ? '✓' : i + 1}
              </div>
              <span className={`
                text-[9px] font-semibold hidden sm:block
                ${isCurrent ? 'text-[#0A1128]' : 'text-gray-400'}
              `}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-px ${i < currentIndex ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Prompt Review Panel ─────────────────────────────────────────────────────

const PromptReviewPanel: React.FC<{
  compiledPrompt: CompiledPrompt;
  onConfirm: () => void;
  onBack: () => void;
}> = ({ compiledPrompt, onConfirm, onBack }) => {
  const [copied, setCopied] = useState(false);

  const copyPrompt = () => {
    navigator.clipboard.writeText(compiledPrompt.fullPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const slots = [
    { label: '1. Main Theme', value: compiledPrompt.mainTheme },
    { label: '2. Focus Area', value: compiledPrompt.focusArea },
    { label: '3. Core Structure', value: compiledPrompt.coreScientificStructure },
    { label: '4. Mechanism', value: compiledPrompt.specificEvent },
    { label: '5. Spatial Layers', value: compiledPrompt.spatialDepthLayers },
    { label: '6. Chemical Species', value: compiledPrompt.mandatoryChemicalSpecies },
    { label: '7. Accuracy Constraints', value: compiledPrompt.scientificAccuracyConstraints },
    { label: '8. Clutter Rules', value: compiledPrompt.reducedClutter },
    { label: '9. Texture & Lighting', value: compiledPrompt.textureAndLighting },
    { label: '10. Style', value: compiledPrompt.style },
    { label: '11. Composition', value: compiledPrompt.compositionConstraints },
    { label: '12. Output', value: compiledPrompt.outputConstraints },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
          Phase 4 · Prompt Compiler
        </p>
        <h2 className="text-lg font-black text-[#0A1128]">Compiled Prompt Review</h2>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          12-slot structured prompt assembled from your science data.
          Hard constraints are auto-appended. Review and confirm to start generation.
        </p>
      </div>

      <div className="space-y-2">
        {slots.map(({ label, value }) => (
          <div key={label} className="border border-gray-100 rounded-[14px] overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{label}</p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[10px] text-gray-600 leading-relaxed font-mono">{value}</p>
            </div>
          </div>
        ))}

        <div className="border border-red-100 rounded-[14px] overflow-hidden">
          <div className="px-3 py-1.5 bg-red-50 border-b border-red-100">
            <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest">
              ⚠ Hard Scientific Constraints (Auto-Appended)
            </p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] text-gray-600 leading-relaxed font-mono whitespace-pre-line">
              {compiledPrompt.hardConstraints}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={copyPrompt}
          className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-100 rounded-[32px] text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy Prompt'}
        </button>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-100 rounded-[32px] text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
        >
          ← Back
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0A1128] text-white text-xs font-bold rounded-[32px] shadow-[0_4px_15px_rgba(10,17,40,0.2)] hover:bg-[#162044] hover:-translate-y-0.5 transition-all duration-200"
        >
          <ImageIcon size={12} strokeWidth={2} />
          Generate HD Images (Gemini)
          <ChevronRight size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

// ─── Phase 5: Image Generation & Export Panel ────────────────────────────────

const JOURNAL_STYLES: Record<string, { fontFamily: string; fontSize: string; subFontSize: string; lineHeight: string; position: string; letterSpacing: string }> = {
  'Nature': { fontFamily: "'Georgia', serif", fontSize: '18%', subFontSize: '18%', lineHeight: '0.85', position: 'top-left', letterSpacing: '-0.03em' },
  'Nature Catalysis': { fontFamily: "'Georgia', serif", fontSize: '10%', subFontSize: '13%', lineHeight: '0.9', position: 'top-left', letterSpacing: '-0.02em' },
  'Nature Materials': { fontFamily: "'Georgia', serif", fontSize: '10%', subFontSize: '13%', lineHeight: '0.9', position: 'top-left', letterSpacing: '-0.02em' },
  'JACS': { fontFamily: "'Arial', sans-serif", fontSize: '10%', subFontSize: '10%', lineHeight: '1', position: 'top-center', letterSpacing: '0.05em' },
  'Angewandte Chemie': { fontFamily: "'Times New Roman', serif", fontSize: '9%', subFontSize: '9%', lineHeight: '1', position: 'top-left', letterSpacing: '0' },
  'ACS Catalysis': { fontFamily: "'Arial', sans-serif", fontSize: '10%', subFontSize: '10%', lineHeight: '1', position: 'top-left', letterSpacing: '0.02em' },
  'Advanced Materials': { fontFamily: "'Helvetica Neue', 'Helvetica', sans-serif", fontSize: '9%', subFontSize: '9%', lineHeight: '1', position: 'top-left', letterSpacing: '0.03em' },
};

const JournalNameOverlay: React.FC<{ journal: string }> = ({ journal }) => {
  const style = JOURNAL_STYLES[journal] || JOURNAL_STYLES['Nature'];
  const parts = journal.split(' ');
  const isNatureFamily = journal.startsWith('Nature');

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ padding: '5% 6%' }}>
      {isNatureFamily ? (
        <div style={{ fontFamily: style.fontFamily, color: 'white', textShadow: '0 3px 20px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: style.fontSize, fontWeight: 400, fontStyle: 'italic', lineHeight: style.lineHeight, letterSpacing: style.letterSpacing }}>
            {parts[0]?.toLowerCase()}
          </div>
          {parts.length > 1 && (
            <div style={{ fontSize: style.subFontSize, fontWeight: 700, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing }}>
              {parts.slice(1).join(' ').toLowerCase()}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: 700,
          color: 'white',
          textShadow: '0 3px 20px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.3)',
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textTransform: 'uppercase' as const,
        }}>
          {journal}
        </div>
      )}
    </div>
  );
};

type MaskTool = 'brush' | 'erase';
type MaskPoint = { x: number; y: number };
type MaskStroke = {
  tool: MaskTool;
  size: number;
  points: MaskPoint[];
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeImageSource = (image: string) => (
  image.startsWith('data:') ? image : `data:image/png;base64,${image}`
);

const loadRasterImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Could not load selected image'));
  img.src = src;
});

const paintStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: MaskStroke,
  width: number,
  height: number,
  target: 'overlay' | 'mask'
) => {
  if (stroke.points.length === 0) return;

  const lineWidth = Math.max(2, stroke.size * Math.min(width, height));
  const paintSelection = target === 'overlay'
    ? stroke.tool === 'brush'
    : stroke.tool === 'erase';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.globalCompositeOperation = paintSelection ? 'source-over' : 'destination-out';
  ctx.strokeStyle = target === 'overlay' ? 'rgba(16, 185, 129, 0.42)' : 'rgba(0, 0, 0, 1)';
  ctx.fillStyle = ctx.strokeStyle;

  const [first, ...rest] = stroke.points;
  const firstX = first.x * width;
  const firstY = first.y * height;

  if (rest.length === 0) {
    ctx.beginPath();
    ctx.arc(firstX, firstY, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(firstX, firstY);
  for (const point of rest) {
    ctx.lineTo(point.x * width, point.y * height);
  }
  ctx.stroke();
  ctx.restore();
};

const createEditMaskDataUrl = async (image: string, strokes: MaskStroke[]) => {
  const hasPaint = strokes.some((stroke) => stroke.tool === 'brush');
  if (!hasPaint) return null;

  const img = await loadRasterImage(normalizeImageSource(image));
  const width = Math.max(1, img.naturalWidth || img.width);
  const height = Math.max(1, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare edit mask');

  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillRect(0, 0, width, height);
  for (const stroke of strokes) {
    paintStroke(ctx, stroke, width, height, 'mask');
  }

  return canvas.toDataURL('image/png');
};

const BaseGenerationPanel: React.FC<{
  compiledPrompt: CompiledPrompt;
  outputParams: OutputParams;
  baseImages: string[];
  selectedBaseIndex: number;
  isGeneratingBase: boolean;
  isEditingImage: boolean;
  baseError: string | null;
  editError: string | null;
  onGenerate: () => void;
  onEditImage: (instruction: string, maskDataUrl?: string | null) => Promise<boolean>;
  onSelectBase: (idx: number) => void;
  onExport: (idx: number) => void;
  onBack: () => void;
}> = ({
  compiledPrompt,
  outputParams,
  baseImages,
  selectedBaseIndex,
  isGeneratingBase,
  isEditingImage,
  baseError,
  editError,
  onGenerate,
  onEditImage,
  onSelectBase,
  onExport,
  onBack,
}) => {
  const [showJournalPreview, setShowJournalPreview] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');
  const [maskTool, setMaskTool] = useState<MaskTool>('brush');
  const [brushSize, setBrushSize] = useState(42);
  const [maskStrokes, setMaskStrokes] = useState<MaskStroke[]>([]);
  const [isDrawingMask, setIsDrawingMask] = useState(false);
  const [maskError, setMaskError] = useState<string | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedImage = baseImages[selectedBaseIndex];
  const hasMaskPaint = maskStrokes.some((stroke) => stroke.tool === 'brush');

  const renderMaskOverlay = useCallback(() => {
    const canvas = maskCanvasRef.current;
    const image = previewImageRef.current;
    if (!canvas || !image) return;

    const rect = image.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.round(width * dpr);
    const nextHeight = Math.round(height * dpr);

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const stroke of maskStrokes) {
      paintStroke(ctx, stroke, width, height, 'overlay');
    }
  }, [maskStrokes]);

  useEffect(() => {
    renderMaskOverlay();
    const handleResize = () => requestAnimationFrame(renderMaskOverlay);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderMaskOverlay, selectedImage, isEditorOpen]);

  useEffect(() => {
    setMaskStrokes([]);
    setMaskError(null);
  }, [selectedBaseIndex]);

  const getMaskPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
  };

  const handleMaskPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isEditorOpen || isEditingImage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const size = brushSize / Math.max(1, Math.min(rect.width, rect.height));
    const point = getMaskPoint(event);
    setMaskError(null);
    setIsDrawingMask(true);
    setMaskStrokes((prev) => [...prev, { tool: maskTool, size, points: [point] }]);
  };

  const handleMaskPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMask || isEditingImage) return;
    event.preventDefault();
    const point = getMaskPoint(event);
    setMaskStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, points: [...last.points, point] };
      return next;
    });
  };

  const handleMaskPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMask) return;
    event.preventDefault();
    setIsDrawingMask(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const handleApplyEdit = async () => {
    if (!editInstruction.trim() || !selectedImage || isEditingImage) return;
    setMaskError(null);

    let maskDataUrl: string | null = null;
    try {
      maskDataUrl = await createEditMaskDataUrl(selectedImage, maskStrokes);
    } catch (error) {
      setMaskError(error instanceof Error ? error.message : 'Could not prepare edit mask');
      return;
    }

    const ok = await onEditImage(editInstruction.trim(), maskDataUrl);
    if (ok) {
      setEditInstruction('');
      setMaskStrokes([]);
      setIsEditorOpen(false);
    }
  };

  return (
  <div className="space-y-5">
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        Phase 5 · HD Image Generation
      </p>
      <h2 className="text-lg font-black text-[#0A1128]">HD Image Generation</h2>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
        The image model generates 1 publication-grade HD image at 600 DPI quality. Edit or export it when ready.
      </p>
    </div>

    {baseError && (
      <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-[14px]">
        <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
        <div>
          <p className="text-xs font-bold text-red-600">Generation Unavailable</p>
          <p className="text-[11px] text-red-500 mt-0.5 leading-relaxed">{baseError}</p>
        </div>
      </div>
    )}

    {isGeneratingBase ? (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-[#0A1128] rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-sm font-bold text-[#0A1128]">Generating HD Images</p>
          <p className="text-xs text-gray-500 mt-1">The image model is generating 1 publication-grade image...</p>
          <p className="text-[10px] text-gray-400 mt-1 font-mono">This may take 30–90 seconds</p>
        </div>
      </div>
    ) : baseImages.length > 0 ? (
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="relative rounded-[16px] overflow-hidden border-2 border-[#0A1128] shadow-[0_4px_20px_rgba(10,17,40,0.2)]">
          <img
            ref={previewImageRef}
            onLoad={renderMaskOverlay}
            src={selectedImage?.startsWith('data:') ? selectedImage : `data:image/png;base64,${selectedImage}`}
            alt="Generated image"
            className="w-full h-auto"
          />
          {isEditorOpen && (
            <canvas
              ref={maskCanvasRef}
              className={`absolute inset-0 h-full w-full ${
                isEditingImage ? 'cursor-wait' : 'cursor-crosshair'
              }`}
              style={{ touchAction: 'none' }}
              onPointerDown={handleMaskPointerDown}
              onPointerMove={handleMaskPointerMove}
              onPointerUp={handleMaskPointerUp}
              onPointerCancel={handleMaskPointerUp}
              onPointerLeave={handleMaskPointerUp}
            />
          )}
          {showJournalPreview && (
            <JournalNameOverlay journal={outputParams.journal} />
          )}
          <div className="absolute top-2 right-2 w-5 h-5 bg-[#0A1128] rounded-full flex items-center justify-center">
            <Check size={10} className="text-white" strokeWidth={3} />
          </div>
          {isEditingImage && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-2 border-gray-200 border-t-[#0A1128] rounded-full animate-spin" />
              <p className="text-xs font-bold text-[#0A1128]">Applying Edit</p>
            </div>
          )}
        </div>

        {baseImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {baseImages.map((img, idx) => (
              <button
                key={`${idx}-${img.slice(0, 18)}`}
                onClick={() => onSelectBase(idx)}
                className={`relative h-20 w-16 flex-shrink-0 overflow-hidden rounded-[12px] border-2 transition-all ${
                  selectedBaseIndex === idx
                    ? 'border-[#0A1128] shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                title={`Version ${idx + 1}`}
              >
                <img
                  src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
                  alt={`Version ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-white border border-gray-100 rounded-[20px]">
        <div className="w-14 h-14 rounded-[16px] bg-gray-50 border border-gray-100 flex items-center justify-center">
          <ImageIcon size={24} className="text-gray-300" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-bold text-[#0A1128]">Ready to Generate (v1.2)</p>
        <p className="text-xs text-gray-500 text-center max-w-xs">
          Click "Generate" to create 1 publication-grade HD image.
        </p>
      </div>
    )}

    {baseImages.length > 0 && isEditorOpen && (
      <div className="max-w-2xl mx-auto space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-gray-200 bg-white px-3 py-2">
          <button
            type="button"
            onClick={() => setMaskTool('brush')}
            disabled={isEditingImage}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
              maskTool === 'brush'
                ? 'border-[#0A1128] bg-[#0A1128] text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            title="Brush"
          >
            <Brush size={12} strokeWidth={2} />
            Brush
          </button>
          <button
            type="button"
            onClick={() => setMaskTool('erase')}
            disabled={isEditingImage}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
              maskTool === 'erase'
                ? 'border-[#0A1128] bg-[#0A1128] text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            title="Erase"
          >
            <Eraser size={12} strokeWidth={2} />
            Erase
          </button>
          <label className="flex min-w-[150px] flex-1 items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-600">
            <span>Size</span>
            <input
              type="range"
              min={14}
              max={96}
              value={brushSize}
              disabled={isEditingImage}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="h-1 flex-1 accent-[#0A1128]"
              title="Brush size"
            />
          </label>
          <button
            type="button"
            onClick={() => setMaskStrokes([])}
            disabled={isEditingImage || maskStrokes.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
            title="Clear selection"
          >
            <RotateCcw size={12} strokeWidth={2} />
            Clear
          </button>
          <span className={`rounded-full px-3 py-2 text-[10px] font-bold ${
            hasMaskPaint ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'
          }`}>
            {hasMaskPaint ? 'Local Edit' : 'Full Image'}
          </span>
        </div>
        <div className="flex items-end gap-2 rounded-[24px] border border-gray-200 bg-white px-3 py-2 shadow-[0_8px_30px_rgba(10,17,40,0.08)]">
          <div className="mb-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#0A1128] text-white">
            <Wand2 size={14} strokeWidth={2} />
          </div>
          <textarea
            value={editInstruction}
            onChange={(event) => setEditInstruction(event.target.value)}
            placeholder="Describe the edit..."
            rows={1}
            disabled={isEditingImage}
            className="min-h-[40px] flex-1 resize-none bg-transparent py-2 text-sm font-medium text-[#0A1128] outline-none placeholder:text-gray-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleApplyEdit}
            disabled={!editInstruction.trim() || isEditingImage || !selectedImage}
            className="mb-0.5 flex h-9 min-w-9 items-center justify-center rounded-full bg-[#0A1128] px-3 text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            title="Apply edit"
          >
            {isEditingImage ? (
              <RefreshCw size={14} className="animate-spin" strokeWidth={2} />
            ) : (
              <Sparkles size={14} strokeWidth={2} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsEditorOpen(false)}
            disabled={isEditingImage}
            className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Close editor"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        {(maskError || editError) && (
          <div className="flex items-start gap-2 rounded-[14px] border border-red-100 bg-red-50 px-4 py-3">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-red-400" strokeWidth={2} />
            <p className="text-[11px] leading-relaxed text-red-500">{maskError || editError}</p>
          </div>
        )}
      </div>
    )}

    <div className="flex gap-2 flex-wrap items-center">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-100 rounded-[32px] text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
      >
        ← Back
      </button>
      <button
        onClick={onGenerate}
        disabled={isGeneratingBase || isEditingImage}
        className="flex items-center gap-1.5 px-5 py-2.5 border border-gray-200 rounded-[32px] text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} strokeWidth={2} className={isGeneratingBase ? 'animate-spin' : ''} />
        Generate
      </button>
      {baseImages.length > 0 && selectedBaseIndex >= 0 && (
        <button
          type="button"
          onClick={() => setIsEditorOpen(true)}
          disabled={isEditingImage}
          className={`flex items-center gap-1.5 px-4 py-2.5 border rounded-[32px] text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            isEditorOpen
              ? 'border-[#0A1128] bg-[#0A1128] text-white'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
          title="Edit selected image"
        >
          <Wand2 size={12} strokeWidth={2} />
          Edit
        </button>
      )}
      {baseImages.length > 0 && (
        <button
          onClick={() => setShowJournalPreview(!showJournalPreview)}
          className={`flex items-center gap-1.5 px-4 py-2.5 border rounded-[32px] text-xs font-semibold transition-all ${
            showJournalPreview
              ? 'border-[#0A1128] bg-[#0A1128] text-white'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {showJournalPreview ? '✓ Journal Preview ON' : 'Journal Preview'}
        </button>
      )}
      {baseImages.length > 0 && selectedBaseIndex >= 0 && (
        <button
          onClick={() => onExport(selectedBaseIndex)}
          disabled={isEditingImage}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-[32px] hover:bg-emerald-700 hover:-translate-y-0.5 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <Download size={12} strokeWidth={2} />
          Export Clean Image (No Text)
        </button>
      )}
    </div>
    {baseImages.length > 0 && showJournalPreview && (
      <p className="text-[10px] text-gray-400 text-center">
        Preview shows journal title overlay — exported image will be clean (no text).
      </p>
    )}
  </div>
);};

// ─── Main Component ──────────────────────────────────────────────────────────

const RenderingAgent: React.FC = () => {
  const navigate = useNavigate();
  const [renderKind, setRenderKind] = useState<RenderKind>('illustration');

  const presentRenderingError = useCallback((message: string) => {
    const raw = String(message || '').trim();

    if (
      /(Text LLM|Gemini) API error\s*401/i.test(raw)
      || /invalid token/i.test(raw)
      || /无效的令牌/i.test(raw)
      || /new_api_error/i.test(raw)
    ) {
      if (/No available channel|model_not_found/i.test(raw)) {
        return 'Image model channel is temporarily unavailable. Please confirm on the model platform that current API Key\'s group has gpt-image-2 enabled.';
      }
      return 'Image service authentication failed. Please contact administrator to check upstream token or gateway configuration.';
    }

    if (/(IMAGE_LLM_API_KEY|TEXT_LLM_API_KEY|GEMINI_API_KEY).*not configured/i.test(raw)) {
      return 'Image service is not configured yet. Please contact administrator to add available credentials.';
    }

    return raw || 'Image analysis is temporarily unavailable. Please try again later.';
  }, []);

  // ── Input state ──
  const [abstractText, setAbstractText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [structureBaseImage, setStructureBaseImage] = useState<File | null>(null);
  const [outputParams, setOutputParams] = useState<OutputParams>(DEFAULT_OUTPUT_PARAMS);
  const [stylePreferences, setStylePreferences] = useState<StylePreferences>(DEFAULT_STYLE_PREFS);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [advancedSwitches, setAdvancedSwitches] = useState<AdvancedSwitches>(DEFAULT_SWITCHES);

  // ── Workflow state ──
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('input');
  const [isGenerating, setIsGenerating] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ── Phase 3 results ──
  const [parsedScience, setParsedScience] = useState<ParsedScience | null>(null);
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [compiledPrompt, setCompiledPrompt] = useState<CompiledPrompt | null>(null);

  // ── Phase 5 state ──
  const [isGeneratingBase, setIsGeneratingBase] = useState(false);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [baseImages, setBaseImages] = useState<string[]>([]);
  const [selectedBaseIndex, setSelectedBaseIndex] = useState<number>(0);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [imageEditError, setImageEditError] = useState<string | null>(null);
  const baseGenInFlightRef = useRef(false);

  const canGenerate = abstractText.trim().length > 20 || pdfFile !== null;

  // ── Phase 1: Parse science with Gemini ──
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setCurrentStep('parsing');
    setParseError(null);

    try {
      const science = pdfFile
        ? await parsePdf(pdfFile)
        : await parseScience(abstractText || 'Catalysis research on Ni/CeO2 for CO oxidation');
      const generatedPlans = generateVisualPlans(science);

      setParsedScience(science);
      setPlans(generatedPlans);
      setSelectedPlanId(null);
      setCompiledPrompt(null);
      setCurrentStep('plan-selection');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const friendly = message === 'This operation was aborted'
        ? 'PDF/analysis request timed out. Please try again or use a smaller PDF.'
        : presentRenderingError(message);
      setParseError(friendly);
      setCurrentStep('input');
    } finally {
      setIsGenerating(false);
    }
  }, [abstractText, pdfFile, presentRenderingError]);

  // ── Phase 3: Select plan + compile prompt ──
  const handleSelectPlan = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    if (parsedScience && plans.length > 0) {
      const plan = plans.find((p) => p.id === planId);
      if (plan) {
        const compiled = compilePlanAPrompt(
          parsedScience,
          plan,
          outputParams,
          stylePreferences,
          advancedSwitches,
          additionalInstructions
        );
        setCompiledPrompt(compiled);
      }
    }
  }, [parsedScience, plans, outputParams, stylePreferences, advancedSwitches, additionalInstructions]);

  const handleProceedToPrompt = () => {
    if (selectedPlanId && compiledPrompt) {
      setCurrentStep('prompt-review');
    }
  };

  // ── Phase 5: Generate HD images ──
  const handleConfirmPrompt = () => {
    setCurrentStep('base-generation');
  };

  const handleGenerateBase = useCallback(async () => {
    if (!compiledPrompt) return;
    if (baseGenInFlightRef.current) return;
    baseGenInFlightRef.current = true;
    setIsGeneratingBase(true);
    setBaseError(null);
    setImageEditError(null);
    setBaseImages([]);
    setSelectedBaseIndex(0);

    try {
      const requiredSpecies = parsedScience
        ? [...parsedScience.reactants, ...parsedScience.intermediates, ...parsedScience.products]
        : [];

      const images = await generateBaseImages(
        compiledPrompt.fullPrompt,
        outputParams.aspectRatio === 'Custom' ? `${outputParams.customWidth}:${outputParams.customHeight}` : outputParams.aspectRatio,
        1,
        {
          strictNoText: true,
          strictChemistry: Boolean(advancedSwitches.strictChemicalStructure || advancedSwitches.prioritizeAccuracy),
          requiredSpecies,
          maxAttemptsPerImage: 1,
        }
      );
      setBaseImages(images);
      setSelectedBaseIndex(0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setBaseError(presentRenderingError(message));
    } finally {
      setIsGeneratingBase(false);
      baseGenInFlightRef.current = false;
    }
  }, [
    advancedSwitches,
    compiledPrompt,
    outputParams.aspectRatio,
    outputParams.customHeight,
    outputParams.customWidth,
    parsedScience,
    presentRenderingError,
  ]);

  const handleEditBase = useCallback(async (instruction: string, maskDataUrl?: string | null) => {
    if (!compiledPrompt || isEditingImage) return false;
    const sourceImage = baseImages[selectedBaseIndex];
    if (!sourceImage) return false;

    setIsEditingImage(true);
    setImageEditError(null);

    try {
      const requiredSpecies = parsedScience
        ? [...parsedScience.reactants, ...parsedScience.intermediates, ...parsedScience.products]
        : [];
      const dataUrl = sourceImage.startsWith('data:')
        ? sourceImage
        : `data:image/png;base64,${sourceImage}`;
      const editedImage = await editBaseImage(
        dataUrl,
        instruction,
        outputParams.aspectRatio === 'Custom' ? `${outputParams.customWidth}:${outputParams.customHeight}` : outputParams.aspectRatio,
        maskDataUrl,
        {
          strictNoText: true,
          strictChemistry: Boolean(advancedSwitches.strictChemicalStructure || advancedSwitches.prioritizeAccuracy),
          requiredSpecies,
        }
      );
      setBaseImages((prev) => [...prev, editedImage]);
      setSelectedBaseIndex(baseImages.length);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setImageEditError(presentRenderingError(message));
      return false;
    } finally {
      setIsEditingImage(false);
    }
  }, [
    advancedSwitches,
    baseImages,
    compiledPrompt,
    isEditingImage,
    outputParams,
    parsedScience,
    presentRenderingError,
    selectedBaseIndex,
  ]);

  // ── Export ──
  const handleExport = (idx: number) => {
    const image = baseImages[idx];
    if (!image) return;
    const dataUrl = image.startsWith('data:') ? image : `data:image/png;base64,${image}`;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `sci-cover-${Date.now()}.png`;
    link.click();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 text-xs font-medium text-gray-700 rounded-[32px] hover:bg-gray-100 transition-all duration-200"
            >
              <ArrowLeft size={12} strokeWidth={2} />
              HOME
            </button>

            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-[12px] bg-[#0A1128] flex items-center justify-center shadow-lg shadow-blue-900/10">
                <BarChart3 size={16} strokeWidth={1.5} className="text-white" />
              </div>
              <div>
                <p className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-widest">
                  {renderKind === 'illustration' ? 'ILLUSTRATION AGENT' : 'DATA FIGURE AGENT'}
                </p>
                <p className="text-xs font-bold text-[#0A1128] leading-none">
                  {renderKind === 'illustration' ? 'SCIENTIFIC AI COVER' : 'PUBLICATION DATA FIGURES'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-[32px] border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setRenderKind('illustration')}
                className={`rounded-[24px] px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  renderKind === 'illustration'
                    ? 'bg-[#0A1128] text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Illustration
              </button>
              <button
                type="button"
                onClick={() => setRenderKind('figure')}
                className={`rounded-[24px] px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  renderKind === 'figure'
                    ? 'bg-[#0A1128] text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Data Figure
              </button>
            </div>
            {renderKind === 'illustration' ? (
              <StepIndicator currentStep={currentStep} />
            ) : (
              <p className="hidden text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:block">
                Profile · Contract · Render
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {renderKind === 'figure' ? (
          <FigureMode />
        ) : (
        <AnimatePresence mode="wait">

          {/* ── input / parsing ── */}
          {(currentStep === 'input' || currentStep === 'parsing') && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <div className="mb-8">
                <h1 className="text-2xl font-black text-[#0A1128] tracking-tight uppercase">
                  Scientific Cover Agent
                </h1>
              </div>

              {parseError && (
                <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-100 rounded-[14px]">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <div>
                    <p className="text-xs font-bold text-red-600">Analysis Unavailable</p>
                    <p className="text-[11px] text-red-500 mt-0.5 leading-relaxed">{parseError}</p>
                  </div>
                </div>
              )}

              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                  <div className="w-12 h-12 border-2 border-gray-100 border-t-[#0A1128] rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-[#0A1128]">Analyzing Scientific Content</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Extracting entities · Routing domain · Generating visual plans...
                    </p>
                  </div>
                </div>
              ) : (
                <InputPanel
                  abstractText={abstractText}
                  onAbstractChange={setAbstractText}
                  pdfFile={pdfFile}
                  onPdfChange={setPdfFile}
                  referenceImages={referenceImages}
                  onReferenceImagesChange={setReferenceImages}
                  structureBaseImage={structureBaseImage}
                  onStructureBaseImageChange={setStructureBaseImage}
                  outputParams={outputParams}
                  onOutputParamsChange={setOutputParams}
                  stylePreferences={stylePreferences}
                  onStylePreferencesChange={setStylePreferences}
                  additionalInstructions={additionalInstructions}
                  onAdditionalInstructionsChange={setAdditionalInstructions}
                  advancedSwitches={advancedSwitches}
                  onAdvancedSwitchesChange={setAdvancedSwitches}
                  onGenerate={handleGenerate}
                  isGenerating={isGenerating}
                  canGenerate={canGenerate}
                />
              )}
            </motion.div>
          )}

          {/* ── plan-selection ── */}
          {currentStep === 'plan-selection' && (
            <motion.div
              key="plans"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <PlanCards
                plans={plans}
                selectedPlanId={selectedPlanId}
                onSelectPlan={handleSelectPlan}
              />

              {selectedPlanId && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 flex gap-3"
                >
                  <button
                    onClick={() => { setCurrentStep('input'); setIsGenerating(false); }}
                    className="px-5 py-3 border border-gray-100 rounded-[32px] text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    ← Back to Input
                  </button>
                  <button
                    onClick={handleProceedToPrompt}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#0A1128] text-white text-xs font-bold rounded-[32px] shadow-[0_4px_15px_rgba(10,17,40,0.2)] hover:bg-[#162044] hover:-translate-y-0.5 transition-all duration-200"
                  >
                    Compile Prompt for Selected Plan
                    <ChevronRight size={13} strokeWidth={2} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── prompt-review ── */}
          {currentStep === 'prompt-review' && compiledPrompt && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <PromptReviewPanel
                compiledPrompt={compiledPrompt}
                onConfirm={handleConfirmPrompt}
                onBack={() => setCurrentStep('plan-selection')}
              />
            </motion.div>
          )}

          {/* ── base-generation & export ── */}
          {currentStep === 'base-generation' && compiledPrompt && (
            <motion.div
              key="base-gen"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <BaseGenerationPanel
                compiledPrompt={compiledPrompt}
                outputParams={outputParams}
                baseImages={baseImages}
                selectedBaseIndex={selectedBaseIndex}
                isGeneratingBase={isGeneratingBase}
                isEditingImage={isEditingImage}
                baseError={baseError}
                editError={imageEditError}
                onGenerate={handleGenerateBase}
                onEditImage={handleEditBase}
                onSelectBase={setSelectedBaseIndex}
                onExport={handleExport}
                onBack={() => setCurrentStep('prompt-review')}
              />
            </motion.div>
          )}

        </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default RenderingAgent;
