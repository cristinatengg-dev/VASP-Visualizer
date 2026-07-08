#!/usr/bin/env python3
"""Build expanded SFT data for VASP-Visualizer-27B-SFT-v2."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

V1_DIR = Path(__file__).resolve().parents[1] / "vasp_visualizer_27b_sft_v1"
sys.path.insert(0, str(V1_DIR))

import build_dataset as v1  # noqa: E402


STRICT_PROJECT_SYSTEM = (
    "You are VASP-Visualizer-27B-SFT-v2. Return one valid JSON object only. "
    "Use exactly the requested schema. Make every output buildable by the "
    "VASP-Visualizer app. Do not invent citations, DOIs, or database IDs."
)

CORRECTION_SYSTEM = (
    "You are VASP-Visualizer's self-repair agent. Given a user request and a "
    "bad model output, return the corrected project JSON only."
)

ERROR_FIX_SYSTEM = (
    "You are VASP-Visualizer's VASP error fixer. Convert VASP or modeling "
    "failure logs into a concrete JSON diagnosis and repair plan. Return JSON only."
)


def material(name, family, phase, task, crystal_system="cubic", surface="", supercell=None, kpoints=None, potcar=None):
    return {
        "name": name,
        "cn": name,
        "family": family,
        "phase": phase,
        "task": task,
        "crystal_system": crystal_system,
        "surface": surface,
        "supercell": supercell or [2, 2, 1 if surface else 2],
        "kpoints": kpoints or ([4, 4, 1] if surface else [4, 4, 4]),
        "potcar": potcar or [],
    }


EXTRA_MATERIALS = [
    material("LiMn2O4", "spinel cathode", "spinel", "voltage", "cubic", "", [2, 2, 2], [4, 4, 4], ["Li_sv", "Mn_pv", "O"]),
    material("LiNiO2", "layered oxide cathode", "O3 layered", "voltage", "rhombohedral", "", [2, 2, 1], [5, 5, 3], ["Li_sv", "Ni_pv", "O"]),
    material("LiNi0.8Mn0.1Co0.1O2", "NMC layered cathode", "O3 layered", "voltage", "rhombohedral", "", [2, 2, 1], [4, 4, 3], ["Li_sv", "Ni_pv", "Mn_pv", "Co_pv", "O"]),
    material("NaFePO4", "sodium phosphate cathode", "olivine or maricite", "voltage", "orthorhombic", "", [2, 1, 1], [4, 4, 4], ["Na_pv", "Fe_pv", "P", "O"]),
    material("Na3V2P3O12", "NASICON cathode", "NASICON", "diffusion", "rhombohedral", "", [1, 1, 1], [3, 3, 3], ["Na_pv", "V_pv", "P", "O"]),
    material("Li10GeP2S12", "sulfide solid electrolyte", "LGPS", "diffusion", "tetragonal", "", [1, 1, 1], [3, 3, 3], ["Li_sv", "Ge_d", "P", "S"]),
    material("Li1.3Al0.3Ti1.7P3O12", "NASICON solid electrolyte", "LATP", "diffusion", "rhombohedral", "", [1, 1, 1], [3, 3, 3], ["Li_sv", "Al", "Ti_pv", "P", "O"]),
    material("BaTiO3", "oxide perovskite", "tetragonal perovskite", "bulk_stability", "tetragonal", "", [2, 2, 2], [4, 4, 4], ["Ba_sv", "Ti_pv", "O"]),
    material("LaNiO3", "correlated oxide perovskite", "rhombohedral perovskite", "bulk_stability", "rhombohedral", "", [2, 2, 2], [4, 4, 4], ["La", "Ni_pv", "O"]),
    material("LaMnO3", "manganite perovskite", "orthorhombic perovskite", "doping", "orthorhombic", "", [2, 2, 2], [4, 4, 4], ["La", "Mn_pv", "O"]),
    material("CsPbBr3", "halide perovskite", "cubic perovskite", "defect", "cubic", "", [2, 2, 2], [4, 4, 4], ["Cs_sv", "Pb_d", "Br"]),
    material("CH3NH3PbI3", "hybrid halide perovskite", "tetragonal perovskite", "defect", "tetragonal", "", [2, 2, 2], [3, 3, 3], ["C", "H", "N", "Pb_d", "I"]),
    material("UO2", "nuclear fuel oxide", "fluorite", "defect", "cubic", "", [2, 2, 2], [4, 4, 4], ["U", "O"]),
    material("Zr", "nuclear cladding metal", "hcp", "bulk_stability", "hexagonal", "(0001)", [3, 3, 1], [4, 4, 1], ["Zr_sv"]),
    material("SiC", "radiation-resistant ceramic", "3C zinc blende", "defect", "cubic", "", [3, 3, 3], [4, 4, 4], ["Si", "C"]),
    material("FeCrAl", "accident-tolerant fuel cladding alloy", "bcc alloy", "bulk_stability", "cubic", "", [3, 3, 3], [4, 4, 4], ["Fe_pv", "Cr_pv", "Al"]),
    material("CoCrFeMnNi", "high entropy alloy", "fcc HEA", "bulk_stability", "cubic", "(111)", [3, 3, 1], [4, 4, 1], ["Co", "Cr_pv", "Fe_pv", "Mn_pv", "Ni_pv"]),
    material("NiO", "transition metal oxide", "rocksalt", "defect", "cubic", "(100)", [2, 2, 1], [4, 4, 1], ["Ni_pv", "O"]),
    material("ZnO", "wide bandgap oxide", "wurtzite", "surface", "hexagonal", "(10-10)", [2, 2, 1], [4, 4, 1], ["Zn", "O"]),
    material("SnO2", "transparent conducting oxide", "rutile", "surface", "tetragonal", "(110)", [2, 2, 1], [4, 4, 1], ["Sn_d", "O"]),
    material("WO3", "electrochromic oxide", "monoclinic", "defect", "monoclinic", "(001)", [2, 2, 1], [3, 3, 1], ["W_pv", "O"]),
    material("MnO2", "battery oxide", "rutile beta", "diffusion", "tetragonal", "(110)", [2, 2, 1], [4, 4, 1], ["Mn_pv", "O"]),
    material("ZrO2", "thermal barrier oxide", "monoclinic", "defect", "monoclinic", "(111)", [2, 2, 1], [3, 3, 1], ["Zr_sv", "O"]),
    material("HfO2", "high-k dielectric oxide", "monoclinic", "defect", "monoclinic", "", [2, 2, 2], [4, 4, 4], ["Hf_pv", "O"]),
    material("MgO", "rocksalt oxide", "rocksalt", "surface", "cubic", "(100)", [3, 3, 1], [4, 4, 1], ["Mg_pv", "O"]),
    material("BN", "2D insulator", "hexagonal monolayer", "defect", "hexagonal", "basal plane", [5, 5, 1], [3, 3, 1], ["B", "N"]),
    material("WS2", "2D transition-metal dichalcogenide", "2H", "defect", "hexagonal", "basal plane", [4, 4, 1], [3, 3, 1], ["W_pv", "S"]),
    material("WSe2", "2D transition-metal dichalcogenide", "2H", "defect", "hexagonal", "basal plane", [4, 4, 1], [3, 3, 1], ["W_pv", "Se"]),
    material("GaN", "wide bandgap semiconductor", "wurtzite", "defect", "hexagonal", "", [3, 3, 2], [4, 4, 4], ["Ga_d", "N"]),
    material("GaAs", "III-V semiconductor", "zinc blende", "band_structure", "cubic", "", [2, 2, 2], [6, 6, 6], ["Ga_d", "As"]),
    material("Cu2O", "oxide semiconductor", "cuprite", "defect", "cubic", "(111)", [2, 2, 1], [4, 4, 1], ["Cu_pv", "O"]),
    material("MoO3", "layered oxide", "orthorhombic alpha", "intercalation", "orthorhombic", "(010)", [2, 2, 1], [3, 3, 1], ["Mo_pv", "O"]),
    material("Au", "noble metal catalyst", "fcc", "surface", "cubic", "(111)", [3, 3, 1], [4, 4, 1], ["Au"]),
    material("Pd", "noble metal catalyst", "fcc", "surface", "cubic", "(111)", [3, 3, 1], [4, 4, 1], ["Pd"]),
    material("Rh", "noble metal catalyst", "fcc", "surface", "cubic", "(111)", [3, 3, 1], [4, 4, 1], ["Rh_pv"]),
    material("Ir", "noble metal catalyst", "fcc", "surface", "cubic", "(111)", [3, 3, 1], [4, 4, 1], ["Ir"]),
]


CALC_MODES = [
    "bulk_relax",
    "static",
    "dos",
    "band_structure",
    "surface_adsorption",
    "defect_relax",
    "doping_relax",
    "neb",
]

SURFACE_PROMPTS_CN = [
    "建立 {formula}{surface} 表面，真空层 {vacuum} Å，底部两层固定。",
    "我要一个 {formula} 的 {surface} slab，用 {supercell} 超胞，后面做吸附能。",
    "帮我从数据库结构生成 {formula}{surface} 表面模型，厚度至少 8 Å。",
]

CRYSTAL_PROMPTS_CN = [
    "帮我建立 {formula} 的体相晶体模型，优先 Materials Project。",
    "我要 {formula} 的可计算结构，不要只给化学式。",
    "用 VASP-Visualizer 生成 {formula} starter model，附上 provider 顺序。",
]

ADS_PROMPTS = [
    "把 {ads} 放到 {formula}{surface} 表面的 {site} 位点，做吸附模型。",
    "Build {ads} adsorption on {formula}{surface} at the {site} site with 15 Å vacuum.",
    "为 {formula}{surface} 构建 {ads} 吸附结构，后续要算 adsorption energy。",
]

CORRECTION_PROMPTS = [
    "这个输出不能 build，帮我修正成项目 schema。",
    "模型把公式当结构了，请修正为可执行 Modeling JSON。",
    "这个 JSON 字段不符合 VASP-Visualizer，返回 corrected JSON only。",
]

ERROR_SNIPPETS = [
    (
        "ZBRENT: fatal error in bracketing",
        "ionic relaxation instability",
        ["reduce POTIM to 0.2", "restart from CONTCAR", "check bad initial geometry or overlapping atoms"],
    ),
    (
        "Sub-Space-Matrix is not hermitian in DAV",
        "electronic minimization instability",
        ["switch ALGO to Normal", "set NELM=120", "check MAGMOM and smearing"],
    ),
    (
        "VERY BAD NEWS! internal error in subroutine PRICEL",
        "bad symmetry or cell geometry",
        ["set ISYM=0", "validate lattice vectors", "rebuild slab/supercell if atoms overlap"],
    ),
    (
        "BRMIX: very serious problems",
        "charge mixing instability",
        ["set AMIX=0.2 and BMIX=0.0001", "try Kerker mixing", "restart from WAVECAR only if compatible"],
    ),
    (
        "WARNING: Sub-Space-Matrix is not hermitian",
        "magnetic/electronic convergence issue",
        ["initialize MAGMOM explicitly", "use ISMEAR=0 SIGMA=0.05 for semiconductors", "increase NELM"],
    ),
    (
        "Error reading item POTCAR",
        "POTCAR assembly problem",
        ["verify POTCAR order matches POSCAR species", "use project pseudopotential library", "regenerate POTCAR"],
    ),
    (
        "CNORMN: search vector ill defined",
        "geometry or electronic optimizer failure",
        ["relax with smaller step", "check constraints", "start with lower symmetry ISYM=0"],
    ),
]


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def add(examples, category, system, user, assistant_obj):
    examples.append({
        "id": f"vv27b-v2-{len(examples) + 1:06d}",
        "category": category,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": dumps(assistant_obj)},
        ],
    })


def all_materials():
    return v1.MATERIALS + EXTRA_MATERIALS


def as_tuple(value):
    return "x".join(str(x) for x in value)


def provider_custom(order):
    merged = []
    for item in order + v1.PROVIDERS:
        if item not in merged:
            merged.append(item)
    return merged


def modeling_with_providers(material, task_type="crystal", providers=None, **kwargs):
    intent = v1.modeling_intent(material, task_type=task_type, **kwargs)
    if providers:
        intent["provider_preferences"] = provider_custom(providers)
    return intent


def strict_integrated(material):
    plan = v1.integrated_plan(material)
    return {
        "mode": "vasp_visualizer_plan",
        "modeling_intent": plan["modeling_intent"],
        "retrieval_plan": plan["retrieval_plan"],
        "vasp_inputs": plan["vasp_inputs"],
        "rendering_brief": plan["rendering_brief"],
        "next_actions": plan["next_actions"],
    }


def vasp_inputs_extended(material, mode):
    plan = v1.vasp_plan(material, "surface_adsorption" if mode == "surface_adsorption" else ("neb" if mode == "neb" else "bulk_relax"))
    plan["calculation_type"] = mode
    incar = plan["vasp"]["incar"]
    if mode == "dos":
        incar.update({"IBRION": -1, "NSW": 0, "ICHARG": 11, "LORBIT": 11, "NEDOS": 2000})
        plan["workflow_steps"].append("Run DOS after a converged static calculation with a denser k-point mesh.")
    elif mode == "band_structure":
        incar.update({"IBRION": -1, "NSW": 0, "ICHARG": 11, "LORBIT": 11})
        plan["vasp"]["kpoints"] = {"mode": "line", "path": "Use pymatgen high-symmetry path after relaxation"}
        plan["workflow_steps"].append("Generate line-mode KPOINTS from the relaxed structure.")
    elif mode == "doping_relax":
        incar["ISIF"] = 3
        plan["workflow_steps"].insert(1, "Replace one host atom by the dopant and record the exact concentration.")
    elif mode == "defect_relax":
        incar["ISIF"] = 3
        plan["workflow_steps"].insert(1, "Remove the requested atom, preserve charge-state notes, and relax the defect cell.")
    return plan


def correction_payload(material, bad_kind):
    corrected = v1.modeling_intent(material, "slab" if material.get("surface") else "crystal", surface=material.get("surface") or None)
    if bad_kind == "formula_only":
        bad_output = {"material": material["name"]}
        issue = "Only a formula was returned; the Modeling Agent needs task_type, substrate, and provider_preferences."
    elif bad_kind == "wrong_task":
        bad_output = {"task_type": "molecule", "molecule": {"name_or_smiles": material["name"]}}
        issue = "A crystal or slab material was incorrectly treated as a molecule."
    else:
        bad_output = {"task": "surface_adsorption", "substrate": material["name"], "adsorbate": "CO2"}
        issue = "Fields use unsupported names and cannot be normalized reliably."
        if material.get("surface"):
            corrected = v1.modeling_intent(material, "slab", adsorbate=v1.ADSORBATES[0], surface=material["surface"])
    return {
        "bad_output": bad_output,
        "issue": issue,
        "corrected": corrected,
    }


def vasp_error_fix(material, snippet, diagnosis, fixes):
    return {
        "error_signature": snippet,
        "diagnosis": diagnosis,
        "affected_material": material["name"],
        "likely_causes": [
            "initial structure or electronic settings are inconsistent with the requested workflow",
            "calculation settings need a conservative recovery path",
        ],
        "repair_plan": fixes,
        "safe_incar_patch": {
            "ALGO": "Normal",
            "NELM": 120,
            "ISYM": 0,
            "EDIFF": "1E-5",
            "PREC": "Accurate",
        },
        "project_action": "Regenerate inputs in VASP-Visualizer, preserve the original failed job, and rerun from a clean working directory.",
    }


def evaluation_example(material, answer_quality):
    good = answer_quality == "good"
    return {
        "is_acceptable": good,
        "score": 5 if good else 1,
        "reasons": [
            "uses project schema" if good else "does not use project schema",
            "separates formula, structure, supercell, and VASP settings" if good else "mixes a formula label with a simulation-ready structure",
            "avoids fabricated citations" if good else "contains unsupported claims or missing build fields",
        ],
        "required_fix": None if good else "Return Modeling JSON with task_type, substrate, provider_preferences, and VASP settings when requested.",
        "reference_material": material["name"],
    }


def build_examples():
    examples = []
    for item in v1.build_examples():
        next_item = json.loads(json.dumps(item, ensure_ascii=False))
        next_item["id"] = f"vv27b-v2-seed-{len(examples) + 1:06d}"
        next_item["category"] = "seed_" + next_item.get("category", "unknown")
        examples.append(next_item)

    materials = all_materials()

    for material in materials:
        formula = material["name"]
        surface = material.get("surface") or "(111)"

        for prompt in CRYSTAL_PROMPTS_CN:
            add(
                examples,
                "modeling_crystal_variants",
                v1.MODELING_SYSTEM,
                prompt.format(formula=formula),
                modeling_with_providers(material, "crystal"),
            )

        add(
            examples,
            "modeling_provider_order",
            v1.MODELING_SYSTEM,
            f"用本地结构库优先，其次 Materials Project，帮我建立 {formula} 模型。",
            modeling_with_providers(material, "crystal", providers=["local_structure", "materials_project"]),
        )
        add(
            examples,
            "modeling_provider_order",
            v1.MODELING_SYSTEM,
            f"Skip local files first; query OPTIMADE then fallback for {formula}.",
            modeling_with_providers(material, "crystal", providers=["optimade", "fallback"]),
        )

        if material.get("surface"):
            for prompt in SURFACE_PROMPTS_CN:
                add(
                    examples,
                    "modeling_surface_variants",
                    v1.MODELING_SYSTEM,
                    prompt.format(formula=formula, surface=material["surface"], vacuum=15, supercell=as_tuple(material["supercell"])),
                    modeling_with_providers(material, "slab", surface=material["surface"]),
                )

            for adsorbate in v1.ADSORBATES:
                ads, site, _reason = adsorbate
                for prompt in ADS_PROMPTS:
                    add(
                        examples,
                        "modeling_adsorption_variants",
                        v1.MODELING_SYSTEM,
                        prompt.format(formula=formula, surface=material["surface"], ads=ads, site=site),
                        modeling_with_providers(material, "slab", adsorbate=adsorbate, surface=material["surface"]),
                    )

        for dopant in v1.DOPANTS:
            host, dopant_element = dopant
            add(
                examples,
                "modeling_doping_variants",
                v1.MODELING_SYSTEM,
                f"把 {formula} 里一个 {host} 位点替换成 {dopant_element}，浓度控制在 12.5% 左右。",
                modeling_with_providers(material, "crystal", dopant=dopant),
            )
            add(
                examples,
                "modeling_doping_variants",
                v1.MODELING_SYSTEM,
                f"Build a substitutional {dopant_element}-doped {formula} supercell and keep it buildable.",
                modeling_with_providers(material, "crystal", dopant=dopant),
            )

        for defect in v1.DEFECTS:
            element, label = defect
            add(
                examples,
                "modeling_defect_variants",
                v1.MODELING_SYSTEM,
                f"给 {formula} 做一个 {label}，只移除一个 {element} 原子。",
                modeling_with_providers(material, "crystal", defect=defect),
            )

        for research_type in ["bulk_stability", "voltage", "diffusion", "doping", "surface", "defect"]:
            plan = v1.retrieval_plan(material, research_type=research_type)
            add(
                examples,
                "idea_retrieval_variants",
                v1.IDEA_SYSTEM,
                f"围绕 {formula} 的 {research_type} 给我检索关键词、结构查询计划和 starter model。",
                plan,
            )

        for mode in CALC_MODES:
            add(
                examples,
                "vasp_inputs_extended",
                v1.VASP_SYSTEM,
                f"为 {formula} 生成 {mode} 的 VASP 输入，要求保守、可复现。",
                vasp_inputs_extended(material, mode),
            )

        add(
            examples,
            "integrated_strict_schema",
            STRICT_PROJECT_SYSTEM,
            (
                "Return JSON only with exactly these top-level keys: mode, modeling_intent, "
                f"retrieval_plan, vasp_inputs, rendering_brief, next_actions. User wants {formula}."
            ),
            strict_integrated(material),
        )
        add(
            examples,
            "integrated_strict_schema",
            STRICT_PROJECT_SYSTEM,
            f"我要在 VASP-Visualizer 里研究 {formula}，从建模、结构检索、VASP 参数到渲染都生成，字段必须固定。",
            strict_integrated(material),
        )

        for bad_kind in ["formula_only", "wrong_task", "wrong_fields"]:
            for prompt in CORRECTION_PROMPTS:
                payload = correction_payload(material, bad_kind)
                add(
                    examples,
                    "self_repair_modeling",
                    CORRECTION_SYSTEM,
                    f"{prompt}\nUser request: build {formula}\nBad output: {dumps(payload['bad_output'])}",
                    payload["corrected"],
                )

        for snippet, diagnosis, fixes in ERROR_SNIPPETS:
            add(
                examples,
                "vasp_error_fix",
                ERROR_FIX_SYSTEM,
                f"{formula} 计算失败日志：{snippet}。请给项目可执行修复方案。",
                vasp_error_fix(material, snippet, diagnosis, fixes),
            )

        render_texts = [
            f"{formula} {material['phase']} structure reveals a {material['task']} mechanism through DFT validation.",
            f"We visualize {formula} as a {material['family']} with structure-property relations and atomistic constraints.",
            f"Scientific cover concept: {formula} lattice, defect site, and VASP workflow validation in one scene.",
        ]
        for text in render_texts:
            add(
                examples,
                "rendering_extraction_variants",
                v1.RENDER_SYSTEM,
                f"Parse this scientific text for rendering:\n\n{text}",
                v1.rendering_payload(material, text),
            )

        add(
            examples,
            "answer_quality_eval",
            STRICT_PROJECT_SYSTEM,
            f"Evaluate answer quality for a {formula} VASP-Visualizer response that uses exact project JSON and buildable fields.",
            evaluation_example(material, "good"),
        )
        add(
            examples,
            "answer_quality_eval",
            STRICT_PROJECT_SYSTEM,
            f"Evaluate answer quality for a {formula} response that only says the material is promising and gives no Modeling JSON.",
            evaluation_example(material, "bad"),
        )

    # Molecule-only examples for the Modeling Agent.
    molecules = [
        ("CO2", "O=C=O"),
        ("H2O", "O"),
        ("NH3", "N"),
        ("CH4", "C"),
        ("ethanol", "CCO"),
        ("benzene", "c1ccccc1"),
        ("formic acid", "C(=O)O"),
    ]
    for name, smiles in molecules:
        add(
            examples,
            "modeling_molecule",
            v1.MODELING_SYSTEM,
            f"生成 {name} 分子的 3D 结构。",
            {
                "task_type": "molecule",
                "molecule": {"name_or_smiles": smiles, "generate_3d": True},
                "provider_preferences": v1.PROVIDERS,
            },
        )

    return examples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    examples = build_examples()
    if args.limit and args.limit > 0:
        examples = examples[: args.limit]

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for item in examples:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    counts = {}
    for item in examples:
        counts[item["category"]] = counts.get(item["category"], 0) + 1

    stats = {"total": len(examples), "categories": counts}
    out.with_suffix(".stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(out), **stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
