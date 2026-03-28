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

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, ChevronRight, Sparkles, BarChart3,
  AlertCircle, Download, RefreshCw, ImageIcon, Wand2,
} from 'lucide-react';

import InputPanel from './components/InputPanel';
import PlanCards from './components/PlanCards';

import {
  StylePreferences,
  AdvancedSwitches,
  OutputParams,
  WorkflowStep,
  PlanCard,
  ParsedScience,
  CompiledPrompt,
} from './types';

import {
  parseScience,
  parsePdf,
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

const BaseGenerationPanel: React.FC<{
  compiledPrompt: CompiledPrompt;
  outputParams: OutputParams;
  baseImages: string[];
  selectedBaseIndex: number;
  isGeneratingBase: boolean;
  baseError: string | null;
  onGenerate: () => void;
  onSelectBase: (idx: number) => void;
  onExport: (idx: number) => void;
  onBack: () => void;
}> = ({
  compiledPrompt,
  baseImages,
  selectedBaseIndex,
  isGeneratingBase,
  baseError,
  onGenerate,
  onSelectBase,
  onExport,
  onBack,
}) => (
  <div className="space-y-5">
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        Phase 5 · Gemini HD Generation
      </p>
      <h2 className="text-lg font-black text-[#0A1128]">HD Image Generation</h2>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
        Gemini generates 1 publication-grade HD image at 600 DPI quality. Export it when ready.
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
          <p className="text-xs text-gray-500 mt-1">Gemini is generating 1 publication-grade image...</p>
          <p className="text-[10px] text-gray-400 mt-1 font-mono">This may take 30–90 seconds</p>
        </div>
      </div>
    ) : baseImages.length > 0 ? (
      <div className="grid grid-cols-1 gap-3 max-w-sm">
        {baseImages.map((img, idx) => (
          <button
            key={idx}
            onClick={() => onSelectBase(idx)}
            className={`
              relative rounded-[16px] overflow-hidden border-2 transition-all duration-200
              ${selectedBaseIndex === idx
                ? 'border-[#0A1128] shadow-[0_4px_20px_rgba(10,17,40,0.2)]'
                : 'border-gray-100 hover:border-gray-300'}
            `}
          >
            <img
              src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
              alt="Generated image"
              className="w-full aspect-[9/16] object-cover"
            />
            {selectedBaseIndex === idx && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-[#0A1128] rounded-full flex items-center justify-center">
                <Check size={10} className="text-white" strokeWidth={3} />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/20 to-transparent px-2 py-1.5" />
          </button>
        ))}
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

    <div className="flex gap-2 flex-wrap">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-100 rounded-[32px] text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
      >
        ← Back
      </button>
      <button
        onClick={onGenerate}
        disabled={isGeneratingBase}
        className="flex items-center gap-1.5 px-5 py-2.5 border border-gray-200 rounded-[32px] text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} strokeWidth={2} className={isGeneratingBase ? 'animate-spin' : ''} />
        Generate
      </button>
      {baseImages.length > 0 && selectedBaseIndex >= 0 && (
        <button
          onClick={() => onExport(selectedBaseIndex)}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-[32px] hover:bg-emerald-700 hover:-translate-y-0.5 transition-all duration-200"
        >
          <Download size={12} strokeWidth={2} />
          Export for Publication
        </button>
      )}
    </div>
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const RenderingAgent: React.FC = () => {
  const navigate = useNavigate();

  const presentRenderingError = useCallback((message: string) => {
    const raw = String(message || '').trim();

    if (
      /Gemini API error\s*401/i.test(raw)
      || /invalid token/i.test(raw)
      || /无效的令牌/i.test(raw)
      || /new_api_error/i.test(raw)
    ) {
      return 'Gemini 图像服务鉴权失败，请联系管理员检查上游令牌或网关配置。';
    }

    if (/GEMINI_API_KEY is not configured/i.test(raw)) {
      return 'Gemini 图像服务尚未配置，请联系管理员补充可用凭据。';
    }

    return raw || '图像分析暂时不可用，请稍后再试。';
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
  const [baseImages, setBaseImages] = useState<string[]>([]);
  const [selectedBaseIndex, setSelectedBaseIndex] = useState<number>(0);
  const [baseError, setBaseError] = useState<string | null>(null);
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
        ? 'PDF/分析请求超时，请重试或换更小的 PDF。'
        : presentRenderingError(message);
      setParseError(friendly);
      setCurrentStep('input');
    } finally {
      setIsGenerating(false);
    }
  }, [abstractText, pdfFile]);

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
          maxAttemptsPerImage: 2,
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
  }, [compiledPrompt, outputParams.aspectRatio, parsedScience, advancedSwitches]);

  // ── Export ──
  const handleExport = (idx: number) => {
    const image = baseImages[idx];
    if (!image) return;
    const dataUrl = image.startsWith('data:') ? image : `data:image/png;base64,${image}`;

    const imgEl = new Image();
    imgEl.onload = () => {
      const srcW = imgEl.naturalWidth || imgEl.width;
      const srcH = imgEl.naturalHeight || imgEl.height;
      if (!srcW || !srcH) return;

      const targetRatio = 9 / 16;
      const srcRatio = srcW / srcH;

      let sx = 0;
      let sy = 0;
      let sw = srcW;
      let sh = srcH;

      if (srcRatio > targetRatio) {
        sw = Math.round(srcH * targetRatio);
        sx = Math.round((srcW - sw) / 2);
      } else if (srcRatio < targetRatio) {
        sh = Math.round(srcW / targetRatio);
        sy = Math.round((srcH - sh) / 2);
      }

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sci-cover-${Date.now()}-9x16.png`;
        link.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    imgEl.src = dataUrl;
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
                  ILLUSTRATION AGENT
                </p>
                <p className="text-xs font-bold text-[#0A1128] leading-none">
                  SCIENTIFIC AI COVER
                </p>
              </div>
            </div>
          </div>

          <StepIndicator currentStep={currentStep} />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
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
                baseError={baseError}
                onGenerate={handleGenerateBase}
                onSelectBase={setSelectedBaseIndex}
                onExport={handleExport}
                onBack={() => setCurrentStep('prompt-review')}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default RenderingAgent;
