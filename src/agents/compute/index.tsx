import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Cpu, Clock, CheckCircle2, Server,
  Settings2, Eye, Play, History, ChevronRight, AlertCircle, Loader2,
  Download, RefreshCw, Zap, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import {
  ComputeIntent, ServerComputeProfile, JobStatus, ComputeResult,
  WorkflowType, QualityType, CompiledInputs
} from './types';
import { API_BASE_URL } from '../../config';

const STEPS = [
  { id: 'structure', label: 'Structure', icon: Eye },
  { id: 'intent', label: 'Compute Intent', icon: Settings2 },
  { id: 'hpc', label: 'HPC Profile', icon: Server },
  { id: 'preview', label: 'Review & Compile', icon: Play },
  { id: 'monitor', label: 'Job Monitor', icon: History },
];

const ComputeAgent: React.FC = () => {
  const navigate = useNavigate();
  const { molecularData, selectedAtomIds } = useStore();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Step 1: Structure
  const [charge, setCharge] = useState(0);
  const [multiplicity, setMultiplicity] = useState(1);

  // Step 2: Intent
  const [intent, setIntent] = useState<ComputeIntent>({
    engine: 'vasp',
    workflow: 'relax',
    quality: 'standard',
    spin_mode: 'auto',
    vdw: true,
    u_correction: false,
    kpoints_mode: 'auto',
    restart_policy: 'custodian'
  });

  // Step 3: HPC
  const [profiles, setProfiles] = useState<ServerComputeProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Step 4: Compile
  const [compiledInputs, setCompiledInputs] = useState<CompiledInputs | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState('INCAR');

  // Step 5: Submit & Monitor
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [computeResult, setComputeResult] = useState<ComputeResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = STEPS[currentStepIndex];
  const selectedProfile = profiles.find(p => p.id === selectedProfileId) || null;

  // ── Fetch HPC profiles ──────────────────────────────────────────────
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoadingProfiles(true);
      try {
        const res = await fetch(`${API_BASE_URL}/compute/profiles`);
        const data = await res.json();
        if (data.success && Array.isArray(data.profiles)) {
          setProfiles(data.profiles);
          const firstConfigured = data.profiles.find((p: ServerComputeProfile) => p.configured);
          if (firstConfigured) setSelectedProfileId(firstConfigured.id);
        }
      } catch (err) {
        console.error('Failed to fetch compute profiles:', err);
      } finally {
        setLoadingProfiles(false);
      }
    };
    fetchProfiles();
  }, []);

  // ── Compile inputs ──────────────────────────────────────────────────
  const handleCompile = useCallback(async () => {
    if (!molecularData) return;
    setIsCompiling(true);
    setCompileError(null);
    setCompiledInputs(null);

    try {
      const structurePayload = {
        data: {
          atoms: molecularData.atoms.map(a => ({
            element: a.element,
            position: a.position,
          })),
          latticeVectors: molecularData.latticeVectors,
        },
        meta: {
          formula: molecularData.filename,
          system: 'slab',
          taskType: intent.workflow,
        },
      };

      const res = await fetch(`${API_BASE_URL}/compute/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structure: structurePayload,
          intent: {
            workflow: intent.workflow,
            quality: intent.quality,
            vdw: intent.vdw,
            spin_mode: intent.spin_mode,
            custom_params: intent.custom_params || {},
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.files) {
        setCompiledInputs({ files: data.files, normalizedIntent: data.normalizedIntent, success: true });
      } else {
        setCompileError(data.error || 'Compilation failed');
      }
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsCompiling(false);
    }
  }, [molecularData, intent]);

  // Auto-compile when entering preview step
  useEffect(() => {
    if (currentStepIndex === 3 && !compiledInputs && !isCompiling) {
      handleCompile();
    }
  }, [currentStepIndex, compiledInputs, isCompiling, handleCompile]);

  // ── Submit job ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!compiledInputs || !selectedProfile) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/compute/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          structure: { meta: { formula: molecularData?.filename } },
          intent,
          compiledFiles: compiledInputs.files,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const job: JobStatus = {
          id: data.jobId,
          status: 'queued',
          job_id: data.externalJobId,
          created_at: Date.now(),
          updated_at: Date.now(),
          externalJobId: data.externalJobId,
          profileId: selectedProfile.id,
          submissionMode: data.submissionMode,
        };
        setJobStatus(job);
        setCurrentStepIndex(4);
        startPolling(data.jobId);
      } else {
        setSubmitError(data.error || 'Submission failed');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Poll job status ─────────────────────────────────────────────────
  const startPolling = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/status`);
        const data = await res.json();
        if (data.success && data.jobStatus) {
          setJobStatus(prev => prev ? {
            ...prev,
            status: data.jobStatus,
            updated_at: Date.now(),
            message: data.schedulerState || data.jobStatus,
          } : prev);

          if (['completed', 'failed', 'cancelled'].includes(data.jobStatus)) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            // Fetch results
            fetchResults(jobId);
          }
        }
      } catch { /* ignore transient poll errors */ }
    }, 5000);
  };

  const fetchResults = async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/results`);
      const data = await res.json();
      if (data.success) {
        setComputeResult(data.metrics);
        setWarnings(data.warnings || []);
      }
    } catch (err) {
      console.error('Failed to fetch results:', err);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };
  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'bg-green-600';
      case 'failed': return 'bg-red-600';
      case 'running': return 'bg-blue-600';
      case 'queued': return 'bg-amber-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
              <ArrowLeft size={20} className="text-gray-500" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[12px] bg-[#0A1128] flex items-center justify-center shadow-lg shadow-blue-900/10">
                <Cpu size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-[#0A1128]">COMPUTE AGENT</h1>
                <p className="text-[9px] text-gray-400 font-mono tracking-widest uppercase">Connected Pipeline</p>
              </div>
            </div>
          </div>

          {/* Stepper */}
          <div className="hidden md:flex items-center gap-2">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === currentStepIndex;
              const isCompleted = idx < currentStepIndex;
              return (
                <React.Fragment key={step.id}>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                    isActive ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' : 'text-gray-400'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive ? 'bg-blue-600 text-white' : isCompleted ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {isCompleted ? <CheckCircle2 size={12} /> : idx + 1}
                    </div>
                    <span className="text-xs font-semibold">{step.label}</span>
                  </div>
                  {idx < STEPS.length - 1 && <div className="w-4 h-[1px] bg-gray-100" />}
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-green-600 uppercase tracking-widest bg-green-50 border border-green-100 px-2 py-1 rounded-[16px]">LIVE</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Step Header */}
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-black text-[#0A1128]">{currentStep.label}</h2>
                <p className="text-gray-500 text-sm mt-1">
                  {currentStep.id === 'structure' && 'Confirm the system structure and properties.'}
                  {currentStep.id === 'intent' && 'Define your computational task and parameters.'}
                  {currentStep.id === 'hpc' && 'Select the target high-performance computing environment.'}
                  {currentStep.id === 'preview' && 'Review generated input files before submission.'}
                  {currentStep.id === 'monitor' && 'Monitor the real-time status of your job.'}
                </p>
              </div>
              <div className="text-xs font-mono text-gray-400">Step {currentStepIndex + 1} of 5</div>
            </div>

            {/* Step Content */}
            <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden min-h-[400px]">

              {/* ── Step 1: Structure ─────────────────────────────── */}
              {currentStep.id === 'structure' && (
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="p-6 bg-gray-50 rounded-[24px] border border-gray-100">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">TARGET SYSTEM</h3>
                      {molecularData ? (
                        <div className="space-y-2">
                          <p className="text-sm font-bold text-[#0A1128]">{molecularData.filename}</p>
                          <div className="flex gap-4">
                            <div className="text-[11px] text-gray-500">
                              <span className="font-mono">{molecularData.atoms.length}</span> Atoms
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Lattice: <span className="font-semibold text-blue-600">{molecularData.latticeVectors ? 'Periodic' : 'Non-periodic'}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-500 bg-amber-50 p-3 rounded-xl">
                          <AlertCircle size={14} />
                          <span className="text-xs font-medium">No structure loaded. Go to Modeling Agent first.</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">PROPERTIES</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 border border-gray-100 rounded-[24px]">
                          <label className="text-[10px] text-gray-400 block mb-1 uppercase tracking-widest font-semibold">Total Charge</label>
                          <input type="number" value={charge} onChange={e => setCharge(Number(e.target.value))} className="w-full text-xs font-mono font-bold focus:outline-none" />
                        </div>
                        <div className="p-4 border border-gray-100 rounded-[24px]">
                          <label className="text-[10px] text-gray-400 block mb-1 uppercase tracking-widest font-semibold">Multiplicity</label>
                          <input type="number" value={multiplicity} onChange={e => setMultiplicity(Number(e.target.value))} className="w-full text-xs font-mono font-bold focus:outline-none" />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                      <h3 className="text-xs font-bold text-blue-900/40 uppercase tracking-widest mb-2">Fixed Atoms</h3>
                      <p className="text-xs text-blue-700">
                        {selectedAtomIds.length > 0
                          ? `${selectedAtomIds.length} atoms selected for fixing (selective dynamics).`
                          : 'No atoms selected for fixing. Full relaxation for all atoms.'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#0A1128]/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200 min-h-[300px]">
                    <p className="text-xs text-gray-400 italic">Structure Preview (Real-time Sync)</p>
                  </div>
                </div>
              )}

              {/* ── Step 2: Intent ────────────────────────────────── */}
              {currentStep.id === 'intent' && (
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {(['relax', 'static', 'dos', 'band', 'adsorption'] as WorkflowType[]).map(wf => (
                      <button
                        key={wf}
                        onClick={() => setIntent({ ...intent, workflow: wf })}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          intent.workflow === wf
                            ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-200'
                            : 'bg-white border-gray-100 hover:border-blue-200'
                        }`}
                      >
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${intent.workflow === wf ? 'text-blue-100' : 'text-gray-400'}`}>Workflow</p>
                        <p className={`text-sm font-bold mt-1 capitalize ${intent.workflow === wf ? 'text-white' : 'text-[#0A1128]'}`}>{wf}</p>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Accuracy & Quality</h3>
                      <div className="flex gap-2 p-1 bg-gray-50 rounded-xl border border-gray-100">
                        {(['fast', 'standard', 'high'] as QualityType[]).map(q => (
                          <button
                            key={q}
                            onClick={() => setIntent({ ...intent, quality: q })}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                              intent.quality === q ? 'bg-white text-[#0A1128] shadow-sm' : 'text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            {q.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Core Settings</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setIntent({ ...intent, vdw: !intent.vdw })}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${intent.vdw ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'}`}
                        >
                          vDW (D3) {intent.vdw ? 'ON' : 'OFF'}
                        </button>
                        <button
                          onClick={() => setIntent({ ...intent, spin_mode: intent.spin_mode === 'auto' ? 'none' : 'auto' })}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${intent.spin_mode !== 'none' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'}`}
                        >
                          Spin {intent.spin_mode !== 'none' ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 3: HPC Profile ──────────────────────────── */}
              {currentStep.id === 'hpc' && (
                <div className="p-8 space-y-6">
                  {loadingProfiles ? (
                    <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
                      <Loader2 size={20} className="animate-spin" />
                      <span className="text-sm">Loading compute profiles...</span>
                    </div>
                  ) : profiles.length === 0 ? (
                    <div className="flex items-center gap-2 text-amber-500 bg-amber-50 p-4 rounded-xl">
                      <AlertCircle size={14} />
                      <span className="text-xs font-medium">No compute profiles available. Configure HPC env vars on the server.</span>
                    </div>
                  ) : (
                    profiles.map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={`w-full p-6 rounded-[24px] border-2 text-left transition-all flex items-center justify-between ${
                          selectedProfileId === profile.id
                            ? 'border-blue-600 bg-blue-50/30'
                            : profile.configured
                              ? 'border-gray-100 hover:border-gray-200'
                              : 'border-gray-100 opacity-50 cursor-not-allowed'
                        }`}
                        disabled={!profile.configured}
                      >
                        <div className="flex items-center gap-6">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                            selectedProfileId === profile.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <Server size={24} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-[#0A1128]">{profile.label}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                profile.configured ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                              }`}>
                                {profile.configured ? profile.system.toUpperCase() : 'NOT CONFIGURED'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 max-w-md">{profile.summary}</p>
                            {profile.hpc && (
                              <div className="flex gap-4 mt-1 text-[11px] text-gray-400 font-mono">
                                {profile.hpc.partition && <span>partition: {profile.hpc.partition}</span>}
                                {profile.hpc.queue && <span>queue: {profile.hpc.queue}</span>}
                                <span>{profile.hpc.nodes}×{profile.hpc.ntasks_per_node || profile.hpc.ppn}</span>
                                <span>{profile.hpc.walltime}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedProfileId === profile.id && <CheckCircle2 className="text-blue-600" />}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* ── Step 4: Preview & Compile ────────────────────── */}
              {currentStep.id === 'preview' && (
                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Compiled VASP Inputs</h3>
                    <div className="flex gap-2">
                      {isCompiling && <span className="flex items-center gap-1 text-blue-600 text-[10px] font-bold"><Loader2 size={12} className="animate-spin" /> COMPILING...</span>}
                      {compiledInputs && <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded">COMPILED</span>}
                      {compileError && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded">ERROR</span>}
                      <button onClick={handleCompile} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Re-compile">
                        <RefreshCw size={14} className="text-gray-400" />
                      </button>
                    </div>
                  </div>

                  {compileError && (
                    <div className="flex items-start gap-2 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100">
                      <XCircle size={16} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold">Compilation Failed</p>
                        <p className="text-[11px] mt-1">{compileError}</p>
                      </div>
                    </div>
                  )}

                  {compiledInputs && (
                    <>
                      <div className="grid grid-cols-4 gap-3">
                        {['INCAR', 'KPOINTS', 'POSCAR', 'POTCAR'].map(file => {
                          const isPotcar = file === 'POTCAR';
                          const fileKey = isPotcar ? 'POTCAR' : file;
                          return (
                          <div
                            key={file}
                            onClick={() => setSelectedPreviewFile(fileKey)}
                            className={`p-4 border rounded-2xl flex flex-col items-center gap-2 cursor-pointer transition-all ${
                              selectedPreviewFile === fileKey
                                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                                : 'border-gray-100 hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedPreviewFile === fileKey ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                              <Eye size={16} />
                            </div>
                            <span className={`text-xs font-bold font-mono ${selectedPreviewFile === fileKey ? 'text-blue-600' : 'text-[#0A1128]'}`}>{file}</span>
                          </div>
                          );
                        })}
                      </div>

                      <div className="bg-[#0A1128] rounded-2xl p-6 text-white overflow-hidden relative">
                        <div className="relative z-10">
                          <h4 className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-4">
                            {selectedPreviewFile === 'POTCAR' ? 'POTCAR Specification' : `File Preview: ${selectedPreviewFile}`}
                          </h4>
                          {selectedPreviewFile === 'POTCAR' ? (
                            <div className="space-y-4">
                              <p className="text-[11px] text-blue-200/80 leading-relaxed">
                                POTCAR files contain licensed VASP pseudopotentials and cannot be generated.
                                When submitting to your HPC cluster, the server will automatically assemble
                                POTCAR from your cluster's pseudopotential library.
                              </p>
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Required Pseudopotentials</p>
                                {(() => {
                                  try {
                                    const specRaw = compiledInputs.files['POTCAR.spec.json' as keyof typeof compiledInputs.files];
                                    const spec = specRaw ? JSON.parse(specRaw) : null;
                                    const symbols: string[] = spec?.symbols || [];
                                    if (symbols.length === 0) return <p className="text-xs text-white/50">No spec available</p>;
                                    return (
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {symbols.map((sym: string, i: number) => (
                                          <span key={i} className="px-3 py-1.5 bg-white/10 rounded-lg text-xs font-mono font-bold text-white">
                                            {sym} <span className="text-white/40 ml-1">PBE</span>
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  } catch {
                                    return <p className="text-xs text-white/50">Spec not available from compiler</p>;
                                  }
                                })()}
                              </div>
                              <div className="mt-3 p-3 bg-white/5 rounded-xl border border-white/10">
                                <p className="text-[10px] text-white/50">
                                  On job submission, the server runs <code className="text-blue-300">materializeRemotePotcar()</code> via
                                  SSH to concatenate the correct POTCAR from <code className="text-blue-300">HPC_REMOTE_POTCAR_DIR</code> on your cluster.
                                </p>
                              </div>
                            </div>
                          ) : (
                          <pre className="text-[11px] font-mono leading-relaxed opacity-90 min-h-[200px] max-h-[400px] overflow-y-auto whitespace-pre-wrap">
                            {(compiledInputs.files as Record<string, string>)[selectedPreviewFile] || '(empty)'}
                          </pre>
                          )}
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full -mr-20 -mt-20" />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Step 5: Monitor ──────────────────────────────── */}
              {currentStep.id === 'monitor' && (
                <div className="p-8 space-y-6">
                  {!jobStatus ? (
                    <div className="flex flex-col items-center justify-center text-center space-y-6 py-8">
                      <div className="w-20 h-20 rounded-[32px] bg-blue-50 flex items-center justify-center">
                        <Zap size={32} className="text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#0A1128]">Ready to Launch</h3>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                          {selectedProfile
                            ? `Submit to ${selectedProfile.label} (${selectedProfile.system})`
                            : 'Select an HPC profile first.'}
                        </p>
                        {submitError && (
                          <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded-lg">{submitError}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Status Banner */}
                      <div className={`flex items-center justify-between p-6 ${statusColor(jobStatus.status)} rounded-[24px] text-white`}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            {jobStatus.status === 'running' || jobStatus.status === 'queued'
                              ? <Loader2 size={20} className="animate-spin" />
                              : jobStatus.status === 'completed'
                                ? <CheckCircle2 size={20} />
                                : <XCircle size={20} />}
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Job Status</p>
                            <p className="text-sm font-bold">{jobStatus.status.toUpperCase()} (ID: {jobStatus.job_id || jobStatus.id})</p>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-white/60">Profile: {jobStatus.profileId}</p>
                          <p className="text-white/60">Mode: {jobStatus.submissionMode}</p>
                        </div>
                      </div>

                      {/* Results (when completed) */}
                      {computeResult && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-5 border border-gray-100 rounded-[20px]">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Total Energy</p>
                            <p className="text-lg font-black text-[#0A1128] mt-1 font-mono">
                              {computeResult.totalEnergyEv != null ? `${computeResult.totalEnergyEv.toFixed(4)} eV` : 'N/A'}
                            </p>
                          </div>
                          <div className="p-5 border border-gray-100 rounded-[20px]">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Converged</p>
                            <p className={`text-lg font-black mt-1 ${computeResult.converged ? 'text-green-600' : 'text-red-600'}`}>
                              {computeResult.converged ? 'YES' : 'NO'}
                            </p>
                          </div>
                          <div className="p-5 border border-gray-100 rounded-[20px]">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Ionic Steps</p>
                            <p className="text-lg font-black text-[#0A1128] mt-1 font-mono">
                              {computeResult.ionicStepCount ?? 'N/A'}
                            </p>
                          </div>
                          <div className="p-5 border border-gray-100 rounded-[20px]">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Max Force</p>
                            <p className="text-lg font-black text-[#0A1128] mt-1 font-mono">
                              {computeResult.maxForceEvPerA != null ? `${computeResult.maxForceEvPerA.toFixed(4)}` : 'N/A'}
                              <span className="text-[10px] text-gray-400 ml-1">eV/A</span>
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Warnings */}
                      {warnings.length > 0 && (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                          <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">Warnings ({warnings.length})</h4>
                          {warnings.map((w, i) => (
                            <p key={i} className="text-xs text-amber-700 mt-1">• {w}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Navigation Footer */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={handleBack}
                disabled={currentStepIndex === 0}
                className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all ${
                  currentStepIndex === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <ArrowLeft size={16} /> Previous Step
              </button>

              {currentStepIndex === 3 ? (
                <button
                  onClick={handleSubmit}
                  disabled={!compiledInputs || isSubmitting || !selectedProfile}
                  className="flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all shadow-lg bg-green-600 text-white shadow-green-200 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <>Submit to Cluster <Play size={16} /></>}
                </button>
              ) : currentStepIndex === 4 ? (
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold bg-[#0A1128] text-white shadow-lg shadow-blue-200 hover:bg-blue-900"
                >
                  Back to Home
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={currentStepIndex === 0 && !molecularData}
                  className="flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all shadow-lg bg-[#0A1128] text-white shadow-blue-200 hover:bg-blue-900 disabled:opacity-50"
                >
                  Next: {STEPS[currentStepIndex + 1]?.label} <ChevronRight size={16} />
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default ComputeAgent;
