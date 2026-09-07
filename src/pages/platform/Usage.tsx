import { CreditCard } from "lucide-react";
import { usePlatform } from "./context";
import { time } from "./api";
import { Badge } from "./ui";

export default function Usage() {
  const { overview } = usePlatform();
  const calls = overview.inferenceUsage || [];
  const total = (key: "input" | "output") =>
    calls.reduce((n, c) => n + (c.tokens?.[key] || 0), 0).toLocaleString();
  return (
    <>
      <div className="ep-section-title">
        <div>
          <h2>模型用量</h2>
          <p>查看每次对话的模型、处理状态与 Token 用量。</p>
        </div>
      </div>
      <div className="ep-wallet-grid">
        <div className="ep-metric">
          <span>模型调用</span>
          <strong>{calls.length}</strong>
        </div>
        <div className="ep-metric">
          <span>已记录输入 Token</span>
          <strong>{total("input")}</strong>
        </div>
        <div className="ep-metric">
          <span>已记录输出 Token</span>
          <strong>{total("output")}</strong>
        </div>
      </div>
      <div className="ep-setting-row">
        <div>
          <h3>
            <CreditCard size={17} /> 充值与结算
          </h3>
          <p>
            充值与平台结算待开放。当前模型费用由已配置的供应商账号结算，平台记录返回的用量。
          </p>
        </div>
        <button disabled>充值 · 待开放</button>
      </div>
      <div className="ep-panel">
        <h3>调用明细</h3>
        {calls.length ? (
          <div className="ep-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>范围 / 模型</th>
                  <th>输入 / 缓存 / 输出 Token</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>
                        {c.projectId
                          ? overview.projects.find((p) => p.id === c.projectId)
                              ?.name || "项目对话"
                          : "账号对话"}
                      </strong>
                      <small>
                        {c.modelName} · {time(c.at)}
                      </small>
                      <small>{c.actualModel || c.gateway}</small>
                    </td>
                    <td>
                      {c.tokens?.input?.toLocaleString() ?? "—"} /{" "}
                      {c.tokens?.cached?.toLocaleString() ?? "—"} /{" "}
                      {c.tokens?.output?.toLocaleString() ?? "—"}
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
          <p>
            还没有模型调用记录。使用模型发送第一条消息后，用量会显示在这里。
          </p>
        )}
        <p className="ep-footnote">
          「—」表示供应商未返回该字段，汇总仅包含已返回的用量。缓存包含在输入总量内；最终费用以供应商账单为准。
        </p>
      </div>
    </>
  );
}
