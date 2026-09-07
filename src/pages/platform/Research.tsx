import { SANDBOX } from "./product-mode";
import { ReplyActivity, LiveReply } from "./ReplyActivity";
import { useReplyStream } from "./useReplyStream";
import { Square } from "lucide-react";
import { ModelCallMeta, MessageText } from "./ModelCall";
import {
  RequirementsFields,
  MeasurementFields,
  RawFileField,
  TaskDefinition,
  CurvePreview,
} from "./ResearchFields";
import type { RawFile } from "./ResearchFields";
import { MemoryCitations } from "./Memory";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  FlaskConical,
  LockKeyhole,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { usePlatform } from "./context";
import { platformApi, saveJson, time } from "./api";
import { Badge, Dialog, Empty, ErrorNote } from "./ui";

const tabs = [
  ["", "协作"],
  ["plan", "研究计划"],
  ["candidates", "候选材料"],
  ["experiments", "实验与样品"],
  ["results", "结果"],
  ["settings/privacy", "项目设置"],
];
const methods = [
  ["dft", "DFT", "形成能、缺陷或元素替位需要原子尺度解释时"],
  ["md", "分子动力学", "需要研究扩散、界面或局部变形机制时"],
  ["cfd", "流体与传热", "熔体流动、凝固或温度场影响制备工艺时"],
];
export default function Research({
  createDemo,
}: {
  createDemo: () => unknown;
}) {
  const {
    overview: o,
    projectData,
    projectId,
    busy,
    action,
    error,
    openNew,
  } = usePlatform();
  const stream = useReplyStream(projectId);
  const [editId, setEditId] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [artifact, setArtifact] = useState<RawFile | null>(null);
  const [executionNote, setExecutionNote] = useState("");
  const [modal, setModal] = useState(""),
    [taskId, setTaskId] = useState(""),
    [message, setMessage] = useState("");
  const location = useLocation(),
    navigate = useNavigate(),
    section = location.pathname.split("/")[2] || "";
  const w = projectData?.workflow,
    p = projectData?.project,
    base = "/api/platform/projects/" + projectId;
  const nextReady = w?.nextRoundReadiness;
  const selectedModel = o.models.find((m) => m.id === o.projectModels[projectId]);
  const close = () => {
    if (!busy) {
      setModal("");
      if (section === "review") navigate("/workspace");
    }
  };
  const run = async (
    path: string,
    body?: unknown,
    method?: string,
    notice = "",
  ) => {
    const ok = await action(
      () => platformApi(base + path, body, method),
      notice,
    );
    if (ok) {
      setModal("");
      setEditId("");
      setArtifact(null);
      if (section === "review") navigate("/workspace/results");
    }
    return ok;
  };
  const form = (el: HTMLFormElement) => Object.fromEntries(new FormData(el));
  async function sendMessage(continueFrom?: string) {
    const prompt = continueFrom ? "继续上一条未完成的回复，从断点接着写，优先补齐所需清单或方案，不重复已写内容，也不要重新回答历史问题。" : message.trim();
    if (!prompt || busy) return;
    if (!continueFrom) setMessage("");
    let completed = false;
    const ok = await action(async () => {
      completed = !!(await stream.send(base + "/messages", {message: prompt, continueFrom}));
    });
    if (ok && completed) stream.clear();
    if (!ok && !continueFrom) setMessage(prompt);
  }
  if (section === "memory") return <Navigate to="/account/memory" replace />;
  if (!w)
    return (
      <div className="ep-page ep-onboarding">
        <div className="ep-eyebrow">从研究目标开始</div>
        <h1>{p ? "为这个项目建立研究路线" : "材料研发，围绕一个目标协作。"}</h1>
        <p>
          把候选材料、仿真、实验与证据串联起来，每一步都有明确的状态和下一步。
        </p>
        {p ? (
          <form
            className="ep-form ep-panel"
            onSubmit={(e) => {
              e.preventDefault();
              run("/initialize", form(e.currentTarget));
            }}
          >
            <label>
              目标与约束
              <textarea
                name="goal"
                minLength={8}
                required
                placeholder="材料体系、性能目标、工况和样品预算"
              />
            </label>
            <button className="ep-primary" disabled={busy}>
              建立研究计划
              <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <button className="ep-primary" onClick={() => openNew()}>
            新建研究
            <Plus size={16} />
          </button>
        )}
        {SANDBOX && (
          <div className="ep-demo-entry">
            <FlaskConical size={22} />
            <div>
              <h3>先体验一轮高强铝合金研究</h3>
              <p>包含已完成的筛选与拉伸、暂停的表征，以及等待你复核的结果。</p>
              <small>独立演练项目，含明确标记的虚构数据。</small>
            </div>
            <button disabled={busy} onClick={createDemo}>
              创建演练项目
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    );
  const task = w.tasks.find((t) => t.id === taskId),
    done = w.tasks.filter((t) => t.status === "completed").length;
  const reviewRecord =
    w.observations.find((r) => r.id === reviewId) || w.result;
  const editCandidate = w.candidates.find((c) => c.id === editId),
    editSample = w.samples.find((s) => s.id === editId);
  const needsReview = (modal === "review" || section === "review") && w.result;
  const openTask = (id: string) => {
    if (id === "review") {
      if (!w.result) {
        navigate("/workspace/experiments");
        return;
      }
      setModal("review");
      return;
    }
    if (id === "learn") {
      navigate("/workspace/results");
      return;
    }
    setTaskId(id);
    setModal("task");
  };
  const results = (
    <>
      {w.result ? (
        <>
          <div className="ep-metric-grid">
            <div className="ep-metric">
              <span>屈服强度</span>
              <strong>
                {w.result.strength}
                {w.result.strengthError != null && (
                  <small> ± {w.result.strengthError}</small>
                )}
                <em>MPa</em>
              </strong>
              <div>目标 ≥ {w.targetStrength ?? "待确认"} MPa</div>
            </div>
            <div className="ep-metric">
              <span>延伸率</span>
              <strong>
                {w.result.elongation}
                {w.result.elongationError != null && (
                  <small> ± {w.result.elongationError}</small>
                )}
                <em>%</em>
              </strong>
              <div>目标 ≥ {w.targetElongation ?? "待确认"}%</div>
            </div>
          </div>
          <div className="ep-assessment">
            <strong>{w.assessment?.label || "等待条件核验"}</strong>
            {w.assessment?.reasons.map((r) => (
              <p key={r}>{r}</p>
            ))}
          </div>
          <div className="ep-result-foot">
            <span>
              第 {w.result.round ?? "历史"} 轮 ·{" "}
              {w.result.sampleId || "历史记录"} · {w.result.conditions}
            </span>
            <Badge status={w.quality === "pending" ? "waiting" : w.quality}>
              {w.quality === "pending" ? "待质量复核" : undefined}
            </Badge>
          </div>
        </>
      ) : (
        <Empty title="等待实验结果">
          在实验与样品中登记样品，再录入结果。原始记录经过复核后才能进入下一轮分析。
        </Empty>
      )}
    </>
  );
  return (
    <div className="ep-research">
      <div className="ep-research-head">
        <div>
          <div className="ep-eyebrow">
            第 {w.round} 轮研究 <span> / </span> {w.family}
          </div>
          <h1>{p.name}</h1>
        </div>
        <div className="ep-actions">
          <button onClick={() => setModal("goal")}>
            <SlidersHorizontal size={15} />
            目标与约束
          </button>
          <button
            aria-label="导出研究记录"
            onClick={() =>
              action(async () =>
                saveJson(
                  "EliangMat_AI_研究记录.json",
                  await platformApi(base + "/report"),
                ),
              )
            }
          >
            <ArrowDownToLine size={16} />
          </button>
        </div>
      </div>
      <div className="ep-tabs">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            to={"/workspace" + (key ? "/" + key : "")}
            className={
              section === key || (section === "review" && !key) ? "active" : ""
            }
          >
            {label}
            {key === "experiments" && <span>{w.samples.length}</span>}
            {key === "results" && w.quality === "pending" && <i />}
          </Link>
        ))}
        <span className="ep-tab-end">
          <LockKeyhole size={12} />
          {p.mode === "private" ? "私密项目" : "参与优化 · 逐份审核"}
        </span>
      </div>
      <div className="ep-context-strip">
        目标 v{w.goalRevision || w.revision} · {w.testTemperature ?? "待确认"}°C
        · {w.environment || "环境待确认"} · {w.standard || "标准待确认"} ·{" "}
        {w.strengthDefinition || "屈服定义待确认"} · {w.repeats ?? "待确认"}{" "}
        个独立试样 · {w.durationWeeks ?? "待确认"} 周
      </div>
      {w.demo && (
        <div className="ep-demo-note">
          流程演练 ·
          候选、测量结果与进度为虚构示例；真实仿真、设备与模型服务尚待接通。
        </div>
      )}
      {(!section || section === "review") && (
        <div className="ep-work-grid">
          <div className="ep-conversation">
            <div className="ep-user-message">{w.goal}</div>
            <article className="ep-assistant">
              <span className="ep-avatar">E</span>
              <div className="ep-assistant-content">
                <div className="ep-assistant-label">
                  EliangMat AI <small>研究进展</small>
                </div>
                <h2>
                  {w.result
                    ? w.assessment?.label || "已有实验记录，等待核验"
                    : `第 ${w.round} 轮研究 · ${w.planState === "approved" ? "按计划推进" : "先确认目标和路线"}`}
                </h2>
                <p>
                  {w.result
                    ? w.quality === "accepted"
                      ? `质量复核结论已归档。${nextReady?.reason || "请核对下一轮的前置条件。"}`
                      : "结果、表征和下一轮计划分别推进；请先核对原始实验记录，再决定是否纳入分析。"
                    : "当前采用合金研发模板。你可以补充 DFT、分子动力学或流体与传热任务，再确认路线。"}
                </p>
                <section className="ep-progress-card">
                  <header>
                    <div>
                      <h3>本轮执行进度</h3>
                      <span>
                        {done} / {w.tasks.length} 项已完成
                      </span>
                    </div>
                    <Link to="/workspace/plan">
                      研究计划
                      <ChevronRight size={14} />
                    </Link>
                  </header>
                  <div className="ep-progress-track">
                    <span
                      style={{ width: (done / w.tasks.length) * 100 + "%" }}
                    />
                  </div>
                  {w.tasks.map((t) => (
                    <button
                      className={
                        "ep-task-row " +
                        (t.status === "completed" ? "is-done" : "")
                      }
                      key={t.id}
                      onClick={() => openTask(t.id)}
                    >
                      <span className="ep-task-icon">
                        {t.status === "completed" ? (
                          <CheckCircle2 size={17} />
                        ) : (
                          <Circle size={16} />
                        )}
                      </span>
                      <div>
                        <strong>{t.name}</strong>
                        <small>
                          {t.blockedReason ? t.blockedReason + " · " : ""}
                          {t.note}
                        </small>
                      </div>
                      <Badge status={t.blockedReason ? "blocked" : t.status}>
                        {t.blockedReason || undefined}
                      </Badge>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </section>
                {w.result && (
                  <div className="ep-panel ep-compact-results">{results}</div>
                )}
                <div className="ep-next-action">
                  <div>
                    <h3>
                      {w.nextPlan?.status === "approved"
                        ? "下一轮计划已归档"
                        : nextReady?.ready
                          ? "下一步：比较误差，起草下一轮"
                          : "先补齐下一轮的前置条件"}
                    </h3>
                    <p>
                      {nextReady?.reason || "请先核对实验记录与研究路线。"}
                    </p>
                  </div>
                  <button
                    className="ep-primary"
                    disabled={busy}
                    onClick={() =>
                      nextReady?.ready
                        ? navigate("/workspace/results")
                        : navigate("/workspace/" + (nextReady?.action || "experiments"))
                    }
                  >
                    {nextReady?.ready ? "查看下一轮" : nextReady?.action === "plan" ? "确认研究路线" : nextReady?.action === "review" ? "复核实验记录" : "补充实验记录"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </article>
            {w.messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user" ? "ep-user-message" : "ep-response"
                }
              >
                {m.role === "assistant" && <small>{m.method}</small>}
                <ReplyActivity message={m} />
                <MessageText message={m} />
                <ModelCallMeta message={m} busy={busy} onContinue={selectedModel?.id === "gemini" && m.id === w.messages.filter(m => m.role === "assistant").at(-1)?.id ? () => sendMessage(m.id) : undefined} />
                {m.actionDraft && (
                  <button onClick={() => setModal("goal")}>
                    核对当前项目的目标与路线
                  </button>
                )}
                {m.role === "assistant" && (
                  <MemoryCitations
                    references={m.memoryReferences}
                    answer={
                      m.answerMode === "recall" || m.answerMode === "facts"
                    }
                    all={m.answerMode === "facts"}
                    contextId={projectId}
                  />
                )}
              </div>
            ))}
            <LiveReply turn={stream.turn} messages={w.messages} />
            <form
              className="ep-composer"
              onSubmit={async (e) => {
                e.preventDefault();
                await sendMessage();
              }}
            >
              <textarea
                disabled={busy}
                aria-label="补充研究信息"
                placeholder="继续上次研究，或询问之前确认的约束与决策…"
                value={message}
                required
                maxLength={3000}
                onChange={(e) => setMessage(e.target.value)}
              />
              <footer>
                <Link to="/workspace/settings/models">
                  {selectedModel?.id === "gemini"
                    ? !selectedModel.connected ? "Gemini · 待接通"
                      : o.externalConsent[projectId]?.fingerprint !== selectedModel.fingerprint ? "Gemini · 待确认处理范围"
                      : busy ? "Gemini 正在回复…" : "Gemini · 已启用外部推理"
                    : "账号记忆检索 · 在账号空间处理"}
                </Link>
                {stream.turn?.running ? (
                  <button
                    type="button"
                    className="ep-primary ep-icon"
                    aria-label="停止生成"
                    onClick={stream.stop}
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className="ep-primary ep-icon"
                    aria-label="记录研究补充"
                    disabled={busy || !message.trim()}
                  >
                    <ArrowUp size={17} />
                  </button>
                )}
              </footer>
            </form>
          </div>
          <aside className="ep-insight">
            <div className="ep-eyebrow">项目上下文</div>
            <h3>目标与约束</h3>
            <dl>
              <dt>屈服强度</dt>
              <dd>≥ {w.targetStrength} MPa</dd>
              <dt>延伸率</dt>
              <dd>≥ {w.targetElongation}%</dd>
              <dt>下一轮样品</dt>
              <dd>≤ {w.sampleBudget} 个</dd>
              <dt>研究路线</dt>
              <dd>
                <Badge status={w.planState} />
              </dd>
            </dl>
            <h3>材料与证据</h3>
            <p>
              {projectData.documents.length} 份资料 · {w.links.length}{" "}
              条已同步证据
            </p>
            <Link to="/knowledge">
              打开项目资料
              <ArrowRight size={14} />
            </Link>
            <button disabled={busy} onClick={() => run("/evidence", {})}>
              同步已复核证据
            </button>
            <h3>最近活动</h3>
            <div className="ep-timeline">
              {projectData.events.slice(0, 5).map((e) => (
                <div key={e.id}>
                  <span>{e.action}</span>
                  <small>{time(e.at)}</small>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
      {!!w.requirementIssues?.length && (
        <div className="ep-inline-note ep-page">
          <div>
            <strong>研究条件待确认 · {w.requirementIssues.length} 项</strong>
            <p>{w.requirementIssues.join("；")}</p>
            <button onClick={() => setModal("goal")}>补齐目标与条件</button>
          </div>
        </div>
      )}
      {section === "plan" && (
        <div className="ep-page">
          <div className="ep-section-title">
            <div>
              <h2>从研究问题选择方法</h2>
              <p>
                合金路线模板 v{w.revision}
                。仿真输出为实验提供依据，每个任务保留前置条件。
              </p>
            </div>
            <Badge status={w.planState} />
          </div>
          <div className="ep-plan-flow">
            {[
              "目标与证据",
              "仿真与候选",
              "制备与表征",
              "质量复核",
              "下一轮验证",
            ].map((x, i) => (
              <div key={x}>
                <small>0{i + 1}</small>
                <strong>{x}</strong>
                {i < 4 && <ArrowRight size={15} />}
              </div>
            ))}
          </div>
          <div className="ep-panel">
            <div className="ep-section-title">
              <h3>任务与协作顺序</h3>
              <button onClick={() => setModal("goal")}>调整方法与约束</button>
            </div>
            {w.tasks.map((t) => (
              <button
                key={t.id}
                className="ep-task-row"
                onClick={() => openTask(t.id)}
              >
                <span className="ep-method-label">{t.method}</span>
                <div>
                  <strong>{t.name}</strong>
                  <small>
                    前置：
                    {t.dependencies
                      .map(
                        (id: string) =>
                          w.tasks.find((a) => a.id === id)?.method,
                      )
                      .join("、") || "研究路线确认"}{" "}
                    · {t.blockedReason || t.note}
                  </small>
                </div>
                <Badge status={t.blockedReason ? "blocked" : t.status}>
                  {t.blockedReason || undefined}
                </Badge>
              </button>
            ))}
          </div>
          <div className="ep-inline-note">
            CALPHAD
            用于相稳定性和工艺窗口；力学性能预测需要经验证的模型与实验。DFT、MD
            和 CFD 按研究问题补充，不要求每个项目全部运行。
          </div>
          {w.planState === "draft" && (
            <form
              className="ep-approval"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  "/approve",
                  { confirm: true, revision: w.revision },
                  undefined,
                  "研究路线已确认。",
                );
              }}
            >
              <label>
                <input type="checkbox" required />
                我已检查目标、方法、样品预算和任务前置条件
              </label>
              <button className="ep-primary" disabled={busy}>
                确认路线 v{w.revision}
                <Check size={15} />
              </button>
            </form>
          )}
        </div>
      )}
      {section === "candidates" && (
        <div className="ep-page">
          <div className="ep-section-title">
            <div>
              <h2>候选材料</h2>
              <p>成分、工艺与性能估计放在一起比较，再选择进入实验的方案。</p>
            </div>
            <button
              onClick={() => {
                setEditId("");
                setModal("candidate");
              }}
            >
              <Plus size={15} />
              登记候选
            </button>
          </div>
          {w.candidates.length ? (
            <div className="ep-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>纳入</th>
                    <th>候选 / 成分</th>
                    <th>工艺</th>
                    <th>屈服强度 MPa</th>
                    <th>延伸率 %</th>
                  </tr>
                </thead>
                <tbody>
                  {w.candidates.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          aria-label={"纳入候选 " + c.id}
                          type="checkbox"
                          checked={c.selected}
                          disabled={
                            busy || (!c.validation?.executable && !c.selected)
                          }
                          onChange={(e) =>
                            run(
                              "/candidates/" + c.id,
                              { selected: e.target.checked },
                              "PATCH",
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>
                          {c.id} · v{c.version || 1}
                        </strong>
                        <small>
                          {c.composition} · {c.basis}
                        </small>
                      </td>
                      <td>{c.process || "待定义"}</td>
                      <td>{c.strength}</td>
                      <td>
                        {c.elongation}
                        <small>{c.validation?.note}</small>
                        <button
                          onClick={() => {
                            setEditId(c.id);
                            setModal("candidate");
                          }}
                        >
                          修订
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="还没有候选材料">
              登记候选成分与配比基准，后续样品会关联到具体候选。
            </Empty>
          )}
          <p className="ep-footnote">
            {w.demo ? "演练中的性能区间为虚构示例；新登记候选的性能显示待计算。" : "候选性能在取得可追溯的计算或实验结果后更新。"}
          </p>
        </div>
      )}
      {section === "experiments" && (
        <div className="ep-page">
          <div className="ep-section-title">
            <div>
              <h2>实验与样品</h2>
              <p>候选 → 制备批次 → 样品 → 测试条件 → 原始记录。</p>
            </div>
            <div className="ep-actions">
              <button
                onClick={() => {
                  setEditId("");
                  setModal("sample");
                }}
                disabled={!w.candidates.length}
              >
                <Plus size={15} />
                登记样品
              </button>
              <button
                className="ep-primary"
                onClick={() => setModal("observation")}
                disabled={!w.samples.length}
              >
                录入实验结果
              </button>
            </div>
          </div>
          <div className="ep-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>样品编号</th>
                  <th>材料候选</th>
                  <th>制备批次</th>
                  <th>工艺</th>
                  <th>进度</th>
                </tr>
              </thead>
              <tbody>
                {w.samples.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.id}</strong>
                      <small>{s.note}</small>
                    </td>
                    <td>
                      {s.candidate} · v{s.candidateVersion || "待核对"}
                    </td>
                    <td>{s.batch || "待补充"}</td>
                    <td>{s.process || "待补充"}</td>
                    <td>
                      {s.status} · v{s.version || 1}
                      <button
                        onClick={() => {
                          setEditId(s.id);
                          setModal("sample");
                        }}
                      >
                        修订
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!w.samples.length && (
              <Empty title="等待登记样品">
                先登记材料候选，再创建样品，保持数据可追溯。
              </Empty>
            )}
          </div>
          <h3 className="ep-subhead">实验任务</h3>
          <div className="ep-panel">
            {w.tasks
              .filter((t) => t.phase === "experiment")
              .map((t) => (
                <button
                  className="ep-task-row"
                  key={t.id}
                  onClick={() => openTask(t.id)}
                >
                  <FlaskConical size={18} />
                  <div>
                    <strong>{t.name}</strong>
                    <small>
                      {t.blockedReason ? t.blockedReason + " · " : ""}
                      {t.note}
                    </small>
                  </div>
                  <Badge status={t.blockedReason ? "blocked" : t.status}>
                    {t.blockedReason || undefined}
                  </Badge>
                  <ChevronRight size={14} />
                </button>
              ))}
          </div>
          {w.observations.length > 0 && (
            <>
              <h3 className="ep-subhead">已录入记录</h3>
              {w.observations.map((r) => (
                <details className="ep-panel" key={r.id}>
                  <summary>
                    {r.sampleId} · {time(r.recordedAt)} · {r.strength} MPa /{" "}
                    {r.elongation}%
                  </summary>
                  <p>{r.conditions}</p>
                  <pre>{r.raw}</pre>
                  {!!r.metrics?.length && (
                    <p>
                      附加指标：
                      {r.metrics
                        .map((m) => `${m.name} ${m.value} ${m.unit}`)
                        .join("；")}
                    </p>
                  )}
                  <Badge status={r.quality || "waiting"} />
                  <p>
                    {r.measurement
                      ? `${r.measurement.temperature}°C · ${r.measurement.standard} · ${r.measurement.specimenId}`
                      : "旧记录缺少结构化条件，不能用于达标判定"}
                  </p>
                  {r.artifact && (
                    <button
                      onClick={() =>
                        saveJson(r.artifact.name + ".archive.json", r.artifact)
                      }
                    >
                      导出原始文件归档
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setReviewId(r.id || "");
                      setModal("review");
                    }}
                  >
                    复核这条记录
                  </button>
                </details>
              ))}
            </>
          )}
        </div>
      )}
      {section === "results" && (
        <div className="ep-page">
          <div className="ep-section-title">
            <div>
              <h2>结果与下一轮</h2>
              <p>复核决定哪些数据可用；模型优化授权在账号页面单独管理。</p>
            </div>
            <button
              disabled={!w.result}
              onClick={() => {
                setReviewId("");
                setModal("review");
              }}
            >
              查看质量复核
            </button>
          </div>
          <div className="ep-panel">{results}</div>
          <div className="ep-panel">
            <h3>项目可比数据组 · 包含历史轮次</h3>
            <p>
              仅汇总当前目标版本、复核通过且工况一致的记录。同一独立试样只计一次；±
              表示样本标准差。
            </p>
            {w.datasets?.length ? (
              w.datasets.map((g) => (
                <div className="ep-dataset" key={g.key}>
                  <strong>
                    第 {g.round ?? "历史"} 轮 · {g.candidate} · {g.batch} ·{" "}
                    {g.temperature}°C · n={g.n}
                  </strong>
                  <p>
                    强度 {g.strength.mean.toFixed(2)}{" "}
                    {g.strength.sd == null
                      ? ""
                      : `± ${g.strength.sd.toFixed(2)}`}{" "}
                    MPa；延伸率 {g.elongation.mean.toFixed(2)}{" "}
                    {g.elongation.sd == null
                      ? ""
                      : `± ${g.elongation.sd.toFixed(2)}`}
                    %
                  </p>
                  <p>{g.label}</p>
                </div>
              ))
            ) : (
              <p>暂无可比组。请先补齐条件并逐条复核。</p>
            )}
          </div>
          {!!w.roundHistory?.length && (
            <details className="ep-panel">
              <summary>历史轮次 · {w.roundHistory.length}</summary>
              {w.roundHistory.map((h) => (
                <div key={h.round}>
                  <h3>
                    第 {h.round} 轮 · 路线 v{h.revision}
                  </h3>
                  <p>
                    {h.result?.strength} MPa / {h.result?.elongation}%
                  </p>
                  <button onClick={() => saveJson(`round-${h.round}.json`, h)}>
                    导出本轮归档
                  </button>
                </div>
              ))}
            </details>
          )}
          <div className="ep-panel ep-next-plan">
            <div className="ep-section-title">
              <h3>下一轮研究</h3>
              {w.nextPlan && (
                <>
                  <Badge status={w.nextPlan.status} />
                  <button onClick={() => setModal("nextPlan")} disabled={busy}>
                    重新起草
                  </button>
                </>
              )}
            </div>
            {w.nextPlan ? (
              <>
                <p>{w.nextPlan.reason}</p>
                <p>
                  验证假设：{w.nextPlan.hypothesis || "旧版草案，请重新起草"}
                </p>
                <p>
                  成本预估：
                  {w.nextPlan.estimatedCost == null
                    ? "待补充"
                    : `¥${w.nextPlan.estimatedCost}`}{" "}
                  · 停止条件：{w.nextPlan.stopCondition || "待补充"}
                </p>
                <ol>
                  {w.nextPlan.items.map((s: string) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="ep-inline-note">
                  本轮草案最多 {w.nextPlan.sampleCount} 个样品 · 项目上限{" "}
                  {w.sampleBudget} 个 · {w.nextPlan.method}
                </div>
                <MemoryCitations
                  references={w.nextPlan.memoryReferences}
                  contextId={projectId}
                />
                {w.nextPlan.status === "draft" ? (
                  <form
                    className="ep-approval"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        "/next-plan/approve",
                        { planId: w.nextPlan.id, confirm: true },
                        undefined,
                        "下一轮已创建，样品与任务已生成，上一轮记录已归档。",
                      );
                    }}
                  >
                    <label>
                      <input required type="checkbox" />
                      我已检查样品预算与验证思路
                    </label>
                    <button disabled={busy} className="ep-primary">
                      确认下一轮计划
                    </button>
                  </form>
                ) : (
                  <p className="ep-good">
                    <CheckCircle2 size={15} />
                    计划已确认，等待工具接通或人工执行。
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  {nextReady?.reason || "正在核对下一轮前置条件。"}
                </p>
                <button
                  className="ep-primary"
                  disabled={
                    busy ||
                    !nextReady?.ready
                  }
                  onClick={() => setModal("nextPlan")}
                >
                  生成下一轮规则草案
                  <ArrowRight size={15} />
                </button>
                {!nextReady?.ready && (
                  <Link className="ep-inline-link" to={"/workspace/" + (nextReady?.action || "experiments")}>
                    {nextReady?.action === "plan" ? "确认研究路线" : nextReady?.action === "review" ? "复核实验记录" : "补充可比实验记录"}
                  </Link>
                )}
              </>
            )}
          </div>
          <div className="ep-panel">
            <div className="ep-section-title">
              <h3>已关联材料证据</h3>
              <Link to="/knowledge">
                管理资料
                <ArrowRight size={14} />
              </Link>
            </div>
            {w.links.length ? (
              w.links.map((l) => (
                <blockquote key={l.documentId + l.evidenceId}>
                  <p>{l.quote}</p>
                  <small>
                    {l.title} · 第 {l.page} 页 {l.demo ? "· 示例证据" : ""}
                  </small>
                </blockquote>
              ))
            ) : (
              <p>
                暂无已同步证据。到「材料与证据」核对原文、许可与质量后，可从协作页同步。
              </p>
            )}
          </div>
        </div>
      )}
      {modal === "nextPlan" && (
        <Dialog title="起草下一轮验证设计" close={close} wide>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              run("/next-plan", form(e.currentTarget));
            }}
          >
            <p>
              为当前候选安排 {w.repeats ?? "待确认"}{" "}
              个独立试样；可增加明确指定的参考或工艺对照。不会自动猜测热处理参数。
            </p>
            <label>
              候选
              <select name="candidateId" required defaultValue="">
                <option value="" disabled>
                  请选择
                </option>
                {w.candidates
                  .filter((c) => c.validation?.executable)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.id} · {c.composition} · {c.process}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              参考候选（可选）
              <select name="referenceId">
                <option value="">不增加</option>
                {w.candidates
                  .filter((c) => c.validation?.executable)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.id} · {c.composition}
                    </option>
                  ))}
              </select>
            </label>
            <div className="ep-form-grid">
              <label>
                对照变量（可选）
                <input name="variable" placeholder="如：时效时间" />
              </label>
              <label>
                对照变量取值（含单位）
                <input name="variableValue" placeholder="由研究者确定" />
              </label>
            </div>
            <label>
              验证假设
              <textarea name="hypothesis" />
            </label>
            <label>
              成本预估 / 元
              <input
                name="estimatedCost"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              停止条件
              <textarea name="stopCondition" />
            </label>
            <ErrorNote message={error} />
            <button disabled={busy} className="ep-primary">
              生成可确认的样品清单
            </button>
          </form>
        </Dialog>
      )}
      {modal === "goal" && (
        <Dialog title="目标、约束与仿真方法" close={close} wide>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                "/goal",
                {
                  ...Object.fromEntries(f),
                  extraMethods: f.getAll("extraMethods"),
                },
                "PATCH",
                "目标已更新，请重新确认研究路线。",
              );
            }}
          >
            <label>
              材料体系
              <input name="family" defaultValue={w.family} required />
            </label>
            <RequirementsFields initial={w} />
            {!!w.goalHistory?.length && (
              <details>
                <summary>目标历史 · {w.goalHistory.length} 个版本</summary>
                {w.goalHistory.map((h) => (
                  <p key={h.revision}>
                    v{h.revision} · {h.goal}
                  </p>
                ))}
              </details>
            )}
            <fieldset>
              <legend>按问题补充仿真方法</legend>
              <p>模板保留 CALPHAD 相稳定性筛选；已完成的任务会保留历史。</p>
              {methods.map(([id, name, note]) => (
                <label className="ep-check-row" key={id}>
                  <input
                    type="checkbox"
                    name="extraMethods"
                    value={id}
                    defaultChecked={w.extraMethods?.includes(id)}
                  />
                  <span>
                    <strong>{name}</strong>
                    <small>{note}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              保存并更新路线
            </button>
          </form>
        </Dialog>
      )}
      {modal === "task" && task && (
        <Dialog title={task.name} close={close}>
          <div className="ep-form">
            <Badge status={task.status} />
            <p>{task.note}</p>
            <dl>
              <dt>方法</dt>
              <dd>{task.method}</dd>
              <dt>前置任务</dt>
              <dd>
                {task.dependencies
                  .map((id: string) => w.tasks.find((t) => t.id === id)?.name)
                  .join("、") || "无任务依赖；执行仍需确认研究路线"}
              </dd>
            </dl>
            <p className="ep-inline-note">
              {w.demo
                ? "本项目为状态流转演练，操作不会调用设备或计算程序。"
                : task.contract?.execution === "curve-csv"
                  ? "CSV 曲线分析已可用。这里只处理上传数据，不执行试验设备。"
                  : task.contract
                    ? "通过人工执行和原始文件回传推进任务，回传后需要验收。"
                    : "请先定义任务输入、执行方式与验收条件。"}
            </p>
            {!w.demo && (
              <>
                {!["running", "waiting", "completed"].includes(task.status) && (
                  <details open={!task.contract}>
                    <summary>
                      任务定义 · {task.contract ? "查看或修订" : "待配置"}
                    </summary>
                    <TaskDefinition
                      key={task.id}
                      task={task}
                      w={w}
                      busy={busy}
                      onSave={(input) =>
                        run("/tasks/" + task.id, input, "PATCH")
                      }
                    />
                  </details>
                )}
                {task.contract && (
                  <div className="ep-panel">
                    <p>
                      {task.contract.assignee} · {task.contract.resource} ·{" "}
                      {task.contract.dueAt}
                    </p>
                    <p>输入：{task.contract.inputs}</p>
                    <p>输出：{task.contract.outputs}</p>
                    <p>验收：{task.contract.acceptance}</p>
                    {task.contract.execution === "curve-csv" && (
                      <p>
                        CSV 表头 strain,stress_mpa，至少 3
                        行；只计算曲线峰值和积分，不模拟设备或推断屈服。
                      </p>
                    )}
                    {((task.contract.execution === "curve-csv" &&
                      ["pending", "failed", "cancelled"].includes(
                        task.status,
                      )) ||
                      task.status === "running") && (
                      <RawFileField onChange={setArtifact} />
                    )}
                    {["running", "waiting"].includes(task.status) && (
                      <label>
                        回传摘要 / 验收或停止说明
                        <textarea
                          value={executionNote}
                          onChange={(e) => setExecutionNote(e.target.value)}
                        />
                      </label>
                    )}
                    <div className="ep-actions">
                      {["pending", "failed", "cancelled", "paused"].includes(
                        task.status,
                      ) && (
                        <button
                          className="ep-primary"
                          disabled={busy}
                          onClick={() =>
                            run("/tasks/" + task.id + "/execute", {
                              action: "submit",
                              artifact,
                            })
                          }
                        >
                          {task.contract.execution === "curve-csv"
                            ? "运行曲线计算"
                            : "登记开始执行"}
                        </button>
                      )}
                      {task.status === "running" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run("/tasks/" + task.id + "/execute", {
                              action: "return",
                              artifact,
                              summary: executionNote,
                            })
                          }
                        >
                          回传原始文件
                        </button>
                      )}
                      {task.status === "waiting" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run("/tasks/" + task.id + "/execute", {
                              action: "accept",
                              confirm: true,
                              note: executionNote,
                            })
                          }
                        >
                          确认验收输出
                        </button>
                      )}
                      {["running", "waiting"].includes(task.status) && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() =>
                              run("/tasks/" + task.id + "/execute", {
                                action: "fail",
                                note: executionNote,
                              })
                            }
                          >
                            记录失败
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              run("/tasks/" + task.id + "/execute", {
                                action: "cancel",
                                note: executionNote,
                              })
                            }
                          >
                            取消执行
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {task.runs?.map((r) => (
                  <details key={r.id} className="ep-panel">
                    <summary>
                      {time(r.at)} · <Badge status={r.status} /> ·{" "}
                      {r.artifact?.name}
                    </summary>
                    {r.error && <p>{r.error}</p>}
                    <CurvePreview output={r.output} />
                    <pre>
                      {JSON.stringify(
                        r.output
                          ? { ...r.output, curve: undefined }
                          : undefined,
                        null,
                        2,
                      )}
                    </pre>
                    <button
                      onClick={() => saveJson("task-run-" + r.id + ".json", r)}
                    >
                      导出输入、原始文件与输出
                    </button>
                  </details>
                ))}
              </>
            )}
            <ErrorNote message={error} />
            <div className="ep-actions">
              {task.status === "completed" ? (
                <span className="ep-good">
                  <CheckCircle2 size={16} />
                  结果已归档
                </span>
              ) : w.demo ? (
                <>
                  {["paused", "pending"].includes(task.status) && (
                    <button
                      className="ep-primary"
                      disabled={busy}
                      onClick={() =>
                        run("/tasks/" + task.id, { action: "start" })
                      }
                    >
                      {task.status === "paused"
                        ? "继续演练任务"
                        : "开始演练任务"}
                    </button>
                  )}
                  {task.status === "running" && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run("/tasks/" + task.id, { action: "pause" })
                        }
                      >
                        暂停任务
                      </button>
                      <button
                        className="ep-primary"
                        disabled={busy}
                        onClick={() =>
                          run("/tasks/" + task.id, { action: "complete-demo" })
                        }
                      >
                        标记演练完成
                      </button>
                    </>
                  )}
                </>
              ) : !task.contract ? (
                <Link to="/tools" onClick={close}>
                  查看资源状态
                  <ArrowRight size={15} />
                </Link>
              ) : null}
            </div>
          </div>
        </Dialog>
      )}
      {needsReview && (
        <Dialog title="拉伸数据质量复核" close={close} wide>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                "/review",
                {
                  ...form(e.currentTarget),
                  confirm: true,
                  observationId: reviewRecord?.id,
                  revision: w.revision,
                },
                undefined,
                "复核结论已保存。",
              );
            }}
          >
            <p>
              {reviewRecord?.sampleId} · {reviewRecord?.strength} MPa /{" "}
              {reviewRecord?.elongation}%
            </p>
            <p>{reviewRecord?.conditions}</p>
            <p>
              按目标 v{w.goalRevision || w.revision}{" "}
              复核。确认可用不等于性能达标；系统会继续检查工况和独立试样数量。
            </p>
            <label>
              原始记录摘录<pre>{reviewRecord?.raw}</pre>
            </label>
            {w.review && (
              <p>
                上次复核：{w.review.note} · {time(w.review.at)}
              </p>
            )}
            <label>
              复核结论
              <select
                name="decision"
                defaultValue={
                  reviewRecord?.quality === "excluded" ? "excluded" : "accepted"
                }
              >
                <option value="accepted">确认记录可用于本项目分析</option>
                <option value="excluded">暂不纳入分析</option>
              </select>
            </label>
            <label>
              复核说明
              <textarea
                name="note"
                minLength={4}
                required
                placeholder="样品、测试条件、原始曲线及异常值的核对结论"
              />
            </label>
            <label className="ep-check-row">
              <input type="checkbox" required />
              <span>
                我已核对样品、数值与测试条件
                {w.demo ? "；了解当前为虚构演练数据" : ""}
              </span>
            </label>
            <small>此操作只确认项目记录的使用，不授权公司模型训练。</small>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              保存复核结论
              <Check size={15} />
            </button>
          </form>
        </Dialog>
      )}
      {modal === "candidate" && (
        <Dialog
          title={editCandidate ? "修订材料候选" : "登记材料候选"}
          close={close}
        >
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                editCandidate
                  ? "/candidates/" + editCandidate.id
                  : "/candidates",
                { ...form(e.currentTarget), version: editCandidate?.version },
                editCandidate ? "PATCH" : "POST",
              );
            }}
          >
            <label>
              成分与配比
              <input
                name="composition"
                defaultValue={editCandidate?.composition}
                required
                placeholder="例如 Al 余量 / Mg 4.5 / Si 0.8"
              />
            </label>
            <label>
              配比基准
              <select name="basis" defaultValue={editCandidate?.basis}>
                <option>wt%</option>
                <option>at%</option>
              </select>
            </label>
            <label>
              制备 / 热处理工艺
              <textarea name="process" defaultValue={editCandidate?.process} />
              {!!editCandidate?.history?.length && (
                <details>
                  <summary>历史版本</summary>
                  {editCandidate.history.map((h) => (
                    <p key={h.version}>
                      v{h.version} · {h.composition} · {h.process}
                    </p>
                  ))}
                </details>
              )}
            </label>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              保存候选
            </button>
          </form>
        </Dialog>
      )}
      {modal === "sample" && (
        <Dialog
          title={editSample ? "修订实验样品" : "登记实验样品"}
          close={close}
        >
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                editSample ? "/samples/" + editSample.id : "/samples",
                { ...form(e.currentTarget), version: editSample?.version },
                editSample ? "PATCH" : "POST",
              );
            }}
          >
            <label>
              样品编号
              <input
                name="id"
                required
                defaultValue={editSample?.id}
                readOnly={!!editSample}
              />
            </label>
            <label>
              关联候选
              <select
                name="candidate"
                required
                defaultValue={editSample?.candidate || ""}
              >
                <option value="" disabled>
                  请选择有效候选
                </option>
                {w.candidates.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                    disabled={!c.validation?.executable}
                  >
                    {c.id} · {c.composition} · {c.process || "工艺待定义"} ·{" "}
                    {c.validation?.note}
                  </option>
                ))}
              </select>
            </label>
            <label>
              制备批次
              <input name="batch" required defaultValue={editSample?.batch} />
            </label>
            <label>
              工艺履历
              <textarea
                name="process"
                required
                defaultValue={editSample?.process}
              />
            </label>
            <label>
              备注
              <input name="note" defaultValue={editSample?.note} />
              {!!editSample?.history?.length && (
                <details>
                  <summary>历史版本</summary>
                  {editSample.history.map((h) => (
                    <p key={h.version}>
                      v{h.version} · {h.batch} · {h.process}
                    </p>
                  ))}
                </details>
              )}
            </label>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              保存样品
            </button>
          </form>
        </Dialog>
      )}
      {modal === "observation" && (
        <Dialog title="录入实验结果" close={close} wide>
          <form
            className="ep-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  "/observations",
                  { ...form(e.currentTarget), artifact },
                  undefined,
                  "记录已保存，请复核原始数据。",
                )
              ) {
                setReviewId("");
                navigate("/workspace/results");
                setModal("review");
              }
            }}
          >
            <label>
              样品
              <select name="sampleId" required defaultValue="">
                <option value="" disabled>
                  请选择样品与批次
                </option>
                {w.samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.batch} · {s.candidate}
                  </option>
                ))}
              </select>
            </label>
            <div className="ep-form-grid">
              <label>
                屈服强度 / MPa
                <input
                  type="number"
                  name="strength"
                  step="any"
                  min="0.01"
                  required
                />
              </label>
              <label>
                延伸率 / %
                <input
                  type="number"
                  name="elongation"
                  step="any"
                  min="0"
                  required
                />
              </label>
            </div>
            <MeasurementFields />
            <RawFileField onChange={setArtifact} />
            <details>
              <summary>附加指标（可选）</summary>
              <label>
                指标 JSON 数组
                <textarea
                  name="metrics"
                  placeholder={'[{"name":"硬度","unit":"HV","value":100}]'}
                />
              </label>
            </details>
            <label>
              测试条件
              <textarea
                name="conditions"
                required
                placeholder="试样尺寸、温度、应变速率、测量方法等"
              />
            </label>
            <label>
              原始记录摘录
              <textarea
                name="raw"
                required
                minLength={20}
                placeholder="至少 20 个字符，包含记录来源及样品对应关系；原始文件可保存在材料与证据中"
              />
            </label>
            <small>
              新记录会成为当前结果并重新进入质量复核；历史录入仍保留。
            </small>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              保存并进入复核
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
