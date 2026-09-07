const fs = require("node:fs");
const path = require("node:path");
const { PlatformAuth } = require("./src/auth/platform-auth");
const { getSmsConfig, sendLoginCode } = require("./src/auth/sms-service");
const { createGeminiGateway } = require("./src/platform/model-gateway");
const { createProductApp } = require("./src/platform/app");
const root = path.resolve(__dirname, "..");
const preview = process.argv.includes("--preview");
const read = (file) =>
  fs.existsSync(file) ? require("dotenv").parse(fs.readFileSync(file)) : {};
// Preview reuses only explicitly allowlisted integration settings, never a production .env.
const names = [
  "GEMINI_BASE_URL",
  "GEMINI_API_KEY",
  "GEMINI_TEXT_MODEL",
  "GEMINI_MAX_OUTPUT_TOKENS",
  "OPENALEX_API_KEY",
  "CROSSREF_EMAIL",
  "UNPAYWALL_EMAIL",
  "TENCENTCLOUD_SECRET_ID",
  "TENCENTCLOUD_SECRET_KEY",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID",
  "TENCENT_SMS_REGION",
];
const inputs = preview
  ? Object.assign(
      {},
      ...["model", "knowledge", "phone-auth"].map((f) =>
        read(path.join(root, ".dev", f + ".env")),
      ),
    )
  : { ...read(path.join(root, ".config/platform.env")), ...process.env };
const env = Object.fromEntries(names.map((k) => [k, inputs[k] || ""]));
const data = preview
  ? path.join(root, ".preview/platform")
  : path.resolve(
      inputs.ELIANGMAT_STORAGE_DIR || path.join(root, ".data/platform"),
    );
if (
  !preview &&
  [".dev", ".preview"].some(
    (dir) =>
      data === path.join(root, dir) ||
      data.startsWith(path.join(root, dir) + path.sep),
  )
)
  throw new Error("Production storage cannot use sandbox or preview data");
const port = preview ? 4317 : Number(inputs.PORT || 3000);
const host = preview ? "127.0.0.1" : inputs.HOST || "127.0.0.1";
const origins = preview
  ? ["http://127.0.0.1:4317", "http://localhost:4317"]
  : String(inputs.ELIANGMAT_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
if (
  !preview &&
  (!origins.length || origins.some((o) => new URL(o).protocol !== "https:"))
)
  throw new Error("Production requires explicit HTTPS origins");
const sms = getSmsConfig(env);
const smsReady = [
  "secretId",
  "secretKey",
  "sdkAppId",
  "signName",
  "templateId",
].every((k) => !!sms[k]);
if (!preview && !smsReady)
  throw new Error("Production SMS configuration is incomplete");
const auth = new PlatformAuth(path.join(data, "auth"), {
  mode: "tencent",
  development: false,
  deliver: (phone, code) => sendLoginCode(phone, code, { config: sms }),
});
const { app } = createProductApp({
  auth,
  root: path.join(data, "knowledge"),
  gateway: createGeminiGateway(env),
  env,
  origins,
  dist: path.join(root, "dist"),
  secure: !preview,
  smsReady,
});
const server = app.listen(port, host, () =>
  console.log("EliangMat AI listening on port " + port),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
