import { createPortal } from "react-dom";
import { useState } from "react";
import { usePlatform } from "./context";
import { platformApi } from "./api";
import { Dialog, ErrorNote } from "./ui";
import type { Model, ResearchWorkflow } from "./types";

export function ModelCallMeta({
  message,
  onContinue,
  busy = false,
}: {
  message: ResearchWorkflow["messages"][number];
  onContinue?: () => void;
  busy?: boolean;
}) {
  if (message.answerMode !== "model") return null;
  const number = (n: number | null | undefined) =>
    n == null ? "未返回" : n.toLocaleString();
  return (
    <div className="ep-call-meta">
      <span>
        {message.modelName} · 输入 {number(message.tokens?.input)} / 输出{" "}
        {number(message.tokens?.output)} Token
      </span>
      {message.finishReason === "length" && (
        <span>本段达到长度上限，回复尚未完成。</span>
      )}
      {message.finishReason === "length" && onContinue && !message.contextStale && (
        <button type="button" disabled={busy} onClick={onContinue}>继续生成</button>
      )}
      {message.citationReview && !message.contextStale && (
        <span>
          {message.citationReview.verifiedQuotes ? `${message.citationReview.verifiedQuotes} 段原文出处已核对；其余为模型分析` : "模型分析 · 尚待研究验证"}
          {message.citationReview.removed > 0 && ` · ${message.citationReview.removed} 处不匹配引用已移除`}
        </span>
      )}
    </div>
  );
}
export function AssistantModelPicker({
  current,
  approved = false,
  onChanged,
}: {
  current: string;
  approved?: boolean;
  onChanged: () => Promise<void>;
}) {
  const { overview, busy, action, error } = usePlatform();
  const [pending, setPending] = useState<Model | null>(null);
  const models = overview.models.filter((m) => m.id === "materials" || m.external);
  const currentModel = models.find((m) => m.id === current);
  async function select(model: string, externalConsent = false, externalFingerprint?: string) {
    if (
      await action(async () => {
        await platformApi(
          "/api/platform/conversation/model",
          { model, externalConsent, ...(externalConsent ? { externalFingerprint } : {}) },
          "PATCH",
        );
        await onChanged();
      })
    )
      setPending(null);
  }
  return (
    <>
      <select
        aria-label="账号对话模型"
        value={current}
        disabled={busy}
        onChange={(e) => {
          const model = overview.models.find((m) => m.id === e.target.value);
          if (model?.external) setPending(model);
          else select(e.target.value);
        }}
      >
        {!currentModel && (
          <option value={current} disabled>原模型不可用 · 请重新选择</option>
        )}
        {models.map((m) => (
            <option
              key={m.id}
              value={m.id}
              disabled={m.external && !m.connected}
            >
              {m.id === "materials"
                ? "账号记忆检索"
                : m.name + (m.connected ? "" : " · 待配置")}
            </option>
          ))}
      </select>
      {currentModel?.external && currentModel.connected && !approved && (
        <button type="button" disabled={busy} onClick={() => setPending(currentModel)}>
          确认处理范围
        </button>
      )}
      {pending &&
        createPortal(
          <Dialog
            title={`使用 ${pending.name} 对话`}
            close={() => !busy && setPending(null)}
          >
            <form
              className="ep-form"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                select(pending.id, true, pending.fingerprint);
              }}
            >
              <p>
                将当前问题、允许的当前对话和相关账号记忆发送给第三方服务
                「{pending.provider}」，由「{pending.name}」通过{" "}
                {pending.gateway || "模型服务接口"}{" "}
                生成回复。其他项目的记忆与证据，只有在该项目单独确认同一模型服务后才会带入。
              </p>
              <p>
                此选择用于之后的账号对话，与项目的模型选择、私密模式和公司训练授权分别管理。
              </p>
              <p>
                会产生供应商 API 用量；平台记录真实
                Token。当前由已配置的供应商账号结算，平台充值待开放。
              </p>
              <label className="ep-check-row">
                <input type="checkbox" required />
                <span>
                  我同意将上述数据发送给所显示的第三方服务进行推理，此确认不授权公司模型训练。
                </span>
              </label>
              <ErrorNote message={error} />
              <button className="ep-primary" disabled={busy}>
                确认并使用
              </button>
            </form>
          </Dialog>,
          document.body,
        )}
    </>
  );
}

export function MessageText({
  message,
}: {
  message: ResearchWorkflow["messages"][number];
}) {
  if (message.answerMode !== "model") return <p>{message.text}</p>;
  return (
    <div className="ep-model-answer">
      {message.text.split(/\n{2,}/).map((paragraph, i) => {
        if (/^「[^「」]+」\[原文\d+\]$/.test(paragraph.trim()))
          return <blockquote key={i}>{paragraph}</blockquote>;
        return <p key={i}>
          {paragraph
            .replace(/^#{1,4} /gm, "")
            .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
            .map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : part.startsWith("`") && part.endsWith("`") ? (
                <code key={j}>{part.slice(1, -1)}</code>
              ) : (
                part
              ),
            )}
        </p>;
      })}
    </div>
  );
}
