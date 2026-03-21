const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * HPC Submitter Module
 * Handles job script generation and sbatch submission
 */

const generateJobScript = (request) => {
    const { structure, hpc, intent } = request;
    const jobName = structure.data.filename || 'vasp_job';
    
    // HPC Profile specific configurations (can be extended to a profile library)
    const defaultModuleLoad = hpc.id === 'server-b' ? 'module load vasp/6.3.0-gpu' : 'module load vasp/6.3.0-std';
    const prelude = String(hpc.ssh?.prelude || hpc.moduleLoad || '').trim() || defaultModuleLoad;

    if (hpc.system === 'pbs') {
        return `#!/bin/bash
#PBS -N ${jobName}
#PBS -q ${hpc.queue}
#PBS -l nodes=${hpc.nodes}:ppn=${hpc.ppn}
#PBS -j oe
#PBS -l walltime=${hpc.walltime}

cd $PBS_O_WORKDIR
NP=\`cat $PBS_NODEFILE | wc -l\`

source /etc/profile
${prelude}

if [ "${request.runtime_policy.use_custodian}" = "true" ]; then
    python3 run_custodian.py
else
    mpirun -np $NP -machinefile $PBS_NODEFILE ${hpc.executable} >> output 2>&1
fi
`;
    }
    
    return `#!/bin/bash
#SBATCH -J ${jobName}
#SBATCH -p ${hpc.partition}
#SBATCH -N ${hpc.nodes}
#SBATCH --ntasks-per-node=${hpc.ntasks_per_node}
#SBATCH -t ${hpc.walltime}
#SBATCH -o vasp.out
#SBATCH -e vasp.err

${prelude}

# Run with Custodian if requested
if [ "${request.runtime_policy.use_custodian}" = "true" ]; then
    python3 run_custodian.py
else
    srun ${hpc.executable} > vasp.out
fi
`;
};

const submitJob = async (workDir, scriptContent, options = {}) => {
    const scriptFileName = String(options.scriptFileName || 'job.sh').trim() || 'job.sh';
    const submitCommand = String(options.submitCommand || 'sbatch').trim() || 'sbatch';
    const submitArgs = Array.isArray(options.submitArgs) && options.submitArgs.length > 0
        ? options.submitArgs
        : [scriptFileName];
    const scriptPath = path.join(workDir, scriptFileName);
    fs.writeFileSync(scriptPath, scriptContent);
    
    return new Promise((resolve, reject) => {
        // Mock sbatch if not on a cluster
        if (process.env.NODE_ENV !== 'production' && submitCommand === 'sbatch') {
            console.log('[HPC] Mock submission in non-prod environment');
            return resolve({ success: true, job_id: Math.floor(Math.random() * 1000000).toString() });
        }

        const submission = spawn(submitCommand, submitArgs, { cwd: workDir });
        let output = '';
        let error = '';

        submission.stdout.on('data', (data) => output += data.toString());
        submission.stderr.on('data', (data) => error += data.toString());

        submission.on('close', (code) => {
            if (code === 0) {
                // Typical Slurm output: "Submitted batch job 123456"
                // Typical PBS output: "123.server"
                const slurmMatch = output.match(/job\s+(\d+)/i);
                const genericMatch = output.match(/\b(\d+(?:\.[A-Za-z0-9._-]+)?)\b/);
                resolve({
                    success: true,
                    job_id: slurmMatch ? slurmMatch[1] : (genericMatch ? genericMatch[1] : 'unknown'),
                    message: output.trim()
                });
            } else {
                reject(new Error(`${submitCommand} failed with code ${code}: ${error}`));
            }
        });
    });
};

module.exports = {
    generateJobScript,
    submitJob
};
