# VASP-Visualizer-27B-SFT-v3

v3 is a benchmark-driven update on top of `vasp_visualizer_27b_sft_v2`.

It keeps the v2 dataset and adds targeted examples for the failures found in
the 2026-07-11 full benchmark:

- uploaded VASP files without a material name must not trigger guessed formulas
- `POSCAR` must not be parsed as element letters
- `CHGCAR/LOCPOT` workflows must request matching structure files when needed
- NaCoO2 handoff must preserve NaCoO2 instead of switching to another layered oxide
- TiO2 oxygen-vacancy workflows must remain strict parseable JSON
- SiC(0001) oxidation must return an executable slab workflow instead of `{}`

## Build Dataset

```bash
python3 training/vasp_visualizer_27b_sft_v3/build_dataset.py \
  --out training/vasp_visualizer_27b_sft_v3/data/vasp_visualizer_sft_v3.jsonl
```

Current generated size:

```text
total: 4157
new_v3_examples: 96
```

## Train On H800 GPU1

Use the same LoRA trainer as v1/v2, but write to a new output directory:

```bash
CUDA_VISIBLE_DEVICES=1 python3 /root/vasp-visualizer-sft-v1/train_lora.py \
  --model_dir /root/models/gemma-3-27b-it \
  --data_path /root/vasp-visualizer-sft-v3/data/vasp_visualizer_sft_v3.jsonl \
  --output_dir /root/models/vasp-visualizer-27b-sft-v3-lora \
  --run_name vasp-visualizer-27b-sft-v3 \
  --max_seq_length 2048 \
  --max_steps 520 \
  --save_steps 130 \
  --logging_steps 10 \
  --gradient_accumulation_steps 8
```

Do not overwrite v2. Serve v3 as a separate LoRA:

```text
vasp-visualizer-27b-sft-v3
```

## Validate Before Release

Run the benchmark against v2, base, and v3:

```bash
npm run benchmark:llm -- \
  --base-url http://127.0.0.1:18001/v1 \
  --models vasp-visualizer-27b-sft-v2,vasp-visualizer-27b-sft-v3,gemma-3-27b-it \
  --concurrency 1
```

Release gate:

- v3 average score > v2 average score from the same run
- JSON success remains 10/10
- `tio2_oxygen_vacancy` >= 9/10 and parseable JSON
- `charge_density_render_no_material_guess` >= 9/10
- `uploaded_poscar_unknown_material` >= 9/10
- `nacoo2_handoff_formula_guard` remains 10/10
- speed remains close to v2 on H800

See `benchmark_failure_report.md` for the failure analysis that drove this
dataset update.
