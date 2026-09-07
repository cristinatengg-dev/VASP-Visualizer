import { useState } from "react";
import { platformApi } from "./api";
import { ErrorNote } from "./ui";
import type { ResearchWorkflow, ResearchTask } from "./types";
export function RequirementsFields({
  initial = {},
}: {
  initial?: Partial<ResearchWorkflow>;
}) {
  const [values, setValues] = useState<Record<string, string | number | null>>({
    ...initial,
  } as unknown as Record<string, string | number | null>);
  const [issues, setIssues] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const numeric = [
    ["targetStrength", "屈服强度目标 / MPa"],
    ["targetElongation", "延伸率目标 / %"],
    ["testTemperature", "目标测试温度 / °C"],
    ["sampleBudget", "下一轮样品上限"],
    ["repeats", "独立试样重复数"],
    ["durationWeeks", "研究周期 / 周"],
  ];
  async function extract() {
    setLoading(true);
    setError("");
    try {
      const next = await platformApi<
        Record<string, string | number | null> & { requirementIssues: string[] }
      >("/api/platform/requirements/preview", { goal: values.goal });
      setValues((v) => {
        const updated = { ...v };
        for (const [key, value] of Object.entries(next))
          if (typeof value === "number") updated[key] = value;
        return updated;
      });
      setIssues(next.requirementIssues);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法解析");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <label>
        目标与约束
        <textarea
          name="goal"
          minLength={8}
          required
          maxLength={3000}
          value={String(values.goal || "")}
          onChange={(e) => setValues({ ...values, goal: e.target.value })}
          placeholder="例如：200°C 下屈服强度至少 300 MPa，延伸率至少 8%，最多 6 个样品，周期 4 周"
        />
      </label>
      <button type="button" onClick={extract} disabled={loading}>
        {loading ? "正在提取…" : "从目标提取数值"}
      </button>
      <p className="ep-footnote">
        提取后请逐项确认。未确定的条件可留空保存草稿，补齐后才能确认路线。
      </p>
      <div className="ep-form-grid">
        {numeric.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type="number"
              step="any"
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              placeholder="待确认"
            />
          </label>
        ))}
      </div>
      <div className="ep-form-grid">
        {[
          ["standard", "测试标准及版本"],
          ["strengthDefinition", "屈服定义（如 Rp0.2）"],
          ["environment", "测试环境"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              placeholder="待确认"
            />
          </label>
        ))}
      </div>
      {!!issues.length && (
        <details>
          <summary>解析待确认项 · {issues.length}</summary>
          {issues.map((x) => (
            <p key={x}>{x}</p>
          ))}
        </details>
      )}
      <ErrorNote message={error} />
    </>
  );
}
export function MeasurementFields() {
  return (
    <div className="ep-form-grid">
      {[
        ["specimenId", "独立试样编号", "text"],
        ["temperature", "实际测试温度 / °C", "number"],
        ["standard", "实际测试标准及版本", "text"],
        ["environment", "实际测试环境", "text"],
        ["strengthDefinition", "实际屈服定义", "text"],
        ["strainRate", "应变速率 / s⁻¹", "number"],
        ["dimensions", "试样尺寸（含单位）", "text"],
      ].map(([key, label, type]) => (
        <label key={key}>
          {label}
          <input
            name={key}
            type={type}
            step="any"
            required
            placeholder="按实际记录填写"
          />
        </label>
      ))}
    </div>
  );
}
export type RawFile = {
  name: string;
  content: string;
  encoding: "text" | "base64";
};
export function CurvePreview({ output }: { output?: Record<string, unknown> }) {
  if (!Array.isArray(output?.curve) || !output.curve.length) return null;
  const points = output.curve.filter(
    (p) => Number.isFinite(p.strain) && Number.isFinite(p.stressMPa),
  );
  if (!points.length) return null;
  const maxX = Math.max(...points.map((p) => p.strain)) || 1,
    maxY = Math.max(...points.map((p) => p.stressMPa)) || 1;
  return (
    <figure className="ep-curve">
      <svg viewBox="0 0 620 260" role="img" aria-label="导入工程应变与应力曲线">
        <path d="M60 15V220H605" fill="none" stroke="#8b8d84" />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <text x="53" y={224 - f * 200} textAnchor="end">
              {(maxY * f).toFixed(0)}
            </text>
            <text x={60 + f * 530} y="239" textAnchor="middle">
              {(maxX * f).toPrecision(3)}
            </text>
          </g>
        ))}
        <polyline
          points={points
            .map(
              (p) =>
                `${60 + (p.strain / maxX) * 530},${220 - (p.stressMPa / maxY) * 200}`,
            )
            .join(" ")}
          fill="none"
          stroke="#383d35"
          strokeWidth="2"
        />
        <text x="65" y="13">
          应力 / MPa
        </text>
        <text x="320" y="257" textAnchor="middle">
          工程应变 / 无量纲
        </text>
      </svg>
      <figcaption>
        来自上传 CSV · 峰值 {String(output.peakStressMPa)} MPa · 积分{" "}
        {Number(output.integralMJm3).toPrecision(5)}{" "}
        MJ/m³。此图不推断屈服或断后延伸率。
      </figcaption>
    </figure>
  );
}
export function RawFileField({
  onChange,
}: {
  onChange: (file: RawFile | null) => void;
}) {
  const [error, setError] = useState(""),
    [name, setName] = useState("");
  return (
    <label>
      原始文件（单文件 ≤ 180 KB）
      <input
        type="file"
        aria-label="原始文件"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setError("");
          setName("");
          onChange(null);
          if (!file) return;
          if (file.size > 180000) {
            setError("文件超过当前大小限制，请选取相关原始记录片段");
            return;
          }
          try {
            if (/\.(csv|txt|json|log)$/i.test(file.name))
              onChange({
                name: file.name,
                content: await file.text(),
                encoding: "text",
              });
            else {
              const buffer = new Uint8Array(await file.arrayBuffer());
              let value = "";
              buffer.forEach((b) => (value += String.fromCharCode(b)));
              onChange({
                name: file.name,
                content: btoa(value),
                encoding: "base64",
              });
            }
            setName(file.name);
          } catch {
            setError("读取文件失败，请重新选择");
          }
        }}
      />
      {name && <small>已选择 {name}，提交后保存原始内容与校验值。</small>}
      <ErrorNote message={error} />
    </label>
  );
}
export function TaskDefinition({
  task,
  w,
  busy,
  onSave,
}: {
  task: ResearchTask;
  w: ResearchWorkflow;
  busy: boolean;
  onSave: (input: unknown) => void;
}) {
  const c = task.contract;
  return (
    <form
      className="ep-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          ...Object.fromEntries(f),
          dependencies: f.getAll("dependencies"),
          version: c?.version || 0,
        });
      }}
    >
      <p>任务定义 v{c?.version || 0} · 修改后需要重新确认研究路线。</p>
      <label>
        执行方式
        <select name="execution" defaultValue={c?.execution || "manual"}>
          <option value="manual">人工执行与文件回传</option>
          {task.id === "tensile" && (
            <option value="curve-csv">工程曲线分析 · CSV v1</option>
          )}
          <option value="simulation-pending" disabled>真实仿真执行 · 待开放</option>
          <option value="equipment-pending" disabled>设备自动执行 · 待开放</option>
        </select>
      </label>
      <label>
        候选
        <select name="candidateId" defaultValue={c?.candidateId || ""}>
          <option value="">不限定单一候选</option>
          {w.candidates
            .filter((c) => c.validation?.executable)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.composition} · v{c.version}
              </option>
            ))}
        </select>
      </label>
      {(
        [
          "inputs",
          "outputs",
          "methodVersion",
          "resource",
          "assignee",
          "dueAt",
          "estimatedCost",
          "acceptance",
        ] as const
      ).map((key, i) => (
        <label key={key}>
          {
            [
              "输入工件、参数及转换说明",
              "要求输出及单位",
              "方法 / 软件 / 数据库版本",
              "执行资源或设备编号",
              "责任人",
              "完成期限",
              "预计执行成本 / 元",
              "验收条件",
            ][i]
          }
          <input
            name={key}
            type={
              key === "estimatedCost"
                ? "number"
                : key === "dueAt"
                  ? "datetime-local"
                  : "text"
            }
            step={key === "estimatedCost" ? "0.01" : undefined}
            min={key === "estimatedCost" ? 0 : undefined}
            required
            defaultValue={c?.[key] ?? ""}
          />
        </label>
      ))}
      <fieldset>
        <legend>前置任务（未勾选的任务可并行）</legend>
        {w.tasks
          .filter(
            (t) => t.id !== task.id && !["review", "learn"].includes(t.id),
          )
          .map((t) => (
            <label className="ep-check-row" key={t.id}>
              <input
                type="checkbox"
                name="dependencies"
                value={t.id}
                defaultChecked={task.dependencies.includes(t.id)}
              />
              {t.name}
            </label>
          ))}
      </fieldset>
      <small>
        责任人是执行登记信息；不会发送邀请或通知。设备自动执行和真实仿真待开放。
      </small>
      <button className="ep-primary" disabled={busy}>
        保存任务定义
      </button>
    </form>
  );
}
