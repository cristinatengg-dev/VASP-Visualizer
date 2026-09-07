import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { usePlatform } from "./context";
import { platformApi, saveJson, time } from "./api";
import { Dialog, Empty, ErrorNote } from "./ui";
import type {
  MemoryRecord,
  MemoryReference,
  MemoryView,
  MemoryHistory,
} from "./types";
const kinds: Record<string, string> = {
  fact: "事实记录",
  preference: "偏好",
  constraint: "约束",
  decision: "决策",
  failure: "经验",
  hypothesis: "假设",
  todo: "待办",
  discussion: "对话",
  evidence: "证据",
};

export function MemoryCitations({
  references,
  answer = false,
  all = false,
  contextId = null,
}: {
  references?: MemoryReference[];
  answer?: boolean;
  all?: boolean;
  contextId?: string | null;
}) {
  const [source, setSource] = useState<MemoryRecord | null>(null),
    [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  if (!references?.length) return null;
  async function open(r: MemoryReference) {
    setOpening(true);
    setError("");
    try {
      const params = new URLSearchParams({
        id: r.id,
        projectId: r.projectId || "",
        version: String(r.version),
      });
      const base = contextId
        ? "/api/platform/projects/" + contextId + "/memory"
        : "/api/platform/memory";
      const next = await platformApi<MemoryRecord>(base + "/source?" + params);
      if (live.current) setSource(next);
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : "来源不可用");
    } finally {
      if (live.current) setOpening(false);
    }
  }
  const cite = (r: MemoryReference, i: number) => (
    <button
      className="ep-source-chip"
      disabled={!r.available || opening}
      onClick={() => open(r)}
      key={r.id + r.projectId + i}
    >
      <BookOpen size={12} />
      {r.projectName || (r.projectId ? "项目记录" : "账号记录")} · {r.title}
      {r.demo ? " · 演练" : ""}
    </button>
  );
  return (
    <>
      {answer && (
        <div className="ep-recalled-answer">
          {references.slice(0, all ? 10 : 1).map((r, i) => (
            <div key={r.id + r.projectId + i}>
              <p>
                {r.available
                  ? r.content
                  : "这条历史来源已经更新或停止引用，请重新提问获取当前记录。"}
              </p>
              {cite(r, i)}
            </div>
          ))}
        </div>
      )}
      <details className="ep-memory-citations">
        <summary>
          <BookOpen size={12} />
          参考了 {references.length} 条历史来源
        </summary>
        <ol>
          {references.map((r, i) => (
            <li key={r.id + r.projectId + i}>
              {cite(r, i)}
              {(!answer || (!all && i >= 1)) && <p>{r.content}</p>}
            </li>
          ))}
        </ol>
      </details>
      <ErrorNote message={error} />
      {source && (
        <Dialog title={source.title} close={() => setSource(null)} wide>
          <div className="ep-memory-version-body">
            <p className="ep-footnote">
              {source.projectName || "账号记录"} · {source.source}
              {source.demo ? " · 演练数据" : ""}
            </p>
            <p className="ep-source-content">{source.content}</p>
            <Link
              to={
                "/account/memory?project=" +
                (source.projectId || "") +
                "&ref=" +
                encodeURIComponent(source.id)
              }
              onClick={() => setSource(null)}
            >
              更正或管理此来源 <ArrowRight size={12} />
            </Link>
          </div>
        </Dialog>
      )}
    </>
  );
}
export function MemoryForm({
  initial,
  save,
  busy,
  error,
}: {
  initial?: Partial<MemoryRecord>;
  save: (input: Record<string, unknown>) => void;
  busy: boolean;
  error: string;
}) {
  return (
    <form
      className="ep-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          ...Object.fromEntries(f),
          pinned: f.get("pinned") === "on",
          version: initial?.version,
        });
      }}
    >
      <label>
        记忆标题
        <input
          name="title"
          maxLength={120}
          required
          autoFocus
          defaultValue={initial?.title || ""}
          placeholder="例如：禁止使用含铍配方"
        />
      </label>
      <label>
        类型
        <select name="kind" defaultValue={initial?.kind || "constraint"}>
          {Object.entries(kinds)
            .filter(([key]) => !["discussion", "evidence"].includes(key))
            .map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
        </select>
      </label>
      <label>
        内容
        <textarea
          name="content"
          maxLength={5000}
          required
          defaultValue={initial?.content || ""}
          placeholder="写下明确的事实、约束或决策；研究假设请保留尚待验证的状态。"
        />
      </label>
      <label className="ep-check-row">
        <input
          name="pinned"
          type="checkbox"
          defaultChecked={!!initial?.pinned}
        />
        <span>优先读取这条记忆</span>
      </label>
      <p className="ep-footnote">
        保存记忆不修改研究目标表单，也不授权公司模型训练。涉及目标或样品预算变化，仍需更新并确认研究路线。
      </p>
      <ErrorNote message={error} />
      <button className="ep-primary" disabled={busy}>
        <Check size={14} />
        保存记忆
      </button>
    </form>
  );
}
export default function Memory() {
  const { overview, busy, action, error } = usePlatform();
  const params = new URLSearchParams(useLocation().search);
  const requested = params.get("project") || "";
  const [controlsOpen, setControlsOpen] = useState(params.has("ref"));
  const [scopeId, setScopeId] = useState(requested),
    [data, setData] = useState<MemoryView | null>(null),
    [account, setAccount] = useState<MemoryView | null>(null);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<MemoryRecord | null>(null),
    [modal, setModal] = useState("");
  const [versions, setVersions] = useState<MemoryRecord[]>([]),
    [history, setHistory] = useState<MemoryHistory[]>([]),
    [detail, setDetail] = useState<MemoryHistory | null>(null),
    [nextOffset, setNextOffset] = useState<number | null>(0);
  const epoch = useRef(0),
    active = useRef(true);
  const base = scopeId
    ? "/api/platform/projects/" + scopeId + "/memory"
    : "/api/platform/memory";
  useEffect(() => {
    setScopeId(requested);
  }, [requested]);
  const load = useCallback(async () => {
    const n = ++epoch.current;
    try {
      const [a, d] = await Promise.all([
        platformApi<MemoryView>("/api/platform/memory"),
        platformApi<MemoryView>(base),
      ]);
      if (active.current && n === epoch.current) {
        setAccount(a);
        setData(d);
        setLoadError("");
      }
    } catch (e) {
      if (active.current && n === epoch.current)
        setLoadError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (active.current && n === epoch.current) setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    active.current = true;
    setData(null);
    setLoading(true);
    setModal("");
    load();
    return () => {
      active.current = false;
    };
  }, [load]);
  async function run(
    path: string,
    input: unknown,
    method = "PATCH",
    note = "设置已保存。",
  ) {
    if (
      await action(async () => {
        await platformApi(base + path, input, method);
        await load();
      }, note)
    )
      setModal("");
  }
  async function loadHistory(offset = 0) {
    await action(async () => {
      const result = await platformApi<{
        items: MemoryHistory[];
        nextOffset: number | null;
      }>(base + "/history?offset=" + offset);
      setHistory((old) => (offset ? [...old, ...result.items] : result.items));
      setNextOffset(result.nextOffset);
      setModal("history");
    });
  }
  if (loading)
    return (
      <div className="ep-loading">
        <Loader2 className="ep-spin" />
      </div>
    );
  if (!data || !account)
    return <ErrorNote message={loadError || "记忆设置暂不可用"} />;
  const rows = data.items.filter((r) =>
    (r.title + " " + r.content).toLowerCase().includes(filter.toLowerCase()),
  );
  const close = () => {
    if (!busy) setModal("");
  };
  return (
    <div className="ep-memory ep-auto-memory">
      <div className="ep-section-title">
        <div>
          <h2>自动记忆</h2>
          <p>
            正常对话、上传资料、推进研究即可。助手会自动回看这个账号的相关信息，无需另行保存。
          </p>
        </div>
      </div>
      <ErrorNote message={loadError} />
      <div className="ep-memory-settings">
        <div>
          <ShieldCheck size={19} />
          <span>
            <strong>
              {account.settings.enabled ? "自动记忆已开启" : "自动记忆已关闭"}
            </strong>
            <small>
              同一账号内按权限读取，始终标明项目来源。私密数据不因此参与训练。
            </small>
          </span>
        </div>
        <label>
          <input
            type="checkbox"
            aria-label="自动记忆"
            checked={account.settings.enabled}
            disabled={busy || overview?.role !== "owner"}
            onChange={(e) =>
              action(async () => {
                await platformApi(
                  "/api/platform/memory/settings",
                  {
                    ...account.settings,
                    revision: account.revision,
                    enabled: e.target.checked,
                  },
                  "PATCH",
                );
                await load();
              }, "自动记忆设置已更新。")
            }
          />
          自动读取历史
        </label>
      </div>
      <p className="ep-footnote">
        默认覆盖本账号的对话、项目进度、实验记录、资料目录与获准检索的正文、设备和模型配置。账户用量等管理信息仅所有者可读，引用保留来源和复核状态。
      </p>
      <details
        className="ep-memory-controls"
        open={controlsOpen || params.has("ref")}
        onToggle={(event) => setControlsOpen(event.currentTarget.open)}
      >
        <summary>查看与管理已记住的内容</summary>
        <div className="ep-memory-toolbar">
          <label>
            来源
            <select
              aria-label="记忆来源范围"
              value={scopeId}
              onChange={(e) => {
                setScopeId(e.target.value);
              }}
            >
              <option value="">账号对话与设置</option>
              {overview?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy}
            aria-label="导出此范围的历史记录"
            onClick={() =>
              action(async () =>
                saveJson(
                  "EliangMat_AI_记录.json",
                  await platformApi(base + "/export"),
                ),
              )
            }
          >
            <ArrowDownToLine size={14} />
            导出
          </button>
          {(scopeId || overview?.role === "owner") && (
            <button disabled={busy} onClick={() => loadHistory()}>
              <Clock3 size={14} />
              版本历史
            </button>
          )}
        </div>
        {scopeId && (
          <label className="ep-check-row">
            <input
              type="checkbox"
              checked={
                data.settings.enabled &&
                data.settings.shareWithAccount !== false
              }
              disabled={busy || !data.writeAllowed}
              onChange={(e) =>
                run("/settings", {
                  ...data.settings,
                  revision: data.revision,
                  enabled: e.target.checked,
                  shareWithAccount: e.target.checked,
                })
              }
            />
            <span>
              允许助手自动参考这个项目。关闭后保留原始数据，后续对话不再引用。
            </span>
          </label>
        )}
        <div className="ep-memory-toolbar">
          <Search size={14} />
          <input
            aria-label="筛选已记住的内容"
            placeholder="搜索记录内容"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <small>{rows.length} 条记录 · 自动更新</small>
        </div>
        <div className="ep-memory-list">
          {rows.slice(0, 100).map((r) => (
            <article
              key={r.id}
              className={
                "ep-memory-card " +
                (!r.enabled ? "is-disabled " : "") +
                (params.get("ref") === r.id ? "is-target" : "")
              }
            >
              <header>
                <h3>{r.title}</h3>
                <small>{r.enabled ? "自动可用" : "已停止引用"}</small>
              </header>
              <p>
                {r.content.slice(0, 220)}
                {r.content.length > 220 ? "…" : ""}
              </p>
              <footer>
                <small>
                  {r.source}
                  {r.demo ? " · 演练" : ""}
                </small>
                <div className="ep-actions">
                  <button
                    onClick={() => {
                      setSelected(r);
                      setModal("source");
                    }}
                  >
                    查看
                  </button>
                  {r.editable && (
                    <>
                      <button
                        aria-label={"修订历史 " + r.title}
                        onClick={() =>
                          action(async () => {
                            const v = await platformApi<{
                              versions: MemoryRecord[];
                            }>(base + "/items/" + r.id + "/versions");
                            setVersions(v.versions);
                            setSelected(r);
                            setModal("versions");
                          })
                        }
                      >
                        <Clock3 size={13} />
                      </button>
                      {data.writeAllowed && (
                        <>
                          <button
                            aria-label={"更正 " + r.title}
                            onClick={() => {
                              setSelected(r);
                              setModal("edit");
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            aria-label={"删除 " + r.title}
                            onClick={() => {
                              setSelected(r);
                              setModal("delete");
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {data.writeAllowed && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        r.editable
                          ? run("/items/" + r.id, {
                              version: r.version,
                              enabled: !r.enabled,
                            })
                          : run("/sources", { id: r.id, suppressed: r.enabled })
                      }
                    >
                      {r.enabled ? "停止引用" : "恢复引用"}
                    </button>
                  )}
                </div>
              </footer>
            </article>
          ))}
        </div>
        {rows.length > 100 && (
          <p className="ep-footnote">
            显示前 100 条，请搜索缩小范围；导出包含完整记录。
          </p>
        )}
        {!rows.length && (
          <Empty title="还没有匹配的记录">
            直接在对话中补充信息，或在项目中上传资料、推进研究，内容会自动保留。
          </Empty>
        )}
      </details>
      <p className="ep-memory-note">
        账号记忆保存在平台的账号空间中；选用 Gemini
        时仅发送获准外部推理的相关记录。关闭记忆后不检索长期历史；当前对话仍保留连续上下文。版本记录从功能启用时开始。
      </p>
      <Link to="/assistant" className="ep-memory-back">
        回到对话 <ArrowRight size={14} />
      </Link>
      {modal === "source" && selected && (
        <Dialog title={selected.title} close={close} wide>
          <p className="ep-source-content">{selected.content}</p>
          <p className="ep-footnote">
            {selected.source}
            。需要更正研究事实时，可在对话中补充更正，并在相应项目表单更新目标或实验数据。
          </p>
        </Dialog>
      )}
      {modal === "edit" && selected && (
        <Dialog title="更正记录" close={close}>
          <MemoryForm
            initial={selected}
            busy={busy}
            error={error}
            save={(input) => run("/items/" + selected.id, input)}
          />
        </Dialog>
      )}
      {modal === "delete" && selected && (
        <Dialog title="删除记录" close={close}>
          <p>
            删除「{selected.title}
            」及修订历史。独立保存的原始对话、实验和资料仍然保留，可分别停止引用。
          </p>
          <ErrorNote message={error} />
          <button
            className="ep-primary"
            disabled={busy}
            onClick={() =>
              run(
                "/items/" + selected.id,
                { version: selected.version },
                "DELETE",
                "记录及修订历史已删除。",
              )
            }
          >
            删除记录
          </button>
        </Dialog>
      )}
      {modal === "versions" && selected && (
        <Dialog title={selected.title + " · 修订历史"} close={close} wide>
          <div className="ep-memory-version-body">
            {versions.length ? (
              [...versions].reverse().map((v) => (
                <div className="ep-panel" key={v.version}>
                  <small>
                    历史 v{v.version} · {time(v.updatedAt)}
                  </small>
                  <p>{v.content}</p>
                </div>
              ))
            ) : (
              <p>尚未修改。</p>
            )}
          </div>
        </Dialog>
      )}
      {modal === "history" && (
        <Dialog title="版本历史" close={close} wide>
          <div className="ep-memory-history">
            {history.map((h) => (
              <button
                key={h.id}
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    setDetail(
                      await platformApi<MemoryHistory>(
                        base + "/history/" + h.id,
                      ),
                    );
                    setModal("detail");
                  })
                }
              >
                <div>
                  <strong>
                    {h.label} · v{h.version}
                  </strong>
                  <small>{h.baseline ? "启用时的基线" : "记录更新"}</small>
                </div>
                <time>{time(h.at)}</time>
              </button>
            ))}
            {nextOffset !== null && (
              <button disabled={busy} onClick={() => loadHistory(nextOffset)}>
                查看更多
              </button>
            )}
          </div>
        </Dialog>
      )}
      {modal === "detail" && detail && (
        <Dialog
          title={detail.label + " · v" + detail.version}
          close={close}
          wide
        >
          <div className="ep-memory-version-body">
            <p>{detail.warning}</p>
            <pre>{JSON.stringify(detail.snapshot, null, 2)}</pre>
            {detail.previous && (
              <details>
                <summary>上一版本</summary>
                <pre>{JSON.stringify(detail.previous, null, 2)}</pre>
              </details>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
