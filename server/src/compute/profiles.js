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
    label: '同机 VASP',
    system: 'local',
    mode: 'server_local',
    configured: Boolean(command),
    directSubmitSupported: true,
    requiresApproval: true,
    summary: '在后端所在服务器直接执行 VASP；提交前实时检查命令和本地 POTCAR 库。',
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
    label: '输入演示（非科研计算）',
    system: 'local',
    mode: 'local_demo',
    configured: true,
    directSubmitSupported: true,
    requiresApproval: true,
    summary: '仅物化输入文件并演示生命周期，不运行 VASP，也不会产生科研结果。',
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
    label: 'Slurm 集群',
    system: 'slurm',
    mode: 'slurm',
    configured: Boolean(partition && executable),
    directSubmitSupported: true,
    requiresApproval: true,
    summary: ssh.configured
      ? '通过后端预配置的 SSH 通道提交到远程 Slurm 集群。'
      : '通过后端本地的 sbatch/squeue 通道提交到 Slurm 集群。',
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
    label: 'PBS 集群',
    system: 'pbs',
    mode: 'pbs',
    configured: Boolean(queue && executable),
    directSubmitSupported: true,
    requiresApproval: true,
    summary: ssh.configured
      ? '通过后端预配置的 SSH 通道提交到远程 PBS 集群。'
      : '通过后端本地的 qsub/qstat 通道提交到 PBS 集群。',
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
    label: 'PBS 独立代理队列',
    system: 'pbs',
    mode: 'pbs_agent',
    configured: Boolean(queue && executable && agentToken),
    directSubmitSupported: false,
    requiresApproval: true,
    summary: '仅供独立计算代理消费，不能从当前直提页面执行。',
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

function toPublicComputeProfile(profile, readiness = {}) {
  const hpc = profile.hpc ? {
    id: profile.hpc.id,
    partition: profile.hpc.partition,
    queue: profile.hpc.queue,
    nodes: profile.hpc.nodes,
    ntasks_per_node: profile.hpc.ntasks_per_node,
    ppn: profile.hpc.ppn,
    walltime: profile.hpc.walltime,
    moduleLoadConfigured: Boolean(profile.hpc.moduleLoad),
    executableConfigured: Boolean(profile.hpc.executable),
    accessMode: profile.hpc.accessMode,
  } : undefined;
  const local = profile.local ? {
    shell: profile.local.shell,
    commandConfigured: Boolean(profile.local.command),
  } : undefined;

  return {
    id: profile.id,
    label: profile.label,
    system: profile.system,
    mode: profile.mode,
    configured: profile.configured,
    ready: readiness.ready ?? profile.configured,
    readinessReason: readiness.reason || null,
    directSubmitSupported: profile.directSubmitSupported !== false,
    requiresApproval: profile.requiresApproval,
    summary: profile.summary,
    schedulerRef: profile.schedulerRef,
    ...(hpc ? { hpc } : {}),
    ...(local ? { local } : {}),
  };
}

module.exports = {
  getComputeProfile,
  listComputeProfiles,
  toPublicComputeProfile,
};
