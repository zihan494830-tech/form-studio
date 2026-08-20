import http from "node:http";
import { join } from "node:path";
import { createAgentAuthoring } from "../application/author-agent.mjs";
import { decorateAgent } from "../application/agent-view.mjs";
import { readOwnerIdentity } from "../application/read-owner-identity.mjs";
import { submitToAgent } from "../application/submit-to-agent.mjs";
import { activePublishedBinding } from "../domain/agent/owner-agent-binding.mjs";
import { inMemoryAgentRepository } from "../infrastructure/in-memory-agent-repository.mjs";
import { renderFormHtml } from "../presentation/form/render-html.mjs";
import { InvalidJsonError, readJsonBody, send, sendJson, serveFile } from "./http-utils.mjs";

function agentIdFrom(pathname, suffix) {
  return decodeURIComponent(pathname.slice("/api/agents/".length, pathname.length - suffix.length));
}
function serveRendered(res, agent, fields, formVersion, options = {}) {
  send(res, 200, renderFormHtml(agent, fields, { formVersion, ...options }), {
    "Content-Type": "text/html; charset=utf-8",
  });
}

export function createFormStudioServer({
  root,
  port = 4190,
  repository = inMemoryAgentRepository,
  identityDirectory = null,
  testRouteHandler = null,
  now = () => new Date().toISOString(),
}) {
  const authoring = createAgentAuthoring(repository, { now });
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const { pathname } = url;
    const method = req.method || "GET";
    try {
      if (testRouteHandler && await testRouteHandler({ req, res, pathname, method, repository })) return;
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
      // 作者面专用草稿预览；/a/:id 仍只读已发布版本。
      if (method === "GET" && pathname.startsWith("/preview/")) {
        const id = decodeURIComponent(pathname.slice("/preview/".length));
        const agent = authoring.getAgent(id);
        if (!agent) return send(res, 404, "没有这个 agent", { "Content-Type": "text/plain; charset=utf-8" });
        return serveRendered(res, agent, agent.fields || [], agent.formVersion || 1, { preview: true });
      }
      if (method === "GET" && pathname.startsWith("/a/")) {
        const id = decodeURIComponent(pathname.slice(3));
        const agent = authoring.getAgent(id);
        if (!agent) return send(res, 404, "没有这个 agent", { "Content-Type": "text/plain; charset=utf-8" });
        if (!activePublishedBinding(agent)) {
          if (agent.origin === "born-form") {
            return send(res, 404, "该 agent form 尚未发布或已下架", { "Content-Type": "text/plain; charset=utf-8" });
          }
          return serveFile(res, root, join("public", "face", "empty.html"));
        }
        return serveRendered(res, agent, agent.published.fields, agent.published.formVersion);
      }
      if (method === "POST" && pathname.startsWith("/submit/")) {
        const id = decodeURIComponent(pathname.slice("/submit/".length));
        const result = submitToAgent(repository, id, await readJsonBody(req));
        return sendJson(res, result.status, result);
      }
      if (method === "POST" && pathname === "/api/agents") {
        const agent = authoring.createAgent((await readJsonBody(req)).name);
        return sendJson(res, 201, decorateAgent(agent));
      }
      if (method === "POST" && pathname === "/api/retrofits") {
        const payload = await readJsonBody(req);
        const identityResult = await readOwnerIdentity(identityDirectory, payload.ownerAgent);
        if (identityResult.status !== 200) return sendJson(res, identityResult.status, identityResult);
        const result = authoring.createRetrofit(identityResult.identity, payload.authorizationConfirmed);
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 201, decorateAgent(result.agent));
      }
      if (method === "GET" && pathname === "/api/agents") {
        return sendJson(res, 200, authoring.listAgents().map(decorateAgent));
      }
      if (method === "GET" && pathname.startsWith("/api/owner-identities/poffices/")) {
        const id = decodeURIComponent(pathname.slice("/api/owner-identities/poffices/".length));
        const result = await readOwnerIdentity(identityDirectory, id);
        return sendJson(res, result.status, result);
      }
      if (method === "PUT" && pathname.startsWith("/api/agents/") && pathname.endsWith("/fields")) {
        const result = authoring.setFields(agentIdFrom(pathname, "/fields"), (await readJsonBody(req)).fields);
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname.startsWith("/api/agents/") && pathname.endsWith("/copy-example")) {
        const result = authoring.copyExample(agentIdFrom(pathname, "/copy-example"));
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "GET" && pathname.startsWith("/api/agents/")) {
        const rest = pathname.slice("/api/agents/".length);
        if (!rest.includes("/")) {
          const agent = decorateAgent(authoring.getAgent(rest));
          return agent ? sendJson(res, 200, agent) : sendJson(res, 404, { error: "没有这个 agent" });
        }
      }
      if (method === "POST" && pathname.endsWith("/unpublish")) {
        const result = authoring.unpublish(agentIdFrom(pathname, "/unpublish"));
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname.endsWith("/publish")) {
        const result = authoring.publish(agentIdFrom(pathname, "/publish"));
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      send(res, 404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      const status = error instanceof InvalidJsonError ? 400 : 500;
      sendJson(res, status, { error: String(error?.message || error) });
    }
  });
}
