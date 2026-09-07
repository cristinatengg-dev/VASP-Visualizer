import { useEffect, useRef, useState } from "react";
import { streamPlatformReply } from "./api";
import type { ResearchMessage } from "./types";
export interface LiveTurn {
  user: ResearchMessage;
  assistant: ResearchMessage;
  running: boolean;
}
export function useReplyStream(scope: string) {
  const [turn, setTurn] = useState<LiveTurn | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    setTurn(null);
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, [scope]);
  const update = (fn: (t: LiveTurn) => LiveTurn) => {
    if (active.current) setTurn((t) => (t ? fn(t) : t));
  };
  async function send(
    path: string,
    body: { message: string; threadId?: string; continueFrom?: string },
  ): Promise<ResearchMessage[] | null> {
    if (controller.current) throw new Error("已有回复正在进行");
    const abort = new AbortController();
    controller.current = abort;
    const at = new Date().toISOString(),
      requestId = crypto.randomUUID();
    setTurn({
      user: { id: requestId + "-user", role: "user", text: body.message, at },
      assistant: {
        id: requestId,
        role: "assistant",
        text: "",
        at,
        answerMode: "model",
        responseStatus: "running",
        processTrail: [
          { code: "connecting", label: "正在发送问题", at, elapsedMs: 0 },
        ],
      },
      running: true,
    });
    let result: ResearchMessage[] | null = null;
    try {
      await streamPlatformReply(
        path,
        { ...body, requestId },
        (event) => {
          if (event.type === "started")
            update(() => ({
              user: event.user,
              assistant: { ...event.assistant, responseStatus: "running" },
              running: true,
            }));
          else if (event.type === "progress")
            update((t) => ({
              ...t,
              assistant: {
                ...t.assistant,
                processTrail: [
                  ...(t.assistant.processTrail || []),
                  event.event,
                ],
              },
            }));
          else if (event.type === "delta")
            update((t) => ({
              ...t,
              assistant: {
                ...t.assistant,
                text: t.assistant.text + event.text,
              },
            }));
          else if (event.type === "summary")
            update((t) => ({
              ...t,
              assistant: {
                ...t.assistant,
                reasoningSummary:
                  (t.assistant.reasoningSummary || "") + event.text,
              },
            }));
          else if (event.type === "done") {
            result = event.messages;
            update((t) => ({
              ...t,
              running: false,
              assistant: event.messages.find(
                (m) => m.id === t.assistant.id,
              ) || { ...t.assistant, responseStatus: "completed" },
            }));
          } else if (event.type === "error")
            update((t) => ({
              ...t,
              running: false,
              assistant: event.messages?.find(
                (m) => m.id === t.assistant.id,
              ) || {
                ...t.assistant,
                responseStatus: "failed",
                text: event.status === 409 ? "" : t.assistant.text,
                error: event.error,
              },
            }));
        },
        abort.signal,
      );
      return result;
    } catch (error) {
      const cancelled = abort.signal.aborted;
      update((t) => ({
        ...t,
        running: false,
        assistant: {
          ...t.assistant,
          responseStatus: cancelled ? "cancelled" : "failed",
          error: cancelled
            ? "已停止接收回复；已处理的 Token 仍可能计费。"
            : error instanceof Error
              ? error.message
              : "回复未完成",
          durationMs: Date.now() - Date.parse(t.assistant.at),
        },
      }));
      if (!cancelled) throw error;
      return null;
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }
  return {
    turn,
    send,
    stop: () => controller.current?.abort(),
    clear: () => setTurn(null),
  };
}
