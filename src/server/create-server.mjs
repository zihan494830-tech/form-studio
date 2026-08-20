import http from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decorateAgent } from "../application/agent-view.mjs";
import { submitToAgent } from "../application/submit-to-agent.mjs";
import {
  bind, copyExample, createAgent, getAgent, listAgents, resetStore, setFields, unbind,
} from "../infrastructure/in-memory-agent-repository.mjs";
import { injectGoldFixture } from "../presentation/form/inject-gold-fixture.mjs";
import { renderFormHtml } from "../presentation/form/render-html.mjs";
import { readJsonBody, send, sendJson, serveFile } from "./http-utils.mjs";

function agentIdFrom(pathname, suffix) {
  return decodeURIComponent(pathname.slice("/api/agents/".length, pathname.length - suffix.length));
}
function serveRendered(res, agent, fields, formVersion, options = {}) {
  send(res, 200, renderFormHtml(agent, fields, { formVersion, ...options }), {
    "Content-Type": "text/html; charset=utf-8",
  });
}

export function createFormStudioServer({ root, port = 4190 }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const { pathname } = url;
    const method = req.method || "GET";
    try {
      if (method === "GET" && pathname === "/") {
        return serveFile(res, root, join("public", "workbench", "index.html"));
      }
      const publicRoutes = new Map([
        ["/workbench/main.js", join("public", "workbench", "main.js")],
        ["/workbench/styles.css", join("public", "workbench", "styles.css")],
        ["/runtime/face-submit.js", join("public", "runtime", "face-submit.js")],
      ]);
      if (method === "GET" && publicRoutes.has(pathname)) {
        return serveFile(res, root, publicRoutes.get(pathname));
      }
      if (method === "GET" && pathname.startsWith("/workbench/modules/")) {
        const moduleName = pathname.slice("/workbench/modules/".length);
        return serveFile(res, root, join("public", "workbench", "modules", moduleName));
      }
      if (method === "GET" && pathname === "/fixture/exercise-1") {
        const agent = getAgent("exercise-1") || { id: "exercise-1", name: "练习一" };
        const fixture = readFileSync(join(root, "tests", "fixtures", "exercise-1", "form.html"), "utf8");
        return send(res, 200, injectGoldFixture(fixture, { agentId: agent.id, agentName: agent.name }), {
          "Content-Type": "text/html; charset=utf-8",
        });
      }
      // 作者面专用草稿预览；/a/:id 仍只读已发布金稿。
      if (method === "GET" && pathname.startsWith("/preview/")) {
        const id = decodeURIComponent(pathname.slice("/preview/".length));
        const agent = getAgent(id);
        if (!agent) return send(res, 404, "没有这个 agent", { "Content-Type": "text/plain; charset=utf-8" });
        return serveRendered(res, agent, agent.fields || [], agent.formVersion || 1, { preview: true });
      }
      if (method === "GET" && pathname.startsWith("/a/")) {
        const id = decodeURIComponent(pathname.slice(3));
        const agent = getAgent(id);
        if (!agent) return send(res, 404, "没有这个 agent", { "Content-Type": "text/plain; charset=utf-8" });
        if (!agent.formId || !agent.published?.fields?.length) {
          if (agent.origin === "born-form") {
            return send(res, 404, "该 agent form 尚未发布或已下架", { "Content-Type": "text/plain; charset=utf-8" });
          }
          return serveFile(res, root, join("public", "face", "empty.html"));
        }
        return serveRendered(res, agent, agent.published.fields, agent.published.formVersion);
      }
      if (method === "POST" && pathname.startsWith("/submit/")) {
        const id = decodeURIComponent(pathname.slice("/submit/".length));
        const result = submitToAgent(id, await readJsonBody(req));
        return sendJson(res, result.status, result);
      }
      if (method === "POST" && pathname === "/api/agents") {
        const agent = createAgent((await readJsonBody(req)).name);
        return sendJson(res, 201, decorateAgent(agent));
      }
      if (method === "GET" && pathname === "/api/agents") {
        return sendJson(res, 200, listAgents().map(decorateAgent));
      }
      if (method === "PUT" && pathname.startsWith("/api/agents/") && pathname.endsWith("/fields")) {
        const result = setFields(agentIdFrom(pathname, "/fields"), (await readJsonBody(req)).fields);
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname.startsWith("/api/agents/") && pathname.endsWith("/copy-example")) {
        const result = copyExample(agentIdFrom(pathname, "/copy-example"));
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "GET" && pathname.startsWith("/api/agents/")) {
        const rest = pathname.slice("/api/agents/".length);
        if (!rest.includes("/")) {
          const agent = decorateAgent(getAgent(rest));
          return agent ? sendJson(res, 200, agent) : sendJson(res, 404, { error: "没有这个 agent" });
        }
      }
      if (method === "POST" && pathname.endsWith("/unbind")) {
        const agent = unbind(agentIdFrom(pathname, "/unbind"));
        return agent ? sendJson(res, 200, decorateAgent(agent)) : sendJson(res, 404, { error: "没有这个 agent" });
      }
      if (method === "POST" && pathname.endsWith("/bind")) {
        const result = bind(agentIdFrom(pathname, "/bind"));
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname === "/api/test/reset") {
        return sendJson(res, 200, resetStore().map(decorateAgent));
      }
      send(res, 404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      sendJson(res, 500, { error: String(error?.message || error) });
    }
  });
}
