import { SANDBOX, PLATFORM_APP } from "../platform/product-mode";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  Folder,
  HelpCircle,
  Link2,
  Loader2,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type { DocumentRecord, Job, Overview, ProjectData } from "./types";
import "./knowledge.css";

const development = SANDBOX;
const base = "/api/knowledge";
const kinds: Record<string, string> = {
  measurement: "实验实测",
  simulation: "仿真预测",
  "patent-example": "专利实施例",
  "patent-claim": "专利权利要求",
};
const statuses: Record<string, string> = {
  queued: "排队中",
  running: "采集中",
  completed: "已完成",
  partial: "部分失败",
  failed: "失败",
  interrupted: "已中断",
};
const documentTypeName = (type?: string) =>
  ({
    "journal-article": "期刊论文",
    article: "论文",
    "peer-review": "审稿记录",
    "posted-content": "发布内容 / 预印本",
    preprint: "预印本",
  })[type || ""] || "类型待核对";
const date = (v: string) =>
  new Date(v).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const headers: Record<string, string> = {
    "X-EliangMat-Client": "knowledge-v1",
  };
  const token = PLATFORM_APP ? null : localStorage.getItem("vasp_token");
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method: body === undefined ? "GET" : method,
    headers,
    credentials: "same-origin",
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const result = await response
    .json()
    .catch(() => ({ error: "服务未启动或返回格式异常" }));
  if (response.status === 401 && PLATFORM_APP)
    window.dispatchEvent(new Event("eliangmat:unauthorized"));
  if (!response.ok)
    throw Object.assign(new Error(result.error || "请求失败"), {
      status: response.status,
    });
  return result;
}
function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"km-modal " + (wide ? "km-wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="km-modal-head">
        <h2>{title}</h2>
        <button aria-label="关闭" className="km-icon" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Status({ job }: { job: Job }) {
  const active = ["queued", "running"].includes(job.status);
  return (
    <span className={"km-status km-" + job.status}>
      {active ? (
        <Loader2 size={13} className="km-spin" />
      ) : job.status === "completed" ? (
        <CheckCircle2 size={13} />
      ) : (
        <Circle size={12} />
      )}
      {statuses[job.status]}
    </span>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="km-empty">
      <BookOpen size={28} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function KnowledgeCenter({
  initialProjectId = "",
  embedded = false,
  onChange,
}: {
  initialProjectId?: string;
  embedded?: boolean;
  onChange?: () => Promise<void>;
} = {}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [data, setData] = useState<ProjectData | null>(null);
  const [tab, setTab] = useState("library");
  const [modal, setModal] = useState("");
  const [detail, setDetail] = useState<DocumentRecord | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("crossref");
  const epoch = useRef(0);
  const projectRef = useRef("");
  projectRef.current = projectId;
  const pbase = base + "/projects/" + projectId;

  const loadOverview = useCallback(async () => {
    const current = epoch.current;
    const next = await api<Overview>(base);
    if (current !== epoch.current) return;
    setOverview(next);
    setProjectId((prev) =>
      next.projects.some((p) => p.id === prev)
        ? prev
        : next.projects[0]?.id || "",
    );
  }, []);
  const refresh = useCallback(async () => {
    const id = projectRef.current;
    const current = epoch.current;
    if (!id) return;
    const next = await api<ProjectData>(base + "/projects/" + id);
    if (current === epoch.current && projectRef.current === id) setData(next);
  }, []);
  useEffect(() => {
    loadOverview()
      .catch((e) => {
        if (!(PLATFORM_APP && e.status === 401)) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [loadOverview]);
  useEffect(() => {
    setData(null);
    setDetail(null);
    if (projectId) refresh().catch((e) => setError(e.message));
  }, [projectId, refresh]);
  const hasActive = data?.jobs.some((j) =>
    ["queued", "running"].includes(j.status),
  );
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      1800,
    );
    return () => clearInterval(timer);
  }, [hasActive, refresh]);

  async function action(work: () => Promise<unknown>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
      if (onChange) await onChange();
      if (message) setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const switchAccount = (account: string) =>
    action(async () => {
      await api("/api/auth/development-login", { account });
      window.dispatchEvent(new Event("eliangmat:session-changed"));
      epoch.current++;
      projectRef.current = "";
      setProjectId("");
      setData(null);
      setDetail(null);
      setOverview(null);
      setModal("");
      await loadOverview();
    });
  const openDetail = (id: string) =>
    action(async () => {
      const current = epoch.current;
      const selectedProject = projectId;
      const d = await api<DocumentRecord>(pbase + "/documents/" + id);
      if (epoch.current === current && projectRef.current === selectedProject) {
        setDetail(d);
        setModal("detail");
      }
    });
  const exportData = (purpose: string) =>
    action(async () => {
      const result = await api(pbase + "/export", { purpose });
      download("EliangMat_AI_" + purpose + ".json", result);
    }, "导出完成。此操作没有调用模型或提交训练。");
  const documents = data?.documents || [];
  const filtered = documents.filter(
    (d) =>
      (filter === "all" ||
        (filter === "missing" ? !d.pageCount : d.kind === filter)) &&
      [d.title, d.doi, d.publicationNumber, d.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const project = data?.project;
  const navigation = [
    { id: "library", name: "资料库", icon: BookOpen },
    { id: "sources", name: "数据源", icon: Link2 },
    { id: "jobs", name: "采集任务", icon: Clock3 },
    { id: "privacy", name: "权限与用途", icon: ShieldCheck },
  ];

  return (
    <div className="km-app">
      <aside className="km-sidebar">
        <Link
          className="km-brand"
          to={development ? "/knowledge" : "/workspace"}
        >
          <span className="km-brand-mark">E</span>
          <span>
            EliangMat AI<small>材料研发数据中心</small>
          </span>
        </Link>
        <div className="km-project-label">
          当前项目
          <button
            className="km-icon"
            aria-label="新建项目"
            disabled={busy || !overview}
            onClick={() => setModal("project")}
          >
            <Plus size={16} />
          </button>
        </div>
        <label className="km-project-select">
          <Folder size={16} />
          <select
            aria-label="当前项目"
            disabled={busy || !overview}
            value={projectId}
            onChange={(e) => {
              epoch.current++;
              setProjectId(e.target.value);
              setNotice("");
              setError("");
            }}
          >
            <option value="" disabled>
              选择或新建项目
            </option>
            {overview?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => setTab(n.id)}
            >
              <n.icon size={17} />
              {n.name}
              {n.id === "jobs" && Boolean(data?.jobs.length) && (
                <span className="km-nav-count">{data?.jobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="km-sidebar-note">
          <LockKeyhole size={15} />
          <div>
            {project?.mode === "contribute"
              ? "参与优化 · 逐份审核"
              : "默认私密"}
            <small>项目授权与内容许可分开管理</small>
          </div>
        </div>
        <div className="km-sidebar-bottom">
          <button
            onClick={() => setTab("guide")}
            className={tab === "guide" ? "active" : ""}
          >
            <HelpCircle size={17} />
            使用指南
            <ChevronRight size={14} />
          </button>
          {!development && (
            <Link to="/workspace">
              <ArrowLeft size={15} />
              返回研发工作台
            </Link>
          )}
        </div>
      </aside>
      <main className="km-main">
        <header className="km-topbar">
          <span>
            数据中心 <ChevronRight size={13} />{" "}
            {navigation.find((n) => n.id === tab)?.name || "使用指南"}
          </span>
          <div>
            {development && (
              <span className="km-dev-label">
                <span />
                开发环境 · 数据独立
              </span>
            )}
            {development ? (
              <select
                aria-label="测试账号"
                value={
                  overview?.account === "客户 B"
                    ? "B"
                    : overview?.account === "客户 A"
                      ? "A"
                      : ""
                }
                disabled={busy}
                onChange={(e) => switchAccount(e.target.value)}
              >
                <option value="" disabled>
                  选择测试账号
                </option>
                <option value="A">客户 A</option>
                <option value="B">客户 B</option>
              </select>
            ) : (
              <span>当前账号</span>
            )}
          </div>
        </header>
        {embedded && (
          <nav className="ep-knowledge-tabs">
            {navigation.map((n) => (
              <button
                key={n.id}
                className={tab === n.id ? "active" : ""}
                onClick={() => setTab(n.id)}
              >
                <n.icon size={15} />
                {n.name}
                {n.id === "jobs" && !!data?.jobs.length && (
                  <span>{data.jobs.length}</span>
                )}
              </button>
            ))}
          </nav>
        )}
        <div className="km-content">
          {error && (
            <div className="km-alert" role="alert">
              <span>{error}</span>
              <button
                className="km-icon"
                aria-label="关闭提示"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="km-notice" role="status">
              <CheckCircle2 size={16} />
              {notice}
            </div>
          )}
          {!overview ? (
            <div className="km-welcome">
              <span className="km-eyebrow">ELIANGMAT AI / KNOWLEDGE</span>
              <h1>从可信的数据开始。</h1>
              <p>文献、专利与材料证据，在同一个项目内管理。</p>
              {loading ? (
                <Loader2 className="km-spin" />
              ) : development ? (
                <div className="km-welcome-actions">
                  <button
                    className="km-primary"
                    disabled={busy}
                    onClick={() => switchAccount("A")}
                  >
                    以客户 A 开始测试
                    <ArrowRight size={16} />
                  </button>
                  <button disabled={busy} onClick={() => switchAccount("B")}>
                    客户 B
                  </button>
                </div>
              ) : (
                <button onClick={() => action(loadOverview)}>重新连接</button>
              )}
              <div className="km-welcome-foot">
                登录后管理本账号有权访问的项目与资料。
              </div>
            </div>
          ) : (
            <>
              <div className="km-heading">
                <div>
                  <div className="km-eyebrow">
                    {project?.name || "ELIANGMAT AI"}
                  </div>
                  <h1>
                    {tab === "library"
                      ? "文献与专利"
                      : tab === "sources"
                        ? "连接研发所需的数据"
                        : tab === "jobs"
                          ? "每一批数据，都有进度"
                          : tab === "privacy"
                            ? "数据由你决定用途"
                            : "资料使用指南"}
                  </h1>
                  <p>
                    {tab === "library"
                      ? "采集、溯源、复核，让资料成为可使用的材料证据。"
                      : tab === "sources"
                        ? "可采集、待配置与待授权的来源，在这里清楚区分。"
                        : tab === "jobs"
                          ? "保留原始响应与历史批次；重复采集会去重。"
                          : tab === "privacy"
                            ? "私密项目不进入公司模型训练。参与优化仍需核对每份内容的许可。"
                            : "管理资料来源、证据复核与数据使用范围。"}
                  </p>
                </div>
                {tab === "library" && projectId && (
                  <div className="km-heading-actions">
                    <button disabled={busy} onClick={() => setModal("import")}>
                      <Upload size={15} />
                      导入文件
                    </button>
                    <button
                      className="km-primary"
                      disabled={busy}
                      onClick={() => setModal("collect")}
                    >
                      <Plus size={16} />
                      采集文献
                    </button>
                  </div>
                )}
              </div>
              {tab === "library" && (
                <>
                  <div className="km-stats">
                    {[
                      {
                        label: "入库资料",
                        value: documents.length,
                        note:
                          documents.filter((d) => d.kind === "paper").length +
                          " 篇文献 · " +
                          documents.filter((d) => d.kind === "patent").length +
                          " 份专利",
                      },
                      {
                        label: "已有正文",
                        value: documents.filter((d) => d.pageCount).length,
                        note: "PDF / TXT / JSONL 正文",
                      },
                      {
                        label: "已复核证据",
                        value: documents.reduce(
                          (n, d) => n + d.reviewedCount,
                          0,
                        ),
                        note: "带原文与页码的材料数据",
                      },
                      {
                        label: "待补齐全文",
                        value: documents.filter((d) => !d.pageCount).length,
                        note: "可导出缺口清单",
                      },
                    ].map((s) => (
                      <div key={s.label}>
                        <span>{s.label}</span>
                        <strong>
                          {s.value}
                          <small>条</small>
                        </strong>
                        <p>{s.note}</p>
                      </div>
                    ))}
                  </div>
                  {!projectId ? (
                    <div className="km-first-project">
                      <Folder size={24} />
                      <h3>创建第一个材料研发项目</h3>
                      <p>
                        项目会以私密模式开始。之后可以采集文献或导入专利资料。
                      </p>
                      <button
                        className="km-primary"
                        onClick={() => setModal("project")}
                      >
                        <Plus size={16} />
                        新建项目
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="km-library-tools">
                        <div className="km-filters">
                          {[
                            ["all", "全部资料"],
                            ["paper", "文献"],
                            ["patent", "专利"],
                            ["missing", "缺少正文"],
                          ].map(([id, label]) => (
                            <button
                              key={id}
                              className={filter === id ? "active" : ""}
                              onClick={() => setFilter(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <label className="km-search">
                          <Search size={15} />
                          <input
                            aria-label="搜索已入库资料"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="搜索标题、DOI、公开号"
                          />
                        </label>
                      </div>
                      <div className="km-catalog">
                        <div className="km-table-head">
                          <span>资料 / 来源</span>
                          <span>正文与证据</span>
                          <span>用途权限</span>
                        </div>
                        {filtered.length ? (
                          filtered.map((d) => (
                            <button
                              disabled={busy}
                              className="km-document"
                              key={d.id}
                              onClick={() => openDetail(d.id)}
                            >
                              <div className="km-doc-name">
                                <span className="km-doc-icon">
                                  {d.kind === "paper" ? (
                                    <FileText size={18} />
                                  ) : (
                                    <ShieldCheck size={18} />
                                  )}
                                </span>
                                <div>
                                  <h3>{d.title}</h3>
                                  <p>
                                    <span>
                                      {d.kind === "paper" ? "文献" : "专利"}
                                    </span>
                                    {d.demo && (
                                      <span className="km-demo-tag">
                                        测试样例
                                      </span>
                                    )}
                                    <span>
                                      {d.year || "年份未提供"} ·{" "}
                                      {documentTypeName(d.documentType)}
                                    </span>
                                    <span>
                                      {[
                                        ...new Set(
                                          d.versions.map((v) => v.source),
                                        ),
                                      ].join(" · ")}
                                    </span>
                                  </p>
                                  <small>{d.doi || d.publicationNumber}</small>
                                </div>
                              </div>
                              <div className="km-doc-progress">
                                {d.pageCount ? (
                                  <>
                                    <strong>
                                      <Check size={14} />
                                      正文已入库
                                    </strong>
                                    <small>
                                      {d.pageCount} 页 · {d.reviewedCount}/
                                      {d.evidenceCount} 条证据已复核
                                    </small>
                                  </>
                                ) : (
                                  <>
                                    <span>
                                      <Clock3 size={14} />
                                      等待全文
                                    </span>
                                    <small>
                                      {d.fulltextLocations.length
                                        ? "已找到全文位置"
                                        : "当前仅有题录"}
                                    </small>
                                  </>
                                )}
                              </div>
                              <div className="km-doc-rights">
                                <span>
                                  {d.rights.rag
                                    ? "可用于项目检索"
                                    : "正文用途待确认"}
                                </span>
                                <small>
                                  {d.training.allowed
                                    ? "训练候选可导出"
                                    : project?.mode === "private"
                                      ? "私密 · 不参与训练"
                                      : "训练候选待审核"}
                                </small>
                                <ChevronRight size={16} />
                              </div>
                            </button>
                          ))
                        ) : (
                          <Empty
                            title={
                              documents.length
                                ? "没有匹配的资料"
                                : "资料库准备好了"
                            }
                          >
                            {documents.length
                              ? "试试其他关键词或切换筛选条件。"
                              : "从真实文献采集开始，或导入一份带来源信息的专利 JSONL 文件。"}
                          </Empty>
                        )}
                      </div>
                      <div className="km-table-footer">
                        <span>
                          {filtered.length} 条结果 · 数据来源与用途可逐份查看
                        </span>
                        <button
                          disabled={busy || !documents.length}
                          onClick={() => exportData("catalog")}
                        >
                          <ArrowDownToLine size={14} />
                          导出题录
                        </button>
                        <button
                          disabled={busy || !documents.length}
                          onClick={() => exportData("gaps")}
                        >
                          导出全文缺口
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              {tab === "sources" && (
                <>
                  <div className="km-subtle-banner">
                    <Database size={18} />
                    <p>
                      本版采集公开题录与已授权文件。全球批量快照、专利机构原始包、自动模型抽取将在数据授权和存储扩容后接入。
                    </p>
                  </div>
                  <div className="km-sources">
                    {overview.sources.map((s) => (
                      <div key={s.id} className="km-source">
                        <div className="km-source-logo">{s.name[0]}</div>
                        <div>
                          <div className="km-source-title">
                            <h3>{s.name}</h3>
                            <span className={"km-source-state " + s.state}>
                              {
                                (
                                  {
                                    ready: "可使用",
                                    configuration: "待配置",
                                    license: "待开通",
                                    planned: "待开放",
                                  } as Record<string, string>
                                )[s.state]
                              }
                            </span>
                          </div>
                          <p>{s.description}</p>
                          <small>{s.kind}</small>
                        </div>
                        <div className="km-source-action">
                          {s.action === "search" ? (
                            <button
                              disabled={!projectId || busy}
                              onClick={() => {
                                setSource(s.id);
                                setModal("collect");
                              }}
                            >
                              采集
                              <ArrowRight size={14} />
                            </button>
                          ) : s.action === "import" ? (
                            <button
                              disabled={!projectId || busy}
                              onClick={() => setModal("import")}
                            >
                              导入
                              <Upload size={14} />
                            </button>
                          ) : (
                            s.url && (
                              <a href={s.url} target="_blank" rel="noreferrer">
                                官方说明
                                <ExternalLink size={13} />
                              </a>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="km-footnote">
                    “可使用”表示已实现接入能力。网络、额度或账户错误会显示在采集任务中。
                  </p>
                </>
              )}
              {tab === "jobs" && (
                <div className="km-jobs">
                  {data?.jobs.length ? (
                    data.jobs.map((j) => (
                      <div key={j.id} className="km-job">
                        <div className="km-job-top">
                          <span className="km-job-symbol">
                            {j.status === "completed" ? (
                              <CheckCircle2 size={20} />
                            ) : (
                              <Clock3 size={20} />
                            )}
                          </span>
                          <div>
                            <h3>{j.query}</h3>
                            <p>
                              {j.source} · {date(j.createdAt)}
                            </p>
                          </div>
                          <Status job={j} />
                        </div>
                        <div className="km-job-stages">
                          {[
                            "创建任务",
                            "获取原始数据",
                            "去重与入库",
                            "批次完成",
                          ].map((stage, i) => (
                            <span
                              key={stage}
                              className={
                                j.status === "completed" ||
                                i === 0 ||
                                (i === 1 && j.received > 0)
                                  ? "done"
                                  : ""
                              }
                            >
                              {j.status === "completed" || i === 0 ? (
                                <Check size={12} />
                              ) : (
                                <Circle size={11} />
                              )}
                              {stage}
                            </span>
                          ))}
                        </div>
                        <div className="km-job-counts">
                          <span>
                            收到 <b>{j.received}</b>
                          </span>
                          <span>
                            新增 <b>{j.added}</b>
                          </span>
                          <span>
                            更新 <b>{j.updated}</b>
                          </span>
                          <span>
                            重复 <b>{j.unchanged}</b>
                          </span>
                          <span>
                            失败 <b>{j.rejected}</b>
                          </span>
                          {j.total != null && (
                            <small>
                              上游检索计数 {j.total.toLocaleString()}{" "}
                              条（非有效证据数），本批过滤 {j.filtered || 0}{" "}
                              条，仅采集本批
                            </small>
                          )}
                        </div>
                        {j.error && <p className="km-job-error">{j.error}</p>}
                        {j.errors?.length > 0 && (
                          <details>
                            <summary>查看 {j.errors.length} 条失败原因</summary>
                            {j.errors.map((e) => (
                              <p key={e.item}>
                                第 {e.item} 条：{e.message}
                              </p>
                            ))}
                          </details>
                        )}
                        <div className="km-job-actions">
                          {!["running", "queued"].includes(j.status) && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                action(
                                  () =>
                                    api(pbase + "/jobs/" + j.id + "/retry", {}),
                                  "已创建重试批次；重复数据会自动去重。",
                                )
                              }
                            >
                              重新采集本批
                            </button>
                          )}
                          {j.nextCursor && j.status === "completed" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                action(
                                  () =>
                                    api(pbase + "/jobs/" + j.id + "/retry", {
                                      next: true,
                                    }),
                                  "已开始下一批采集。",
                                )
                              }
                            >
                              继续下一批
                              <ArrowRight size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty title="还没有采集任务">
                      采集或导入后，可在这里查看进度和失败原因。
                    </Empty>
                  )}
                </div>
              )}
              {tab === "privacy" && (
                <>
                  {project ? (
                    <>
                      <div className="km-privacy-card">
                        <div>
                          <LockKeyhole size={22} />
                          <h2>项目数据模式</h2>
                          <p>
                            当前设置仅作用于「{project.name}
                            」。不会自动公开项目文件。
                          </p>
                        </div>
                        <div className="km-mode-options">
                          <button
                            disabled={busy}
                            className={
                              project.mode === "private" ? "selected" : ""
                            }
                            onClick={() =>
                              action(async () => {
                                await api(
                                  pbase + "/privacy",
                                  { mode: "private" },
                                  "PATCH",
                                );
                                await loadOverview();
                              }, "项目已设为私密，后续训练候选导出已关闭。")
                            }
                          >
                            <span>
                              <LockKeyhole size={18} />
                              <b>私密</b>
                              {project.mode === "private" && (
                                <CheckCircle2 size={17} />
                              )}
                            </span>
                            <p>
                              仅在当前账号的项目内使用。禁止导出到公司模型训练候选。
                            </p>
                          </button>
                          <button
                            disabled={busy}
                            className={
                              project.mode === "contribute" ? "selected" : ""
                            }
                            onClick={() => setModal("consent")}
                          >
                            <span>
                              <FlaskConical size={18} />
                              <b>参与模型优化</b>
                              {project.mode === "contribute" && (
                                <CheckCircle2 size={17} />
                              )}
                            </span>
                            <p>
                              经你明确授权，并通过内容许可与材料证据复核后，才可导出候选。
                            </p>
                          </button>
                        </div>
                      </div>
                      <div className="km-rights-explanation">
                        <h2>三道条件，分别确认</h2>
                        <div>
                          <span>01</span>
                          <p>
                            <b>项目授权</b>客户选择是否参与公司模型优化。
                          </p>
                          <span>
                            {project.mode === "private" ? "私密模式" : "已授权"}
                          </span>
                        </div>
                        <div>
                          <span>02</span>
                          <p>
                            <b>内容许可</b>
                            逐份填写合同、开放许可或自有内容依据；网页可访问不等于可训练。
                          </p>
                          <span>
                            {documents.filter((d) => d.rights.training).length}{" "}
                            份已声明
                          </span>
                        </div>
                        <div>
                          <span>03</span>
                          <p>
                            <b>证据复核</b>
                            区分实测、仿真、实施例与权利要求，核对原文和条件。
                          </p>
                          <span>
                            {documents.filter((d) => d.training.allowed).length}{" "}
                            份符合条件
                          </span>
                        </div>
                        <div className="km-export-actions">
                          <button
                            disabled={busy}
                            onClick={() => exportData("rag")}
                          >
                            <ArrowDownToLine size={15} />
                            导出项目检索证据
                          </button>
                          <button
                            disabled={busy || project.mode === "private"}
                            onClick={() => exportData("training")}
                          >
                            <ArrowDownToLine size={15} />
                            导出训练候选
                          </button>
                        </div>
                        <p className="km-footnote">
                          候选文件仅下载到本机；模型训练服务待开放。撤回授权会阻止后续导出，已下载的副本不会自动收回。
                        </p>
                      </div>
                      <div className="km-audit">
                        <h2>操作记录</h2>
                        {data?.audit.length ? (
                          data.audit.map((a) => (
                            <div key={a.id}>
                              <span>{date(a.at)}</span>
                              <p>{a.action}</p>
                            </div>
                          ))
                        ) : (
                          <p className="km-footnote">
                            切换模式、用途许可、复核与导出会记录在这里。
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <Empty title="请先选择项目">
                      每个项目默认私密，单独管理授权。
                    </Empty>
                  )}
                </>
              )}
              {tab === "guide" && (
                <div className="km-guide">
                  {[
                    [
                      "01",
                      "采集与导入",
                      "按项目研究问题检索文献，或导入有权使用的专利 JSONL。题录保留来源链接，相同资料自动去重。",
                    ],
                    [
                      "02",
                      "原文与证据",
                      "上传 PDF / TXT 原文，按页码摘录材料证据，记录成分、数值、单位及试验条件。",
                    ],
                    [
                      "03",
                      "质量复核",
                      "核对原始出处及材料相关性，区分实测结果、仿真预测和专利权利要求，复核后再用于研究。",
                    ],
                    [
                      "04",
                      "数据使用范围",
                      "项目默认私密。参与优化须由所有者明确选择，并逐份核对许可；导出候选不会自动启动训练。",
                    ],
                  ].map(([n, title, body]) => (
                    <div key={n}>
                      <span>{n}</span>
                      <section>
                        <h3>{title}</h3>
                        <p>{body}</p>
                      </section>
                    </div>
                  ))}
                  <div className="km-guide-note">
                    <h3>导入格式与容量</h3>
                    <p>
                      支持 PDF / TXT 原文与 JSONL 题录。单份文件最多 5
                      MB，单批最多 500 条 JSONL，当前空间最多 3,000 条资料。
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="km-bottom">
          EliangMat AI <span>来源可追溯 · 用途可控制 · 证据可复核</span>
          {busy && (
            <span>
              <Loader2 size={13} className="km-spin" />
              处理中
            </span>
          )}
        </footer>
      </main>

      {modal === "project" && (
        <Modal title="新建研发项目" close={() => !busy && setModal("")}>
          <form
            className="km-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              action(async () => {
                const p = await api<{ id: string }>(base + "/projects", {
                  name: form.get("name"),
                });
                await loadOverview();
                setProjectId(p.id);
                setTab("library");
                setModal("");
              }, "项目已创建，默认私密。");
            }}
          >
            <label>
              项目名称
              <input
                autoFocus
                required
                name="name"
                maxLength={100}
                placeholder="例如：高温合金研发"
              />
            </label>
            <div className="km-form-note">
              <LockKeyhole size={16} />
              默认私密。你可以在权限与用途中修改。
            </div>
            <FormError error={error} />
            <button disabled={busy} className="km-primary">
              创建项目
              <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "collect" && (
        <Modal title="采集文献" close={() => !busy && setModal("")}>
          <form
            className="km-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              action(async () => {
                await api(pbase + "/search", {
                  source,
                  query: form.get("query"),
                  limit: Number(form.get("limit")),
                  since: form.get("since"),
                  documentType: form.get("documentType"),
                  yearFrom: form.get("yearFrom"),
                  yearTo: form.get("yearTo"),
                  requiredTerms: form.get("requiredTerms"),
                });
                setModal("");
                setTab("jobs");
              }, "采集已开始。");
            }}
          >
            <label>
              数据来源
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="crossref">Crossref · DOI 题录</option>
                <option value="openalex">OpenAlex · 学术索引</option>
              </select>
            </label>
            <label>
              材料 / 研发主题
              <input
                name="query"
                required
                maxLength={300}
                defaultValue={data?.suggestedQuery || ""}
              />
            </label>
            <label>
              文献类型
              <select name="documentType" defaultValue="journal-article">
                <option value="journal-article">期刊论文</option>
                <option value="posted-content">预印本 / 发布内容</option>
                <option value="all">全部类型（包含审稿记录）</option>
              </select>
            </label>
            <div className="km-form-grid">
              <label>
                发表年份起
                <input name="yearFrom" type="number" min="1800" max="2100" />
              </label>
              <label>
                发表年份止
                <input name="yearTo" type="number" min="1800" max="2100" />
              </label>
            </div>
            <label>
              题名或摘要必须包含的关键词（可选）
              <input
                name="requiredTerms"
                placeholder="用空格分隔，如 aluminum tensile"
              />
              <small>逐词文本过滤，不能替代材料体系与工况的人工核对。</small>
            </label>
            <div className="km-form-grid">
              <label>
                本批数量
                <select name="limit" defaultValue="10">
                  <option value="5">5 条</option>
                  <option value="10">10 条</option>
                  <option value="25">25 条</option>
                  <option value="50">50 条</option>
                </select>
              </label>
              <label>
                {source === "crossref"
                  ? "索引更新起始日期（可选）"
                  : "发表起始日期（可选）"}
                <input type="date" name="since" />
              </label>
            </div>
            <p className="km-footnote">
              本次只采集选定数量的元数据。下一批可在任务详情继续；全文与用途许可单独处理。
            </p>
            <FormError error={error} />
            <button className="km-primary" disabled={busy}>
              开始采集
              <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="导入文献与专利文件" close={() => !busy && setModal("")}>
          <form
            className="km-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              action(async () => {
                await api(pbase + "/import", form);
                setModal("");
                setTab("jobs");
              }, "文件校验通过，开始入库。");
            }}
          >
            <p>
              支持标准 JSONL，每行一条文献或专利，最多 500 行 / 5
              MB。包含来源、标识符，可附带正文页码与材料证据。
            </p>
            <label className="km-file-input">
              <Upload size={22} />
              选择 JSONL 文件
              <input required type="file" name="file" accept=".jsonl,.ndjson" />
            </label>
            {development && (
              <a
                href="/api/knowledge-dev/sample"
                download
                className="km-text-link"
              >
                下载带材料证据的测试样例
                <ArrowDownToLine size={14} />
              </a>
            )}
            <label className="km-checkbox">
              <input
                required
                type="checkbox"
                name="storageConsent"
                value="true"
              />
              <span>
                我有权将该文件上传、存储并在本项目中处理。检索与训练用途另行确认。
              </span>
            </label>
            <FormError error={error} />
            <button className="km-primary" disabled={busy}>
              校验并导入
              <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "consent" && (
        <Modal title="授权项目参与模型优化" close={() => !busy && setModal("")}>
          <form
            className="km-form"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api(
                  pbase + "/privacy",
                  { mode: "contribute", consent: true },
                  "PATCH",
                );
                await loadOverview();
                setModal("");
              }, "已记录项目授权。内容许可和证据仍需逐份复核。");
            }}
          >
            <p>
              你将允许「{project?.name}」中符合许可与质量要求的资料进入
              EliangMat AI
              的模型优化候选。第三方文献和专利不会因这项授权自动获得训练使用权。
            </p>
            <label className="km-checkbox">
              <input type="checkbox" required />
              <span>
                我明确同意该项目参与公司模型优化，并了解仍需逐份确认内容许可。可以随时切回私密，阻止后续候选导出。
              </span>
            </label>
            <p className="km-footnote">
              候选导出不触发训练。撤回授权会阻止后续导出，已下载文件需另行管理。
            </p>
            <FormError error={error} />
            <button className="km-primary" disabled={busy}>
              确认授权
            </button>
          </form>
        </Modal>
      )}
      {modal === "detail" && detail && (
        <Modal
          title={detail.kind === "paper" ? "文献详情" : "专利详情"}
          wide
          close={() => !busy && setModal("")}
        >
          <DocumentDetail
            document={detail}
            busy={busy}
            error={error}
            development={development}
            onUpdate={(work) =>
              action(async () => {
                await work();
                setDetail(
                  await api<DocumentRecord>(pbase + "/documents/" + detail.id),
                );
              })
            }
            path={pbase + "/documents/" + detail.id}
          />
        </Modal>
      )}
    </div>
  );
}
function FormError({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="km-form-error">
      {error}
    </div>
  ) : null;
}

function DocumentDetail({
  document: d,
  busy,
  error,
  onUpdate,
  path,
}: {
  document: DocumentRecord;
  busy: boolean;
  error: string;
  development: boolean;
  onUpdate: (work: () => Promise<unknown>) => void;
  path: string;
}) {
  const [tab, setTab] = useState("evidence");
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(d.pages?.[0]?.page || 1);
  const [uploading, setUploading] = useState(false);
  const [rag, setRag] = useState(d.rights.rag);
  const [training, setTraining] = useState(d.rights.training);
  useEffect(() => {
    setRag(d.rights.rag);
    setTraining(d.rights.training);
  }, [d.rights.rag, d.rights.training]);
  const original = (rawHash: string) =>
    onUpdate(async () => {
      const headers = !PLATFORM_APP
        ? { Authorization: "Bearer " + localStorage.getItem("vasp_token") }
        : undefined;
      const response = await fetch(path + "/original/" + rawHash, { headers });
      if (!response.ok) throw new Error("原始文件不可访问");
      const url = URL.createObjectURL(await response.blob());
      const a = window.document.createElement("a");
      a.href = url;
      a.download = "EliangMat_AI_original_" + rawHash.slice(0, 12);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <div className="km-detail">
      <div className="km-detail-title">
        {d.demo && (
          <span className="km-demo-tag">
            虚构测试样例 · 禁止用于真实研发与模型训练
          </span>
        )}
        <h2>{d.title}</h2>
        <p>
          <p>
            {d.documentType === "peer-review"
              ? "审稿记录（不可当作原论文）"
              : documentTypeName(d.documentType)}{" "}
            · {d.screening || "待核对材料相关性"}
          </p>
          {d.sourceRelations?.map((r, i) => (
            <p key={i}>
              {r.relation}：{r.identifier}
            </p>
          ))}
          {d.authors.join(" · ") || "作者未提供"} · {d.year || "年份未提供"}
        </p>
        <div>
          <code>{d.doi || d.publicationNumber}</code>
          {d.url && (
            <a href={d.url} target="_blank" rel="noreferrer">
              查看来源
              <ExternalLink size={13} />
            </a>
          )}
        </div>
        {d.familyId && (
          <p>专利族：{d.familyId}（同族文献分别保存，不合并权利要求）</p>
        )}
      </div>
      <div className="km-detail-tabs">
        {[
          ["evidence", "材料证据"],
          ["text", "正文与摘要"],
          ["rights", "使用许可"],
          ["provenance", "来源与版本"],
        ].map(([id, name]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <FormError error={error} />
      {tab === "evidence" && (
        <>
          <div className="km-detail-toolbar">
            <p>证据需要原文、页码与人工复核</p>
            <button
              disabled={busy || !d.pages?.length}
              onClick={() => setAdding(!adding)}
            >
              <Plus size={14} />
              添加证据
            </button>
          </div>
          {adding && (
            <EvidenceForm
              pages={d.pages || []}
              busy={busy}
              submit={(input) =>
                onUpdate(async () => {
                  await api(path + "/evidence", input);
                  setAdding(false);
                })
              }
            />
          )}
          {d.evidence?.length ? (
            d.evidence.map((e) => (
              <div className="km-evidence" key={e.id}>
                <div className="km-evidence-top">
                  <span>{kinds[e.kind]}</span>
                  <span>第 {e.page} 页</span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      onUpdate(() =>
                        api(
                          path + "/evidence/" + e.id,
                          { reviewed: !e.reviewed },
                          "PATCH",
                        ),
                      )
                    }
                  >
                    {e.reviewed ? (
                      <>
                        <CheckCircle2 size={14} />
                        已复核 · 撤销
                      </>
                    ) : (
                      "确认复核"
                    )}
                  </button>
                </div>
                <h3>
                  {e.material || "材料未标注"}{" "}
                  {e.property && " / " + e.property}
                </h3>
                <dl>
                  <dt>成分</dt>
                  <dd>
                    {e.composition || "未提取"}
                    {e.composition &&
                      " · " +
                        (e.basis === "unspecified"
                          ? "计量基准未注明"
                          : e.basis)}
                  </dd>
                  <dt>工艺</dt>
                  <dd>{e.process || "未提取"}</dd>
                  <dt>结果</dt>
                  <dd>
                    {[e.value, e.unit].filter(Boolean).join(" ") || "未提取"}
                  </dd>
                  <dt>条件</dt>
                  <dd>{e.conditions || "未注明，请回看原文"}</dd>
                </dl>
                <blockquote>{e.quote}</blockquote>
                <p className="km-footnote">
                  请核对数值、单位、样品与测试条件，不要将权利要求范围当作实测结果。
                </p>
              </div>
            ))
          ) : (
            <Empty title="还没有结构化材料证据">
              上传正文后可以摘录带页码的证据，或导入带 evidence 字段的
              JSONL。本版使用人工复核。
            </Empty>
          )}
        </>
      )}
      {tab === "text" && (
        <>
          <div className="km-detail-toolbar">
            <p>{d.pages?.length || 0} 页正文已入库</p>
            <button disabled={busy} onClick={() => setUploading(!uploading)}>
              <Upload size={14} />
              {d.pages?.length ? "替换正文" : "上传正文"}
            </button>
          </div>
          {uploading && (
            <form
              className="km-form km-inset"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                onUpdate(async () => {
                  await api(path + "/content", form);
                  setUploading(false);
                  setPage(1);
                });
              }}
            >
              <label>
                PDF / TXT（最多 5 MB）
                <input required type="file" accept=".pdf,.txt" name="file" />
              </label>
              <label className="km-checkbox">
                <input
                  type="checkbox"
                  required
                  name="storageConsent"
                  value="true"
                />
                <span>
                  我有权存储并处理该正文。替换正文会清空旧证据并重置用途许可，需要重新复核。
                </span>
              </label>
              <button disabled={busy} className="km-primary">
                {busy ? "正在解析…" : "上传并解析"}
              </button>
            </form>
          )}
          {d.pages?.length ? (
            <>
              <label className="km-page-select">
                正文页码
                <select
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
                >
                  {d.pages.map((p) => (
                    <option key={p.page} value={p.page}>
                      第 {p.page} 页
                    </option>
                  ))}
                </select>
              </label>
              <pre className="km-page-text">
                {d.pages.find((p) => p.page === page)?.text || d.pages[0].text}
              </pre>
            </>
          ) : (
            <p className="km-footnote">
              尚无正文。外部链接和元数据不代表全文已入库。
            </p>
          )}
          {d.abstract && (
            <div className="km-abstract">
              <h3>来源摘要</h3>
              <p>{d.abstract}</p>
              <small>保留来源文本，不自动授权检索或训练。</small>
            </div>
          )}
          <div className="km-locations">
            <h3>全文位置</h3>
            <button
              disabled={busy || !d.doi}
              onClick={() => onUpdate(() => api(path + "/locate", {}))}
            >
              通过 Unpaywall 查找
              <ExternalLink size={13} />
            </button>
            {d.fulltextLocations.map((l, i) => (
              <div key={i}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  打开来源 {i + 1}
                  <ExternalLink size={12} />
                </a>
                <p>
                  {l.version || "版本未注明"} · {l.license || "许可未注明"}
                </p>
              </div>
            ))}
            <p className="km-footnote">
              不会自动下载外部链接。使用许可必须与实际取得的正文版本一致。
            </p>
          </div>
        </>
      )}
      {tab === "rights" && (
        <form
          className="km-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            onUpdate(() =>
              api(
                path + "/rights",
                { rag, training, basis: form.get("basis"), confirm: true },
                "PATCH",
              ),
            );
          }}
        >
          <div className="km-form-note">
            <ShieldCheck size={18} />
            <span>{d.training.reason}</span>
          </div>
          <div className="km-locations">
            <h3>来源声明的许可</h3>
            {d.licenses.length ? (
              d.licenses.map((license, index) => (
                <div key={index}>
                  {license.url ? (
                    <a href={license.url} target="_blank" rel="noreferrer">
                      查看许可条款
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span>{license.label || "许可未注明"}</span>
                  )}
                  <p>{license.scope}</p>
                </div>
              ))
            ) : (
              <p>来源未提供许可信息。</p>
            )}
            <p className="km-footnote">
              请核对是否适用于本次入库的正文版本及拟使用的用途。
            </p>
          </div>
          <label>
            具体授权依据
            <textarea
              name="basis"
              required
              minLength={8}
              maxLength={2000}
              defaultValue={d.rights.basis}
              placeholder="例如：企业自有实验记录；或具体合同条款、许可证 URL、内容版本与授权范围。"
            />
          </label>
          <label className="km-checkbox">
            <input
              type="checkbox"
              checked={rag}
              disabled={!d.pages?.length}
              onChange={(e) => setRag(e.target.checked)}
            />
            <span>允许此正文的已复核证据用于项目检索（RAG）</span>
          </label>
          <label className="km-checkbox">
            <input
              type="checkbox"
              checked={training}
              disabled={!d.pages?.length}
              onChange={(e) => setTraining(e.target.checked)}
            />
            <span>已确认此正文及派生证据具有公司模型训练使用权</span>
          </label>
          <label className="km-checkbox">
            <input type="checkbox" required />
            <span>
              我有权作出以上声明，已核对具体正文版本和用途范围。系统会记录这次声明。
            </span>
          </label>
          <p className="km-footnote">
            这里记录使用权声明，不替代机构授权核验。元数据中的开放标签不会自动开启正文用途。
          </p>
          <button disabled={busy} className="km-primary">
            保存用途许可
          </button>
        </form>
      )}
      {tab === "provenance" && (
        <div className="km-provenance">
          <p>
            保留每次采集的原始批次。相同资料的新来源与版本不会覆盖已复核正文。
          </p>
          {d.versions.map((v, i) => (
            <div key={v.hash + i}>
              <div>
                <h3>{v.source}</h3>
                <span>{date(v.at)}</span>
              </div>
              <p>{v.sourceId}</p>
              <code>SHA-256 {v.hash}</code>
              <button disabled={busy} onClick={() => original(v.rawHash)}>
                <ArrowDownToLine size={14} />
                下载原始批次 / 文件
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceForm({
  pages,
  busy,
  submit,
}: {
  pages: { page: number; text: string }[];
  busy: boolean;
  submit: (input: Record<string, FormDataEntryValue>) => void;
}) {
  const [page, setPage] = useState(pages[0]?.page || 1);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(Object.fromEntries(new FormData(e.currentTarget).entries()));
  };
  return (
    <form className="km-form km-inset" onSubmit={onSubmit}>
      <div className="km-form-grid">
        <label>
          证据类型
          <select name="kind">
            {Object.entries(kinds).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          引用页码
          <select
            name="page"
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {pages.map((p) => (
              <option key={p.page} value={p.page}>
                {p.page}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>查看所选页原文</summary>
        <pre className="km-page-text">
          {pages.find((p) => p.page === page)?.text}
        </pre>
      </details>
      <label>
        原文引用（从该页复制）
        <textarea name="quote" required maxLength={4000} />
      </label>
      <div className="km-form-grid">
        <label>
          材料
          <input name="material" />
        </label>
        <label>
          成分基准
          <select name="basis">
            <option value="unspecified">原文未注明</option>
            <option value="wt%">wt%</option>
            <option value="at%">at%</option>
          </select>
        </label>
      </div>
      <label>
        成分
        <input
          name="composition"
          placeholder="保留原文数值，勿混用质量与原子百分比"
        />
      </label>
      <label>
        工艺
        <input name="process" />
      </label>
      <div className="km-form-grid km-three">
        <label>
          性能
          <input name="property" />
        </label>
        <label>
          数值
          <input name="value" />
        </label>
        <label>
          单位
          <input name="unit" />
        </label>
      </div>
      <label>
        测试 / 仿真条件
        <input name="conditions" />
      </label>
      <button className="km-primary" disabled={busy}>
        保存待复核证据
      </button>
    </form>
  );
}
