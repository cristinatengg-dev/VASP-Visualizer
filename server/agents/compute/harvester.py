import json
import sys
from pymatgen.io.vasp import Vasprun, Outcar
from pymatgen.core import Structure

"""
Result Harvester Module
Parses VASP output files into standard result objects
"""

def harvest_results(work_dir):
    try:
        # Load vasprun.xml for most data
        vrun = Vasprun(f"{work_dir}/vasprun.xml", parse_dos=True, parse_eigen=True)
        
        # Load OUTCAR for forces and stress if needed
        outcar = Outcar(f"{work_dir}/OUTCAR")
        
        final_struct = vrun.final_structure
        
        result = {
            "converged": vrun.converged,
            "final_energy": float(vrun.final_energy),
            "final_structure": final_struct.as_dict(),
            "forces": vrun.ionic_steps[-1]["forces"],
            "stress": vrun.ionic_steps[-1]["stress"],
            "efermi": float(vrun.efermi),
            "is_metal": vrun.get_band_structure().is_metal(),
            "summary": "Calculation completed successfully"
        }
        
        # Add error history from custodian if exists
        custodian_file = f"{work_dir}/custodian.json"
        if (os.path.exists(custodian_file)):
            with open(custodian_file, 'r') as f:
                result["corrections"] = json.load(f)
                
        return result
    except Exception as e:
        return {"error": str(e), "summary": "Failed to parse result files"}

if __name__ == "__main__":
    # Mocking for now as it needs real files
    print(json.dumps({"status": "Harvester script ready", "requires": ["vasprun.xml", "OUTCAR"]}))
