/** 第 0 段夹具适配；只用于测试已发布示例入口。 */
export function injectGoldFixture(html, { agentId, agentName }) {
  const escapeHtml = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  let out = html;
  out = out.replace(/data-owner-agent="[^"]*"/, `data-owner-agent="${escapeHtml(agentId)}"`);
  out = out.replace(/data-agent-name="[^"]*"/, `data-agent-name="${escapeHtml(agentName)}"`);
  out = out.replace(/(<h1 id="face-title">)[^<]*/, `$1${escapeHtml(agentName)}`);
  if (!out.includes("/runtime/face-submit.js")) {
    out = out.replace("</body>", `<script src="/runtime/face-submit.js"></script>\n</body>`);
  }
  return out;
}
