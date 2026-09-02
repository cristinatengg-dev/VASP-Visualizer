import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Cpu, Clock, CheckCircle2, Server,
  Settings2, Eye, Play, History, ChevronRight, AlertCircle, Loader2,
  Download, RefreshCw, Zap, XCircle
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  ComputeIntent, ServerComputeProfile, JobStatus, ComputeResult,
  WorkflowType, QualityType, CompiledInputs,
  EngineType
} from './types';
import { Scene3D } from '../../components/Scene3D';
import { VisualizationErrorBoundary } from '../../components/VisualizationErrorBoundary';
import { API_BASE_URL } from '../../config';
import type { MolecularStructure } from '../../types';

const STEPS = [
  { id: 'structure', label: 'Confirm Structure', icon: Eye },
  { id: 'intent', label: 'Compute Settings', icon: Settings2 },
  { id: 'hpc', label: 'Runtime Environment', icon: Server },
  { id: 'preview', label: 'Inspect Inputs', icon: Play },
  { id: 'monitor', label: 'Compute Results', icon: History },
];

const ENGINE_OPTIONS: Array<{ id: EngineType; label: string; description: string }> = [
  { id: 'vasp', label: 'VASP', description: 'Periodic plane-wave DFT' },
  { id: 'quantum_espresso', label: 'Quantum ESPRESSO', description: 'Open-source plane-wave DFT' },
  { id: 'cp2k', label: 'CP2K', description: 'Gaussian and plane-wave DFT/MD' },
  { id: 'lammps', label: 'LAMMPS', description: 'Classical molecular dynamics' },
  { id: 'orca', label: 'ORCA', description: 'Molecular quantum chemistry' },
];

const COMPILE_READY_ENGINES = new Set<EngineType>(ENGINE_OPTIONS.map((engine) => engine.id));

const WORKFLOW_OPTIONS: Array<{ id: WorkflowType; label: string }> = [
  { id: 'relax', label: 'Relax' },
  { id: 'static', label: 'Static' },
  { id: 'dos', label: 'DOS' },
  { id: 'band', label: 'Band' },
];

const LAMMPS_TASK_OPTIONS: Array<{ id: WorkflowType; label: string }> = [
  { id: 'irradiation_creep', label: 'Irradiation Creep' },
];

type VaspSystemType = 'bulk' | 'slab' | 'interface' | 'defect';

const inferVaspSystemType = (data: MolecularStructure | null): VaspSystemType => {
  if (!data?.latticeVectors || data.latticeVectors.length !== 3) return 'bulk';
  const lengths = data.latticeVectors.map((vector) => Math.hypot(...vector));
  return lengths[2] > Math.max(lengths[0], lengths[1]) * 1.6 && lengths[2] > 12 ? 'slab' : 'bulk';
};

const ComputeAgent: React.FC = () => {
  const navigate = useNavigate();
  const { molecularData, selectedAtomIds } = useStore();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Step 1: Structure
  const [charge, setCharge] = useState(0);
  const [multiplicity, setMultiplicity] = useState(1);
  const [systemType, setSystemType] = useState<VaspSystemType>(() => inferVaspSystemType(molecularData));

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
  const taskOptions = intent.engine === 'lammps' ? LAMMPS_TASK_OPTIONS : WORKFLOW_OPTIONS;
  const selectedProfile = profiles.find(p => p.id === selectedProfileId) || null;
  const submissionReady = Boolean(compiledInputs?.validation?.submissionReady && compiledInputs?.auditToken);
  const selectedProfileReady = Boolean(selectedProfile && (selectedProfile.ready ?? selectedProfile.configured) && selectedProfile.directSubmitSupported !== false);
  const isDemoProfile = selectedProfile?.mode === 'local_demo';

  const authHeaders = useCallback((contentType = false) => {
    const token = localStorage.getItem('vasp_token');
    return {
      ...(contentType ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  useEffect(() => {
    setSystemType(inferVaspSystemType(molecularData));
  }, [molecularData?.id]);

  // ── Fetch HPC profiles ──────────────────────────────────────────────
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoadingProfiles(true);
      try {
        const res = await fetch(`${API_BASE_URL}/compute/profiles`);
        const data = await res.json();
        if (data.success && Array.isArray(data.profiles)) {
          setProfiles(data.profiles);
          const firstConfigured = data.profiles.find((p: ServerComputeProfile) => (p.ready ?? p.configured) && p.directSubmitSupported !== false);
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
      if (!COMPILE_READY_ENGINES.has(intent.engine)) throw new Error(`${intent.engine} input compilation is not available.`);

      const structurePayload = {
        data: {
          atoms: molecularData.atoms.map(a => ({
            id: a.id,
            element: a.element,
            position: a.position,
            fixed: selectedAtomIds.includes(a.id),
          })),
          latticeVectors: molecularData.latticeVectors,
        },
        meta: {
          formula: molecularData.filename,
          system: systemType,
          taskType: intent.workflow,
        },
      };

      const res = await fetch(`${API_BASE_URL}/compute/compile`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          structure: structurePayload,
          intent: {
            engine: intent.engine,
            workflow: intent.workflow,
            quality: intent.quality,
            vdw: intent.vdw,
            spin_mode: intent.spin_mode,
            kpoints_mode: intent.kpoints_mode,
            u_correction: intent.u_correction,
            system_hint: systemType,
            custom_params: {
              ...(intent.custom_params || {}),
              charge,
              multiplicity,
              fixed_atom_indices: molecularData.atoms
                .map((atom, index) => selectedAtomIds.includes(atom.id) ? index : -1)
                .filter(index => index >= 0),
            },
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.files) {
        const fileNames = Object.keys(data.files as Record<string, string>);
        const preferredPreview = fileNames.find(name => name.startsWith('in.')) || fileNames[0] || 'INCAR';
        setSelectedPreviewFile(preferredPreview);
        setCompiledInputs({
          files: data.files,
          normalizedIntent: data.normalizedIntent,
          preview: data.preview,
          validation: data.validation,
          audit: data.audit,
          auditToken: data.auditToken,
          success: true,
        });
      } else {
        setCompileError(data.error || 'Compilation failed');
      }
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsCompiling(false);
    }
  }, [authHeaders, charge, intent, molecularData, multiplicity, selectedAtomIds, systemType]);

  // Auto-compile when entering preview step
  useEffect(() => {
    if (currentStepIndex === 3 && !compiledInputs && !isCompiling) {
      handleCompile();
    }
  }, [currentStepIndex, compiledInputs, isCompiling, handleCompile]);

  // ── Submit job ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!compiledInputs || !selectedProfile) return;
    if (!(selectedProfile.ready ?? selectedProfile.configured) || selectedProfile.directSubmitSupported === false) {
      setSubmitError('The selected compute environment failed real-time checks and cannot submit real jobs.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/compute/submit`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          profileId: selectedProfile.id,
          structure: { meta: { formula: molecularData?.filename } },
          intent,
          compiledFiles: compiledInputs.files,
          auditToken: compiledInputs.auditToken,
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
        const res = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/status`, { headers: authHeaders() });
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
      const res = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/results`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setComputeResult({
          ...data.metrics,
          resultSource: data.resultSource,
          isDemo: data.isDemo,
          audit: data.audit,
          potcarProvenance: data.potcarProvenance,
          resultAudit: data.resultAudit,
          resultAuditToken: data.resultAuditToken,
        });
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
      case 'running': return 'bg-[#2E4A8E]';
      case 'queued': return 'bg-amber-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col text-[#1d1d1f]">
      {/* Top Bar */}
      <header className="apple-nav sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-50 rounded-full transition-colors"
              title="Back to home"
              aria-label="Back to home"
            >
              <ArrowLeft size={20} className="text-gray-500" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[12px] bg-[#0A1128] flex items-center justify-center shadow-sm">
                <Cpu size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-[#1d1d1f]">Scientific Compute</h1>
                <p className="text-[10px] text-[#6e6e73]">Reproducible · Auditable</p>
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
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-[16px] transition-all ${
                    isActive ? 'bg-[#0A1128]/10 text-[#0A1128]' : 'text-[#86868b]'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive ? 'bg-[#0A1128] text-white' : isCompleted ? 'bg-[#34c759] text-white' : 'bg-[#e8e8ed] text-[#86868b]'
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
            <span className="rounded-full bg-[#e8f5ff] px-3 py-1 text-[10px] font-semibold text-[#0A1128]">Trusted Compute Chain</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 py-10 md:py-14">
        <div key={currentStep.id} className="space-y-8">
            {/* Step Header */}
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#1d1d1f]">{currentStep.label}</h2>
                <p className="text-[#6e6e73] text-sm mt-2">
                  {currentStep.id === 'structure' && 'Confirm periodic system, fixed atoms, and charge state.'}
                  {currentStep.id === 'intent' && 'Select a compute engine, calculation task, and precision.'}
                  {currentStep.id === 'hpc' && 'Select a real cluster; demo environments will not produce scientific results.'}
                  {currentStep.id === 'preview' && 'Inspect files, scientific warnings, and audit IDs before submission.'}
                  {currentStep.id === 'monitor' && 'View real job status, convergence, and result provenance.'}
                </p>
              </div>
              <div className="text-xs text-[#86868b]">{currentStepIndex + 1} / 5</div>
            </div>

            {/* Step Content */}
            <div className="apple-surface overflow-hidden min-h-[400px]">

              {/* ── Step 1: Structure ─────────────────────────────── */}
              {currentStep.id === 'structure' && (
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="p-6 bg-gray-50 rounded-[24px] border border-gray-100">
                      <h3 className="apple-eyebrow mb-4">Current Structure</h3>
                      {molecularData ? (
                        <div className="space-y-2">
                          <p className="text-sm font-bold text-[#0A1128]">{molecularData.filename}</p>
                          <div className="flex gap-4">
                            <div className="text-[11px] text-gray-500">
                              <span className="font-mono">{molecularData.atoms.length}</span> atoms
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Lattice:<span className="font-semibold text-[#0A1128]">{molecularData.latticeVectors ? 'Periodic' : 'Non-periodic'}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-500 bg-amber-50 p-3 rounded-[16px]">
                          <AlertCircle size={14} />
                          <span className="text-xs font-medium">No structure loaded yet. Please select or import a structure in the modeling Agent first.</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h3 className="apple-eyebrow">System Type</h3>
                      <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-[#F5F5F0] p-1.5">
                        {(['bulk', 'slab', 'interface', 'defect'] as VaspSystemType[]).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setSystemType(type)}
                            className={`rounded-[13px] px-3 py-2.5 text-xs font-medium transition ${systemType === type ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73]'}`}
                          >
                            {{ bulk: 'Bulk', slab: 'Surface', interface: 'Interface', defect: 'Defect' }[type]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="apple-eyebrow">Charge and Spin Multiplicity</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 border border-gray-100 rounded-[24px]">
                          <label className="text-[10px] text-gray-400 block mb-1 uppercase tracking-widest font-semibold">Total Charge</label>
                          <input type="number" value={charge} onChange={e => setCharge(Number(e.target.value))} className="apple-field font-mono text-sm" aria-label="Total charge" />
                        </div>
                        <div className="p-4 border border-gray-100 rounded-[24px]">
                          <label className="text-[10px] text-gray-400 block mb-1 uppercase tracking-widest font-semibold">Spin Multiplicity</label>
                          <input type="number" min={1} value={multiplicity} onChange={e => setMultiplicity(Math.max(1, Number(e.target.value)))} className="apple-field font-mono text-sm" aria-label="Multiplicity" />
                        </div>
                      </div>
                    </div>

                    <div className="apple-surface-muted p-4">
                      <h3 className="apple-eyebrow mb-2">Fixed Atoms</h3>
                      <p className="text-xs text-[#0A1128]">
                        {selectedAtomIds.length > 0
                          ? `Fixed ${selectedAtomIds.length} atoms (Selective Dynamics).`
                          : 'No atoms currently fixed; all atoms will be relaxed.'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#0A1128] rounded-[24px] overflow-hidden min-h-[300px] relative">
                    {molecularData ? (
                      <div className="w-full h-[300px]">
                        <VisualizationErrorBoundary>
                          <Scene3D />
                        </VisualizationErrorBoundary>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[300px]">
                        <p className="text-xs text-white/40">No Structure Loaded</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 2: Intent ────────────────────────────────── */}
              {currentStep.id === 'intent' && (
                <div className="p-8 space-y-8">
                  <div className="space-y-4">
                    <h3 className="apple-eyebrow">Compute Engine</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {ENGINE_OPTIONS.map((engine) => {
                        const selected = intent.engine === engine.id;
                        return (
                          <button
                            key={engine.id}
                            type="button"
                            onClick={() => setIntent((current) => ({
                              ...current,
                              engine: engine.id,
                              workflow: engine.id === 'lammps'
                                ? 'irradiation_creep'
                                : current.workflow === 'irradiation_creep' ? 'relax' : current.workflow,
                            }))}
                            className={`rounded-[18px] border p-4 text-left transition-all ${
                              selected
                                ? 'border-[#0A1128] bg-[#0A1128] text-white shadow-sm'
                                : 'border-gray-200 bg-white text-[#1d1d1f] hover:border-[#0A1128]'
                            }`}
                          >
                            <p className="text-sm font-semibold">{engine.label}</p>
                            <p className={`mt-1 text-[10px] leading-4 ${selected ? 'text-white/70' : 'text-[#6e6e73]'}`}>{engine.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-[#F5F5F0] p-1.5 md:grid-cols-4">
                    {taskOptions.map(workflow => (
                      <button
                        key={workflow.id}
                        onClick={() => setIntent({ ...intent, workflow: workflow.id })}
                        className={`rounded-[13px] px-4 py-3 text-left transition-all ${
                          intent.workflow === workflow.id
                            ? 'bg-white shadow-sm'
                            : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                        }`}
                      >
                        <p className={`text-[10px] font-medium uppercase tracking-widest ${intent.workflow === workflow.id ? 'text-[#0A1128]' : 'text-[#86868b]'}`}>Agent</p>
                        <p className="mt-1 text-sm font-semibold text-[#1d1d1f]">{workflow.label}</p>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="space-y-4">
                      <h3 className="apple-eyebrow">Precision</h3>
                      <div className="flex gap-2 p-1 bg-gray-50 rounded-[16px] border border-gray-100">
                        {(['fast', 'standard', 'high'] as QualityType[]).map(q => (
                          <button
                            key={q}
                            onClick={() => setIntent({ ...intent, quality: q })}
                            className={`flex-1 py-2 text-xs font-bold rounded-[16px] transition-all ${
                              intent.quality === q ? 'bg-white text-[#0A1128] shadow-sm' : 'text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            {q.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="apple-eyebrow">K-point Grid</h3>
                      <div className="flex gap-1 bg-[#F5F5F0] p-1 rounded-[16px]">
                        {(['auto', 'gamma', 'monkhorst'] as const).map(mode => (
                          <button
                            key={mode}
                            onClick={() => setIntent({ ...intent, kpoints_mode: mode })}
                            className={`flex-1 rounded-[12px] px-2 py-2 text-[10px] font-semibold transition ${intent.kpoints_mode === mode ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b]'}`}
                          >
                            {mode === 'auto' ? 'Automatic' : mode === 'gamma' ? 'Γ-centered' : 'Monkhorst'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="apple-eyebrow">Core Settings</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setIntent({ ...intent, vdw: !intent.vdw })}
                          className={`flex items-center justify-between p-3 rounded-[16px] border text-xs font-medium transition-all ${intent.vdw ? 'border-[#0A1128]/20 bg-[#e8f3ff] text-[#0A1128]' : 'border-gray-100 text-gray-500'}`}
                        >
                          D3 Dispersion {intent.vdw ? 'On' : 'Off'}
                        </button>
                        <button
                          onClick={() => setIntent({ ...intent, spin_mode: intent.spin_mode === 'auto' ? 'none' : 'auto' })}
                          className={`flex items-center justify-between p-3 rounded-[16px] border text-xs font-medium transition-all ${intent.spin_mode !== 'none' ? 'border-[#0A1128]/20 bg-[#e8f3ff] text-[#0A1128]' : 'border-gray-100 text-gray-500'}`}
                        >
                          Spin {intent.spin_mode !== 'none' ? 'Automatic' : 'Disabled'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 3: HPC Profile ──────────────────────────── */}
              {currentStep.id === 'hpc' && (
                <div className="p-8 space-y-6">
                  <div className="apple-surface-muted flex items-start gap-3 p-5">
                    <Server size={18} className="mt-0.5 shrink-0 text-[#0A1128]" />
                    <div>
                      <h3 className="text-sm font-semibold text-[#1d1d1f]">Select a Verified Runtime Environment</h3>
                      <p className="mt-1 text-xs leading-5 text-[#6e6e73]">
                        Server addresses, SSH keys, executable paths, and software licenses are configured on the backend by administrators. The browser does not receive cluster passwords and only displays real-time check results.
                      </p>
                    </div>
                  </div>

                  {loadingProfiles ? (
                    <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
                      <Loader2 size={20} className="animate-spin" />
                      <span className="text-sm">Loading compute profiles...</span>
                    </div>
                  ) : profiles.length === 0 ? (
                    <div className="flex items-center gap-2 text-amber-500 bg-amber-50 p-4 rounded-[16px]">
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
                            ? 'border-[#2E4A8E] bg-[#2E4A8E]/5'
                            : (profile.ready ?? profile.configured) && profile.directSubmitSupported !== false
                              ? 'border-gray-100 hover:border-gray-200'
                              : 'border-gray-100 opacity-50 cursor-not-allowed'
                        }`}
                        disabled={!(profile.ready ?? profile.configured) || profile.directSubmitSupported === false}
                      >
                        <div className="flex items-center gap-6">
                          <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center ${
                            selectedProfileId === profile.id ? 'bg-[#2E4A8E] text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <Server size={24} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-[#0A1128]">{profile.label}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                (profile.ready ?? profile.configured) && profile.directSubmitSupported !== false ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                              }`}>
                                {!profile.configured ? 'NOT CONFIGURED' : profile.directSubmitSupported === false ? 'RUNTIME ONLY' : profile.ready === false ? 'CHECK FAILED' : profile.system.toUpperCase()}
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
                        {selectedProfileId === profile.id && <CheckCircle2 className="text-[#2E4A8E]" />}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* ── Step 4: Preview & Compile ────────────────────── */}
              {currentStep.id === 'preview' && (
                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                      <h3 className="apple-eyebrow">Compiled {ENGINE_OPTIONS.find((engine) => engine.id === intent.engine)?.label || intent.engine} Inputs</h3>
                    <div className="flex gap-2">
                      {isCompiling && <span className="flex items-center gap-1 text-[#2E4A8E] text-[10px] font-bold"><Loader2 size={12} className="animate-spin" /> COMPILING...</span>}
                      {compiledInputs && <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded">COMPILED</span>}
                      {compileError && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded">ERROR</span>}
                      <button onClick={handleCompile} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Re-compile">
                        <RefreshCw size={14} className="text-gray-400" />
                      </button>
                    </div>
                  </div>

                  {compileError && (
                    <div className="flex items-start gap-2 p-4 bg-red-50 text-red-700 rounded-[16px] border border-red-100">
                      <XCircle size={16} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold">Compilation Failed</p>
                        <p className="text-[11px] mt-1">{compileError}</p>
                      </div>
                    </div>
                  )}

                  {compiledInputs && (
                    <>
                      <div className={`rounded-[20px] border p-5 ${compiledInputs.validation?.submissionReady ? 'border-[#34c759]/20 bg-[#f2fbf5]' : 'border-[#ff3b30]/20 bg-[#fff4f3]'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#1d1d1f]">
                              {compiledInputs.validation?.submissionReady ? 'Scientific Validation Passed' : 'Currently Not Submittable'}
                            </p>
                            <p className="mt-1 text-xs text-[#6e6e73]">
                              {compiledInputs.audit?.auditId ? `Audit ID ${compiledInputs.audit.auditId.slice(0, 16)}` : 'Missing Server-Signed Audit Manifest'}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-[#6e6e73] shadow-sm">
                            {compiledInputs.validation?.maturity || 'unknown'}
                          </span>
                        </div>
                        {compiledInputs.validation?.blockingIssues?.map(issue => (
                          <p key={issue} className="mt-3 text-xs text-[#d70015]">• {issue}</p>
                        ))}
                        {compiledInputs.validation?.warnings?.map(warning => (
                          <p key={warning} className="mt-2 text-xs text-[#6e6e73]">• {warning}</p>
                        ))}
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        {Object.keys(compiledInputs.files)
                          .filter(file => file !== 'POTCAR.spec.json')
                          .concat(compiledInputs.files['POTCAR.spec.json'] ? ['POTCAR'] : [])
                          .slice(0, 8)
                          .map(file => {
                          const isPotcar = file === 'POTCAR';
                          const fileKey = isPotcar ? 'POTCAR' : file;
                          return (
                          <div
                            key={file}
                            onClick={() => setSelectedPreviewFile(fileKey)}
                            className={`p-4 border rounded-[20px] flex flex-col items-center gap-2 cursor-pointer transition-all ${
                              selectedPreviewFile === fileKey
                                ? 'border-[#2E4A8E] bg-[#2E4A8E]/5 ring-1 ring-[#2E4A8E]'
                                : 'border-gray-100 hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-[16px] flex items-center justify-center ${selectedPreviewFile === fileKey ? 'bg-[#2E4A8E] text-white' : 'bg-gray-100 text-gray-400'}`}>
                              <Eye size={16} />
                            </div>
                            <span className={`text-xs font-bold font-mono ${selectedPreviewFile === fileKey ? 'text-[#2E4A8E]' : 'text-[#0A1128]'}`}>{file}</span>
                          </div>
                          );
                        })}
                      </div>

                      <div className="bg-[#0A1128] rounded-2xl p-6 text-white overflow-hidden relative">
                        <div className="relative z-10">
                          <h4 className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-4">
                            {selectedPreviewFile === 'POTCAR' ? 'POTCAR Specification' : `File Preview: ${selectedPreviewFile}`}
                          </h4>
                          {selectedPreviewFile === 'POTCAR' ? (
                            <div className="space-y-4">
                              <p className="text-[11px] text-white/50 leading-relaxed">
                                Some engines need licensed or cluster-local assets such as pseudopotentials,
                                basis sets, force fields, topologies, or machine-specific runtime modules.
                                The compiler records the required spec here instead of embedding private files.
                              </p>
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Required Engine Assets</p>
                                {(() => {
                                  try {
                                    const specRaw = compiledInputs.files['POTCAR.spec.json' as keyof typeof compiledInputs.files];
                                    const spec = specRaw ? JSON.parse(specRaw) : null;
                                    const symbols: string[] = spec?.symbols || [];
                                    if (symbols.length === 0) return <p className="text-xs text-white/50">No spec available</p>;
                                    return (
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {symbols.map((sym: string, i: number) => (
                                          <span key={i} className="px-3 py-1.5 bg-white/10 rounded-[16px] text-xs font-mono font-bold text-white">
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
                              <div className="mt-3 p-3 bg-white/5 rounded-[16px] border border-white/10">
                                <p className="text-[10px] text-white/50">
                                  On job submission, the runtime should resolve engine-specific assets on the
                                  selected remote channel instead of storing them in the browser payload.
                                </p>
                              </div>
                            </div>
                          ) : (
                          <pre className="text-[11px] font-mono leading-relaxed opacity-90 min-h-[200px] max-h-[400px] overflow-y-auto whitespace-pre-wrap">
                            {(compiledInputs.files as Record<string, string>)[selectedPreviewFile] || '(empty)'}
                          </pre>
                          )}
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#2E4A8E]/10 blur-[80px] rounded-full -mr-20 -mt-20" />
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
                      <div className="w-20 h-20 rounded-[32px] bg-[#2E4A8E]/10 flex items-center justify-center">
                        <Zap size={32} className="text-[#2E4A8E]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#0A1128]">Ready to Launch</h3>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                          {selectedProfile
                            ? `Submit to ${selectedProfile.label} (${selectedProfile.system})`
                            : 'Select an HPC profile first.'}
                        </p>
                        {submitError && (
                          <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded-[16px]">{submitError}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Status Banner */}
                      <div className={`flex items-center justify-between p-6 ${statusColor(jobStatus.status)} rounded-[24px] text-white`}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white/20 rounded-[16px] flex items-center justify-center">
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
                        <div className="space-y-4">
                          {computeResult.isDemo && (
                            <div className="rounded-[20px] border border-[#ff9f0a]/25 bg-[#fff8ed] p-4 text-sm font-semibold text-[#9a5b00]">
                              Demo results, not scientific compute data; cannot be used for papers or reports.
                            </div>
                          )}
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
                          {computeResult.audit && (
                            <div className="apple-surface-muted p-4 text-xs text-[#6e6e73]">
                              Source:<span className="font-medium text-[#1d1d1f]">{computeResult.isDemo ? 'Demo Materialization (Non-scientific Compute)' : computeResult.resultSource || 'Real Compute Environment'}</span>
                              <span className="mx-2">·</span>
                              Audit ID:<span className="font-mono text-[#1d1d1f]">{String(computeResult.audit.auditId || '').slice(0, 24)}</span>
                              {computeResult.potcarProvenance?.combinedSha256 && (
                                <span className="ml-4">POTCAR：<span className="font-mono text-[#1d1d1f]">{String(computeResult.potcarProvenance.combinedSha256).slice(0, 16)}</span></span>
                              )}
                              {computeResult.resultAudit?.hashedFiles && (
                                <span className="ml-4">Hashed Results:<span className="font-medium text-[#1d1d1f]">{computeResult.resultAudit.hashedFiles.length}</span></span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Warnings */}
                      {warnings.length > 0 && (
                        <div className="p-4 bg-amber-50 rounded-[16px] border border-amber-100">
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
                  disabled={!submissionReady || isSubmitting || !selectedProfileReady}
                  className="apple-button-primary"
                >
                  {isSubmitting
                    ? <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                    : isDemoProfile
                      ? <>Create Demo Record <Play size={16} /></>
                      : <>Submit Real Compute <Play size={16} /></>}
                </button>
              ) : currentStepIndex === 4 ? (
                <button
                  onClick={() => navigate('/')}
                  className="apple-button-primary"
                >
                  Back to Home
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={currentStepIndex === 0 && !molecularData}
                  className="apple-button-primary disabled:opacity-50"
                >
                  Next Step:{STEPS[currentStepIndex + 1]?.label} <ChevronRight size={16} />
                </button>
              )}
            </div>
        </div>
      </main>
    </div>
  );
};

export default ComputeAgent;
