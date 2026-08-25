import { join } from "node:path";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "0.0.0.0"]);
const ALLOWED_MODES = new Set(["product", "demo", "test"]);

function configuredValue(env, name) {
  const raw = env[name];
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).trim();
}

function parseBoolean(env, name, fallback = false) {
  const value = configuredValue(env, name);
  if (value == null) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} 非法；只允许 true 或 false`);
}

export function normalizePublicOrigin(value) {
  if (value == null || String(value).trim() === "") return null;
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    throw new Error("FORM_STUDIO_PUBLIC_ORIGIN 非法；必须是 http(s) origin");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin === "null") {
    throw new Error("FORM_STUDIO_PUBLIC_ORIGIN 非法；不得包含凭据、路径、查询或片段");
  }
  return parsed.origin;
}

export function readRuntimeConfig({ env = process.env, root, argv = process.argv.slice(2) } = {}) {
  if (!root) throw new TypeError("runtime config root 必填");
  const host = configuredValue(env, "FORM_STUDIO_HOST") || "127.0.0.1";
  if (!ALLOWED_HOSTS.has(host)) throw new Error("FORM_STUDIO_HOST 非法；只允许 127.0.0.1 或 0.0.0.0");

  const port = Number(configuredValue(env, "FORM_STUDIO_PORT") || 4190);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("FORM_STUDIO_PORT 非法");

  const testMode = argv.includes("--test-mode");
  const demoMode = argv.includes("--demo-mode");
  const configuredMode = configuredValue(env, "FORM_STUDIO_MODE");
  if (configuredMode && !ALLOWED_MODES.has(configuredMode)) throw new Error("FORM_STUDIO_MODE 非法");
  const mode = testMode ? "test" : demoMode ? "demo" : configuredMode || "product";

  return Object.freeze({
    host,
    port,
    databasePath: configuredValue(env, "FORM_STUDIO_DB_PATH") || join(root, "data", "form-studio.sqlite"),
    mode,
    trustProxy: parseBoolean(env, "FORM_STUDIO_TRUST_PROXY"),
    publicOrigin: normalizePublicOrigin(configuredValue(env, "FORM_STUDIO_PUBLIC_ORIGIN")),
    runtimeRevision: configuredValue(env, "FORM_STUDIO_RUNTIME_REVISION") || "development",
  });
}

/**
 * 只在显式信任直接上游代理时读取其覆盖后的协议头；绝不从 forwarded host 猜公开 origin。
 * 依据：https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header
 */
export function requestUsesSecureTransport(req, { trustProxy = false, publicOrigin = null } = {}) {
  if (publicOrigin && new URL(publicOrigin).protocol === "https:") return true;
  if (!trustProxy) return false;
  return String(req?.headers?.["x-forwarded-proto"] || "").trim().toLowerCase() === "https";
}
