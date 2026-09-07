const fs = require("node:fs");
const path = require("node:path");
const {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} = require("node:crypto");
const {
  normalizePhoneNumber,
  maskPhoneNumber,
  generateVerificationCode,
  hashVerificationCode,
} = require("./phone-auth");
const { fail } = require("../knowledge/store");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const SESSION_TTL = 7 * 86400_000;

// An isolated, atomic pilot identity store. Identity is independent of phone number and research data.
class PlatformAuth {
  constructor(
    root,
    { mode = "local", development = false, deliver, now = Date.now } = {},
  ) {
    if (
      !["local", "tencent"].includes(mode) ||
      (mode === "local" && !development)
    )
      throw new Error("Local verification is development-only");
    if (mode === "tencent" && typeof deliver !== "function")
      throw new Error("SMS delivery adapter required");
    this.root = root;
    this.mode = mode;
    this.development = development;
    this.deliver = deliver;
    this.now = now;
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const keyFile = path.join(root, "session.key");
    if (!fs.existsSync(keyFile))
      fs.writeFileSync(keyFile, randomBytes(32).toString("hex"), {
        flag: "wx",
        mode: 0o600,
      });
    this.secret = fs.readFileSync(keyFile, "utf8");
    this.file = path.join(root, "identity.json");
    this.state = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : { version: 1, users: {}, workspaces: {}, challenges: {}, sessions: {} };
    if (this.state.version !== 1)
      throw new Error("Unsupported identity storage version");
  }
  update(fn) {
    const s = structuredClone(this.state),
      result = fn(s);
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.state = s;
    return result;
  }
  phone(value) {
    const p = normalizePhoneNumber(value);
    if (!p) throw fail("请输入有效手机号；中国大陆号码可直接输入 11 位。");
    return p;
  }
  phoneKey(phone) {
    return hashVerificationCode(phone, "identity", this.secret);
  }
  async sendCode(value) {
    const phone = this.phone(value),
      key = this.phoneKey(phone),
      now = this.now();
    const old = this.state.challenges[key];
    if (old && now - old.issuedAt < 60_000)
      throw Object.assign(fail("请稍后再获取验证码。", 429), {
        retryAfter: Math.ceil((60_000 - now + old.issuedAt) / 1000),
      });
    const code = generateVerificationCode(),
      challengeId = randomUUID();
    this.update((s) => {
      for (const [k, c] of Object.entries(s.challenges))
        if (c.expiresAt < now - 600_000) delete s.challenges[k];
      s.challenges[key] = {
        id: challengeId,
        hash: hashVerificationCode(phone, code, this.secret),
        issuedAt: now,
        expiresAt: now + 300_000,
        attempts: 0,
        status: "sending",
      };
    });
    try {
      if (this.mode === "tencent") await this.deliver(phone, code);
    } catch (_error) {
      this.update((s) => {
        if (s.challenges[key]?.id === challengeId)
          s.challenges[key].status = "failed";
      });
      throw fail("短信发送失败，请稍后重试。", 502);
    }
    this.update((s) => {
      if (s.challenges[key]?.id === challengeId)
        s.challenges[key].status = "sent";
    });
    return {
      success: true,
      delivery: this.mode,
      maskedPhone: maskPhoneNumber(phone),
      retryAfter: 60,
      expiresIn: 300,
      ...(this.mode === "local" ? { developmentCode: code } : {}),
    };
  }
  makeSession(s, values, previousToken) {
    const now = this.now();
    if (previousToken) delete s.sessions[sha(previousToken)];
    for (const [key, v] of Object.entries(s.sessions))
      if (v.expiresAt <= now) delete s.sessions[key];
    const token = randomBytes(32).toString("hex");
    s.sessions[sha(token)] = {
      ...values,
      createdAt: now,
      expiresAt: now + SESSION_TTL,
    };
    return token;
  }
  login(value, code, previousToken) {
    const phone = this.phone(value),
      key = this.phoneKey(phone);
    if (!/^\d{6}$/.test(String(code))) throw fail("请输入六位验证码。");
    // Commit failed-attempt counters as well as one-time consumption atomically.
    const result = this.update((s) => {
      const c = s.challenges[key];
      if (
        !c ||
        c.status !== "sent" ||
        c.expiresAt <= this.now() ||
        c.attempts >= 5
      )
        return { error: "验证码无效或已过期，请重新获取。" };
      if (
        !equal(c.hash, hashVerificationCode(phone, String(code), this.secret))
      ) {
        c.attempts++;
        return {
          error:
            c.attempts >= 5
              ? "验证码尝试次数过多，请重新获取。"
              : "验证码不正确，请检查后重试。",
        };
      }
      delete s.challenges[key];
      let user = s.users[key];
      if (!user) {
        const userId = randomUUID(),
          workspaceId = randomUUID();
        user = {
          id: userId,
          workspaceId,
          maskedPhone: maskPhoneNumber(phone),
          createdAt: this.now(),
        };
        s.users[key] = user;
        s.workspaces[workspaceId] = {
          id: workspaceId,
          name: "个人研发空间",
          ownerKey: "workspace:" + workspaceId,
          members: [{ userId, role: "owner" }],
        };
      }
      return {
        token: this.makeSession(
          s,
          { kind: "phone", userId: user.id, workspaceId: user.workspaceId },
          previousToken,
        ),
      };
    });
    if (result.error) throw fail(result.error, 401);
    return result.token;
  }
  demoLogin(account, previousToken) {
    if (!this.development || !["A", "B"].includes(account))
      throw fail("开发测试入口不可用。", 403);
    return this.update((s) =>
      this.makeSession(
        s,
        {
          kind: "demo",
          userId: "demo-user-" + account,
          workspaceId: "demo-" + account,
          demoAccount: account,
          role: "owner",
        },
        previousToken,
      ),
    );
  }
  session(token) {
    if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
    const v = this.state.sessions[sha(token)];
    if (!v || v.expiresAt <= this.now()) return null;
    if (v.kind === "demo")
      return this.development
        ? {
            ...v,
            ownerKey: "development-customer-" + v.demoAccount,
            workspaceName: "客户 " + v.demoAccount,
            maskedPhone: "开发演练账号",
            displayName: "客户 " + v.demoAccount,
          }
        : null;
    const user = Object.values(this.state.users).find((u) => u.id === v.userId),
      workspace = this.state.workspaces[v.workspaceId];
    const member = workspace?.members.find((m) => m.userId === v.userId);
    if (
      !user ||
      !member ||
      !["owner", "researcher", "finance"].includes(member.role)
    )
      return null;
    return {
      ...v,
      role: member.role,
      ownerKey: workspace.ownerKey,
      workspaceName: workspace.name,
      maskedPhone: user.maskedPhone,
      displayName: user.maskedPhone,
    };
  }
  publicSession(token) {
    const s = this.session(token);
    if (!s)
      return {
        authenticated: false,
        delivery: this.mode,
        development: this.development,
      };
    const { ownerKey, ...identity } = s;
    return {
      authenticated: true,
      identity,
      delivery: this.mode,
      development: this.development,
    };
  }
  logout(token) {
    this.update((s) => {
      if (token) delete s.sessions[sha(token)];
    });
  }
  setDemoRole(token, role) {
    const current = this.session(token);
    if (
      !this.development ||
      current?.kind !== "demo" ||
      !["owner", "researcher", "finance"].includes(role)
    )
      throw fail("角色切换仅对开发演练账号开放。", 403);
    this.update((s) => {
      s.sessions[sha(token)].role = role;
    });
    return this.publicSession(token);
  }
}
module.exports = { PlatformAuth, SESSION_TTL };
