import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  X,
  CircleAlert,
} from "lucide-react";
const labels: Record<string, string> = {
  completed: "已完成",
  running: "进行中",
  waiting: "待你确认",
  pending: "待执行",
  paused: "已暂停",
  blocked: "待前置条件",
  draft: "待确认计划",
  approved: "已确认",
  accepted: "已确认可用",
  excluded: "暂不纳入",
  unconfigured: "待接通",
  paid: "已到账",
  cancelled: "已取消",
  failed: "执行失败",
  interrupted: "已中断",
};
export function Badge({
  status,
  children,
}: {
  status: string;
  children?: ReactNode;
}) {
  const Icon = ["completed", "accepted", "approved", "paid"].includes(status)
    ? CheckCircle2
    : status === "running"
      ? Loader2
      : ["waiting", "draft", "blocked", "excluded"].includes(status)
        ? CircleAlert
        : status === "pending" || status === "paused"
          ? Clock3
          : Circle;
  return (
    <span className={"ep-badge ep-" + status}>
      <Icon size={13} className={status === "running" ? "ep-spin" : ""} />
      {children || labels[status] || status}
    </span>
  );
}
export function Dialog({
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
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      className={"ep-dialog " + (wide ? "ep-dialog-wide" : "")}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="ep-icon"
          aria-label="关闭对话框"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="ep-empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function ErrorNote({ message }: { message: string }) {
  return message ? (
    <p className="ep-error" role="alert">
      {message}
    </p>
  ) : null;
}
