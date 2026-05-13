#!/usr/bin/env python3
import base64
import csv
import io
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["svg.fonttype"] = "none"
matplotlib.rcParams["axes.titlesize"] = 11
matplotlib.rcParams["axes.labelsize"] = 10
matplotlib.rcParams["xtick.labelsize"] = 9
matplotlib.rcParams["ytick.labelsize"] = 9

import matplotlib.pyplot as plt
import numpy as np


def _read_request():
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("Empty figure worker request")
    return json.loads(raw)


def _parse_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_date(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m", "%Y/%m", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _load_rows(file_path, original_name=None):
    _, ext = os.path.splitext(original_name or file_path)
    ext = ext.lower()

    if ext in (".csv", ".tsv", ".txt", ""):
        with open(file_path, "r", encoding="utf-8-sig", newline="") as handle:
            sample = handle.read(2048)
            handle.seek(0)
            delimiter = "\t" if ext == ".tsv" else ","
            try:
                sniffed = csv.Sniffer().sniff(sample, delimiters=",\t;")
                delimiter = sniffed.delimiter
            except csv.Error:
                pass
            reader = csv.DictReader(handle, delimiter=delimiter)
            rows = []
            for row in reader:
                normalized = {str(k or "").strip(): str(v or "").strip() for k, v in row.items() if k is not None}
                if any(str(v).strip() for v in normalized.values()):
                    rows.append(normalized)
            return rows

    if ext == ".json":
        with open(file_path, "r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        if isinstance(parsed, list):
            rows = [item for item in parsed if isinstance(item, dict)]
        elif isinstance(parsed, dict) and isinstance(parsed.get("rows"), list):
            rows = [item for item in parsed["rows"] if isinstance(item, dict)]
        else:
            raise ValueError("JSON figure data must be a list of objects or an object with a rows array")
        return [{str(k or "").strip(): str(v if v is not None else "").strip() for k, v in row.items()} for row in rows]

    raise ValueError(f"Unsupported data format for figure worker: {ext or 'unknown'}")


def _profile_rows(rows):
    if not rows:
        raise ValueError("Uploaded figure dataset is empty")

    column_names = []
    seen = set()
    for row in rows:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                column_names.append(key)

    columns = []
    numeric_columns = []
    categorical_columns = []
    date_columns = []

    for name in column_names:
        values = [row.get(name, "") for row in rows]
        non_empty = [value for value in values if str(value).strip()]
        numeric_values = [_parse_number(value) for value in non_empty]
        parsed_dates = [_parse_date(value) for value in non_empty]
        missing_count = len(values) - len(non_empty)
        unique_values = []
        for value in non_empty:
            if value not in unique_values:
                unique_values.append(value)
        if non_empty and all(value is not None for value in numeric_values):
            numeric_only = [float(value) for value in numeric_values]
            column_type = "numeric"
            numeric_columns.append(name)
            summary = {
                "min": min(numeric_only),
                "max": max(numeric_only),
                "mean": float(sum(numeric_only) / len(numeric_only)),
            }
        elif len(non_empty) >= 3 and all(value is not None for value in parsed_dates):
            column_type = "date"
            date_columns.append(name)
            summary = {
                "earliest": min(parsed_dates).isoformat(),
                "latest": max(parsed_dates).isoformat(),
            }
        else:
            column_type = "categorical"
            categorical_columns.append(name)
            summary = {
                "top_values": unique_values[:8],
            }

        columns.append(
            {
                "name": name,
                "type": column_type,
                "missingCount": missing_count,
                "uniqueCount": len(unique_values),
                "summary": summary,
            }
        )

    preview_rows = rows[:8]

    return {
        "rowCount": len(rows),
        "columns": columns,
        "numericColumns": numeric_columns,
        "categoricalColumns": categorical_columns,
        "dateColumns": date_columns,
        "previewRows": preview_rows,
        "recommendedMappings": {
            "grouped_bar": {
                "x": categorical_columns[0] if categorical_columns else (date_columns[0] if date_columns else None),
                "y": numeric_columns[0] if numeric_columns else None,
                "group": categorical_columns[1] if len(categorical_columns) > 1 else None,
            },
            "line": {
                "x": date_columns[0] if date_columns else (numeric_columns[0] if numeric_columns else None),
                "y": numeric_columns[1] if len(numeric_columns) > 1 else (numeric_columns[0] if numeric_columns else None),
                "group": categorical_columns[0] if categorical_columns else None,
            },
            "scatter": {
                "x": numeric_columns[0] if numeric_columns else None,
                "y": numeric_columns[1] if len(numeric_columns) > 1 else (numeric_columns[0] if numeric_columns else None),
                "group": categorical_columns[0] if categorical_columns else None,
            },
            "heatmap": {
                "x": categorical_columns[0] if categorical_columns else None,
                "y": categorical_columns[1] if len(categorical_columns) > 1 else None,
                "value": numeric_columns[0] if numeric_columns else None,
            },
        },
    }


def _ordered_unique(values):
    ordered = []
    for value in values:
        if value not in ordered:
            ordered.append(value)
    return ordered


def _color_sequence():
    return ["#0E5A8A", "#F28E2B", "#59A14F", "#E15759", "#9C755F", "#4E79A7", "#B07AA1", "#76B7B2"]


def _compute_error(values, mode):
    arr = [float(v) for v in values if v is not None]
    if len(arr) <= 1 or mode == "none":
        return 0.0
    if mode == "std":
        return float(np.std(arr, ddof=1))
    if mode == "sem":
        return float(np.std(arr, ddof=1) / math.sqrt(len(arr)))
    if mode == "ci95":
        return float(1.96 * np.std(arr, ddof=1) / math.sqrt(len(arr)))
    return 0.0


def _get_column_values(rows, name):
    return [row.get(name, "") for row in rows]


def _build_script(contract):
    compact = json.dumps(contract, indent=2)
    return f'''#!/usr/bin/env python3
import json
from pathlib import Path

CONTRACT = {compact}

print("Generated figure contract:")
print(json.dumps(CONTRACT, indent=2))
print("\\nThis script is the exact planning artifact used by SCI Visualizer's Data Figure mode.")
print("Use the contract together with your source dataset to reproduce or customize the figure.")
Path("figure_spec.json").write_text(json.dumps(CONTRACT, indent=2), encoding="utf-8")
'''


def _prepare_rows(rows, columns_needed):
    missing = [column for column in columns_needed if column and column not in rows[0]]
    return missing


def _aggregate_by(rows, x_col, y_col, series_col=None):
    grouped = defaultdict(list)
    for row in rows:
        x_val = row.get(x_col, "")
        y_val = _parse_number(row.get(y_col))
        if not str(x_val).strip() or y_val is None:
            continue
        series_val = row.get(series_col, "") if series_col else ""
        grouped[(x_val, series_val)].append(y_val)
    return grouped


def _render_grouped_bar(ax, rows, panel, stats, qa):
    x_col = panel.get("x_column")
    y_col = panel.get("y_column")
    series_col = panel.get("series_column")
    grouped = _aggregate_by(rows, x_col, y_col, series_col)
    x_order = _ordered_unique([row.get(x_col, "") for row in rows if str(row.get(x_col, "")).strip()])
    series_order = _ordered_unique([row.get(series_col, "") for row in rows if series_col and str(row.get(series_col, "")).strip()]) if series_col else [""]
    palette = _color_sequence()
    width = 0.8 / max(1, len(series_order))
    base_positions = np.arange(len(x_order))
    legend_labels = []

    for idx, series in enumerate(series_order):
        heights = []
        errors = []
        for x_value in x_order:
            values = grouped.get((x_value, series), [])
            heights.append(float(np.mean(values)) if values else 0.0)
            errors.append(_compute_error(values, stats.get("error_mode", "none")) if values else 0.0)
        offset = (idx - (len(series_order) - 1) / 2) * width
        bars = ax.bar(base_positions + offset, heights, width=width, label=series if series else None, color=palette[idx % len(palette)], yerr=errors if any(errors) else None, capsize=3)
        if panel.get("show_points") and series_col:
            for bar, x_value in zip(bars, x_order):
                values = grouped.get((x_value, series), [])
                if not values:
                    continue
                xs = np.full(len(values), bar.get_x() + bar.get_width() / 2)
                jitter = np.linspace(-width * 0.2, width * 0.2, len(values)) if len(values) > 1 else [0.0]
                ax.scatter(xs + jitter, values, s=12, color="#111827", alpha=0.55, zorder=3)
        if series:
            legend_labels.append(series)

    ax.set_xticks(base_positions)
    ax.set_xticklabels(x_order, rotation=0 if len(x_order) <= 6 else 20, ha="center")
    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    qa["duplicateLegendLabels"] = [label for label in _ordered_unique(legend_labels) if legend_labels.count(label) > 1]
    if series_col and legend_labels:
        ax.legend(frameon=False, fontsize=8)


def _render_line(ax, rows, panel, stats, qa):
    x_col = panel.get("x_column")
    y_col = panel.get("y_column")
    series_col = panel.get("series_column")
    grouped = _aggregate_by(rows, x_col, y_col, series_col)
    x_raw = _ordered_unique([row.get(x_col, "") for row in rows if str(row.get(x_col, "")).strip()])
    series_order = _ordered_unique([row.get(series_col, "") for row in rows if series_col and str(row.get(series_col, "")).strip()]) if series_col else [""]
    palette = _color_sequence()
    legend_labels = []

    def sort_key(value):
        num = _parse_number(value)
        if num is not None:
            return (0, num)
        date = _parse_date(value)
        if date is not None:
            return (1, date.timestamp())
        return (2, str(value))

    x_order = sorted(x_raw, key=sort_key)
    x_positions = np.arange(len(x_order))

    for idx, series in enumerate(series_order):
        means = []
        errors = []
        for x_value in x_order:
            values = grouped.get((x_value, series), [])
            means.append(float(np.mean(values)) if values else np.nan)
            errors.append(_compute_error(values, stats.get("error_mode", "none")) if values else 0.0)
        ax.plot(x_positions, means, marker="o", linewidth=2, color=palette[idx % len(palette)], label=series if series else None)
        if any(errors):
            lower = np.array(means) - np.array(errors)
            upper = np.array(means) + np.array(errors)
            ax.fill_between(x_positions, lower, upper, color=palette[idx % len(palette)], alpha=0.16)
        if series:
            legend_labels.append(series)

    ax.set_xticks(x_positions)
    ax.set_xticklabels(x_order, rotation=20 if len(x_order) > 6 else 0, ha="right" if len(x_order) > 6 else "center")
    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    qa["duplicateLegendLabels"] = [label for label in _ordered_unique(legend_labels) if legend_labels.count(label) > 1]
    if series_col and legend_labels:
        ax.legend(frameon=False, fontsize=8)


def _render_scatter(ax, rows, panel, stats, qa):
    x_col = panel.get("x_column")
    y_col = panel.get("y_column")
    series_col = panel.get("series_column")
    palette = _color_sequence()
    legend_labels = []

    if series_col:
        series_order = _ordered_unique([row.get(series_col, "") for row in rows if str(row.get(series_col, "")).strip()])
    else:
        series_order = [""]

    for idx, series in enumerate(series_order):
        points = []
        for row in rows:
            if series_col and row.get(series_col, "") != series:
                continue
            x_val = _parse_number(row.get(x_col))
            y_val = _parse_number(row.get(y_col))
            if x_val is None or y_val is None:
                continue
            points.append((x_val, y_val))
        if not points:
            continue
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        ax.scatter(xs, ys, s=24, alpha=0.75, color=palette[idx % len(palette)], label=series if series else None)
        if series:
            legend_labels.append(series)

    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    qa["duplicateLegendLabels"] = [label for label in _ordered_unique(legend_labels) if legend_labels.count(label) > 1]
    if series_col and legend_labels:
        ax.legend(frameon=False, fontsize=8)


def _render_heatmap(ax, rows, panel, stats, qa):
    x_col = panel.get("x_column")
    y_col = panel.get("secondary_column")
    value_col = panel.get("y_column")
    x_order = _ordered_unique([row.get(x_col, "") for row in rows if str(row.get(x_col, "")).strip()])
    y_order = _ordered_unique([row.get(y_col, "") for row in rows if str(row.get(y_col, "")).strip()])
    matrix = np.full((len(y_order), len(x_order)), np.nan)
    grouped = defaultdict(list)

    for row in rows:
        x_val = row.get(x_col, "")
        y_val = row.get(y_col, "")
        value = _parse_number(row.get(value_col))
        if not str(x_val).strip() or not str(y_val).strip() or value is None:
            continue
        grouped[(y_val, x_val)].append(value)

    for y_idx, y_value in enumerate(y_order):
        for x_idx, x_value in enumerate(x_order):
            values = grouped.get((y_value, x_value), [])
            matrix[y_idx, x_idx] = float(np.mean(values)) if values else np.nan

    image = ax.imshow(matrix, cmap="viridis", aspect="auto")
    ax.set_xticks(np.arange(len(x_order)))
    ax.set_xticklabels(x_order, rotation=20 if len(x_order) > 6 else 0, ha="right" if len(x_order) > 6 else "center")
    ax.set_yticks(np.arange(len(y_order)))
    ax.set_yticklabels(y_order)
    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    plt.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    qa["duplicateLegendLabels"] = []


def _render_panel(ax, rows, panel, stats, qa):
    chart_type = panel.get("chart_type", "grouped_bar")
    if chart_type == "line":
        _render_line(ax, rows, panel, stats, qa)
    elif chart_type == "scatter":
        _render_scatter(ax, rows, panel, stats, qa)
    elif chart_type == "heatmap":
        _render_heatmap(ax, rows, panel, stats, qa)
    else:
        _render_grouped_bar(ax, rows, panel, stats, qa)


def _render_figure(rows, contract, export_options):
    panel_map = contract.get("panel_map", [])
    panel_count = max(1, min(4, len(panel_map)))
    export_bundle = contract.get("export_bundle", {})
    width_px = int(export_options.get("widthPx") or export_bundle.get("width_px") or 3600)
    height_px = int(export_options.get("heightPx") or export_bundle.get("height_px") or 2700)
    dpi = 200
    figsize = (max(6.0, width_px / dpi), max(4.0, height_px / dpi))
    rows = rows or []

    if panel_count == 1:
      fig, axes = plt.subplots(1, 1, figsize=figsize, constrained_layout=True)
      axes = [axes]
    else:
      fig, grid_axes = plt.subplots(2, 2, figsize=figsize, constrained_layout=True)
      axes = list(grid_axes.flatten())

    missing_columns = []
    duplicate_legend_labels = []
    overflow_warnings = []
    panel_label_count = 0

    for index, ax in enumerate(axes):
        if index >= panel_count:
            ax.axis("off")
            continue

        panel = panel_map[index]
        required_columns = [
            panel.get("x_column"),
            panel.get("y_column"),
            panel.get("series_column"),
            panel.get("secondary_column"),
        ]
        missing_columns.extend(_prepare_rows(rows, [column for column in required_columns if column]))
        panel_qa = {
            "duplicateLegendLabels": [],
        }
        _render_panel(ax, rows, panel, contract.get("stats_needed", {}), panel_qa)
        ax.set_title(panel.get("title", ""), loc="left", fontweight="bold")
        ax.text(-0.08, 1.06, panel.get("id", chr(65 + index)), transform=ax.transAxes, fontsize=12, fontweight="bold")
        panel_label_count += 1
        duplicate_legend_labels.extend(panel_qa["duplicateLegendLabels"])

        if len(panel.get("title", "")) > 60:
            overflow_warnings.append(f"Panel {panel.get('id', chr(65 + index))} title is long and may need manual tightening.")

    fig.suptitle(contract.get("figure_title", "Data figure"), fontsize=13, fontweight="bold", x=0.02, ha="left")

    svg_buffer = io.StringIO()
    fig.savefig(svg_buffer, format="svg", facecolor="white", dpi=dpi)
    svg_text = svg_buffer.getvalue()

    png_buffer = io.BytesIO()
    fig.savefig(png_buffer, format="png", facecolor="white", dpi=dpi)
    png_bytes = png_buffer.getvalue()
    plt.close(fig)

    return {
        "svgBase64": base64.b64encode(svg_text.encode("utf-8")).decode("ascii"),
        "pngBase64": base64.b64encode(png_bytes).decode("ascii"),
        "missingColumns": _ordered_unique(missing_columns),
        "duplicateLegendLabels": _ordered_unique(duplicate_legend_labels),
        "overflowWarnings": _ordered_unique(overflow_warnings),
        "panelLabelCount": panel_label_count,
    }


def handle_profile(request):
    rows = _load_rows(request["filePath"], request.get("originalName"))
    profile = _profile_rows(rows)
    return {
        "success": True,
        "profile": profile,
    }


def handle_render(request):
    rows = _load_rows(request["filePath"], request.get("originalName"))
    contract = request.get("contract") or {}
    render_result = _render_figure(rows, contract, request.get("exportOptions") or {})
    qa_report = {
        "notes": [
            "SVG export keeps text editable via matplotlib svg.fonttype=none.",
            "Check final typography and spacing before submission.",
        ],
        "renderWarnings": render_result["overflowWarnings"],
    }
    return {
        "success": True,
        "renderSuccess": True,
        "figureScript": _build_script(contract),
        "figureSpec": contract,
        "svgBase64": render_result["svgBase64"],
        "pngBase64": render_result["pngBase64"],
        "missingColumns": render_result["missingColumns"],
        "duplicateLegendLabels": render_result["duplicateLegendLabels"],
        "overflowWarnings": render_result["overflowWarnings"],
        "panelLabelCount": render_result["panelLabelCount"],
        "qaReport": qa_report,
        "notes": qa_report["notes"],
    }


def main():
    try:
        request = _read_request()
        action = request.get("action")
        if action == "profile":
            response = handle_profile(request)
        elif action == "render":
            response = handle_render(request)
        else:
            raise ValueError(f"Unsupported figure worker action: {action}")
        print(json.dumps(response))
    except Exception as exc:
        sys.stderr.write(f"CRITICAL: {exc}\n")
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
