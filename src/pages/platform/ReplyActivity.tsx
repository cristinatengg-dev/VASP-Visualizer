import { useEffect, useState } from "react";
import { Check, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import type { ResearchMessage } from "./types";
import type { LiveTurn } from "./useReplyStream";
import { MessageText, ModelCallMeta } from "./ModelCall";
export function ReplyActivity({
  message,
  running = false,
}: {
  message: ResearchMessage;
  running?: boolean;
}) {
  const [expanded, setExpanded] = useState(running);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const steps = message.processTrail || [];
  if (!steps.length) return null;
  const incomplete =
    message.responseStatus === "failed" ||
    message.responseStatus === "cancelled" || message.finishReason === "length";
  const duration = running
    ? Math.max(0, now - Date.parse(message.at))
    : message.durationMs || steps.at(-1)?.elapsedMs || 0;
  const title = running
    ? steps.at(-1)!.label
    : incomplete
      ? message.responseStatus === "cancelled"
        ? "已停止"
        : message.finishReason === "length" ? "待续写" : "回复未完成"
      : "处理完成";
  return (
    <div className="ep-reply-activity">
      <button
        type="button"
        className="ep-activity-toggle"
        aria-expanded={expanded}
        aria-label={`${title}，${(duration / 1000).toFixed(running ? 0 : 1)} 秒，${expanded ? "收起" : "展开"}处理过程`}
        onClick={() => setExpanded((v) => !v)}
      >
        {running ? (
          <Loader2 size={13} className="ep-spin" />
        ) : incomplete ? (
          <CircleAlert size={13} />
        ) : (
          <Check size={13} />
        )}
        <span role={running ? "status" : undefined}>{title}</span>
        <span>{(duration / 1000).toFixed(running ? 0 : 1)} 秒</span>
        <ChevronRight size={13} className={expanded ? "ep-chevron-open" : ""} />
      </button>
      {expanded && (
        <div className="ep-activity-details">
          <ol>
            {steps.map((s, i) => (
              <li key={s.code + String(i)}>
                <span className="ep-activity-dot" />
                <span>{s.label}</span>
                <time>{(s.elapsedMs / 1000).toFixed(1)}s</time>
              </li>
            ))}
          </ol>
          {message.reasoningSummary && (
            <div className="ep-process-summary">
              <small>模型提供的摘要</small>
              <p>{message.reasoningSummary}</p>
            </div>
          )}
        </div>
      )}
      {message.error && <p className="ep-reply-interrupted">{message.error}</p>}
    </div>
  );
}
export function LiveReply({
  turn,
  messages,
}: {
  turn: LiveTurn | null;
  messages: ResearchMessage[];
}) {
  if (!turn) return null;
  return (
    <>
      {!messages.some((m) => m.id === turn.user.id) && (
        <div className="ep-user-message">
          <p>{turn.user.text}</p>
        </div>
      )}
      {!messages.some((m) => m.id === turn.assistant.id) && (
        <div className="ep-response ep-live-response">
          <strong className="ep-assistant-name">EliangMat AI</strong>
          <ReplyActivity message={turn.assistant} running={turn.running} />
          {turn.assistant.text && <MessageText message={turn.assistant} />}{" "}
          {!turn.running && <ModelCallMeta message={turn.assistant} />}
        </div>
      )}
    </>
  );
}
