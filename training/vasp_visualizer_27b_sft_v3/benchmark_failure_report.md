# VASP-Visualizer-27B-SFT-v3 Failure Report

Generated from the full 10-case benchmark on 2026-07-11.

Important evaluator fix: the first scorer treated the element symbol `Cu` as a
plain substring, so words such as `Accurate` caused false material-guess
penalties. The benchmark harness now matches one- or two-letter element symbols
as standalone chemistry tokens.

## Benchmark Summary

| Model | JSON success | Avg score | Avg latency | Avg tok/s | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| vasp-visualizer-27b-sft-v2 | 9/10 | 9.283/10 | 19.601 s | 24.269 | Better specialist score, but one defect workflow produced malformed JSON. |
| gemma-3-27b-it | 10/10 | 9.033/10 | 8.807 s | 23.820 | Faster, but fails a specialist SiC surface case with `{}`. |

Full fixed-scorer result JSON is stored outside git at:

```text
server/benchmark-results/full-v2-base-20260711-fixed-scorer.json
```

## Weak Cases

### v2: `tio2_oxygen_vacancy`

User intent: rutile `TiO2` oxygen vacancy formation energy workflow.

Observed issue:

- Score: 5/10
- The output contained the right scientific terms: `TiO2`, `oxygen vacancy`,
  `formation energy`, and `INCAR`.
- The output was not valid JSON.
- The malformed area was `render_plan.structures`, where an object and a prose
  fragment were mixed inside the same array.

Required behavior:

- Return strict parseable JSON only.
- Keep `render_plan.structures` as an array of JSON objects.
- Put prose into `risk_checks` or string fields, never as unquoted fragments in
  arrays.
- Include perfect and defect supercells, oxygen chemical potential note, INCAR
  blocks, and visualization outputs.

### base: `sic_oxidation_surface`

User intent: `SiC(0001)` oxidation surface VASP workflow.

Observed issue:

- Score: 3/10
- Output was `{}`.

Required behavior:

- Return the full project schema.
- Ask/track SiC polytype when needed.
- Include slab thickness, vacuum, fixed bottom layers, oxygen adsorption sites,
  INCAR, and rendering plan.

## v3 Data Added

v3 starts from v2 and adds 96 failure-driven examples:

- `defect_schema_stability`: valid TiO2 oxygen-vacancy formation-energy JSON.
- `self_repair_json_schema_defect`: repairs malformed TiO2 defect JSON.
- `file_upload_no_material_guess`: uploaded `POSCAR/CONTCAR/CHGCAR/LOCPOT/...`
  workflows that must not guess materials.
- `hard_negative_no_material_guess`: self-repair examples where bad outputs
  guessed specific materials from uploaded files.
- `missing_uploaded_file_guardrail`: cases where volumetric files need a
  matching structure file.
- `target_formula_preservation`: NaCoO2 handoff examples that keep the target
  formula fixed.
- `benchmark_regression_cases`: exact benchmark-style positive examples.
- `surface_oxidation_recovery`: SiC(0001) oxidation examples to avoid empty
  outputs.

## Acceptance Criteria For v3

Before switching production from v2 to v3:

- Full benchmark average score must exceed v2's fixed-scorer 9.283/10.
- JSON success must be 10/10.
- `tio2_oxygen_vacancy` must score at least 9/10 and parse as JSON.
- `charge_density_render_no_material_guess` must stay at least 9/10.
- `uploaded_poscar_unknown_material` must stay at least 9/10.
- `nacoo2_handoff_formula_guard` must remain 10/10.
- Throughput should stay near v2's measured ~24.3 tok/s on the H800 service.
