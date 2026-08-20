import { existsSync, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { "Content-Length": payload.length, ...headers });
  res.end(payload);
}
export function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), { "Content-Type": MIME[".json"] });
}
export class InvalidJsonError extends Error {}
export function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolveBody({});
      try { resolveBody(JSON.parse(raw)); } catch { reject(new InvalidJsonError("请求 JSON 格式错误")); }
    });
    req.on("error", reject);
  });
}
export function serveFile(res, root, relativePath) {
  const rootPath = resolve(root);
  const filePath = resolve(rootPath, relativePath);
  if (!filePath.startsWith(`${rootPath}${sep}`) || !existsSync(filePath)) {
    send(res, 404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  send(res, 200, readFileSync(filePath), {
    "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
  });
}
