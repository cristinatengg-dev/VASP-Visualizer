#!/usr/bin/env python3
"""Build deterministic SFT data for VASP-Visualizer-27B-SFT-v1."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


PROJECT_SYSTEM = (
    "You are VASP-Visualizer-27B-SFT-v1, the project-specific materials agent "
    "inside VASP-Visualizer. Convert user requests into structured, executable "
    "outputs for the app. Prefer valid JSON. Do not invent citations. Separate "
    "formula labels, database structures, supercells, VASP settings, and visual "
    "rendering instructions."
)

MODELING_SYSTEM = (
    "You are VASP-Visualizer's Modeling Agent. Convert natural language into "
    "one valid JSON object for atomistic modeling. Supported task_type values "
    "are molecule, crystal, slab. Return JSON only."
)

IDEA_SYSTEM = (
    "You are VASP-Visualizer's Idea Agent. Convert a materials research request "
    "into a retrieval and structure-query plan. Return JSON only. Candidate "
    "formulas must be explicit or clearly family-derived; do not fabricate papers."
)

VASP_SYSTEM = (
    "You are VASP-Visualizer's VASP input assistant. Produce conservative, "
    "project-executable VASP settings and workflow checks. Return JSON only."
)

RENDER_SYSTEM = (
    "You are VASP-Visualizer's scientific rendering extractor. Parse scientific "
    "text into the rendering schema used by the journal-cover generator. Return "
    "JSON only."
)


PROVIDERS = [
    "local_structure",
    "materials_project",
    "atomly",
    "csd",
    "icsd",
    "optimade",
    "fallback",
]


MATERIALS = [
    {
        "name": "LiFePO4",
        "cn": "磷酸铁锂",
        "family": "olivine phosphate cathode",
        "phase": "olivine",
        "task": "voltage",
        "crystal_system": "orthorhombic",
        "supercell": [2, 1, 1],
        "kpoints": [4, 4, 4],
        "potcar": ["Li_sv", "Fe_pv", "P", "O"],
    },
    {
        "name": "LiCoO2",
        "cn": "钴酸锂",
        "family": "layered oxide cathode",
        "phase": "O3 layered",
        "task": "voltage",
        "crystal_system": "rhombohedral",
        "supercell": [2, 2, 1],
        "kpoints": [5, 5, 3],
        "potcar": ["Li_sv", "Co_pv", "O"],
    },
    {
        "name": "NaCoO2",
        "cn": "钠层状氧化物",
        "family": "sodium layered oxide cathode",
        "phase": "O3 or P2 layered",
        "task": "voltage",
        "crystal_system": "hexagonal",
        "supercell": [2, 2, 1],
        "kpoints": [5, 5, 3],
        "potcar": ["Na_pv", "Co_pv", "O"],
    },
    {
        "name": "SrTiO3",
        "cn": "钛酸锶",
        "family": "oxide perovskite",
        "phase": "cubic perovskite",
        "task": "defect",
        "crystal_system": "cubic",
        "supercell": [2, 2, 2],
        "kpoints": [4, 4, 4],
        "potcar": ["Sr_sv", "Ti_pv", "O"],
    },
    {
        "name": "TiO2",
        "cn": "二氧化钛",
        "family": "rutile/anatase oxide",
        "phase": "rutile",
        "task": "surface",
        "crystal_system": "tetragonal",
        "surface": "(110)",
        "supercell": [2, 2, 1],
        "kpoints": [4, 4, 1],
        "potcar": ["Ti_pv", "O"],
    },
    {
        "name": "CeO2",
        "cn": "氧化铈",
        "family": "fluorite oxide catalyst support",
        "phase": "fluorite",
        "task": "surface",
        "crystal_system": "cubic",
        "surface": "(111)",
        "supercell": [2, 2, 1],
        "kpoints": [4, 4, 1],
        "potcar": ["Ce", "O"],
    },
    {
        "name": "MoS2",
        "cn": "二硫化钼",
        "family": "2D transition-metal dichalcogenide",
        "phase": "2H",
        "task": "surface",
        "crystal_system": "hexagonal",
        "surface": "basal plane",
        "supercell": [4, 4, 1],
        "kpoints": [3, 3, 1],
        "potcar": ["Mo_pv", "S"],
    },
    {
        "name": "Graphene",
        "cn": "石墨烯",
        "family": "2D carbon material",
        "phase": "single layer",
        "task": "adsorption",
        "crystal_system": "hexagonal",
        "surface": "basal plane",
        "supercell": [5, 5, 1],
        "kpoints": [3, 3, 1],
        "potcar": ["C"],
    },
    {
        "name": "Cu",
        "cn": "铜",
        "family": "fcc transition metal catalyst",
        "phase": "fcc",
        "task": "surface",
        "crystal_system": "cubic",
        "surface": "(111)",
        "supercell": [3, 3, 1],
        "kpoints": [4, 4, 1],
        "potcar": ["Cu_pv"],
    },
    {
        "name": "Pt",
        "cn": "铂",
        "family": "fcc noble metal catalyst",
        "phase": "fcc",
        "task": "surface",
        "crystal_system": "cubic",
        "surface": "(111)",
        "supercell": [3, 3, 1],
        "kpoints": [4, 4, 1],
        "potcar": ["Pt"],
    },
    {
        "name": "Ni",
        "cn": "镍",
        "family": "fcc transition metal catalyst",
        "phase": "fcc",
        "task": "surface",
        "crystal_system": "cubic",
        "surface": "(111)",
        "supercell": [3, 3, 1],
        "kpoints": [4, 4, 1],
        "potcar": ["Ni_pv"],
    },
    {
        "name": "Fe",
        "cn": "铁",
        "family": "bcc transition metal",
        "phase": "bcc",
        "task": "bulk_stability",
        "crystal_system": "cubic",
        "supercell": [3, 3, 3],
        "kpoints": [5, 5, 5],
        "potcar": ["Fe_pv"],
    },
    {
        "name": "Si",
        "cn": "硅",
        "family": "diamond semiconductor",
        "phase": "diamond",
        "task": "bulk_stability",
        "crystal_system": "cubic",
        "supercell": [2, 2, 2],
        "kpoints": [6, 6, 6],
        "potcar": ["Si"],
    },
    {
        "name": "Al2O3",
        "cn": "氧化铝",
        "family": "ceramic oxide",
        "phase": "corundum",
        "task": "surface",
        "crystal_system": "trigonal",
        "surface": "(0001)",
        "supercell": [2, 2, 1],
        "kpoints": [4, 4, 1],
        "potcar": ["Al", "O"],
    },
    {
        "name": "Li7La3Zr2O12",
        "cn": "LLZO 固态电解质",
        "family": "garnet solid electrolyte",
        "phase": "cubic garnet",
        "task": "diffusion",
        "crystal_system": "cubic",
        "supercell": [1, 1, 1],
        "kpoints": [3, 3, 3],
        "potcar": ["Li_sv", "La", "Zr_sv", "O"],
    },
]


ADSORBATES = [
    ("CO2", "top", "CO2 reduction intermediate screening"),
    ("CO", "top", "CO adsorption energy benchmark"),
    ("H2O", "top", "surface hydroxylation check"),
    ("O2", "bridge", "oxygen activation"),
    ("H", "hollow", "hydrogen adsorption"),
    ("OH", "top", "oxygen evolution intermediate"),
]

DOPANTS = [
    ("Fe", "Mn"),
    ("Co", "Ni"),
    ("Ti", "Nb"),
    ("Ce", "Zr"),
    ("Sr", "La"),
    ("Li", "Mg"),
    ("O", "F"),
]

DEFECTS = [
    ("O", "oxygen vacancy"),
    ("Li", "lithium vacancy"),
    ("Na", "sodium vacancy"),
    ("S", "sulfur vacancy"),
    ("C", "carbon vacancy"),
]


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def add_example(examples, category, system, user, assistant_obj):
    examples.append({
        "id": f"vv27b-v1-{len(examples) + 1:05d}",
        "category": category,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": dumps(assistant_obj)},
        ],
    })


def base_substrate(material, task_type="crystal", surface=None):
    return {
        "material": material["name"],
        "surface": surface or material.get("surface", ""),
        "min_slab_size": 8.0,
        "supercell": material["supercell"],
        "vacuum": 15.0,
    } if task_type == "slab" else {
        "material": material["name"],
        "surface": "",
        "min_slab_size": 8.0,
        "supercell": material["supercell"],
        "vacuum": 15.0,
    }


def modeling_intent(material, task_type="crystal", adsorbate=None, dopant=None, defect=None, surface=None):
    intent = {
        "task_type": task_type,
        "substrate": base_substrate(material, task_type, surface),
        "adsorbates": [],
        "doping": None,
        "defect": None,
        "provider_preferences": PROVIDERS,
    }
    if adsorbate:
        formula, site, _reason = adsorbate
        intent["adsorbates"] = [{"formula": formula, "initial_site": site, "count": 1}]
    if dopant:
        host, dopant_element = dopant
        intent["doping"] = {
            "host_element": host,
            "dopant_element": dopant_element,
            "count": 1,
            "concentration": 0.125,
        }
    if defect:
        element, _label = defect
        intent["defect"] = {"type": "vacancy", "element": element, "count": 1}
    return intent


def retrieval_plan(material, research_type=None):
    formula = material["name"]
    family = material["family"]
    research = research_type or material["task"]
    return {
        "interpreted_goal": f"Build a source-backed starter workflow for {formula} in {family}.",
        "user_profile": "theory-starter",
        "depth": "starter",
        "literature_query": f"{formula} {family} DFT {research} structure",
        "candidate_formulas": [formula],
        "material_family": family,
        "research_type": research,
        "structure_query_plan": {
            "formulas": [formula],
            "sources": [
                {"formula": formula, "reason": "explicit_formula", "family_label": family},
            ],
            "families": [family],
        },
        "idea_cards": [
            {
                "id": "starter-model",
                "title": f"Starter {formula} model",
                "modeling_target": f"Use the {material['phase']} {formula} polymorph as the initial structure.",
                "supercell": material["supercell"],
                "rationale": "Start from a database-backed conventional cell, then expand only enough for the requested perturbation.",
                "modeling_prompt": f"Build a {formula} {material['phase']} starter model using Materials Project first.",
            },
            {
                "id": "validation-path",
                "title": "Validation calculation",
                "modeling_target": "Relax the imported structure, then run static energy and optional DOS checks.",
                "supercell": material["supercell"],
                "rationale": "Separating relaxation and static calculations keeps geometry and electronic outputs reproducible.",
                "modeling_prompt": f"Prepare a relaxation and static workflow for {formula}.",
            },
        ],
    }


def incar_for(material, mode):
    base = {
        "SYSTEM": f"{material['name']} {mode}",
        "ENCUT": 520,
        "EDIFF": "1E-5",
        "ISMEAR": 0,
        "SIGMA": 0.05,
        "IBRION": 2,
        "NSW": 100,
        "ISIF": 3 if mode in ("bulk_relax", "defect_relax", "doping_relax") else 2,
        "PREC": "Accurate",
        "LREAL": "Auto",
    }
    if any(x in material["family"] for x in ["cathode", "oxide", "garnet", "perovskite"]):
        base.update({"LDAU": True, "LDAUTYPE": 2, "LASPH": True})
    if mode == "static":
        base.update({"IBRION": -1, "NSW": 0, "ICHARG": 11, "ISIF": 2})
    if mode == "surface_adsorption":
        base.update({"ISIF": 2, "LDIPOL": True, "IDIPOL": 3})
    if mode == "neb":
        base.update({"IBRION": 3, "POTIM": 0, "IMAGES": 5, "SPRING": -5, "LCLIMB": True})
    return base


def vasp_plan(material, mode="bulk_relax"):
    return {
        "calculation_type": mode,
        "structure": {
            "formula": material["name"],
            "phase": material["phase"],
            "crystal_system": material["crystal_system"],
            "supercell": material["supercell"],
        },
        "vasp": {
            "incar": incar_for(material, mode),
            "kpoints": {"mode": "Gamma", "grid": material["kpoints"]},
            "potcar": material["potcar"],
        },
        "workflow_steps": [
            "Import or build the database-backed structure in Modeling Agent.",
            "Run geometry relaxation and check force convergence below 0.03 eV/Å.",
            "Run a static calculation using the relaxed CONTCAR.",
            "Parse energy, volume, magnetization, and electronic outputs before comparing candidates.",
        ],
        "validation_checks": [
            "Verify stoichiometry and oxidation-state-sensitive POTCAR choices.",
            "Check k-point density after supercell expansion.",
            "Do not compare energies from different ENCUT, U, or smearing settings.",
        ],
    }


def rendering_payload(material, theme):
    formula = material["name"]
    central = f"{formula} {material['phase']} structure"
    return {
        "domain": "Materials",
        "subdomain": material["family"],
        "core_theme": theme,
        "central_object": central,
        "support_or_substrate": f"{formula} {material.get('surface', '')} surface".strip() if material.get("surface") else None,
        "active_site": "defect or adsorption site" if material["task"] in ("surface", "adsorption", "defect") else None,
        "environment": "atomistic model under DFT workflow conditions",
        "scale_level": "nanoscale (1-10 nm)",
        "key_mechanism": "structure-property relationship",
        "visual_keywords": [material["family"], material["phase"], "crystal lattice", "DFT workflow"],
        "must_show_elements": [formula, "crystal lattice", "surface or supercell context"],
        "forbidden_elements": ["text labels", "fake citations", "unphysical bonds"],
        "reactants": [],
        "intermediates": [],
        "products": [],
        "scientific_entities": [
            {"name": formula, "role": "host material", "formula": formula},
        ],
    }


def integrated_plan(material):
    formula = material["name"]
    return {
        "mode": "vasp_visualizer_plan",
        "project_model": "VASP-Visualizer-27B-SFT-v1",
        "modeling_intent": modeling_intent(material, "crystal"),
        "retrieval_plan": retrieval_plan(material),
        "vasp_inputs": vasp_plan(material, "bulk_relax"),
        "rendering_brief": rendering_payload(material, f"Show the {formula} workflow from crystal model to VASP validation."),
        "next_actions": [
            "Search Materials Project and local structure libraries for a concrete structure.",
            "Build the selected structure with the Modeling Agent.",
            "Generate relaxation and static VASP inputs.",
            "Render a scientifically faithful structure view after validation.",
        ],
    }


def build_examples():
    examples = []

    for material in MATERIALS:
        formula = material["name"]
        cn = material["cn"]

        add_example(
            examples,
            "modeling_intent",
            MODELING_SYSTEM,
            f"帮我建立 {cn}（{formula}）的体相晶体模型，优先用 Materials Project。",
            modeling_intent(material, "crystal"),
        )
        add_example(
            examples,
            "modeling_intent",
            MODELING_SYSTEM,
            f"Build a simulation-ready {formula} {material['phase']} crystal, then expand to {material['supercell']}.",
            modeling_intent(material, "crystal"),
        )

        if material.get("surface"):
            add_example(
                examples,
                "modeling_intent",
                MODELING_SYSTEM,
                f"建立 {formula}{material['surface']} 表面，真空层 15 Å，厚度至少 8 Å。",
                modeling_intent(material, "slab", surface=material["surface"]),
            )
            for adsorbate in ADSORBATES[:4]:
                add_example(
                    examples,
                    "modeling_intent",
                    MODELING_SYSTEM,
                    f"把 {adsorbate[0]} 放到 {formula}{material['surface']} 表面的 {adsorbate[1]} 位点，做吸附模型。",
                    modeling_intent(material, "slab", adsorbate=adsorbate, surface=material["surface"]),
                )

        for dopant in DOPANTS[:4]:
            add_example(
                examples,
                "modeling_intent",
                MODELING_SYSTEM,
                f"在 {formula} 中用 {dopant[1]} 替代一个 {dopant[0]} 位点，浓度大概 12.5%。",
                modeling_intent(material, "crystal", dopant=dopant),
            )

        for defect in DEFECTS[:3]:
            add_example(
                examples,
                "modeling_intent",
                MODELING_SYSTEM,
                f"给 {formula} 做一个 {defect[1]} 缺陷模型。",
                modeling_intent(material, "crystal", defect=defect),
            )

        add_example(
            examples,
            "idea_retrieval",
            IDEA_SYSTEM,
            f"我想研究 {cn} 的 {material['task']}，帮我找结构和计算路线。",
            retrieval_plan(material),
        )
        add_example(
            examples,
            "idea_retrieval",
            IDEA_SYSTEM,
            f"Give me a source-backed starter plan for {formula} as a {material['family']} material.",
            retrieval_plan(material),
        )

        for mode in ["bulk_relax", "static", "defect_relax"]:
            add_example(
                examples,
                "vasp_inputs",
                VASP_SYSTEM,
                f"给 {formula} 的 {mode} 计算生成 VASP 输入建议。",
                vasp_plan(material, mode),
            )
        if material.get("surface"):
            add_example(
                examples,
                "vasp_inputs",
                VASP_SYSTEM,
                f"Prepare VASP settings for adsorption on {formula}{material['surface']}.",
                vasp_plan(material, "surface_adsorption"),
            )
        if material["task"] == "diffusion":
            add_example(
                examples,
                "vasp_inputs",
                VASP_SYSTEM,
                f"给 {formula} 的 Li 扩散 NEB 计算生成保守参数。",
                vasp_plan(material, "neb"),
            )

        text = (
            f"We study {formula} as a {material['family']} using a {material['phase']} "
            f"structure and DFT validation to reveal its {material['task']} behavior."
        )
        add_example(
            examples,
            "rendering_parse",
            RENDER_SYSTEM,
            f"Parse this scientific text for rendering:\n\n{text}",
            rendering_payload(material, f"{formula} {material['task']} in {material['family']}"),
        )

        add_example(
            examples,
            "integrated_workflow",
            PROJECT_SYSTEM,
            f"我要在 VASP-Visualizer 里研究 {cn}（{formula}），从建模、检索、VASP 参数到渲染都帮我生成。",
            integrated_plan(material),
        )

    surface_materials = [m for m in MATERIALS if m.get("surface")]
    for material in surface_materials:
        for adsorbate in ADSORBATES:
            formula, site, reason = adsorbate
            payload = integrated_plan(material)
            payload["modeling_intent"] = modeling_intent(material, "slab", adsorbate=adsorbate, surface=material["surface"])
            payload["retrieval_plan"]["research_type"] = "surface"
            payload["retrieval_plan"]["literature_query"] = f"{material['name']} {material['surface']} {formula} adsorption DFT {reason}"
            payload["vasp_inputs"] = vasp_plan(material, "surface_adsorption")
            payload["rendering_brief"] = rendering_payload(material, f"{formula} adsorption on {material['name']}{material['surface']}")
            add_example(
                examples,
                "integrated_workflow",
                PROJECT_SYSTEM,
                f"在 {material['name']}{material['surface']} 上研究 {formula} 吸附，输出项目能执行的完整方案。",
                payload,
            )

    # Add English/Chinese paraphrase pairs for robustness.
    paraphrases = [
        ("不要只给公式，给我能建模的结构来源和超胞。", "structure_query_plan"),
        ("I need a model that can actually be built, not only a material name.", "buildable_model"),
        ("先给 starter model，再给更高级的 follow-up。", "tiered_plan"),
        ("Explain which database polymorph to start from and why.", "polymorph_choice"),
    ]
    for material in MATERIALS:
        for prompt, tag in paraphrases:
            plan = retrieval_plan(material)
            plan["instruction_tag"] = tag
            add_example(
                examples,
                "idea_retrieval",
                IDEA_SYSTEM,
                f"{material['name']} {prompt}",
                plan,
            )

    return examples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Output JSONL path.")
    parser.add_argument("--limit", type=int, default=0, help="Optional maximum number of examples.")
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

    stats_path = out.with_suffix(".stats.json")
    stats_path.write_text(json.dumps({
        "total": len(examples),
        "categories": counts,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(out), "total": len(examples), "categories": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
