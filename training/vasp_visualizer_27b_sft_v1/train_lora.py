#!/usr/bin/env python3
"""QLoRA SFT training for VASP-Visualizer-27B-SFT-v1."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import torch
from torch.utils.data import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoModelForImageTextToText,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Trainer,
    TrainingArguments,
)

try:
    from transformers import BitsAndBytesConfig
except Exception:  # pragma: no cover
    BitsAndBytesConfig = None

from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training


DEFAULT_TARGET_MODULES = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]


def load_jsonl(path: str):
    items = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
    return items


def fallback_chat_template(messages, add_generation_prompt=False):
    chunks = []
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content", "")
        chunks.append(f"<{role}>\n{content}\n</{role}>")
    if add_generation_prompt:
        chunks.append("<assistant>\n")
    return "\n".join(chunks)


def render_messages(tokenizer, messages, add_generation_prompt=False):
    try:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=add_generation_prompt,
        )
    except Exception:
        return fallback_chat_template(messages, add_generation_prompt=add_generation_prompt)


class ChatSftDataset(Dataset):
    def __init__(self, items, tokenizer, max_length: int):
        self.items = items
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]
        messages = item["messages"]
        prompt_messages = [m for m in messages if m.get("role") != "assistant"]
        full_text = render_messages(self.tokenizer, messages, add_generation_prompt=False)
        prompt_text = render_messages(self.tokenizer, prompt_messages, add_generation_prompt=True)

        full = self.tokenizer(
            full_text,
            truncation=True,
            max_length=self.max_length,
            add_special_tokens=False,
        )
        prompt = self.tokenizer(
            prompt_text,
            truncation=True,
            max_length=self.max_length,
            add_special_tokens=False,
        )

        input_ids = full["input_ids"]
        attention_mask = full["attention_mask"]
        labels = list(input_ids)
        prompt_len = min(len(prompt["input_ids"]), len(labels))
        for pos in range(prompt_len):
            labels[pos] = -100
        if all(value == -100 for value in labels) and labels:
            labels[-1] = input_ids[-1]

        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "labels": labels,
        }


def split_items(items, eval_ratio=0.06):
    eval_size = max(1, int(len(items) * eval_ratio))
    return items[:-eval_size], items[-eval_size:]


def load_model(model_dir, load_in_4bit=True, torch_dtype=torch.bfloat16):
    quantization_config = None
    if load_in_4bit:
        if BitsAndBytesConfig is None:
            raise RuntimeError("bitsandbytes/quantization support is not available")
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch_dtype,
            bnb_4bit_use_double_quant=True,
        )

    common_kwargs = {
        "trust_remote_code": True,
        "torch_dtype": torch_dtype,
        "device_map": "auto",
    }
    if quantization_config is not None:
        common_kwargs["quantization_config"] = quantization_config

    try:
        return AutoModelForImageTextToText.from_pretrained(model_dir, **common_kwargs)
    except Exception as error:
        print(f"[train_lora] AutoModelForImageTextToText failed, falling back to AutoModelForCausalLM: {error}")
        return AutoModelForCausalLM.from_pretrained(model_dir, **common_kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", required=True)
    parser.add_argument("--data_path", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--run_name", default="vasp-visualizer-27b-sft-v1")
    parser.add_argument("--served_model_name", default="")
    parser.add_argument("--max_seq_length", type=int, default=2048)
    parser.add_argument("--max_steps", type=int, default=160)
    parser.add_argument("--num_train_epochs", type=float, default=3.0)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--per_device_train_batch_size", type=int, default=1)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=8)
    parser.add_argument("--save_steps", type=int, default=40)
    parser.add_argument("--logging_steps", type=int, default=5)
    parser.add_argument("--lora_r", type=int, default=16)
    parser.add_argument("--lora_alpha", type=int, default=32)
    parser.add_argument("--lora_dropout", type=float, default=0.05)
    parser.add_argument("--no_4bit", action="store_true")
    args = parser.parse_args()

    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, trust_remote_code=True, use_fast=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    items = load_jsonl(args.data_path)
    train_items, eval_items = split_items(items)
    train_dataset = ChatSftDataset(train_items, tokenizer, args.max_seq_length)
    eval_dataset = ChatSftDataset(eval_items, tokenizer, args.max_seq_length)

    model = load_model(args.model_dir, load_in_4bit=not args.no_4bit)
    model.config.use_cache = False
    if not args.no_4bit:
        model = prepare_model_for_kbit_training(model)

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=DEFAULT_TARGET_MODULES,
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    collator = DataCollatorForSeq2Seq(
        tokenizer=tokenizer,
        model=model,
        padding=True,
        label_pad_token_id=-100,
        return_tensors="pt",
    )

    train_args = TrainingArguments(
        output_dir=str(output_dir),
        run_name=args.run_name,
        per_device_train_batch_size=args.per_device_train_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        max_steps=args.max_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        save_total_limit=3,
        eval_strategy="steps",
        eval_steps=max(args.save_steps, 40),
        bf16=True,
        tf32=True,
        gradient_checkpointing=True,
        optim="paged_adamw_8bit" if not args.no_4bit else "adamw_torch",
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        report_to=[],
        remove_unused_columns=False,
    )

    trainer = Trainer(
        model=model,
        args=train_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=collator,
    )
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    metadata = {
        "base_model": args.model_dir,
        "adapter": str(output_dir),
        "train_examples": len(train_items),
        "eval_examples": len(eval_items),
        "max_seq_length": args.max_seq_length,
        "max_steps": args.max_steps,
        "lora_r": args.lora_r,
        "lora_alpha": args.lora_alpha,
        "target_modules": DEFAULT_TARGET_MODULES,
        "served_model_name": args.served_model_name or args.run_name,
    }
    (output_dir / "vasp_visualizer_sft_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
