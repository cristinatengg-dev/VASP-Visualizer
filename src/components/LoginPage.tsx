import { useEffect, useId, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useStore } from "../store/useStore";
import { API_BASE_URL } from "../config";
import { normalizePhoneNumber } from "../utils/phone";
import { SUPPORT_MAILTO } from "../constants/contact";
import "../pages/platform/login.css";

export interface CodeDelivery {
  success: boolean;
  delivery?: "local" | "tencent";
  developmentCode?: string;
  retryAfter?: number;
  message?: string;
}
export function PhoneLoginPanel({
  sendCode,
  login,
  localVerification = false,
  children,
}: {
  sendCode: (phone: string) => Promise<CodeDelivery>;
  login: (phone: string, code: string) => Promise<unknown>;
  localVerification?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [sending, setSending] = useState(false),
    [logging, setLogging] = useState(false),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false),
    [developmentCode, setDevelopmentCode] = useState("");
  const busy = sending || logging;
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  async function send() {
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) {
      setError("请输入有效手机号；中国大陆号码可直接输入 11 位。");
      return;
    }
    setSending(true);
    setError("");
    setSent(false);
    setDevelopmentCode("");
    try {
      const response = await sendCode(normalized);
      setSeconds(response.retryAfter || 60);
      setSent(true);
      setDevelopmentCode(
        localVerification && response.delivery === "local"
          ? response.developmentCode || ""
          : "",
      );
    } catch (e) {
      const err = e as Error & { retryAfter?: number };
      setError(err.message || "发送失败，请重试。");
      if (err.retryAfter) setSeconds(err.retryAfter);
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="ep-login-card">
      <header>
        <div className="ep-login-symbol">
          <ShieldCheck size={25} />
        </div>
        <h1>EliangMat AI</h1>
        <p>登录，继续你的材料研究</p>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const normalized = normalizePhoneNumber(phone);
          if (!normalized || !/^\d{6}$/.test(code)) {
            setError("请输入有效手机号和六位验证码。");
            return;
          }
          setLogging(true);
          setError("");
          try {
            await login(normalized, code);
          } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败，请重试。");
          } finally {
            setLogging(false);
          }
        }}
      >
        <label htmlFor={id + "phone"}>手机号</label>
        <input
          id={id + "phone"}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="请输入手机号"
          value={phone}
          disabled={busy}
          onChange={(e) => {
            setPhone(e.target.value);
            setCode("");
            setError("");
            setSent(false);
            setDevelopmentCode("");
            setSeconds(0);
          }}
          required
        />
        <small>中国大陆号码直接输入 11 位，其他地区请带国家或地区代码。</small>
        <label htmlFor={id + "code"}>验证码</label>
        <div className="ep-login-code">
          <input
            id={id + "code"}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="六位验证码"
            value={code}
            disabled={busy}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setError("");
            }}
            maxLength={6}
            required
          />
          <button
            type="button"
            disabled={busy || seconds > 0 || !phone.trim()}
            onClick={send}
          >
            {sending ? (
              <Loader2 size={15} className="ep-spin" />
            ) : seconds > 0 ? (
              `${seconds} 秒后重发`
            ) : (
              "获取验证码"
            )}
          </button>
        </div>
        {sent && (
          <p className="ep-login-status" role="status">
            {developmentCode ? (
              <>
                本机测试验证码：<strong>{developmentCode}</strong>
                <button type="button" onClick={() => setCode(developmentCode)}>
                  填入
                </button>
                <span>仅用于当前开发环境，不发送短信。</span>
              </>
            ) : (
              "验证码已发送，5 分钟内有效。"
            )}
          </p>
        )}
        {error && (
          <p className="ep-login-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="ep-login-submit"
          disabled={busy || !normalizePhoneNumber(phone) || code.length !== 6}
        >
          {logging ? (
            <>
              <Loader2 size={16} className="ep-spin" />
              正在验证
            </>
          ) : (
            <>
              登录并继续
              <ArrowRight size={16} />
            </>
          )}
        </button>
        <p className="ep-login-caption">
          首次验证自动创建账号。项目默认私密，历史记录会随账号保留。
        </p>
      </form>
      {localVerification && (
        <p className="ep-login-environment">本机开发环境 · 测试验证码模式</p>
      )}
      {children}
      <footer>
        <p>
          继续即表示同意<Link to="/terms-of-service">服务条款</Link>和
          <Link to="/privacy-policy">隐私政策</Link>。
        </p>
        <a href={SUPPORT_MAILTO}>联系 EliangMat AI 客服</a>
      </footer>
    </section>
  );
}
export const LoginPage = () => {
  const { login } = useStore(),
    navigate = useNavigate();
  return (
    <div className="ep-login-page">
      <Link className="ep-login-back" to="/">
        ← 返回首页
      </Link>
      <PhoneLoginPanel
        sendCode={async (phone) => {
          const response = await fetch(API_BASE_URL + "/auth/send-phone-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone }),
          });
          const data = await response.json();
          if (!response.ok || !data.success)
            throw Object.assign(new Error(data.error || "验证码发送失败。"), {
              retryAfter:
                Number(response.headers.get("Retry-After")) || undefined,
            });
          return data;
        }}
        login={async (phone, code) => {
          await login(phone, code);
          navigate("/", { replace: true });
        }}
      />
    </div>
  );
};
