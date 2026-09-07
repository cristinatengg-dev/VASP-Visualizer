import { SANDBOX } from "./product-mode";
import Usage from "./Usage";
import Memory from "./Memory";
import { usePlatformSession } from "./session-context";
import type { Model } from "./types";
import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CreditCard,
  ExternalLink,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { usePlatform } from "./context";
import { money, platformApi, time } from "./api";
import { Badge, Dialog, Empty, ErrorNote } from "./ui";
export default function Accounts({
  scope = "account",
}: {
  scope?: "account" | "project";
}) {
  const auth = usePlatformSession();
  const {
    overview: o,
    projectId,
    projectData,
    busy,
    action,
    error,
  } = usePlatform();
  const [modal, setModal] = useState(""),
    [selected, setSelected] = useState<Model | null>(null);
  const [defaultMode, setDefaultMode] = useState(o.defaults?.mode || "private"),
    [defaultModel, setDefaultModel] = useState(
      o.defaults?.model || "materials",
    );
  const section =
      useLocation().pathname.split("/")[scope === "project" ? 3 : 2] ||
      (scope === "project" ? "privacy" : "defaults"),
    role = o.role,
    owner = role === "owner",
    finance = role === "finance";
  const p = projectData?.project || o.projects.find((p) => p.id === projectId),
    base = "/api/platform/projects/" + projectId;
  const close = () => {
    if (!busy) setModal("");
  };
  const run = async (
    path: string,
    input: unknown,
    method = "POST",
    notice = "",
  ) => {
    if (await action(() => platformApi(path, input, method), notice)) close();
  };
  const entries = (
    scope === "project"
      ? [
          ["privacy", "项目数据用途"],
          ["models", "项目模型"],
        ]
      : [
          ["defaults", "新项目默认设置"],
          ["memory", "自动记忆"],
          ["billing", "余额与用量"],
          ["members", "成员与权限"],
        ]
  ).filter(([key]) => !finance || key === "billing" || key === "members");
  if (scope === "account" && ["privacy", "models"].includes(section))
    return <Navigate to={"/workspace/settings/" + section} replace />;
  const current = o.projectModels[projectId] || "materials";
  return (
    <div className="ep-account">
      <div className="ep-research-head">
        <div>
          <div className="ep-eyebrow">工作空间设置</div>
          <h1>{scope === "project" ? "项目设置" : "账号与用量"}</h1>
        </div>
        <div className="ep-account-mark">
          <ShieldCheck size={17} />
          {o.account} · {owner ? "所有者" : finance ? "财务" : "研究员"}
        </div>
      </div>
      <nav className="ep-tabs">
        {entries.map(([key, name]) => (
          <Link
            key={key}
            className={section === key ? "active" : ""}
            to={
              (scope === "project" ? "/workspace/settings/" : "/account/") + key
            }
          >
            {name}
          </Link>
        ))}
      </nav>
      <div className="ep-page">
        <div className="ep-inline-note">
          <strong>
            作用范围：
            {scope === "project"
              ? `项目「${p?.name || "未选择"}」`
              : `账号「${o.account}」`}
          </strong>
          {scope === "project" ? (
            <Link to="/account/defaults">账号默认设置</Link>
          ) : (
            <Link to="/workspace/settings/privacy">查看当前项目的覆盖项</Link>
          )}
        </div>
        {section === "defaults" && !finance && (
          <form
            className="ep-form ep-panel"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                "/api/platform/defaults",
                {
                  mode: defaultMode,
                  model: defaultModel,
                  consent: f.get("consent") === "on",
                  externalConsent: f.get("externalConsent") === "on",
                },
                "PATCH",
                "默认设置已保存，仅影响之后新建的项目。",
              );
            }}
          >
            <h2>新项目默认设置</h2>
            <p>
              已有项目保留各自的隐私与模型选择。资料许可、模型推理许可和训练授权分别管理。
            </p>
            <label>
              默认数据模式
              <select
                value={defaultMode}
                disabled={!owner}
                onChange={(e) =>
                  setDefaultMode(e.target.value as "private" | "contribute")
                }
              >
                <option value="private">私密</option>
                <option value="contribute">参与自有模型优化候选集</option>
              </select>
            </label>
            {defaultMode === "contribute" && (
              <label className="ep-check-row">
                <input name="consent" type="checkbox" required />
                我同意之后新建项目默认参与优化；仅限有权授权、逐份许可并经复核的数据。
              </label>
            )}
            <label>
              默认模型
              <select
                value={defaultModel}
                disabled={!owner}
                onChange={(e) => setDefaultModel(e.target.value)}
              >
                {o.models.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                    {m.connected ? "" : " · 待接通"}
                  </option>
                ))}
              </select>
            </label>
            {o.models.find((m) => m.id === defaultModel)?.external && (
              <label className="ep-check-row">
                <input name="externalConsent" type="checkbox" required />
                我同意之后新建项目使用该外部服务进行推理，此确认不授权训练。
              </label>
            )}
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy || !owner}>
              保存默认设置
            </button>
          </form>
        )}

        {section === "memory" && !finance && <Memory />}
        {section === "privacy" && !finance && (
          <>
            <div className="ep-section-title">
              <div>
                <h2>数据由客户自己选择如何使用</h2>
                <p>
                  当前项目：{p?.name || "请先创建项目"}
                  。新项目采用账号默认设置，可在这里单独调整后续使用授权。
                </p>
              </div>
            </div>
            <div className="ep-choice-grid">
              <article
                className={
                  "ep-choice " + (p?.mode === "private" ? "selected" : "")
                }
              >
                <div className="ep-choice-icon">
                  <LockKeyhole size={23} />
                  {p?.mode === "private" && (
                    <Badge status="approved">当前模式</Badge>
                  )}
                </div>
                <h2>私密研发</h2>
                <p>
                  项目数据保留在客户空间中，不纳入 EliangMat AI
                  公司模型的优化数据集。
                </p>
                <ul>
                  <li>仍可检索本项目获许可的材料证据</li>
                  <li>不允许导出为公司训练数据</li>
                  <li>切回私密后停止后续训练导出</li>
                </ul>
                <button
                  className={p?.mode === "private" ? "" : "ep-primary"}
                  disabled={busy || !owner || !p || p.mode === "private"}
                  onClick={() =>
                    run(
                      "/api/knowledge/projects/" + projectId + "/privacy",
                      { mode: "private", consent: false },
                      "PATCH",
                      "已切换为私密，后续训练导出已关闭。",
                    )
                  }
                >
                  {p?.mode === "private" ? "已启用" : "选择私密研发"}
                </button>
              </article>
              <article
                className={
                  "ep-choice " + (p?.mode === "contribute" ? "selected" : "")
                }
              >
                <div className="ep-choice-icon">
                  <ShieldCheck size={23} />
                  {p?.mode === "contribute" && (
                    <Badge status="approved">当前模式</Badge>
                  )}
                </div>
                <h2>参与模型优化</h2>
                <p>
                  允许把你有权授权且通过审核的数据，纳入公司自有模型的优化候选集。
                </p>
                <ul>
                  <li>明确同意后才开启</li>
                  <li>每份资料仍须单独核对用途许可</li>
                  <li>只有复核通过的真实证据可导出</li>
                </ul>
                <button
                  disabled={busy || !owner || !p || p.mode === "contribute"}
                  onClick={() => setModal("privacy")}
                >
                  {p?.mode === "contribute" ? "已启用" : "选择参与优化"}
                  <ArrowRight size={14} />
                </button>
              </article>
            </div>
            <div className="ep-inline-note">
              <ShieldCheck size={18} />
              <span>
                项目模式、原文使用许可、证据质量共同决定可用范围。参与优化后，获准数据可加入候选集；模型训练与迭代待开放，当前不会自动提交训练。
              </span>
            </div>
            {!SANDBOX && (
              <div className="ep-setting-row">
                <div>
                  <h3>公司模型训练与迭代</h3>
                  <p>可先管理数据授权与优化候选集。</p>
                </div>
                <button disabled>模型迭代 · 待开放</button>
              </div>
            )}
            <div className="ep-setting-row">
              <div>
                <h3>查看逐份资料的授权</h3>
                <p>私密 / 参与优化不改变第三方文献与专利的版权许可。</p>
              </div>
              <Link to="/knowledge">
                材料与证据
                <ArrowRight size={15} />
              </Link>
            </div>
            {!owner && (
              <p className="ep-footnote">
                研究员可以使用项目；隐私授权由空间所有者修改。
              </p>
            )}
          </>
        )}
        {section === "models" && !finance && (
          <>
            <div className="ep-section-title">
              <div>
                <h2>按项目选择研究模型</h2>
                <p>
                  {p?.name || "请先创建项目"} ·
                  选择保存到当前项目，用于之后的项目对话。账号对话的模型单独选择。
                </p>
              </div>
              <Link to="/tools">
                工具与模型
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="ep-inline-note">
              选择后用于当前项目的对话。外部模型需要单独确认数据范围；账号记忆检索在平台内处理已有记录。
            </div>
            <div className="ep-model-list">
              {o.models.map((m) => (
                <article
                  key={m.id}
                  className={
                    "ep-model-card " + (current === m.id ? "selected" : "")
                  }
                >
                  <div className="ep-model-symbol">
                    {m.id === "materials"
                      ? "E"
                      : m.id === "gemini"
                        ? "G"
                        : m.id === "reasoning"
                          ? "A"
                          : "e"}
                  </div>
                  <div className="ep-model-detail">
                    <div className="ep-model-title">
                      <h3>{m.name}</h3>
                      <Badge status={m.connected ? "approved" : "unconfigured"}>
                        {m.connected ? "可用" : "待接通"}
                      </Badge>
                      {m.external && (
                        <span className="ep-test-tag">外部服务</span>
                      )}
                    </div>
                    <p>{m.purpose}</p>
                    <small>{m.provider}</small>
                    {!SANDBOX && m.id === "materials" ? (
                      <div className="ep-model-rates">
                        不产生模型 Token 费用
                      </div>
                    ) : m.pricingConfigured === false ? (
                      <div className="ep-model-rates">
                        供应商账号结算 · 记录实际 Token
                      </div>
                    ) : (
                      <div className="ep-model-rates">
                        <span>
                          输入 <strong>¥{m.input}</strong>
                        </span>
                        <span>
                          缓存输入 <strong>¥{m.cached}</strong>
                        </span>
                        <span>
                          输出 <strong>¥{m.output}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    disabled={
                      busy ||
                      !projectId ||
                      (current === m.id &&
                        (m.id !== "gemini" ||
                          o.externalConsent[projectId]?.fingerprint ===
                            m.fingerprint))
                    }
                    className={current === m.id ? "ep-selected-button" : ""}
                    onClick={() => {
                      if (
                        m.external &&
                        (!o.externalConsent[projectId] ||
                          (m.id === "gemini" &&
                            o.externalConsent[projectId]?.fingerprint !==
                              m.fingerprint))
                      ) {
                        setSelected(m);
                        setModal("external");
                      } else
                        run(
                          base + "/model",
                          { model: m.id },
                          "PATCH",
                          m.connected
                            ? "项目模型选择已保存，后续对话按此设置处理。"
                            : "模型选择已保存，服务仍待接通。",
                        );
                    }}
                  >
                    {current === m.id ? (
                      <>
                        <Check size={15} />
                        已选择
                      </>
                    ) : (
                      "选择模型"
                    )}
                  </button>
                </article>
              ))}
            </div>
            <div className="ep-setting-row">
              <div>
                <h3>外部服务数据范围</h3>
                <p>
                  {o.externalConsent[projectId]
                    ? "已记录外部推理范围。Gemini 只会带入获准交给当前网关的记忆与证据。"
                    : "选用外部模型时单独确认数据处理范围。"}
                </p>
              </div>
              <div className="ep-actions">
                <span>公司训练授权独立管理</span>
                {o.externalConsent[projectId] && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        base + "/model",
                        { model: "materials" },
                        "PATCH",
                        "已停止该项目的外部推理，项目对话回到本地检索。",
                      )
                    }
                  >
                    停止外部推理
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        {section === "billing" && !SANDBOX && <Usage />}
        {section === "billing" && SANDBOX && (
          <>
            <div className="ep-section-title">
              <div>
                <h2>预充值，按实际用量结算</h2>
                <p>
                  充值和余额仍为 TEST 演练。Gemini 调用记录真实
                  Token，供应商费用由已配置 API
                  账号承担；平台价格未配置，暂不扣测试余额。
                </p>
              </div>
              {role !== "researcher" && (
                <button
                  className="ep-primary"
                  onClick={() => setModal("topup")}
                >
                  <Plus size={15} />
                  测试充值
                </button>
              )}
            </div>
            {o.wallet ? (
              <>
                <div className="ep-wallet-grid">
                  {[
                    ["可用测试余额", o.wallet.available],
                    ["任务预留", o.wallet.reserved],
                    ["本月测试消耗", o.wallet.monthSpent],
                    ["账户测试总额", o.wallet.balance],
                  ].map(([name, value]) => (
                    <div className="ep-metric" key={name}>
                      <span>{name}</span>
                      <strong>{money(Number(value))}</strong>
                    </div>
                  ))}
                </div>
                {o.wallet.available < o.settings.lowBalance && (
                  <div className="ep-inline-note">
                    <Wallet size={17} />
                    可用测试余额低于提醒阈值 {money(o.settings.lowBalance)}
                    ，可用测试充值补充。
                  </div>
                )}
              </>
            ) : (
              <div className="ep-inline-note">
                研究员可查看调用记录并进行计费演练，账户充值和总余额由所有者 /
                财务管理。
              </div>
            )}
            <div className="ep-panel">
              <h3>真实模型调用</h3>
              <p>
                保留接口返回的用量；未返回的字段显示「—」，不会估算成真实账单。失败或中断需以供应商账单核对。
              </p>
              {o.inferenceUsage?.length ? (
                <div className="ep-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>范围 / 模型</th>
                        <th>输入 / 缓存 / 输出</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.inferenceUsage.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>
                              {c.projectId
                                ? o.projects.find((p) => p.id === c.projectId)
                                    ?.name || "项目调用"
                                : "账号对话"}
                            </strong>
                            <small>
                              {c.modelName} · {time(c.at)}
                            </small>
                            <small>
                              {c.gateway} · {c.actualModel || "等待接口返回"}
                            </small>
                          </td>
                          <td>
                            {c.tokens?.input?.toLocaleString() ?? "—"} /{" "}
                            {c.tokens?.cached?.toLocaleString() ?? "—"} /{" "}
                            {c.tokens?.output?.toLocaleString() ?? "—"}
                            <small>未扣平台余额</small>
                          </td>
                          <td>
                            <Badge status={c.status} />
                            {c.error && <small>{c.error}</small>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>尚无真实调用。选择 Gemini 后发送研究问题即可记录。</p>
              )}
            </div>
            <div className="ep-panel">
              <div className="ep-section-title">
                <div>
                  <h3>TEST 计费演练</h3>
                  <p>
                    开始时预留预算，完成后按示例 Token
                    结算；取消会释放全部预留。
                  </p>
                </div>
                {!finance && (
                  <button
                    disabled={!projectId || busy || current === "gemini"}
                    onClick={() => setModal("usage")}
                  >
                    开始计费演练
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              {o.usage.length ? (
                <div className="ep-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>项目 / 模型</th>
                        <th>输入 / 缓存 / 输出</th>
                        <th>预留 / 结算</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.usage.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>
                              {
                                o.projects.find((p) => p.id === u.projectId)
                                  ?.name
                              }
                            </strong>
                            <small>
                              {u.model.name} · {time(u.at)}
                            </small>
                          </td>
                          <td>
                            {u.tokens.input.toLocaleString()} /{" "}
                            {u.tokens.cached.toLocaleString()} /{" "}
                            {u.tokens.output.toLocaleString()}
                          </td>
                          <td>
                            {money(u.hold)} /{" "}
                            {u.status === "completed" ? money(u.cost) : "—"}
                          </td>
                          <td>
                            <Badge status={u.status} />
                          </td>
                          <td>
                            {u.status === "running" && !finance ? (
                              <div className="ep-actions">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      "/api/platform/usage/" + u.id + "/settle",
                                      { cancel: false },
                                    )
                                  }
                                >
                                  结算
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      "/api/platform/usage/" + u.id + "/settle",
                                      { cancel: true },
                                    )
                                  }
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <small>演练记录</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="暂无调用记录">
                  开始一次计费演练，验证余额预留、结算和取消流程。
                </Empty>
              )}
              <p className="ep-footnote">
                缓存 Token
                包含在输入总量内；每次调用按开始时的价格保存快照，费用向上取整到分。
              </p>
            </div>
            {o.wallet && (
              <>
                <div className="ep-panel">
                  <h3>充值订单</h3>
                  {o.orders.length ? (
                    <div className="ep-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>订单 / 时间</th>
                            <th>金额</th>
                            <th>状态</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.orders.map((order) => (
                            <tr key={order.id}>
                              <td>
                                <strong title={order.id}>
                                  {order.id.slice(0, 23)}
                                </strong>
                                <small>{time(order.createdAt)}</small>
                              </td>
                              <td>{money(order.amount)}</td>
                              <td>
                                <Badge status={order.status}>
                                  {order.status === "pending"
                                    ? "待模拟支付"
                                    : undefined}
                                </Badge>
                              </td>
                              <td>
                                {order.status === "pending" ? (
                                  <div className="ep-actions">
                                    <button
                                      className="ep-primary"
                                      disabled={busy}
                                      onClick={() =>
                                        run(
                                          "/api/platform/orders/" +
                                            order.id +
                                            "/pay-test",
                                          {},
                                          "POST",
                                          "测试余额已到账，未发生真实支付。",
                                        )
                                      }
                                    >
                                      模拟支付成功
                                    </button>
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        run(
                                          "/api/platform/orders/" +
                                            order.id +
                                            "/cancel",
                                          {},
                                        )
                                      }
                                    >
                                      取消
                                    </button>
                                  </div>
                                ) : (
                                  <small>测试订单</small>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>还没有测试充值订单。</p>
                  )}
                </div>
                <details className="ep-panel">
                  <summary>账户流水 · {o.ledger.length} 条</summary>
                  {o.ledger.map((l) => (
                    <div className="ep-ledger-row" key={l.id}>
                      <span>
                        {l.note}
                        <small>{time(l.at)}</small>
                      </span>
                      <strong>
                        {l.kind === "recharge" ? "+" : "−"}
                        {money(l.amount)}
                      </strong>
                    </div>
                  ))}
                </details>
              </>
            )}
            {owner && (
              <form
                className="ep-panel ep-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  run(
                    "/api/platform/settings",
                    {
                      spaceName: o.settings.spaceName,
                      monthCap: Math.round(Number(f.monthCap) * 100),
                      taskCap: Math.round(Number(f.taskCap) * 100),
                      lowBalance: Math.round(Number(f.lowBalance) * 100),
                    },
                    "PATCH",
                    "预算设置已保存。",
                  );
                }}
              >
                <h3>预算控制</h3>
                <p>
                  以下金额预算仅控制 TEST 演练。Gemini
                  网关费率尚未配置，暂不按人民币预算拦截；目前每次最多 2048 输出
                  Token，每个账号每分钟最多 6 次调用。
                </p>
                <div className="ep-form-grid">
                  {[
                    ["monthCap", "每月预算"],
                    ["taskCap", "单任务预算"],
                    ["lowBalance", "低余额提醒"],
                  ].map(([key, name]) => (
                    <label key={key}>
                      {name} / 元
                      <input
                        key={o.settings[key]}
                        name={key}
                        type="number"
                        min="0"
                        max="1000000"
                        step="0.01"
                        required
                        defaultValue={o.settings[key] / 100}
                      />
                    </label>
                  ))}
                </div>
                <button disabled={busy}>保存预算</button>
              </form>
            )}
          </>
        )}
        {section === "members" && (
          <>
            <div className="ep-section-title">
              <div>
                <h2>成员与权限</h2>
                <p>
                  所有者管理空间与数据授权。团队邀请待开放，当前成员以实际账号绑定为准。
                </p>
              </div>
              {owner && SANDBOX && (
                <button onClick={() => setModal("member")}>
                  <Plus size={15} />
                  添加成员草稿
                </button>
              )}
              {!SANDBOX && <button disabled>邀请成员 · 待开放</button>}
            </div>
            <div className="ep-role-grid">
              {[
                ["所有者", "管理项目、数据授权、预算和成员"],
                ["研究员", "查看研发资料、推进研究和使用预算"],
                ["财务", "查看用量与充值；无法读取研发结果"],
              ].map(([name, text]) => (
                <div className="ep-panel" key={name}>
                  <Users size={19} />
                  <h3>{name}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            {owner && (
              <div className="ep-panel">
                <h3>成员列表</h3>
                <div className="ep-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>成员</th>
                        <th>角色</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <strong>{m.name}</strong>
                            <small>{m.email || "当前空间所有者"}</small>
                          </td>
                          <td>
                            {m.role === "owner"
                              ? "所有者"
                              : m.role === "researcher"
                                ? "研究员"
                                : "财务"}
                          </td>
                          <td>
                            {m.status === "draft"
                              ? "邀请草稿 · 未发送"
                              : "已加入"}
                          </td>
                          <td>
                            {m.status === "draft" && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    "/api/platform/members/" + m.id,
                                    {},
                                    "DELETE",
                                  )
                                }
                              >
                                移除草稿
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {SANDBOX && auth.identity.kind === "demo" && (
              <div className="ep-setting-row">
                <div>
                  <h3>测试不同角色</h3>
                  <p>
                    仅限本机开发验收，可切回所有者。手机号登录已接入；团队邀请与组织成员绑定尚待接入。
                  </p>
                </div>
                <select
                  aria-label="测试角色"
                  disabled={busy}
                  value={role}
                  onChange={(e) =>
                    action(() => auth.setDemoRole(e.target.value))
                  }
                >
                  <option value="owner">所有者</option>
                  <option value="researcher">研究员</option>
                  <option value="finance">财务</option>
                </select>
              </div>
            )}
          </>
        )}
        {finance && !["billing", "members"].includes(section) && (
          <Empty title="当前为财务视角">
            <Link to="/account/billing">
              查看余额与用量
              <ArrowRight size={15} />
            </Link>
            <Link to="/account/members">查看成员权限</Link>
          </Empty>
        )}
      </div>
      {modal === "privacy" && (
        <Dialog title="确认参与公司模型优化" close={close}>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                "/api/knowledge/projects/" + projectId + "/privacy",
                { mode: "contribute", consent: true },
                "PATCH",
                "项目已选择参与优化，资料仍须逐份授权与复核。",
              );
            }}
          >
            <p>
              仅对「{p?.name}
              」生效。获许可、经审核的真实数据可导出为公司自有模型的优化候选集。
            </p>
            <label className="ep-check-row">
              <input type="checkbox" required />
              <span>我有权代表该项目作出授权，并同意上述用途。</span>
            </label>
            <p className="ep-footnote">
              可随时切回私密，停止后续导出。若将来执行真实训练，已训练模型的移除范围需要另行处理；当前没有训练任务执行。
            </p>
            <ErrorNote message={error} />
            <button disabled={busy} className="ep-primary">
              确认开启
            </button>
          </form>
        </Dialog>
      )}
      {modal === "external" && (
        <Dialog title="确认外部模型处理范围" close={close}>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                base + "/model",
                { model: selected.id, externalConsent: true },
                "PATCH",
                "已保存模型与外部推理范围；发送问题时开始调用。",
              );
            }}
          >
            <ExternalLink size={23} />
            <p>
              使用「{selected.name}
              」时，当前问题、对话历史及获准检索的项目记忆与证据会交给{" "}
              {selected.gateway || selected.provider}{" "}
              处理。其他项目需分别允许外部推理。
            </p>
            <label className="ep-check-row">
              <input required type="checkbox" />
              <span>我确认上述数据范围用于所显示网关的外部推理。</span>
            </label>
            <small>
              该确认不代表同意 EliangMat AI 使用项目数据训练公司模型。
            </small>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              确认并选择模型
            </button>
          </form>
        </Dialog>
      )}
      {SANDBOX && modal === "topup" && (
        <Dialog title="测试充值" close={close}>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                "/api/platform/orders",
                {
                  amount: Math.round(Number(f.get("amount")) * 100),
                  requestId: crypto.randomUUID(),
                },
                "POST",
                "订单已创建，请在订单列表点击“模拟支付成功”完成演练。",
              );
            }}
          >
            <CreditCard size={26} />
            <p>
              先创建测试订单，再模拟支付回调。不会打开收银台或产生真实付款。
            </p>
            <label>
              测试金额 / 元
              <input
                type="number"
                name="amount"
                min="1"
                max="10000"
                step="0.01"
                defaultValue="100"
                required
                autoFocus
              />
            </label>
            <ErrorNote message={error} />
            <button disabled={busy} className="ep-primary">
              创建测试订单
              <ArrowRight size={15} />
            </button>
          </form>
        </Dialog>
      )}
      {SANDBOX && modal === "usage" && (
        <Dialog title="计费流程演练" close={close}>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                base + "/usage",
                {
                  budget: Math.round(Number(f.get("budget")) * 100),
                  requestId: crypto.randomUUID(),
                },
                "POST",
                "已预留测试预算；在调用明细中结算或取消。",
              );
            }}
          >
            <p>
              {p?.name} · {o.models.find((m) => m.id === current)?.name}
            </p>
            <div className="ep-inline-note">
              示例输入 12,000 Token（含缓存 2,000），输出
              3,000；不调用语言模型。
            </div>
            <label>
              本次预留预算 / 元
              <input
                name="budget"
                type="number"
                min="0.01"
                max={o.settings.taskCap / 100}
                step="0.01"
                required
                defaultValue={Math.min(1, o.settings.taskCap / 100)}
              />
            </label>
            <small>
              单任务上限 {money(o.settings.taskCap)} ·
              费用按启动时的模型价格结算。
            </small>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              预留预算并开始演练
            </button>
          </form>
        </Dialog>
      )}
      {SANDBOX && modal === "member" && (
        <Dialog title="添加成员邀请草稿" close={close}>
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                "/api/platform/members",
                {
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  projectIds: projectId ? [projectId] : [],
                },
                "POST",
                "成员草稿已保存，未发送邀请。",
              );
            }}
          >
            <label>
              姓名
              <input name="name" required />
            </label>
            <label>
              邮箱
              <input name="email" type="email" required />
            </label>
            <label>
              角色
              <select name="role">
                <option value="researcher">研究员</option>
                <option value="finance">财务</option>
              </select>
            </label>
            <p>
              保存邀请草稿以测试账号管理界面，实际成员加入与项目范围授权尚待接入。
            </p>
            <ErrorNote message={error} />
            <button disabled={busy} className="ep-primary">
              保存草稿
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
