import fs from "node:fs";
import path from "node:path";
export function preparePreview(root) {
  const source = path.join(root, ".dev/platform-auth");
  const target = path.join(root, ".preview/platform/auth");
  if (
    fs.existsSync(path.join(target, "identity.json")) ||
    !fs.existsSync(path.join(source, "identity.json"))
  )
    return;
  const identity = JSON.parse(
    fs.readFileSync(path.join(source, "identity.json"), "utf8"),
  );
  identity.challenges = {};
  identity.sessions = Object.fromEntries(
    Object.entries(identity.sessions).filter(
      ([, s]) => s.kind === "phone" && s.expiresAt > Date.now(),
    ),
  );
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  fs.copyFileSync(
    path.join(source, "session.key"),
    path.join(target, "session.key"),
  );
  fs.chmodSync(path.join(target, "session.key"), 0o600);
  fs.writeFileSync(
    path.join(target, "identity.json"),
    JSON.stringify(identity),
    { mode: 0o600 },
  );
}
