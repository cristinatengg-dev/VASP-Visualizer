import { MolecularStructure } from '../../types';

export type EngineType = 'vasp' | 'cp2k' | 'qe';
export type WorkflowType = 'relax' | 'static' | 'dos' | 'band' | 'adsorption' | 'neb';
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
    executable: string;
    moduleLoad?: string | null;
    accessMode: 'local_shell' | 'remote_ssh' | 'agent_http';
  };
  local?: {
    command: string;
    shell: string;
  };
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

// Compiled VASP input files from backend
export interface CompiledInputs {
  files: {
    INCAR: string;
    KPOINTS: string;
    POSCAR: string;
    'POTCAR.spec.json'?: string;
  };
  normalizedIntent?: Record<string, any>;
  success: boolean;
}

// Result metrics from VASP output parsing
export interface ComputeResult {
  totalEnergyEv: number | null;
  converged: boolean;
  ionicStepCount: number | null;
  electronicStepHints: number | null;
  maxForceEvPerA: number | null;
  rmsForceEvPerA: number | null;
  exitCode: number | null;
  elapsedSeconds: number;
}
