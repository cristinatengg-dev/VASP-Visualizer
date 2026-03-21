const { getHpcSshConfigFromEnv } = require('./ssh-config');

function buildServerLocalProfile() {
  const command = String(
    process.env.COMPUTE_LOCAL_COMMAND
    || process.env.VASP_LOCAL_COMMAND
    || process.env.COMPUTE_LOCAL_EXECUTABLE
    || process.env.VASP_LOCAL_EXECUTABLE
    || ''
  ).trim();
  const shell = String(process.env.COMPUTE_LOCAL_SHELL || '/bin/zsh').trim() || '/bin/zsh';
  const schedulerRef = String(process.env.COMPUTE_LOCAL_RUNNER_ID || 'server-local').trim();

  return {
    id: 'server_local',
    label: 'Server Local Execution',
    system: 'local',
    mode: 'server_local',
    configured: Boolean(command),
    requiresApproval: true,
    summary: 'Run the compute workload directly on the same server that hosts the browser/runtime backend.',
    schedulerRef,
    local: {
      command,
      shell,
    },
  };
}

function buildLocalDemoProfile() {
  return {
    id: 'local_demo',
    label: 'Local Demo Runner',
    system: 'local',
    mode: 'local_demo',
    configured: true,
    requiresApproval: true,
    summary: 'Materialize a real compute workdir locally and drive the runtime lifecycle without a real scheduler.',
  };
}

function buildSlurmProfile() {
  const partition = String(process.env.HPC_SLURM_PARTITION || '').trim();
  const executable = String(process.env.HPC_EXECUTABLE || '').trim();
  const schedulerRef = String(process.env.HPC_SCHEDULER_REF || 'slurm-default').trim();
  const ssh = getHpcSshConfigFromEnv();
  const moduleLoad = String(process.env.HPC_MODULE_LOAD || '').trim();

  return {
    id: 'slurm_default',
    label: 'Slurm Default',
    system: 'slurm',
    mode: 'slurm',
    configured: Boolean(partition && executable),
    requiresApproval: true,
    summary: ssh.configured
      ? 'Submit the compiled workdir to a remote Slurm cluster over SSH.'
      : 'Submit the compiled workdir to a Slurm cluster using local sbatch/squeue access.',
    schedulerRef,
    hpc: {
      id: schedulerRef,
      partition,
      nodes: Math.max(1, Number(process.env.HPC_NODES || 1)),
      ntasks_per_node: Math.max(1, Number(process.env.HPC_TASKS_PER_NODE || 32)),
      walltime: String(process.env.HPC_WALLTIME || '12:00:00').trim(),
      executable,
      moduleLoad: moduleLoad || null,
      accessMode: ssh.configured ? 'remote_ssh' : 'local_shell',
      ssh,
    },
  };
}

function buildPbsProfile() {
  const queue = String(process.env.HPC_PBS_QUEUE || '').trim();
  const executable = String(process.env.HPC_EXECUTABLE || '').trim();
  const schedulerRef = String(process.env.HPC_SCHEDULER_REF || 'pbs-default').trim();
  const ssh = getHpcSshConfigFromEnv();
  const moduleLoad = String(process.env.HPC_MODULE_LOAD || '').trim();

  return {
    id: 'pbs_default',
    label: 'PBS Default',
    system: 'pbs',
    mode: 'pbs',
    configured: Boolean(queue && executable),
    requiresApproval: true,
    summary: ssh.configured
      ? 'Submit the compiled workdir to a remote PBS cluster over SSH.'
      : 'Submit the compiled workdir to a PBS cluster using local qsub/qstat access.',
    schedulerRef,
    hpc: {
      id: schedulerRef,
      queue,
      nodes: Math.max(1, Number(process.env.HPC_NODES || 1)),
      ppn: Math.max(1, Number(process.env.HPC_TASKS_PER_NODE || 32)),
      walltime: String(process.env.HPC_WALLTIME || '12:00:00').trim(),
      executable,
      moduleLoad: moduleLoad || null,
      accessMode: ssh.configured ? 'remote_ssh' : 'local_shell',
      ssh,
    },
  };
}

function buildPbsAgentProfile() {
  const queue = String(process.env.HPC_PBS_QUEUE || '').trim();
  const executable = String(process.env.HPC_EXECUTABLE || '').trim();
  const schedulerRef = String(process.env.COMPUTE_AGENT_SCHEDULER_REF || 'pbs-agent').trim();
  const agentToken = String(process.env.COMPUTE_AGENT_TOKEN || process.env.ADMIN_SECRET || '').trim();

  return {
    id: 'pbs_via_local_agent',
    label: 'PBS via Local Agent',
    system: 'pbs',
    mode: 'pbs_agent',
    configured: Boolean(queue && executable && agentToken),
    requiresApproval: true,
    summary: 'Queue the compiled workdir for a local compute agent running on a machine that can reach the PBS cluster.',
    schedulerRef,
    hpc: {
      id: schedulerRef,
      queue,
      nodes: Math.max(1, Number(process.env.HPC_NODES || 1)),
      ppn: Math.max(1, Number(process.env.HPC_TASKS_PER_NODE || 32)),
      walltime: String(process.env.HPC_WALLTIME || '12:00:00').trim(),
      executable,
      moduleLoad: String(process.env.HPC_MODULE_LOAD || '').trim() || null,
      accessMode: 'agent_http',
    },
    agent: {
      authConfigured: Boolean(agentToken),
      tokenEnvKey: process.env.COMPUTE_AGENT_TOKEN ? 'COMPUTE_AGENT_TOKEN' : (process.env.ADMIN_SECRET ? 'ADMIN_SECRET' : null),
    },
  };
}

function listComputeProfiles() {
  return [
    buildServerLocalProfile(),
    buildLocalDemoProfile(),
    buildPbsAgentProfile(),
    buildPbsProfile(),
    buildSlurmProfile(),
  ];
}

function getComputeProfile(profileId) {
  const requestedId = String(profileId || '').trim();
  const profiles = listComputeProfiles();
  if (!requestedId) {
    return profiles.find((profile) => profile.configured) || profiles[0];
  }
  return profiles.find((profile) => profile.id === requestedId) || null;
}

module.exports = {
  getComputeProfile,
  listComputeProfiles,
};
