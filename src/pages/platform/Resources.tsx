import type { Resource } from "./types";
import { SANDBOX } from "./product-mode";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Box,
  Cable,
  Cpu,
  FlaskConical,
  Settings2,
} from "lucide-react";
import { usePlatform } from "./context";
import { platformApi } from "./api";
import { Badge, Dialog, ErrorNote } from "./ui";
export default function Resources({ page }: { page: "lab" | "tools" }) {
  const { overview: o, projectData, busy, action, error } = usePlatform();
  const [selected, setSelected] = useState<Resource | null>(null);
  const list = o.resources.filter(
    (r) => r.kind === (page === "lab" ? "equipment" : "simulation"),
  );
  return (
    <div className="ep-page ep-resource-page">
      <div className="ep-section-title">
        <div>
          <div className="ep-eyebrow">
            {page === "lab" ? "实验执行与数据回流" : "计算执行与研究模型"}
          </div>
          <h1>{page === "lab" ? "实验室" : "工具与模型"}</h1>
          <p>
            {page === "lab"
              ? "设备自动接入待开放。当前可管理样品、测试记录与原始文件。"
              : "真实仿真执行待开放。当前可选择研究模型、定义计算任务与分析已有曲线。"}
          </p>
        </div>
        <Link
          to={
            page === "lab"
              ? "/workspace/experiments"
              : projectData?.project
                ? "/workspace/settings/models"
                : "/account/defaults"
          }
        >
          {page === "lab" ? "查看项目样品" : "选择研究模型"}
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="ep-resource-stats">
        <div>
          <strong>{list.length}</strong>
          <span>{page === "lab" ? "设备类型" : "计算方法"}</span>
        </div>
        <div>
          <strong>{list.filter((r) => r.state === "approved").length}</strong>
          <span>已接通资源</span>
        </div>
        <div>
          <strong>
            {page === "lab"
              ? projectData?.workflow?.samples.length || 0
              : o.models.length}
          </strong>
          <span>{page === "lab" ? "当前项目样品" : "可用服务"}</span>
        </div>
      </div>
      <div className="ep-resource-grid">
        {list.map((r) => {
          const pending = !SANDBOX && r.state !== "approved";
          return (
            <article className="ep-panel ep-resource-card" key={r.id}>
              <header>
                {page === "lab" ? <FlaskConical size={24} /> : <Cpu size={24} />}
                <Badge status={r.state}>{pending ? "待开放" : undefined}</Badge>
              </header>
              <h2>{r.name}</h2>
              <p>{r.method}</p>
              <dl>
                <dt>{pending ? "计划接入方式" : "接入方式"}</dt>
                <dd>{r.channel}</dd>
              </dl>
              <p className="ep-resource-note">{r.note}</p>
              <button
                disabled={pending || o.role !== "owner"}
                onClick={() => setSelected(r)}
              >
                {!pending && <Settings2 size={14} />}
                {pending
                  ? `${page === "lab" ? "设备接入" : "仿真执行"} · 待开放`
                  : "配置接入说明"}
              </button>
            </article>
          );
        })}
      </div>
      <div className="ep-panel ep-connection-flow">
        <h3>资源接入后的协作关系</h3>
        <div>
          <span>
            <Box size={17} />
            项目计划与输入
          </span>
          <ArrowRight size={16} />
          <span>
            <Cable size={17} />
            计算 / 设备适配器
          </span>
          <ArrowRight size={16} />
          <span>
            <FlaskConical size={17} />
            运行状态与原始数据
          </span>
          <ArrowRight size={16} />
          <span>质量复核</span>
        </div>
        <p>
          项目任务现可定义输入、输出、负责人、期限和验收条件，并回传原始文件。拉伸任务支持
          CSV
          曲线计算。设备与仿真自动执行待开放，当前可通过人工执行和原始文件回传推进任务。
        </p>
      </div>
      {selected && (
        <Dialog
          title={selected.name + " · 接入说明"}
          close={() => !busy && setSelected(null)}
        >
          <form
            className="ep-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const input = Object.fromEntries(new FormData(e.currentTarget));
              if (
                await action(
                  () =>
                    platformApi(
                      "/api/platform/resources/" + selected.id,
                      input,
                      "PATCH",
                    ),
                  "接入说明已保存；资源仍显示待接通。",
                )
              )
                setSelected(null);
            }}
          >
            <label>
              计划接入方式
              <input name="channel" required defaultValue={selected.channel} />
            </label>
            <label>
              资源说明与要求
              <textarea name="note" defaultValue={selected.note} />
            </label>
            <div className="ep-inline-note">
              这里保存对接需求，不保存密码、API 密钥或设备控制指令。
            </div>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              保存接入说明
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
