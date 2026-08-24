import { existsSync, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export const DEFAULT_JSON_BODY_LIMIT = 1024 * 1024;
const DEFAULT_RESPONSE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

export function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { ...DEFAULT_RESPONSE_HEADERS, "Content-Length": payload.length, ...headers });
  res.end(payload);
}
export function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { "Content-Type": MIME[".json"], ...headers });
}
export class InvalidJsonError extends Error {}
export class UnsupportedMediaTypeError extends Error {}
export class PayloadTooLargeError extends Error {}

export function readJsonBody(req, { maxBytes = DEFAULT_JSON_BODY_LIMIT } = {}) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const mediaType = contentType.split(";", 1)[0].trim();
  if (mediaType !== "application/json") {
    return Promise.reject(new UnsupportedMediaTypeError("Content-Type 必须为 application/json"));
  }
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return Promise.reject(new PayloadTooLargeError(`JSON 请求不得超过 ${maxBytes} bytes`));
  }
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let received = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      received += chunk.length;
      if (received > maxBytes) {
        failed = true;
        chunks.length = 0;
        reject(new PayloadTooLargeError(`JSON 请求不得超过 ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolveBody({});
      try { resolveBody(JSON.parse(raw)); } catch { reject(new InvalidJsonError("请求 JSON 格式错误")); }
    });
    req.on("error", reject);
  });
}
export function serveFile(res, root, relativePath, headers = {}) {
  const rootPath = resolve(root);
  const filePath = resolve(rootPath, relativePath);
  if (!filePath.startsWith(`${rootPath}${sep}`) || !existsSync(filePath)) {
    send(res, 404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  send(res, 200, readFileSync(filePath), {
    "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
    ...headers,
  });
}
