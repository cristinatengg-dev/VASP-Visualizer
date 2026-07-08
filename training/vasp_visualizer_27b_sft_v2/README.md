# VASP-Visualizer-27B-SFT-v2

v2 expands the first project-specific dataset from a format-alignment set into a
larger project-operations set. It keeps the v1 contract examples and adds:

- more material families and formula aliases
- more Chinese/English user phrasing
- Modeling Agent correction examples
- VASP input/error-fix examples
- integrated workflow examples with fixed top-level keys
- rendering extraction examples

Build:

```bash
python3 training/vasp_visualizer_27b_sft_v2/build_dataset.py \
  --out training/vasp_visualizer_27b_sft_v2/data/vasp_visualizer_sft_v2.jsonl
```

Train on H800 GPU1 using the v1 training script:

```bash
CUDA_VISIBLE_DEVICES=1 python3 /root/vasp-visualizer-sft-v1/train_lora.py \
  --model_dir /root/models/gemma-3-27b-it \
  --data_path /root/vasp-visualizer-sft-v2/data/vasp_visualizer_sft_v2.jsonl \
  --output_dir /root/models/vasp-visualizer-27b-sft-v2-lora \
  --run_name vasp-visualizer-27b-sft-v2 \
  --max_seq_length 2048 \
  --max_steps 420 \
  --save_steps 105 \
  --logging_steps 10 \
  --gradient_accumulation_steps 8
```
