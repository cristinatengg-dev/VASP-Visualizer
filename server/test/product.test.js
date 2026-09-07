const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PlatformAuth } = require("../src/auth/platform-auth");
const { PlatformService } = require("../src/platform/service");
const { KnowledgeStore } = require("../src/knowledge/store");
const { createProductApp } = require("../src/platform/app");

function root(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eliangmat-product-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("product excludes fake balances/models and rejects sandbox mutations in the service", (t) => {
  const dir = root(t),
    store = new KnowledgeStore(dir);
  const sandbox = new PlatformService(store, { development: true });
  const order = sandbox.createOrder(
    "owner",
    { amount: 10000, requestId: "abcdefgh-123456" },
    "owner",
  );
  sandbox.payOrder("owner", order.id, "owner");
  const product = new PlatformService(store);
  const data = product.overview("owner");
  assert.equal(data.environment, "production");
  assert.equal(data.wallet, null);
  assert.deepEqual(data.orders, []);
  assert.deepEqual(data.usage, []);
  assert.deepEqual(
    data.models.map((m) => m.id),
    ["materials"],
  );
  assert.equal(data.models[0].name, "账号记忆检索");
  const remembered = product.memory.view("owner", null, "owner").items;
  assert.ok(
    !remembered.some((r) => /测试余额|测试充值|开发测试余额/.test(r.content)),
  );
  assert.throws(
    () =>
      product.createProject("owner", { demo: true, name: "sample" }, "owner"),
    { status: 403 },
  );
  for (const call of [
    () => product.createOrder("owner", {}, "owner"),
    () => product.payOrder("owner", order.id, "owner"),
    () => product.usage("owner", "project", {}, "owner"),
    () => product.taskAction("owner", "project", "task", "start", "owner"),
    () => product.member("owner", {}, "owner"),
  ])
    assert.throws(call, { status: 403 });
  assert.equal(sandbox.overview("owner").wallet.balance, 10000);
});
test("product HTTP serves the built app, uses OTP auth, blocks development APIs and preserves tenant isolation", async (t) => {
  const dir = root(t),
    dist = path.join(dir, "dist");
  fs.mkdirSync(dist);
  fs.writeFileSync(
    path.join(dist, "index.html"),
    "<title>EliangMat AI</title>",
  );
  let delivered;
  const auth = new PlatformAuth(path.join(dir, "auth"), {
    mode: "tencent",
    development: false,
    deliver: async (_phone, code) => {
      delivered = code;
    },
  });
  const server = require("node:http").createServer().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const origins = ["http://127.0.0.1:" + server.address().port];
  const { app } = createProductApp({
    auth,
    root: path.join(dir, "data"),
    origins,
    dist,
    smsReady: true,
  });
  server.on("request", app);
  t.after(() => new Promise((r) => server.close(r)));
  const url = "http://127.0.0.1:" + server.address().port;
  const request = (route, body, cookie = "", extra = {}) =>
    fetch(url + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EliangMat-Client": "knowledge-v1",
        cookie,
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal((await request("/assistant")).status, 200);
  assert.equal((await request("/api/platform")).status, 401);
  assert.equal(
    (await request("/api/auth/development-login", { account: "A" })).status,
    404,
  );
  assert.equal((await request("/api/knowledge-dev/sample")).status, 404);
  const sent = await request("/api/auth/send-phone-code", {
    phone: "+12025550146",
  });
  const delivery = await sent.json();
  assert.equal(delivery.delivery, "tencent");
  assert.equal(delivery.developmentCode, undefined);
  const login = await request("/api/auth/login", {
    phone: "+12025550146",
    code: delivered,
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.headers.get("set-cookie"), /Secure/);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await login.json()).development, false);
  const initial = await (
    await request("/api/platform", undefined, cookie)
  ).json();
  assert.deepEqual(initial.projects, []);
  assert.deepEqual(initial.inferenceUsage, []);
  for (const route of [
    "/api/platform/orders",
    "/api/platform/orders/id/pay-test",
    "/api/platform/members",
    "/api/platform/projects/id/tasks/task",
    "/api/platform/projects/id/usage",
    "/api/platform/usage/id/settle",
  ])
    assert.equal((await request(route, {}, cookie)).status, 403, route);
  const created = await request(
    "/api/platform/projects",
    { name: "合金研究", goal: "研究合金组织与性能之间的关系" },
    cookie,
  );
  assert.equal(created.status, 201);
  const project = await created.json();
  assert.equal(
    (await request("/api/platform/projects/" + project.id, undefined, cookie))
      .status,
    200,
  );
  assert.equal(
    (
      await request("/api/platform", undefined, cookie, {
        Origin: "https://untrusted.invalid",
      })
    ).status,
    403,
  );
  await request("/api/auth/send-phone-code", { phone: "+12025550147" });
  const second = await request("/api/auth/login", {
    phone: "+12025550147",
    code: delivered,
  });
  const other = second.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await request("/api/platform/projects/" + project.id, undefined, other))
      .status,
    404,
  );
});
test("product refuses local verification configuration", (t) => {
  const dir = root(t);
  assert.throws(
    () =>
      new PlatformAuth(path.join(dir, "auth"), {
        mode: "local",
        development: false,
      }),
    /development-only/,
  );
  const auth = new PlatformAuth(path.join(dir, "sandbox"), {
    mode: "local",
    development: true,
  });
  assert.throws(
    () =>
      createProductApp({
        auth,
        root: dir,
        origins: ["https://example.invalid"],
      }),
    /disable development/,
  );
});

test('production proxy keeps SMS rate limits per client and direct instances ignore spoofed forwarding', async t => {
  for (const trustProxy of [false, 1]) {
    const dir = root(t);
    const auth = new PlatformAuth(path.join(dir, 'auth'), {
      mode:'tencent', development:false, deliver:async()=>{ throw new Error('Must not send SMS in this test'); },
    });
    const server = require('node:http').createServer().listen(0, '127.0.0.1');
    await new Promise(resolve=>server.once('listening', resolve));
    t.after(()=>server.close());
    const origin = 'http://127.0.0.1:' + server.address().port;
    const {app} = createProductApp({auth,root:path.join(dir,'data'),origins:[origin],smsReady:true,trustProxy});
    server.on('request',app);
    const send = ip => fetch(origin+'/api/auth/send-phone-code', {method:'POST',headers:{'Content-Type':'application/json','X-EliangMat-Client':'knowledge-v1','X-Forwarded-For':ip},body:JSON.stringify({phone:'invalid'})});
    for(let n=0;n<10;n++) assert.equal((await send('192.0.2.1')).status,400);
    assert.equal((await send('192.0.2.1')).status,429);
    assert.equal((await send('192.0.2.2')).status,trustProxy?400:429);
  }
});
