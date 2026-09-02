import { MolecularStructure } from '../../types';

export type EngineType =
  | 'vasp'
  | 'cp2k'
  | 'quantum_espresso'
  | 'gaussian'
  | 'orca'
  | 'nwchem'
  | 'qchem'
  | 'lammps'
  | 'gromacs'
  | 'namd'
  | 'amber'
  | 'openmm'
  | 'abinit'
  | 'castep'
  | 'siesta'
  | 'dftbplus'
  | 'xtb';
export type WorkflowType = 'relax' | 'static' | 'dos' | 'band' | 'adsorption' | 'neb' | 'irradiation_creep';
export type QualityType = 'fast' | 'standard' | 'high';
export type SpinMode = 'auto' | 'none' | 'collinear' | 'non-collinear';

export interface StructurePackage {
  id: string;
  data: MolecularStructure;
  type: 'bulk' | 'slab' | 'molecule' | 'interface';
  charge: number;
  multiplicity: number;
  fixedAtoms: string[]; // List of atom IDs
}

export interface ComputeIntent {
  engine: EngineType;
  workflow: WorkflowType;
  quality: QualityType;
  spin_mode: SpinMode;
  vdw: boolean;
  u_correction: boolean;
  kpoints_mode: 'auto' | 'gamma' | 'monkhorst';
  restart_policy: 'custodian' | 'basic';
  custom_params?: Record<string, any>;
}

// Backend-aligned profile shape (from server/src/compute/profiles.js)
export interface ServerComputeProfile {
  id: string;
  label: string;
  system: 'local' | 'slurm' | 'pbs';
  mode: string;
  configured: boolean;
  ready?: boolean;
  readinessReason?: string | null;
  directSubmitSupported?: boolean;
  requiresApproval: boolean;
  summary: string;
  schedulerRef?: string;
  hpc?: {
    id: string;
    partition?: string;
    queue?: string;
    nodes: number;
    ntasks_per_node?: number;
    ppn?: number;
    walltime: string;
    executable?: string;
    executableConfigured?: boolean;
    moduleLoad?: string | null;
    moduleLoadConfigured?: boolean;
    accessMode: 'local_shell' | 'remote_ssh' | 'agent_http';
  };
  local?: {
    command?: string;
    commandConfigured?: boolean;
    shell: string;
  };
}

export interface RemoteComputeChannelInput {
  host: string;
  user: string;
  port: string;
  password: string;
}

export interface RemoteComputeChannelTestResult {
  ok: boolean;
  target?: {
    host: string;
    port: number;
    username: string;
  };
  remote?: {
    hostname: string | null;
    user: string | null;
    pwd: string | null;
    shell: string | null;
  };
  scheduler?: string;
  schedulers?: Array<{
    id: string;
    label: string;
    commands: Record<string, string>;
  }>;
  software?: Array<{
    id: string;
    label: string;
    category: string;
    commands: Record<string, string>;
    pythonModules?: string[];
  }>;
  commands?: Record<string, string>;
  pythonModules?: Record<string, boolean>;
}

// Legacy frontend-only type (kept for backward compat)
export interface HPCProfile {
  id: string;
  name: string;
  server: string;
  partition: string;
  nodes: number;
  ntasks_per_node: number;
  walltime: string;
  executable: string;
}

export interface ComputeRequest {
  structure: StructurePackage;
  intent: ComputeIntent;
  hpc: HPCProfile;
  runtime_policy: {
    use_custodian: boolean;
    max_retries: number;
    store_outputs: boolean;
  };
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  job_id?: string;
  created_at: number;
  updated_at: number;
  progress?: number;
  message?: string;
  errors?: string[];
  externalJobId?: string;
  profileId?: string;
  submissionMode?: string;
}

// Compiled engine input files from backend
export interface CompiledInputs {
  files: Record<string, string>;
  normalizedIntent?: Record<string, any>;
  preview?: Record<string, any>;
  validation?: {
    submissionReady: boolean;
    maturity: 'validated' | 'experimental' | string;
    blockingIssues: string[];
    warnings: string[];
  };
  audit?: {
    auditId: string;
    generatedAt: string;
    compilerVersion?: string | null;
    systemType?: string | null;
    stages?: Array<Record<string, any>>;
    validation?: Record<string, any>;
  } | null;
  auditToken?: string | null;
  success: boolean;
}

// Result metrics from VASP output parsing
export interface ComputeResult {
  totalEnergyEv: number | null;
  freeEnergyEv?: number | null;
  energyWithoutEntropyEv?: number | null;
  sigmaToZeroEnergyEv?: number | null;
  fermiEnergyEv?: number | null;
  totalMagnetizationMuB?: number | null;
  converged: boolean;
  electronicConverged?: boolean;
  ionicConverged?: boolean | null;
  ionicStepCount: number | null;
  electronicStepHints: number | null;
  maxForceEvPerA: number | null;
  rmsForceEvPerA: number | null;
  exitCode: number | null;
  elapsedSeconds: number;
  stressKbar?: { xx: number; yy: number; zz: number; xy: number; yz: number; zx: number } | null;
  resultSource?: string;
  isDemo?: boolean;
  audit?: Record<string, any> | null;
  potcarProvenance?: Record<string, any> | null;
  resultAudit?: {
    inputAuditId?: string | null;
    resultSource?: string;
    collectedAt?: string;
    potcarCombinedSha256?: string | null;
    hashedFiles?: Array<{ path: string; sizeBytes: number; sha256: string }>;
    largeFiles?: Array<{ path: string; sizeBytes: number; sha256: null; note?: string }>;
  } | null;
  resultAuditToken?: string | null;
}
