import { ReplyActivity, LiveReply } from "./ReplyActivity";
import { useReplyStream } from "./useReplyStream";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Loader2,
  Plus,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { usePlatform } from "./context";
import { platformApi } from "./api";
import { MemoryCitations } from "./Memory";
import { AssistantModelPicker, ModelCallMeta, MessageText } from "./ModelCall";
import { ErrorNote } from "./ui";
import type { ResearchWorkflow } from "./types";

type Conversation = {
  modelId: string;
  modelConnected: boolean;
  messages: ResearchWorkflow["messages"];
  memoryEnabled: boolean;
  threadId: string;
  threads: { id: string; title: string }[];
};
export default function Assistant() {
  const { action, busy, overview, openNew } = usePlatform();
  const [data, setData] = useState<Conversation | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const stream = useReplyStream("account");
  const bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let live = true;
    platformApi<Conversation>("/api/platform/conversation")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length, data?.threadId, stream.turn?.user.id]);
  async function select(threadId = "") {
    stream.clear();
    await action(async () => {
      setData(
        await platformApi<Conversation>("/api/platform/conversation/select", {
          threadId,
        }),
      );
      setMessage("");
      input.current?.focus();
    });
  }
  async function send(continueFrom?: string) {
    const prompt = continueFrom ? "继续上一条未完成的回复，从断点接着写，优先补齐所需清单或方案，不重复已写内容，也不要重新回答历史问题。" : message.trim();
    if (!prompt || busy) return;
    if (!continueFrom) setMessage("");
    const ok = await action(async () => {
      const messages = await stream.send("/api/platform/conversation", {
        message: prompt,
        threadId: data?.threadId || "",
        continueFrom,
      });
      if (messages) setData((d) => (d ? { ...d, messages } : d));
      setData(await platformApi<Conversation>("/api/platform/conversation"));
      if (messages) stream.clear();
    });
    if (!ok && !continueFrom) setMessage(prompt);
  }

  return (
    <div className="ep-assistant-page">
      <header className="ep-assistant-header">
        <div>
          <strong>EliangMat AI</strong>
          <span>
            {overview?.projects.length
              ? "从上一次研究继续"
              : "从一个材料目标开始"}
          </span>
        </div>
        <div className="ep-actions">
          {!!data?.threads.length && (
            <select
              aria-label="历史对话"
              value={data.threadId}
              disabled={busy}
              onChange={(e) => select(e.target.value)}
            >
              {data.threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          <button disabled={busy} onClick={() => select()}>
            <Plus size={14} />
            新对话
          </button>
          <Link to="/account/memory" aria-label="自动记忆设置">
            <SlidersHorizontal size={15} />
          </Link>
        </div>
      </header>
      <div className="ep-assistant-thread">
        <ErrorNote message={error} />
        {!data && !error && (
          <div className="ep-loading">
            <Loader2 className="ep-spin" />
          </div>
        )}
        {data && !data.messages.length && !stream.turn && (
          <div className="ep-assistant-empty">
            <span className="ep-assistant-monogram">E</span>
            <h1>
              {overview?.projects.length
                ? "今天继续哪一项研究？"
                : "开始第一项材料研究"}
            </h1>
            <p>
              直接接着说。这个账号里的对话、项目、资料与进度，会按相关性自动带入。
            </p>
            {!overview?.projects.length && (
              <button className="ep-primary" onClick={() => openNew()}>
                新建第一项研究
              </button>
            )}
            <div className="ep-assistant-prompts">
              {[
                "回顾账号里各个项目的进展",
                "之前约定的研究条件是什么？",
                "我们有哪些设备和仿真工具？",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setMessage(q);
                    input.current?.focus();
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {data?.messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "ep-user-message" : "ep-response"}
          >
            {m.role === "assistant" && (
              <strong className="ep-assistant-name">EliangMat AI</strong>
            )}
            <ReplyActivity message={m} />
            <MessageText message={m} />
            <ModelCallMeta message={m} busy={busy} onContinue={data?.modelId === "gemini" && m.id === data.messages.filter(m => m.role === "assistant").at(-1)?.id ? () => send(m.id) : undefined} />
            {m.actionDraft && (
              <button onClick={() => openNew(m.actionDraft.goal)}>
                查看研究需求草稿
              </button>
            )}
            {m.role === "assistant" && (
              <MemoryCitations
                references={m.memoryReferences}
                answer={m.answerMode === "recall" || m.answerMode === "facts"}
                all={m.answerMode === "facts"}
              />
            )}
          </div>
        ))}
        <LiveReply turn={stream.turn} messages={data?.messages || []} />
        <div ref={bottom} />
      </div>
      <form
        className="ep-composer ep-assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          disabled={busy}
          aria-label="发送给 EliangMat AI"
          placeholder="继续上次研究，或直接补充新的想法…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={3000}
          required
        />
        <footer>
          <div className="ep-composer-model">
            <AssistantModelPicker
              current={data?.modelId || "materials"}
              onChanged={async () =>
                setData(
                  await platformApi<Conversation>("/api/platform/conversation"),
                )
              }
            />
            <span>
              {data?.memoryEnabled === false
                ? "自动记忆已关闭"
                : "自动参考账号历史"}{" "}
              ·{" "}
              {data?.modelId === "gemini"
                ? busy
                  ? "Gemini 正在回复…"
                  : "仅带入获准外部推理的资料"
                : "本地检索，未调用大模型"}
            </span>
          </div>
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
              disabled={busy || !data || !message.trim()}
              aria-label="发送消息"
            >
              <ArrowUp size={17} />
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
