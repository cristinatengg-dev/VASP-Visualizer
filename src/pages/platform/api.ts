import { PLATFORM_APP } from "./product-mode";
export async function platformApi<T = unknown>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const headers: Record<string, string> = {
    "X-EliangMat-Client": "knowledge-v1",
  };
  if (!PLATFORM_APP) {
    const token = localStorage.getItem("vasp_token");
    if (token) headers.Authorization = "Bearer " + token;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method: body === undefined ? "GET" : method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "服务暂不可用，请稍后重试" }));
  if (response.status === 401 && !path.startsWith("/api/auth/"))
    window.dispatchEvent(new Event("eliangmat:unauthorized"));
  if (!response.ok)
    throw Object.assign(new Error(data.error || "请求失败"), {
      status: response.status,
      retryAfter:
        data.retryAfter ||
        Number(response.headers.get("Retry-After")) ||
        undefined,
    });
  return data;
}
export const money = (cents: number) => "¥" + (cents / 100).toFixed(2);
export const time = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
export function saveJson(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function streamPlatformReply(
  path: string,
  body: unknown,
  onEvent: (event: import("./types").ReplyEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-EliangMat-Client": "knowledge-v1",
    Accept: "text/event-stream",
  };
  if (!PLATFORM_APP) {
    const token = localStorage.getItem("vasp_token");
    if (token) headers.Authorization = "Bearer " + token;
  }
  const response = await fetch(path, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "服务连接失败" }));
    if (response.status === 401)
      window.dispatchEvent(new Event("eliangmat:unauthorized"));
    throw Object.assign(new Error(data.error || "请求失败"), {
      status: response.status,
    });
  }
  if (!response.body) throw new Error("当前浏览器无法读取实时回复");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    finished = false;
  const frame = (value: string) => {
    const data = value
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const event = JSON.parse(data) as import("./types").ReplyEvent;
    onEvent(event);
    if (event.type === "done") finished = true;
    if (event.type === "error")
      throw Object.assign(new Error(event.error), { status: event.status });
  };
  const drain = () => {
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      frame(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 2000000) throw new Error("实时回复数据过大");
      drain();
    }
    buffer += decoder.decode();
    drain();
    if (buffer.trim()) frame(buffer);
    if (!finished)
      throw new Error("连接已中断，回复可能未完成。请刷新查看已保存状态。");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
