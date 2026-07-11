#!/usr/bin/env python3
"""Build failure-driven SFT data for VASP-Visualizer-27B-SFT-v3."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

V2_DIR = Path(__file__).resolve().parents[1] / "vasp_visualizer_27b_sft_v2"
V2_SPEC = importlib.util.spec_from_file_location("vasp_visualizer_27b_sft_v2_build_dataset", V2_DIR / "build_dataset.py")
if V2_SPEC is None or V2_SPEC.loader is None:
    raise RuntimeError(f"Unable to load v2 dataset builder from {V2_DIR}")
v2 = importlib.util.module_from_spec(V2_SPEC)
sys.modules[V2_SPEC.name] = v2
V2_SPEC.loader.exec_module(v2)


STRICT_V3_SYSTEM = (
    "You are VASP-Visualizer-27B-SFT-v3. Return one valid JSON object only. "
    "Use the requested schema exactly. Preserve user-specified formulas. "
    "If files are uploaded but no material name is provided, use unknown_uploaded_vasp_files "
    "and never guess a concrete material, POTCAR species, database ID, or citation."
)

SELF_REPAIR_SYSTEM = (
    "You are VASP-Visualizer's benchmark-driven self-repair agent. Given a user request "
    "and a bad model output, return the corrected project JSON only. Do not repeat the bad guess."
)


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def add(examples, category, system, user, assistant_obj):
    examples.append({
        "id": f"vv27b-v3-{len(examples) + 1:06d}",
        "category": category,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": dumps(assistant_obj)},
        ],
    })


def unknown_file_workflow(files, user_goal, render_focus=True):
    normalized_files = list(dict.fromkeys(files))
    return {
        "task_type": "uploaded_vasp_file_workflow",
        "target_material": "unknown_uploaded_vasp_files",
        "modeling_plan": {
            "source": "uploaded_files",
            "input_files": normalized_files,
            "material_identity": "unknown_until_parsed_from_uploaded_structure",
            "do_not_guess_material": True,
            "steps": [
                "parse lattice vectors, species labels, coordinates, and selective dynamics from uploaded structure files",
                "validate atom counts, cell volume, coordinate mode, and file consistency before building any model",
                "use species explicitly present in the uploaded POSCAR/CONTCAR only; do not infer POTCAR symbols from the filename",
                "ask for missing reference files when charge-density difference requires two compatible charge densities",
            ],
        },
        "retrieval_query": None,
        "vasp_parameters": {
            "mode": "file_analysis_or_restart",
            "incar_defaults": {
                "PREC": "Accurate",
                "EDIFF": "1E-5",
                "LREAL": "Auto",
                "ISMEAR": 0,
                "SIGMA": 0.05,
            },
            "potcar_policy": "preserve_or_request_species_from_uploaded_structure; never guess concrete POTCAR labels",
            "kpoints_policy": "derive from parsed cell dimensions; do not assume 4x4x4 for unknown files",
        },
        "render_plan": {
            "mode": "uploaded_file_rendering" if render_focus else "uploaded_file_validation",
            "structure_source": "CONTCAR/POSCAR parsed from upload",
            "volumetric_sources": [item for item in normalized_files if item in ["CHGCAR", "CHG", "LOCPOT", "ELFCAR", "PARCHG"]],
            "isosurface": {
                "enabled": any(item in normalized_files for item in ["CHGCAR", "CHG", "LOCPOT", "ELFCAR", "PARCHG"]),
                "initial_value": 0.003,
                "sign_mode": "positive_negative_if_difference_density",
                "color_map": "blue_white_red_for_difference_or_viridis_for_absolute_density",
            },
            "exports": ["png", "glb", "camera_state_json"],
        },
        "risk_checks": [
            "do not name a material unless it appears inside the parsed uploaded files or user prompt",
            "do not invent Materials Project, JARVIS, DOI, or paper identifiers",
            "verify that CHGCAR/LOCPOT grids match the parsed structure before rendering volumetric data",
            "if species labels are absent or inconsistent, ask the user for POTCAR/POSCAR species order",
            f"user_goal: {user_goal}",
        ],
    }


def strict_workflow(task_type, target_material, modeling_plan, retrieval_query, vasp_parameters, render_plan, risk_checks):
    return {
        "task_type": task_type,
        "target_material": target_material,
        "modeling_plan": modeling_plan,
        "retrieval_query": retrieval_query,
        "vasp_parameters": vasp_parameters,
        "render_plan": render_plan,
        "risk_checks": risk_checks,
    }


def nacoo2_handoff_payload(task="starter_model"):
    return strict_workflow(
        "handoff",
        "NaCoO2",
        {
            "handoff_target": "Modeling Agent",
            "formula": "NaCoO2",
            "phase_priority": ["O3 layered", "P2 layered"],
            "provider_order": ["local_structure", "materials_project", "jarvis", "oqmd", "aflow", "fallback"],
            "supercell": [2, 2, 1],
            "must_preserve_user_formula": True,
            "forbidden_fallback_behavior": "do_not_replace_with_other_layered_oxide_formulas",
            "task": task,
        },
        "NaCoO2 sodium cobalt oxide layered cathode DFT starter model",
        {
            "relax": {
                "ENCUT": 520,
                "EDIFF": "1E-5",
                "ISMEAR": 0,
                "SIGMA": 0.05,
                "IBRION": 2,
                "NSW": 100,
                "ISIF": 3,
                "LASPH": True,
                "LDAU": True,
            },
            "kpoints": {"mode": "Gamma", "grid": [5, 5, 3]},
            "potcar_policy": "Na_pv Co_pv O only after species are confirmed from selected NaCoO2 structure",
        },
        {
            "structure": "render relaxed NaCoO2 layered cell with Na layer highlighted",
            "figures": ["parent_structure", "supercell", "Na_layer_view"],
        },
        [
            "keep target_material exactly NaCoO2",
            "do not recommend a different cathode as a starter when user specified NaCoO2",
            "confirm O3/P2 phase before publication-grade calculations",
        ],
    )


def sic_surface_payload():
    return strict_workflow(
        "slab",
        "SiC",
        {
            "surface": "(0001)",
            "structure_source": "3C/4H/6H SiC must be selected explicitly before slab generation",
            "slab": {"min_thickness_angstrom": 10, "vacuum_angstrom": 15, "fixed_bottom_layers": 2},
            "adsorbates": [{"formula": "O", "initial_sites": ["top-Si", "bridge", "hollow"], "coverage": "low"}],
            "supercell": [3, 3, 1],
        },
        "SiC(0001) oxidation oxygen adsorption DFT VASP slab",
        {
            "relax": {
                "ENCUT": 520,
                "EDIFF": "1E-5",
                "ISMEAR": 0,
                "SIGMA": 0.05,
                "IBRION": 2,
                "NSW": 120,
                "ISIF": 2,
                "ISYM": 0,
                "LDIPOL": True,
                "IDIPOL": 3,
            },
            "kpoints": {"mode": "Gamma", "grid": [3, 3, 1]},
            "energy_expression": "E_ads = E(SiC slab + O) - E(clean SiC slab) - 1/2 E(O2)",
        },
        {
            "figures": ["clean_slab", "O_adsorption_sites", "relaxed_oxidized_surface"],
            "highlight": ["surface Si/C atoms", "adsorbed O"],
        },
        [
            "do not return an empty object for SiC surface oxidation",
            "ask user whether target polytype is 3C, 4H, or 6H if not specified",
            "test multiple oxygen adsorption sites before reporting reaction trends",
        ],
    )


def neb_payload(formula="NaCoO2"):
    return strict_workflow(
        "neb",
        formula,
        {
            "parent_phase": "O3 or P2 layered phase selected from structure database",
            "supercell": [2, 2, 1],
            "defect": {"type": "Na vacancy", "count": 1},
            "endpoints": "move a neighboring Na ion into the vacancy; keep parent framework aligned",
            "images": 5,
        },
        f"{formula} Na ion diffusion NEB vacancy migration pathway DFT",
        {
            "pre_relax": {"IBRION": 2, "NSW": 100, "ISIF": 2, "EDIFF": "1E-5", "ISYM": 0},
            "neb": {
                "IBRION": 3,
                "POTIM": 0,
                "IMAGES": 5,
                "SPRING": -5,
                "LCLIMB": True,
                "EDIFF": "1E-5",
                "EDIFFG": -0.03,
                "ISYM": 0,
            },
            "kpoints": {"mode": "Gamma", "grid": [3, 3, 2]},
        },
        {
            "figures": ["initial_endpoint", "final_endpoint", "migration_path", "energy_barrier_plot"],
            "highlight": ["migrating Na", "Na vacancy"],
        },
        [
            "do not run NEB before relaxing compatible initial and final endpoints",
            "keep atom ordering identical across images",
            "verify Na site mapping in the selected phase",
        ],
    )


def tio2_oxygen_vacancy_payload():
    return strict_workflow(
        "defect",
        "TiO2",
        {
            "phase": "rutile",
            "defect": {"type": "oxygen_vacancy", "element": "O", "count": 1},
            "supercell": [2, 2, 2],
            "reference_models": ["perfect rutile TiO2 supercell", "one O vacancy supercell"],
            "formation_energy_expression": "E_f(V_O)=E(defect)-E(perfect)+mu_O plus charge-state correction if charged defects are studied",
        },
        "TiO2 rutile oxygen vacancy formation energy DFT VASP",
        {
            "perfect_relax": {"ENCUT": 520, "EDIFF": "1E-5", "ISMEAR": 0, "SIGMA": 0.05, "IBRION": 2, "NSW": 100, "ISIF": 3, "LASPH": True},
            "defect_relax": {"ENCUT": 520, "EDIFF": "1E-5", "ISMEAR": 0, "SIGMA": 0.05, "IBRION": 2, "NSW": 120, "ISIF": 3, "ISYM": 0, "LASPH": True},
            "static": {"IBRION": -1, "NSW": 0, "LORBIT": 11, "ICHARG": 11},
            "kpoints": {"mode": "Gamma", "grid": [3, 3, 3]},
            "potcar_policy": "Ti_pv and O after species order is confirmed",
        },
        {
            "structures": [
                {"label": "perfect_TiO2", "formula": "TiO2", "phase": "rutile", "supercell": [2, 2, 2]},
                {"label": "oxygen_vacancy_TiO2", "formula": "TiO2-x", "defect": "single O vacancy", "supercell": [2, 2, 2]},
            ],
            "figures": ["perfect_vs_defect_structure", "vacancy_site_highlight", "formation_energy_bar"],
            "volumetric": ["charge_density_difference_optional"],
        },
        [
            "return strict JSON only; every array item must be a JSON object or a quoted string with commas between items",
            "do not mix prose fragments into arrays",
            "define oxygen chemical potential choice before reporting absolute formation energy",
            "use ISYM=0 for the defect cell",
        ],
    )


def benchmark_regression_cases():
    return [
        (
            "NaCoO2 理论计算，我做实验想补充计算内容。请给项目可执行的建模、文献检索、VASP 参数和渲染方案。",
            strict_workflow(
                "idea_to_workflow",
                "NaCoO2",
                {
                    "starter_model": "NaCoO2 layered bulk, O3/P2 phase selected from database evidence",
                    "supercell": [2, 2, 1],
                    "first_calculations": ["bulk relaxation", "static energy", "DOS if experiment needs electronic support"],
                },
                "NaCoO2 sodium cobalt oxide layered cathode DFT first principles",
                {
                    "relax": {"ENCUT": 520, "EDIFF": "1E-5", "ISMEAR": 0, "SIGMA": 0.05, "IBRION": 2, "NSW": 100, "ISIF": 3},
                    "static": {"IBRION": -1, "NSW": 0, "LORBIT": 11, "ICHARG": 11},
                    "kpoints": {"mode": "Gamma", "grid": [5, 5, 3]},
                },
                {"figures": ["NaCoO2 layered cell", "relaxed structure", "Na layer view"]},
                ["preserve NaCoO2", "do not use other cathodes as fallback", "confirm phase and magnetic state"],
            ),
        ),
        (
            "NaCoO2 中 Na 离子扩散 NEB 怎么搭模型？请给超胞、空位、端点、INCAR 和可视化输出。",
            neb_payload("NaCoO2"),
        ),
        (
            "SiC(0001) 表面氧化反应怎么做 VASP 计算？请给 slab、吸附氧、参数和渲染方案。",
            sic_surface_payload(),
        ),
        (
            "TiO2 金红石氧空位形成能怎么计算？需要结构、超胞、化学势、INCAR 和可视化输出。",
            tio2_oxygen_vacancy_payload(),
        ),
        (
            "基于 NaCoO2 做一个 starter model，输出给 Modeling Agent 的 handoff，不要推荐 LiCoO2。",
            nacoo2_handoff_payload(),
        ),
    ]


def build_file_upload_examples(examples):
    file_sets = [
        (["POSCAR"], "检查结构、补全可计算参数、渲染晶胞"),
        (["CONTCAR"], "从已优化结构继续分析并渲染"),
        (["POSCAR", "CHGCAR"], "绘制电荷密度等值面"),
        (["CONTCAR", "CHGCAR", "LOCPOT"], "做电子密度差分和静电势辅助渲染"),
        (["POSCAR", "OUTCAR", "vasprun.xml"], "解析能量、磁矩和结构收敛信息"),
        (["XDATCAR", "CONTCAR"], "检查轨迹末态并导出动画"),
        (["CHGCAR", "LOCPOT"], "体数据已上传但缺结构文件时给出补文件要求"),
    ]
    prompts = [
        "我上传了 {files}，没有说材料名。请给建模检查、VASP 参数补全和渲染方案，不要猜材料。",
        "Files: {files}. Build a VASP-Visualizer workflow, but the material identity is unknown. Return JSON only.",
        "{files} 已经在网站里，帮我做可视化和检查；没有材料名时不要写具体化学式。",
    ]
    for files, goal in file_sets:
        for prompt in prompts:
            add(
                examples,
                "file_upload_no_material_guess",
                STRICT_V3_SYSTEM,
                prompt.format(files="/".join(files)),
                unknown_file_workflow(files, goal),
            )


def build_self_repair_examples(examples):
    bad_outputs = [
        {
            "task_type": "slab",
            "target_material": "Cu",
            "modeling_plan": "Import POSCAR then render Cu slab",
            "vasp_parameters": {"potcar": ["Cu"]},
        },
        {
            "task_type": "crystal",
            "target_material": "POSCAR",
            "vasp_parameters": {"potcar": ["P", "O", "S", "C", "A", "R"]},
            "render_plan": {"highlight_atoms": ["P", "O", "S", "C", "A", "R"]},
        },
        {
            "task_type": "slab",
            "target_material": "slab",
            "modeling_plan": {"structure": {"formula": "slab", "supercell": [3, 3, 1]}},
            "vasp_parameters": {"potcar": ["C", "H"]},
        },
        {
            "task_type": "handoff",
            "target_material": "LiCoO2",
            "modeling_plan": {"handoff_target": "Modeling Agent", "formula": "LiCoO2"},
        },
    ]
    repair_prompts = [
        ("我上传了 POSCAR，但没有告诉你材料名。不要猜材料。", unknown_file_workflow(["POSCAR"], "validate uploaded POSCAR")),
        ("我有 CONTCAR、CHGCAR、LOCPOT，要做电子密度差分，不要猜具体材料。", unknown_file_workflow(["CONTCAR", "CHGCAR", "LOCPOT"], "charge-density rendering")),
        ("基于 NaCoO2 做 starter model，输出给 Modeling Agent 的 handoff，不要换成别的正极。", nacoo2_handoff_payload()),
    ]
    for user_request, corrected in repair_prompts:
        category = (
            "self_repair_formula_preservation"
            if corrected.get("target_material") == "NaCoO2"
            else "self_repair_no_invent_material"
        )
        for bad_output in bad_outputs:
            add(
                examples,
                category,
                SELF_REPAIR_SYSTEM,
                f"User request: {user_request}\nBad output: {dumps(bad_output)}",
                corrected,
            )


def build_hard_negative_repair_examples(examples):
    file_requests = [
        ("我上传了 POSCAR，但没有告诉你材料名。请先检查结构，不要猜材料。", ["POSCAR"], "uploaded POSCAR validation"),
        ("我上传了 CONTCAR 和 CHGCAR，要做等值面渲染，不要猜材料。", ["CONTCAR", "CHGCAR"], "charge density rendering"),
        ("只有 CHGCAR/LOCPOT，没有 POSCAR。请告诉我缺什么，不要写具体材料。", ["CHGCAR", "LOCPOT"], "missing structure file handling"),
        ("I uploaded POSCAR/OUTCAR/vasprun.xml, but the material name is unknown. Do not infer a formula.", ["POSCAR", "OUTCAR", "vasprun.xml"], "restart and validation"),
        ("网站里有 XDATCAR 和 CONTCAR，先做轨迹渲染检查，不要猜元素。", ["XDATCAR", "CONTCAR"], "trajectory rendering"),
    ]
    guessed_materials = [
        "Cu",
        "LiCoO2",
        "NaCoO2",
        "SiC",
        "MoS2",
        "TiO2",
    ]
    for user_request, files, goal in file_requests:
        corrected = unknown_file_workflow(files, goal)
        for guessed in guessed_materials:
            bad_output = {
                "task_type": "crystal",
                "target_material": guessed,
                "modeling_plan": f"Assume uploaded files are {guessed} and run a standard workflow.",
                "retrieval_query": f"{guessed} DFT structure",
                "vasp_parameters": {"potcar": [guessed]},
                "render_plan": {"highlight_material": guessed},
            }
            add(
                examples,
                "hard_negative_no_material_guess",
                SELF_REPAIR_SYSTEM,
                f"User request: {user_request}\nBad output: {dumps(bad_output)}",
                corrected,
            )


def build_missing_file_examples(examples):
    missing_cases = [
        (["CHGCAR"], ["POSCAR or CONTCAR"], "CHGCAR grid cannot be rendered atomistically without a matching structure file."),
        (["LOCPOT"], ["POSCAR or CONTCAR"], "LOCPOT requires a matching structure for spatial rendering."),
        (["CHGCAR", "LOCPOT"], ["POSCAR or CONTCAR"], "volumetric grids must be aligned to a known cell and atom list."),
        (["OUTCAR"], ["POSCAR or CONTCAR"], "OUTCAR can provide convergence metadata, but structure rendering needs coordinates."),
        (["vasprun.xml"], ["POSCAR or CONTCAR if structure parsing fails"], "vasprun.xml may contain final structure, but the parser must verify it first."),
    ]
    for files, required, reason in missing_cases:
        payload = unknown_file_workflow(files, "missing file validation", render_focus=True)
        payload["modeling_plan"]["missing_inputs"] = required
        payload["risk_checks"].insert(0, reason)
        add(
            examples,
            "missing_uploaded_file_guardrail",
            STRICT_V3_SYSTEM,
            f"只上传了 {'/'.join(files)}，没有材料名。请给可执行检查和渲染方案，不能猜材料。",
            payload,
        )


def build_formula_guard_examples(examples):
    prompts = [
        "NaCoO2 starter model 只能用 NaCoO2，不要换成同族材料。",
        "用户明确写了 NaCoO2，handoff 给 Modeling Agent 时必须保持公式。",
        "NaCoO2 的实验补理论计算，模型建议不要漂移到其他 layered oxide。",
        "Build NaCoO2 bulk starter model; preserve the formula exactly in the handoff.",
        "NaCoO2 NEB workflow: keep target material fixed through retrieval, modeling, and rendering.",
    ]
    for prompt in prompts:
        add(
            examples,
            "target_formula_preservation",
            STRICT_V3_SYSTEM,
            prompt,
            nacoo2_handoff_payload("formula_preservation"),
        )


def build_tio2_schema_stability_examples(examples):
    prompts = [
        "TiO2 金红石氧空位形成能怎么计算？需要严格 JSON。",
        "Rutile TiO2 oxygen vacancy formation energy workflow; return valid JSON only.",
        "给 TiO2 做一个 O vacancy 缺陷模型和 formation energy 计算方案。",
        "TiO2 缺陷计算输出不要把说明文字塞进数组，必须是可解析 JSON。",
        "Build a VASP-Visualizer defect workflow for one oxygen vacancy in rutile TiO2.",
    ]
    for prompt in prompts:
        add(
            examples,
            "defect_schema_stability",
            STRICT_V3_SYSTEM,
            prompt,
            tio2_oxygen_vacancy_payload(),
        )

    bad_outputs = [
        '{"task_type":"defect","target_material":"TiO2","render_plan":{"structures":[{"formula":"TiO2"},"electronic_outputs_to_plot_together_in_one_figure_panel_per_material_surface_or_defect_type_}',
        '{"task_type":"defect","target_material":"TiO2","vasp_parameters":{"incar":{"SYSTEM":"TiO2"}},"render_plan":{"structures":[{"formula":"TiO2"} "vacancy_site"]}}',
        '{"task_type":"defect","target_material":"TiO2","modeling_plan":"oxygen vacancy","render_plan":{"structures":[{"formula":"TiO2","phase":"rutile"}], risk_checks: ["bad json"]}}',
    ]
    for bad_output in bad_outputs:
        add(
            examples,
            "self_repair_json_schema_defect",
            SELF_REPAIR_SYSTEM,
            "User request: TiO2 金红石氧空位形成能怎么计算？需要结构、超胞、化学势、INCAR 和可视化输出。\n"
            f"Bad output: {bad_output}",
            tio2_oxygen_vacancy_payload(),
        )


def build_examples():
    examples = v2.build_examples()

    build_file_upload_examples(examples)
    build_self_repair_examples(examples)
    build_hard_negative_repair_examples(examples)
    build_missing_file_examples(examples)
    build_formula_guard_examples(examples)
    build_tio2_schema_stability_examples(examples)

    for user, assistant in benchmark_regression_cases():
        add(examples, "benchmark_regression_cases", STRICT_V3_SYSTEM, user, assistant)

    # Add repeated natural-language variants for the most important regression:
    # uploaded files must not trigger guessed materials or POTCAR species.
    variants = [
        "只有 CHGCAR 和 CONTCAR，没有材料名，给我可视化方案。",
        "上传文件里可能有材料信息，但我没有在问题里说明；你先解析，不要猜。",
        "I uploaded POSCAR/CHGCAR only. The model must not infer Cu, LiCoO2, or any other material name.",
        "网站收到 LOCPOT 和 CONTCAR，做 electrostatic potential rendering，不要编材料。",
        "POSCAR 里的元素顺序还没确认，先给 validation workflow。",
        "CHGCAR 网格和 CONTCAR 可能不匹配，先给风险检查和渲染 fallback。",
    ]
    for text in variants:
        files = ["POSCAR", "CHGCAR"] if "POSCAR" in text or "CHGCAR" in text else ["CONTCAR", "LOCPOT"]
        add(
            examples,
            "file_upload_no_material_guess_variants",
            STRICT_V3_SYSTEM,
            text,
            unknown_file_workflow(files, "file upload validation and rendering"),
        )

    # SiC surface examples prevent the base-model empty-object behavior.
    sic_prompts = [
        "SiC(0001) 氧吸附要怎么建 slab？",
        "Build an executable VASP workflow for oxygen adsorption on SiC(0001).",
        "3C-SiC(0001) 表面氧化，给 slab、O 位点、INCAR、渲染。",
        "SiC surface oxidation should not return an empty JSON object; give the full project schema.",
    ]
    for prompt in sic_prompts:
        add(examples, "surface_oxidation_recovery", STRICT_V3_SYSTEM, prompt, sic_surface_payload())

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

    stats = {
        "total": len(examples),
        "base_dataset": "vasp_visualizer_27b_sft_v2",
        "categories": counts,
        "new_v3_examples": len(examples) - len(v2.build_examples()),
    }
    out.with_suffix(".stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(out), **stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
