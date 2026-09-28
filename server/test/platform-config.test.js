const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "../..");
const sms = Object.fromEntries([
  "TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY", "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME", "TENCENT_SMS_TEMPLATE_ID",
].map((key) => [key, "fictional-test-only"]));

function importConfig(extra = {}) {
  return spawnSync(process.execPath, [path.join(root, "scripts/platform/import-existing-config.cjs")], {
    env: { ...sms, ...extra }, encoding: "utf8",
  });
}

test("config import preserves integrations but never imports Gemini credentials", () => {
  const result = importConfig({
    GEMINI_API_KEY: "legacy-secret-must-not-be-copied",
    GEMINI_BASE_URL: "https://example.invalid/v1",
    HUNYUAN_API_KEY: "fictional-hunyuan-key",
    HUNYUAN_TEXT_MODEL: "hy3",
    ELIANGMAT_ORIGINS: "https://custom.example",
  });
  assert.equal(result.status, 0);
  const env = dotenv.parse(result.stdout);
  assert.equal(env.HUNYUAN_API_KEY, "fictional-hunyuan-key");
  assert.equal(env.HUNYUAN_BASE_URL, "https://tokenhub.tencentmaas.com/v1");
  assert.equal(env.HUNYUAN_TEXT_MODEL, "hy3");
  assert.equal(env.ELIANGMAT_ORIGINS, "https://custom.example");
  assert.equal(env.TENCENT_SMS_TEMPLATE_ID, sms.TENCENT_SMS_TEMPLATE_ID);
  assert.doesNotMatch(result.stdout, /GEMINI|legacy-secret|example\.invalid/);
});

test("config import allows local retrieval without a model key and still requires SMS", () => {
  const result = importConfig();
  assert.equal(result.status, 0);
  const env = dotenv.parse(result.stdout);
  assert.equal(env.HUNYUAN_API_KEY, undefined);
  assert.match(env.ELIANGMAT_ORIGINS, /https:\/\/eliangai\.com/);
  assert.equal(importConfig({ TENCENTCLOUD_SECRET_KEY: "" }).status, 1);
});

function runEntry(preview) {
  const filesRead = [];
  let gatewayEnv;
  const settings = {
    ...sms, ELIANGMAT_ORIGINS: "https://eliangai.com",
    HUNYUAN_API_KEY: "fictional-server-key", GEMINI_API_KEY: "legacy-key",
  };
  const fakeFiles = {
    ".config/platform.env": Object.entries(settings).map(([k, v]) => `${k}=${v}`).join("\n"),
    ".dev/model.env": "HUNYUAN_API_KEY=fictional-preview-key\nGEMINI_API_KEY=legacy-preview-key",
  };
  const short = (file) => path.relative(root, file);
  const mockRequire = (name) => {
    if (name === "node:fs") return {
      existsSync: (file) => Object.hasOwn(fakeFiles, short(file)),
      readFileSync: (file) => { filesRead.push(short(file)); return fakeFiles[short(file)]; },
    };
    if (name === "node:path") return path;
    if (name === "dotenv") return dotenv;
    if (name === "./src/auth/platform-auth") return { PlatformAuth: class {} };
    if (name === "./src/auth/sms-service") return {
      getSmsConfig: () => ({ secretId: "test", secretKey: "test", sdkAppId: "test", signName: "test", templateId: "test" }),
      sendLoginCode: () => { throw new Error("SMS must not run in this test"); },
    };
    if (name === "./src/platform/model-gateway") return {
      createHunyuanGateway: (env) => { gatewayEnv = env; return {}; },
    };
    if (name === "./src/platform/app") return {
      createProductApp: () => ({ app: { listen: () => ({ on() {}, close() {} }) } }),
    };
    throw new Error("Unexpected import " + name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "server/platform.cjs"), "utf8"), {
    require: mockRequire, __dirname: path.join(root, "server"), console, URL,
    process: { argv: preview ? ["node", "platform.cjs", "--preview"] : [],
      env: { HUNYUAN_API_KEY: "fictional-process-key", GEMINI_API_KEY: "legacy-process-key" }, on() {} },
  });
  return { filesRead, gatewayEnv };
}

test("production startup uses only the Hunyuan factory and allowlisted model settings", () => {
  const { filesRead, gatewayEnv } = runEntry(false);
  assert.deepEqual(filesRead, [".config/platform.env"]);
  assert.equal(gatewayEnv.HUNYUAN_API_KEY, "fictional-process-key");
  assert.equal(gatewayEnv.GEMINI_API_KEY, undefined);
  assert.doesNotMatch(JSON.stringify(gatewayEnv), /legacy-/);
});

test("preview startup cannot inherit production or Gemini model credentials", () => {
  const { filesRead, gatewayEnv } = runEntry(true);
  assert.deepEqual(filesRead, [".dev/model.env"]);
  assert.equal(gatewayEnv.HUNYUAN_API_KEY, "fictional-preview-key");
  assert.equal(gatewayEnv.GEMINI_API_KEY, undefined);
  assert.doesNotMatch(JSON.stringify(gatewayEnv), /legacy-|fictional-process-key/);
});
