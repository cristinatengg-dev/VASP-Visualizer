import { SANDBOX } from "./product-mode";
import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PhoneLoginPanel } from "../../components/LoginPage";
import { platformApi } from "./api";
import Landing from "./Landing";
import Guide from "./Guide";
import { Context, type PlatformIdentity } from "./session-context";
const Terms = lazy(() => import("../TermsOfService")),
  Privacy = lazy(() => import("../PrivacyPolicy")),
  Cookies = lazy(() => import("../CookiePolicy"));
interface Session {
  authenticated: boolean;
  identity?: PlatformIdentity;
  delivery: "local" | "tencent";
  development: boolean;
}
function safeReturn(value: string | null) {
  try {
    const url = new URL(value || "/assistant", "http://local.invalid");
    if (
      url.origin === "http://local.invalid" &&
      /^\/(assistant|workspace|knowledge|account|laboratory|tools|platform-guide)(\/|$)/.test(
        url.pathname,
      )
    )
      return url.pathname + url.search + url.hash;
  } catch {
    /* default route */
  }
  return "/assistant";
}
export function PlatformAuthBoundary({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    channel = useRef<BroadcastChannel | null>(null),
    live = useRef(true);
  const location = useLocation(),
    navigate = useNavigate();
  async function refresh() {
    const n = ++epoch.current;
    try {
      const next = await platformApi<Session>("/api/auth/session");
      if (live.current && n === epoch.current) {
        setSession(next);
        setError("");
      }
    } catch (e) {
      if (live.current && n === epoch.current)
        setError(e instanceof Error ? e.message : "登录服务暂不可用");
    }
  }
  useEffect(() => {
    live.current = true;
    refresh();
    const unauthorized = () => {
      epoch.current++;
      setSession((s) => ({ ...s!, authenticated: false, identity: undefined }));
    };
    const sync = () => refresh();
    const broadcast = new BroadcastChannel("eliangmat-auth");
    channel.current = broadcast;
    broadcast.onmessage = sync;
    window.addEventListener("eliangmat:unauthorized", unauthorized);
    window.addEventListener("eliangmat:session-changed", sync);
    window.addEventListener("focus", sync);
    return () => {
      live.current = false;
      broadcast.close();
      window.removeEventListener("eliangmat:unauthorized", unauthorized);
      window.removeEventListener("eliangmat:session-changed", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  function accept(next: Session) {
    epoch.current++;
    setSession(next);
    setError("");
    channel.current?.postMessage("changed");
  }
  const returnTo = safeReturn(
    new URLSearchParams(location.search).get("returnTo"),
  );
  async function login(phone: string, code: string) {
    const next = await platformApi<Session>("/api/auth/login", { phone, code });
    accept(next);
    navigate(
      next.identity?.role === "finance" ? "/account/billing" : returnTo,
      { replace: true },
    );
  }
  async function switchDemo(account: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const next = await platformApi<Session>("/api/auth/development-login", {
        account,
      });
      accept(next);
      navigate(returnTo, { replace: true });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法进入演练账号");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await platformApi("/api/auth/logout", {});
    accept({ ...session!, authenticated: false, identity: undefined });
    navigate("/login", { replace: true });
  }
  async function setDemoRole(role: string) {
    accept(await platformApi<Session>("/api/auth/development-role", { role }));
  }
  if (location.pathname === "/")
    return <Landing authenticated={session?.authenticated === true} />;
  if (
    location.pathname === "/terms-of-service" ||
    location.pathname === "/privacy-policy" ||
    location.pathname === "/cookie-policy"
  )
    return (
      <Suspense fallback={null}>
        {location.pathname === "/terms-of-service" ? <Terms /> : location.pathname === "/privacy-policy" ? <Privacy /> : <Cookies />}
      </Suspense>
    );
  if (location.pathname === "/platform-guide" && !session?.authenticated)
    return (
      <div className="ep-public-guide">
        <Link to="/">← 返回首页</Link>
        <Guide />
        <Link to="/login">登录体验平台 →</Link>
      </div>
    );
  if (!session)
    return (
      <div className="ep-auth-loading">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={refresh}>重新连接</button>
            <Link to="/">返回首页</Link>
          </>
        ) : (
          <Loader2 className="ep-spin" />
        )}
      </div>
    );
  if (location.pathname === "/login") {
    if (
      session.authenticated &&
      (!SANDBOX || !new URLSearchParams(location.search).has("development"))
    )
      return (
        <Navigate
          to={
            session.identity?.role === "finance" ? "/account/billing" : returnTo
          }
          replace
        />
      );
    return (
      <div className="ep-login-page">
        <Link className="ep-login-back" to="/">
          ← 返回首页
        </Link>
        <PhoneLoginPanel
          sendCode={(phone) =>
            platformApi("/api/auth/send-phone-code", { phone })
          }
          login={login}
          localVerification={SANDBOX && session.delivery === "local"}
        >
          {SANDBOX && session.development && (
            <details
              className="ep-login-dev"
              open={
                new URLSearchParams(location.search).has("development")
                  ? true
                  : undefined
              }
            >
              <summary>开发测试</summary>
              <p>客户 A / B 为独立演练空间，保留原测试资料和虚拟余额。</p>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => switchDemo("A")}
                >
                  进入客户 A 演练
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => switchDemo("B")}
                >
                  进入客户 B 演练
                </button>
              </div>
              {error && <p role="alert">{error}</p>}
            </details>
          )}
        </PhoneLoginPanel>
      </div>
    );
  }
  if (!session.authenticated || !session.identity)
    return (
      <Navigate
        to={
          "/login?returnTo=" +
          encodeURIComponent(
            safeReturn(location.pathname + location.search + location.hash),
          )
        }
        replace
      />
    );
  const identity = session.identity;
  return (
    <Context.Provider value={{ identity, logout, switchDemo, setDemoRole }}>
      <div key={identity.userId + identity.workspaceId + identity.role}>
        {children}
      </div>
    </Context.Provider>
  );
}
