# VASP-Visualizer-27B-SFT-v1

This folder contains the first project-specific SFT/LoRA pipeline for turning the
self-hosted 27B model into a VASP-Visualizer assistant.

The v1 model is trained to convert user material-science requests into outputs
that match VASP-Visualizer's runtime contracts:

- Modeling Agent intent JSON
- Idea / retrieval planning JSON
- VASP input recommendations
- Rendering science-extraction JSON
- Integrated project workflow plans

## Build The Dataset

```bash
python3 training/vasp_visualizer_27b_sft_v1/build_dataset.py \
  --out training/vasp_visualizer_27b_sft_v1/data/vasp_visualizer_sft_v1.jsonl
```

## Train On H800 GPU1

```bash
CUDA_VISIBLE_DEVICES=1 python3 train_lora.py \
  --model_dir /root/models/gemma-3-27b-it \
  --data_path /root/vasp-visualizer-sft-v1/data/vasp_visualizer_sft_v1.jsonl \
  --output_dir /root/models/vasp-visualizer-27b-sft-v1-lora \
  --max_seq_length 2048 \
  --max_steps 160
```

The training script uses 4-bit QLoRA when `bitsandbytes` is available.

## Serve The Adapter

The output adapter can be served through vLLM using LoRA support, with the
served model name `vasp-visualizer-27b-sft-v1`.
