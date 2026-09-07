const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { PlatformAuth } = require("../src/auth/platform-auth");
const {
  createPlatformAuthRouter,
  platformIdentity,
} = require("../src/auth/platform-auth-router");
const { KnowledgeStore } = require("../src/knowledge/store");
const { PlatformService } = require("../src/platform/service");
const { createPlatformRouter } = require("../src/platform/router");
const phone = "+12025550141",
  other = "+12025550142";
function setup(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eliangmat-auth-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let now = Date.now();
  const config = {
    development: true,
    mode: "local",
    now: () => now,
    ...options,
  };
  const auth = new PlatformAuth(path.join(root, "auth"), config);
  return {
    auth,
    root,
    config,
    advance: (ms) => {
      now += ms;
    },
  };
}
async function login(auth, p = phone, previous) {
  const code = await auth.sendCode(p);
  return auth.login(p, code.developmentCode, previous);
}

test("phone login reuses stable user and workspace IDs; OTP and phone are not stored in plaintext", async (t) => {
  const { auth, root, config } = setup(t);
  const code = await auth.sendCode(phone);
  const file = fs.readFileSync(auth.file, "utf8");
  assert.ok(!file.includes(code.developmentCode));
  assert.ok(!file.includes(phone));
  const token = auth.login(phone, code.developmentCode),
    first = auth.session(token);
  assert.ok(first.userId);
  assert.equal(first.kind, "phone");
  assert.match(first.ownerKey, /^workspace:/);
  const fresh = new PlatformAuth(path.join(root, "auth"), config);
  assert.equal(fresh.session(token).workspaceId, first.workspaceId);
  fresh.logout(token);
  assert.equal(fresh.session(token), null);
  const again = await login(fresh, phone);
  assert.equal(fresh.session(again).userId, first.userId);
  assert.equal(fresh.session(again).ownerKey, first.ownerKey);
});

test("codes are phone-bound, single-use, expiring and limited to five attempts", async (t) => {
  const { auth, advance } = setup(t);
  const code = await auth.sendCode(phone);
  assert.throws(() => auth.login(other, code.developmentCode), { status: 401 });
  const wrong = code.developmentCode === "111111" ? "222222" : "111111";
  for (let n = 0; n < 5; n++)
    assert.throws(() => auth.login(phone, wrong), { status: 401 });
  assert.throws(() => auth.login(phone, code.developmentCode), { status: 401 });
  advance(60_001);
  const next = await auth.sendCode(phone);
  advance(300_001);
  assert.throws(() => auth.login(phone, next.developmentCode), { status: 401 });
  const valid = await auth.sendCode(phone);
  auth.login(phone, valid.developmentCode);
  assert.throws(() => auth.login(phone, valid.developmentCode), {
    status: 401,
  });
});

test("resend cooldown survives restart and old codes become invalid when replaced", async (t) => {
  const { auth, root, config, advance } = setup(t);
  const first = await auth.sendCode(phone);
  const fresh = new PlatformAuth(path.join(root, "auth"), config);
  await assert.rejects(() => fresh.sendCode(phone), {
    status: 429,
    retryAfter: 60,
  });
  advance(60_001);
  const second = await fresh.sendCode(phone);
  if (first.developmentCode !== second.developmentCode)
    assert.throws(() => fresh.login(phone, first.developmentCode), {
      status: 401,
    });
  assert.ok(fresh.login(phone, second.developmentCode));
});

test("verified SMS adapter never returns the code; failure cannot create a usable challenge", async (t) => {
  let delivered, finish;
  const { auth } = setup(t, {
    mode: "tencent",
    deliver: async (p, c) => {
      delivered = { p, c };
      await new Promise((resolve) => (finish = resolve));
    },
  });
  const pending = auth.sendCode(phone);
  assert.throws(() => auth.login(phone, delivered.c), { status: 401 });
  await assert.rejects(() => auth.sendCode(phone), { status: 429 });
  finish();
  const result = await pending;
  assert.equal(result.developmentCode, undefined);
  assert.equal(delivered.p, phone);
  assert.ok(auth.login(phone, delivered.c));
  auth.deliver = async () => {
    throw new Error("provider credentials must not escape");
  };
  await assert.rejects(() => auth.sendCode(other), {
    status: 502,
    message: "短信发送失败，请稍后重试。",
  });
  assert.throws(() => auth.login(other, "123456"), { status: 401 });
});

test("local verification and demo entry cannot be enabled accidentally in production mode", (t) => {
  const { root } = setup(t);
  assert.throws(
    () => new PlatformAuth(path.join(root, "prod"), { mode: "local" }),
    /development-only/,
  );
  const prod = new PlatformAuth(path.join(root, "prod"), {
    mode: "tencent",
    deliver: async () => {},
  });
  assert.throws(() => prod.demoLogin("A"), { status: 403 });
});

test("logout revokes the current session and a replacement login rotates its cookie", async (t) => {
  const { auth, advance } = setup(t);
  const first = await login(auth);
  const second = await login(auth, phone, first);
  assert.equal(auth.session(first), null);
  assert.ok(auth.session(second));
  auth.logout(second);
  assert.equal(auth.session(second), null);
  const third = await login(auth);
  advance(7 * 86400_000 + 1);
  assert.equal(auth.session(third), null);
  assert.equal(auth.session("f".repeat(64)), null);
});

test("demo roles stay in demo spaces and real phone sessions cannot elevate via test controls", async (t) => {
  const { auth } = setup(t);
  const demo = auth.demoLogin("A");
  assert.equal(auth.session(demo).ownerKey, "development-customer-A");
  auth.setDemoRole(demo, "researcher");
  assert.equal(auth.session(demo).role, "researcher");
  const real = await login(auth, phone, demo);
  assert.equal(auth.session(demo), null);
  assert.throws(() => auth.setDemoRole(real, "finance"), { status: 403 });
  assert.equal(auth.session(real).role, "owner");
});

test("research and automatic memory return to the same phone account after logout and service restart", async (t) => {
  const { auth, root, config } = setup(t);
  const store = new KnowledgeStore(path.join(root, "data")),
    p = new PlatformService(store);
  const token = await login(auth),
    owner = auth.session(token).ownerKey;
  const project = p.createProject(
    owner,
    { name: "登录记忆验收", goal: "研究登录前后不应丢失的材料项目" },
    "owner",
  );
  p.message(
    owner,
    null,
    "登录记忆测试代号 LOGIN-731 的流程为先复核再归档。",
    "owner",
  );
  const b = await login(auth, other);
  assert.notEqual(auth.session(b).ownerKey, owner);
  assert.throws(
    () => p.project(auth.session(b).ownerKey, project.id, "owner"),
    { status: 404 },
  );
  assert.deepEqual(
    p.memory.search(
      auth.session(b).ownerKey,
      null,
      { query: "LOGIN-731" },
      "owner",
    ).records,
    [],
  );
  auth.logout(token);
  const fresh = new PlatformAuth(path.join(root, "auth"), config);
  const restored = await login(fresh);
  assert.equal(fresh.session(restored).ownerKey, owner);
  const next = new PlatformService(new KnowledgeStore(path.join(root, "data")));
  assert.equal(
    next.project(owner, project.id, "owner").project.name,
    "登录记忆验收",
  );
  assert.ok(
    next.memory
      .search(owner, null, { query: "LOGIN-731" }, "owner")
      .records.some((r) => r.content.includes("先复核再归档")),
  );
});

test("workspace membership is revalidated on every request rather than trusting the client role", async (t) => {
  const { auth } = setup(t);
  const token = await login(auth),
    s = auth.session(token);
  auth.update((state) => {
    state.workspaces[s.workspaceId].members[0].role = "researcher";
  });
  assert.equal(auth.session(token).role, "researcher");
  auth.update((state) => {
    state.workspaces[s.workspaceId].members = [];
  });
  assert.equal(auth.session(token), null);
});

test("HTTP login protects all project routes, uses HttpOnly cookies and rejects cross-account IDs and role spoofing", async (t) => {
  const { auth, root } = setup(t);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createPlatformAuthRouter(auth));
  app.use(
    "/api/platform",
    createPlatformRouter(
      new PlatformService(new KnowledgeStore(path.join(root, "data"))),
      platformIdentity(auth),
    ),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (url, body, cookie, headers = {}) =>
    fetch(base + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EliangMat-Client": "knowledge-v1",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal((await request("/api/platform")).status, 401);
  assert.equal(
    (
      await request("/api/auth/send-phone-code", { phone }, undefined, {
        "X-EliangMat-Client": "",
      })
    ).status,
    403,
  );
  const code = await (
    await request("/api/auth/send-phone-code", { phone })
  ).json();
  const logged = await request("/api/auth/login", {
    phone,
    code: code.developmentCode,
    role: "owner",
    account: "A",
  });
  const setCookie = logged.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(";")[0];
  const principal = await logged.json();
  assert.equal(principal.identity.kind, "phone");
  assert.equal(principal.identity.ownerKey, undefined);
  const created = await request(
    "/api/platform/projects",
    {
      name: "隔离校验",
      goal: "研发独立身份的材料项目",
      owner: "development-customer-A",
    },
    cookie,
  );
  const project = await created.json();
  assert.equal(created.status, 201);
  const demo = await request(
    "/api/auth/development-login",
    { account: "B" },
    cookie,
  );
  const demoCookie = demo.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await request(
        "/api/platform/projects/" + project.id,
        undefined,
        demoCookie,
        { "x-owner": principal.identity.userId },
      )
    ).status,
    404,
  );
  assert.equal((await request("/api/platform", undefined, cookie)).status, 401);
  await request("/api/auth/logout", {}, demoCookie);
  assert.equal(
    (await request("/api/platform", undefined, demoCookie)).status,
    401,
  );
});
