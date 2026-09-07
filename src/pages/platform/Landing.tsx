import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
export default function Landing({
  authenticated = false,
}: {
  authenticated?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== ref.current?.contentWindow ||
        event.data?.type !== "eliangmat:navigate"
      )
        return;
      if (
        ["/workspace", "/knowledge", "/account/privacy", "/login"].includes(
          event.data.path,
        )
      )
        navigate(
          event.data.path === "/workspace" ? "/assistant" : event.data.path,
        );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [navigate]);
  return (
    <iframe
      ref={ref}
      className="ep-landing"
      title="EliangMat AI 材料研发滑动首页"
      src={"/platform/hero.html?authenticated=" + (authenticated ? "1" : "0")}
    />
  );
}
