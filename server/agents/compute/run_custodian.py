import os
from custodian import Custodian
from custodian.vasp.handlers import VaspErrorHandler, MeshSymmetryErrorHandler, UnconvergedErrorHandler, NonConvergingErrorHandler, PotimErrorHandler
from custodian.vasp.jobs import VaspJob

"""
Runtime Guardian based on Custodian
Handles VASP error detection and automatic recovery
"""

def run_vasp_with_custodian():
    # Define the VASP command (can be read from environment or config)
    vasp_cmd = os.environ.get("VASP_CMD", "vasp_std")
    
    # Define error handlers
    handlers = [
        VaspErrorHandler(),
        MeshSymmetryErrorHandler(),
        UnconvergedErrorHandler(),
        NonConvergingErrorHandler(),
        PotimErrorHandler()
    ]
    
    # Define the job
    jobs = [VaspJob(vasp_cmd)]
    
    # Create and run Custodian
    c = Custodian(handlers, jobs, max_errors=5)
    c.run()

if __name__ == "__main__":
    run_vasp_with_custodian()
