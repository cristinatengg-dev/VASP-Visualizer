const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * HPC Submitter Module
 * Handles job script generation and sbatch submission
 */

const buildEngineRunCommand = (engine, executable) => {
    const exe = String(executable || '').trim();
    switch (engine) {
        case 'abinit':
            return `${exe || 'abinit'} < abinit.files`;
        case 'amber':
            return `tleap -f tleap.in && ${exe || 'sander'} -O -i mdin -p system.prmtop -c system.inpcrd -o amber.out -r restrt`;
        case 'castep':
            return `${exe || 'castep'} scivis`;
        case 'cp2k':
            return `${exe || 'cp2k'} -i input.inp -o cp2k.out`;
        case 'dftbplus':
            return `${exe || 'dftb+'}`;
        case 'gaussian':
            return `${exe || 'g16'} gaussian.gjf`;
        case 'gromacs':
            return `${exe || 'gmx'} grompp -f md.mdp -c conf.gro -p topol.top -o topol.tpr && ${exe || 'gmx'} mdrun -deffnm run`;
        case 'lammps':
            return `${exe || 'lmp'} -in in.graphite_irradiation_creep`;
        case 'namd':
            return `${exe || 'namd2'} namd.conf`;
        case 'nwchem':
            return `${exe || 'nwchem'} nwchem.nw`;
        case 'openmm':
            return `${exe || 'python3'} run_openmm.py`;
        case 'orca':
            return `${exe || 'orca'} orca.inp`;
        case 'qchem':
            return `${exe || 'qchem'} qchem.in qchem.out`;
        case 'quantum_espresso':
            return `${exe || 'pw.x'} -in pw.in`;
        case 'siesta':
            return `${exe || 'siesta'} < siesta.fdf`;
        case 'xtb':
            return `sh run_xtb.sh`;
        case 'vasp':
        default:
            return exe || 'vasp_std';
    }
};

const defaultModuleForEngine = (engine, hpc) => {
    if (engine === 'vasp') {
        return hpc.id === 'server-b' ? 'module load vasp/6.3.0-gpu' : 'module load vasp/6.3.0-std';
    }
    return `module load ${engine}`;
};

const generateJobScript = (request) => {
    const { structure, hpc, intent } = request;
    const engine = String(intent?.engine || 'vasp').trim().toLowerCase() || 'vasp';
    const jobName = structure.data.filename || `${engine}_job`;
    const isLammps = engine === 'lammps';
    const stdoutFile = engine === 'vasp' ? 'vasp.out' : `${engine}.out`;
    const stderrFile = engine === 'vasp' ? 'vasp.err' : `${engine}.err`;
    const runCommand = buildEngineRunCommand(engine, hpc.executable);
    
    // HPC Profile specific configurations (can be extended to a profile library)
    const defaultModuleLoad = defaultModuleForEngine(engine, hpc);
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
    if [ "${engine}" = "vasp" ] || [ "${isLammps ? 'true' : 'false'}" = "true" ]; then
        mpirun -np $NP -machinefile $PBS_NODEFILE ${runCommand} >> ${stdoutFile} 2>&1
    else
        ${runCommand} >> ${stdoutFile} 2>&1
    fi
fi
`;
    }
    
    return `#!/bin/bash
#SBATCH -J ${jobName}
#SBATCH -p ${hpc.partition}
#SBATCH -N ${hpc.nodes}
#SBATCH --ntasks-per-node=${hpc.ntasks_per_node}
#SBATCH -t ${hpc.walltime}
#SBATCH -o ${stdoutFile}
#SBATCH -e ${stderrFile}

${prelude}

# Run with Custodian if requested
if [ "${request.runtime_policy.use_custodian}" = "true" ]; then
    python3 run_custodian.py
else
    if [ "${engine}" = "vasp" ] || [ "${isLammps ? 'true' : 'false'}" = "true" ]; then
        srun ${runCommand} > ${stdoutFile}
    else
        ${runCommand} > ${stdoutFile} 2> ${stderrFile}
    fi
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
