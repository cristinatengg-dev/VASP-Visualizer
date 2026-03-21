import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Cpu, Clock, CheckCircle2, Server, 
  Settings2, Eye, Play, History, ChevronRight, AlertCircle, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { 
  ComputeIntent, HPCProfile, ComputeRequest, JobStatus,
  EngineType, WorkflowType, QualityType, SpinMode
} from './types';

const STEPS = [
  { id: 'structure', label: 'Select Structure', icon: Eye },
  { id: 'intent', label: 'Compute Intent', icon: Settings2 },
  { id: 'hpc', label: 'HPC Profile', icon: Server },
  { id: 'preview', label: 'Review & Compile', icon: Play },
  { id: 'monitor', label: 'Job Monitor', icon: History },
];

const DEFAULT_HPC_PROFILES: HPCProfile[] = [
  {
    id: 'server-a',
    name: 'Research Cluster A (High Priority)',
    server: 'hpc-a.univ.edu',
    partition: 'normal',
    nodes: 1,
    ntasks_per_node: 64,
    walltime: '24:00:00',
    executable: 'vasp_std'
  },
  {
    id: 'server-b',
    name: 'GPU Accel Cluster',
    server: 'gpu-cluster.univ.edu',
    partition: 'gpu',
    nodes: 1,
    ntasks_per_node: 32,
    walltime: '12:00:00',
    executable: 'vasp_gpu'
  }
];

const ComputeAgent: React.FC = () => {
  const navigate = useNavigate();
  const { molecularData, selectedAtomIds } = useStore();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // State for the 5 steps
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
  
  const [hpc, setHpc] = useState<HPCProfile>(DEFAULT_HPC_PROFILES[0]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState('INCAR');

  const currentStep = STEPS[currentStepIndex];

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

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-50 rounded-full transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-500" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[12px] bg-[#0A1128] flex items-center justify-center shadow-lg shadow-blue-900/10">
                <Cpu size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-[#0A1128]">COMPUTE AGENT</h1>
                <p className="text-[9px] text-gray-400 font-mono tracking-widest uppercase">Professional Pipeline</p>
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
                  {idx < STEPS.length - 1 && (
                    <div className="w-4 h-[1px] bg-gray-100" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
             <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest bg-amber-50 border border-amber-100 px-2 py-1 rounded-[16px]">V1.0 BETA</span>
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
                              Type: <span className="font-semibold text-blue-600 uppercase">Slab</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-500 bg-amber-50 p-3 rounded-xl">
                          <AlertCircle size={14} />
                          <span className="text-xs font-medium">No structure loaded from Modeling Agent.</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">PROPERTIES</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 border border-gray-100 rounded-[24px]">
                          <label className="text-[10px] text-gray-400 block mb-1 uppercase tracking-widest font-semibold">Total Charge</label>
                          <input type="number" defaultValue={0} className="w-full text-xs font-mono font-bold focus:outline-none" />
                        </div>
                        <div className="p-4 border border-gray-100 rounded-[24px]">
                          <label className="text-[10px] text-gray-400 block mb-1 uppercase tracking-widest font-semibold">Multiplicity</label>
                          <input type="number" defaultValue={1} className="w-full text-xs font-mono font-bold focus:outline-none" />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                      <h3 className="text-xs font-bold text-blue-900/40 uppercase tracking-widest mb-2">Selection Status</h3>
                      <p className="text-xs text-blue-700">
                        {selectedAtomIds.length > 0 
                          ? `Fixed ${selectedAtomIds.length} atoms in the bottom layers.`
                          : 'No atoms selected for fixing. Dynamic relaxation for all.'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-[#0A1128]/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200">
                    <p className="text-xs text-gray-400 italic">Structure Preview (Real-time Sync)</p>
                  </div>
                </div>
              )}

              {currentStep.id === 'intent' && (
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['relax', 'static', 'dos', 'band', 'adsorption'] as WorkflowType[]).map((wf) => (
                      <button
                        key={wf}
                        onClick={() => setIntent({ ...intent, workflow: wf })}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          intent.workflow === wf 
                            ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-200' 
                            : 'bg-white border-gray-100 hover:border-blue-200'
                        }`}
                      >
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${intent.workflow === wf ? 'text-blue-100' : 'text-gray-400'}`}>Task Type</p>
                        <p className={`text-sm font-bold mt-1 capitalize ${intent.workflow === wf ? 'text-white' : 'text-[#0A1128]'}`}>{wf}</p>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Accuracy & Quality</h3>
                      <div className="flex gap-2 p-1 bg-gray-50 rounded-xl border border-gray-100">
                        {(['fast', 'standard', 'high'] as QualityType[]).map((q) => (
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
                          onClick={() => setIntent({...intent, vdw: !intent.vdw})}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${intent.vdw ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'}`}
                        >
                          vDW (D3) {intent.vdw ? 'ON' : 'OFF'}
                        </button>
                        <button 
                          onClick={() => setIntent({...intent, spin_mode: intent.spin_mode === 'auto' ? 'none' : 'auto'})}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${intent.spin_mode !== 'none' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'}`}
                        >
                          Spin {intent.spin_mode !== 'none' ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStep.id === 'hpc' && (
                <div className="p-8 space-y-6">
                  {DEFAULT_HPC_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => setHpc(profile)}
                      className={`w-full p-6 rounded-[24px] border-2 text-left transition-all flex items-center justify-between ${
                        hpc.id === profile.id 
                          ? 'border-blue-600 bg-blue-50/30' 
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${hpc.id === profile.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          <Server size={24} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#0A1128]">{profile.name}</p>
                          <div className="flex gap-4 mt-1 text-[11px] text-gray-500">
                            <span className="font-mono">{profile.server}</span>
                            <span>•</span>
                            <span>Partition: {profile.partition}</span>
                          </div>
                        </div>
                      </div>
                      {hpc.id === profile.id && <CheckCircle2 className="text-blue-600" />}
                    </button>
                  ))}

                  <div className="p-6 bg-gray-50 rounded-[24px] border border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <label className="text-[10px] text-gray-400 block uppercase font-bold mb-1">Nodes</label>
                      <input type="number" defaultValue={hpc.nodes} className="bg-transparent font-mono text-sm font-bold w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block uppercase font-bold mb-1">Tasks/Node</label>
                      <input type="number" defaultValue={hpc.ntasks_per_node} className="bg-transparent font-mono text-sm font-bold w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block uppercase font-bold mb-1">Walltime</label>
                      <input type="text" defaultValue={hpc.walltime} className="bg-transparent font-mono text-sm font-bold w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block uppercase font-bold mb-1">Executable</label>
                      <input type="text" defaultValue={hpc.executable} className="bg-transparent font-mono text-sm font-bold w-full" />
                    </div>
                  </div>
                </div>
              )}

              {currentStep.id === 'preview' && (
                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Compiled VASP Inputs</h3>
                    <div className="flex gap-2">
                       <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded">VALIDATED</span>
                       <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded">TEMPLATED</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-3">
                    {['INCAR', 'KPOINTS', 'POSCAR', 'POTCAR'].map(file => (
                      <div 
                        key={file} 
                        onClick={() => setSelectedPreviewFile(file)}
                        className={`p-4 border rounded-2xl flex flex-col items-center gap-2 cursor-pointer transition-all ${
                          selectedPreviewFile === file 
                            ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                            : 'border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedPreviewFile === file ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          <Eye size={16} />
                        </div>
                        <span className={`text-xs font-bold font-mono ${selectedPreviewFile === file ? 'text-blue-600' : 'text-[#0A1128]'}`}>{file}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#0A1128] rounded-2xl p-6 text-white overflow-hidden relative">
                    <div className="relative z-10">
                      <h4 className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-4">
                        {selectedPreviewFile === 'job.sh' ? 'Submission Script' : `File Preview: ${selectedPreviewFile}`}
                      </h4>
                      <pre className="text-[11px] font-mono leading-relaxed opacity-80 min-h-[200px]">
                        {selectedPreviewFile === 'INCAR' && `# VASP INCAR Generated by Compute Agent\nSYSTEM = ${molecularData?.filename || 'System'}\nPREC = ${intent.quality === 'high' ? 'Accurate' : 'Normal'}\nIBRION = 2\nISIF = 3\nNSW = 100\nEDIFF = ${intent.quality === 'high' ? '1E-6' : '1E-4'}\nISMEAR = 0\nSIGMA = 0.05\nIVDW = ${intent.vdw ? '11' : '0'}\nISPIN = ${intent.spin_mode !== 'none' ? '2' : '1'}`}
                        {selectedPreviewFile === 'KPOINTS' && `Automatic Mesh\n0\nMonkhorst-Pack\n4 4 1\n0.0 0.0 0.0`}
                        {selectedPreviewFile === 'POSCAR' && `${molecularData?.filename || 'System'}\n1.0\n${molecularData?.latticeVectors?.map(v => v.map(n => n.toFixed(8)).join(' ')).join('\n') || '8.0 0.0 0.0\n0.0 8.0 0.0\n0.0 0.0 20.0'}\n${molecularData?.atoms?.[0]?.element || 'H'}\n${molecularData?.atoms?.length || 0}\nDirect\n${molecularData?.atoms?.slice(0, 5).map(a => '0.500 0.500 0.500').join('\n')}\n...`}
                        {selectedPreviewFile === 'POTCAR' && `PAW_PBE ${molecularData?.atoms?.[0]?.element || 'H'} 15Jun2001\n... (Truncated for preview) ...`}
                      </pre>
                    </div>
                    <button 
                      onClick={() => setSelectedPreviewFile('job.sh')}
                      className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-blue-200 text-[10px] font-bold uppercase tracking-widest"
                    >
                      View Job Script
                    </button>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full -mr-20 -mt-20" />
                  </div>
                </div>
              )}

              {currentStep.id === 'monitor' && (
                <div className="p-8 flex flex-col items-center justify-center text-center space-y-6">
                  {!jobStatus ? (
                    <>
                      <div className="w-20 h-20 rounded-[32px] bg-blue-50 flex items-center justify-center">
                        <Loader2 size={32} className="text-blue-600 animate-spin" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#0A1128]">Ready to Launch</h3>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                          Click the "Submit to Cluster" button below to begin the calculation with Custodian monitoring.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="w-full space-y-8">
                       <div className="flex items-center justify-between p-6 bg-blue-600 rounded-[24px] text-white">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                <History size={20} />
                             </div>
                             <div className="text-left">
                                <p className="text-xs font-bold text-blue-100 uppercase tracking-widest">Job Status</p>
                                <p className="text-sm font-bold">RUNNING (ID: {jobStatus.job_id || 'Waiting...'})</p>
                             </div>
                          </div>
                          <div className="px-4 py-2 bg-white/20 rounded-full text-xs font-bold">
                             02:14:45 ELAPSED
                          </div>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-6 border border-gray-100 rounded-[24px] text-left">
                             <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Live Log Output</h4>
                             <div className="bg-gray-900 rounded-xl p-4 h-48 overflow-y-auto">
                                <pre className="text-[10px] font-mono text-green-400">
{`[2026-03-13 22:14:01] Job submitted via sbatch.
[2026-03-13 22:14:05] Custodian started.
[2026-03-13 22:14:10] VASP initialization complete.
[2026-03-13 22:14:15] Electronic step 1: 0.124E+02
[2026-03-13 22:14:20] Electronic step 2: 0.115E+02
[2026-03-13 22:14:25] Electronic step 3: 0.108E+02
[2026-03-13 22:14:30] Electronic step 4: 0.102E+02
[2026-03-13 22:14:35] Electronic step 5: 0.101E+02
[2026-03-13 22:14:40] Electronic step 6: 0.100E+02`}
                                </pre>
                             </div>
                          </div>

                          <div className="p-6 border border-gray-100 rounded-[24px] text-left">
                             <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Runtime Guardian</h4>
                             <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                                   <span className="text-xs font-medium text-green-700">Self-Healing</span>
                                   <span className="text-[10px] font-bold text-green-600 bg-white px-2 py-0.5 rounded">ACTIVE</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                   <span className="text-xs font-medium text-gray-700">Detected Errors</span>
                                   <span className="text-[10px] font-bold text-gray-500">NONE</span>
                                </div>
                                <div className="p-3">
                                   <p className="text-[10px] text-gray-400 leading-relaxed">
                                      Custodian is monitoring your VASP job for common errors (EDDDAV, ZHEGV, etc.) and will automatically adjust INCAR parameters if needed.
                                   </p>
                                </div>
                             </div>
                          </div>
                       </div>
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
                <ArrowLeft size={16} />
                Previous Step
              </button>

              <button
                onClick={currentStepIndex === 3 ? () => setJobStatus({ id: 'local-1', status: 'running', job_id: '482931', created_at: Date.now(), updated_at: Date.now() }) : handleNext}
                className={`flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all shadow-lg ${
                  currentStepIndex === 3 
                    ? 'bg-green-600 text-white shadow-green-200 hover:bg-green-700' 
                    : 'bg-[#0A1128] text-white shadow-blue-200 hover:bg-blue-900'
                }`}
              >
                {currentStepIndex === 3 ? (
                  <>Submit to Cluster <Play size={16} /></>
                ) : currentStepIndex === 4 ? (
                  <>Back to Home</>
                ) : (
                  <>Next: {STEPS[currentStepIndex + 1].label} <ChevronRight size={16} /></>
                )}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default ComputeAgent;
