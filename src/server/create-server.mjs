import http from "node:http";
import { join } from "node:path";
import { createAgentAuthoring } from "../application/author-agent.mjs";
import { decorateAgent } from "../application/agent-view.mjs";
import { readOwnerIdentity } from "../application/read-owner-identity.mjs";
import { createTeacherSubmissionReader } from "../application/read-teacher-submissions.mjs";
import { submitToAgent } from "../application/submit-to-agent.mjs";
import { authorizeAgentAction, createAgentAccess, verifiedActor } from "../domain/access/agent-access.mjs";
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
  actorResolver = null,
  deliveryRelay = null,
  testRouteHandler = null,
  now = () => new Date().toISOString(),
}) {
  const authoring = createAgentAuthoring(repository, { now });
  const teacherSubmissions = createTeacherSubmissionReader(repository);
  function requireRole(req, res, expectedRole) {
    const actor = actorResolver?.resolve(req, { expectedRole }) || null;
    if (!verifiedActor(actor)) {
      sendJson(res, 401, { error: "需要先选择或登录一个有效身份" });
      return null;
    }
    if (actor.role !== expectedRole) {
      sendJson(res, 403, { error: `当前操作需要 ${expectedRole} 身份` });
      return null;
    }
    return actor;
  }
  function requireAgentAction(res, id, actor, action) {
    const agent = authoring.getAgent(id);
    if (!agent) {
      sendJson(res, 404, { error: "没有这个 agent" });
      return null;
    }
    const decision = authorizeAgentAction(agent, actor, action);
    if (!decision.allowed) {
      sendJson(res, decision.status, { error: decision.error });
      return null;
    }
    return agent;
  }
  function accessForAuthor(actor) {
    const defaults = actorResolver.defaultAgentAccess();
    return createAgentAccess({ ...defaults, authorIds: [actor.id] });
  }
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const { pathname } = url;
    const method = req.method || "GET";
    try {
      if (testRouteHandler && await testRouteHandler({ req, res, pathname, method, repository })) return;
      if (method === "GET" && pathname === "/api/session") {
        const actor = actorResolver?.resolve(req) || null;
        return sendJson(res, 200, { mode: actorResolver?.mode || "unconfigured", actor, classroom: actorResolver?.classroom || null });
      }
      if (method === "GET" && pathname === "/api/session/profiles") {
        return sendJson(res, 200, { mode: actorResolver?.mode || "unconfigured", profiles: actorResolver?.listProfiles?.() || [] });
      }
      if (method === "POST" && pathname === "/api/session") {
        const actor = actorResolver?.startSession((await readJsonBody(req)).profileId, res) || null;
        return actor ? sendJson(res, 200, { actor }) : sendJson(res, 400, { error: "没有这个本地演示身份" });
      }
      if (method === "DELETE" && pathname === "/api/session") {
        actorResolver?.endSession(req, res);
        return sendJson(res, 200, { actor: null });
      }
      if (method === "GET" && pathname === "/") {
        return serveFile(res, root, join("public", "workbench", "index.html"));
      }
      if (method === "GET" && pathname === "/session") {
        return serveFile(res, root, join("public", "session", "index.html"));
      }
      if (method === "GET" && pathname === "/classroom") {
        return serveFile(res, root, join("public", "classroom", "index.html"));
      }
      const publicRoutes = new Map([
        ["/workbench/main.js", join("public", "workbench", "main.js")],
        ["/workbench/styles.css", join("public", "workbench", "styles.css")],
        ["/runtime/face-submit.js", join("public", "runtime", "face-submit.js")],
        ["/session/main.js", join("public", "session", "main.js")],
        ["/session/styles.css", join("public", "session", "styles.css")],
        ["/classroom/main.js", join("public", "classroom", "main.js")],
        ["/classroom/styles.css", join("public", "classroom", "styles.css")],
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
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const agent = requireAgentAction(res, id, actor, "author");
        if (!agent) return;
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
        const actor = requireRole(req, res, "student");
        if (!actor) return;
        const result = submitToAgent(repository, id, await readJsonBody(req), { actor });
        if (result.status === 200 && deliveryRelay) {
          queueMicrotask(() => deliveryRelay.runOnce().catch(() => {}));
        }
        return sendJson(res, result.status, result);
      }
      if (method === "GET" && pathname === "/api/teacher/agents") {
        const actor = requireRole(req, res, "teacher");
        if (!actor) return;
        return sendJson(res, 200, { agents: teacherSubmissions.listAgents(actor) });
      }
      if (method === "GET" && pathname.startsWith("/api/teacher/agents/") && pathname.endsWith("/submissions")) {
        const actor = requireRole(req, res, "teacher");
        if (!actor) return;
        const id = decodeURIComponent(pathname.slice("/api/teacher/agents/".length, -"/submissions".length));
        const result = teacherSubmissions.list(id, actor, { actorId: url.searchParams.get("actorId") || "" });
        return sendJson(res, result.status, result);
      }
      if (method === "GET" && pathname.startsWith("/api/teacher/submissions/")) {
        const actor = requireRole(req, res, "teacher");
        if (!actor) return;
        const id = decodeURIComponent(pathname.slice("/api/teacher/submissions/".length));
        const result = teacherSubmissions.get(id, actor);
        return sendJson(res, result.status, result);
      }
      if (method === "POST" && pathname === "/api/agents") {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const agent = authoring.createAgent((await readJsonBody(req)).name, { access: accessForAuthor(actor) });
        return sendJson(res, 201, decorateAgent(agent));
      }
      if (method === "POST" && pathname === "/api/retrofits") {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const payload = await readJsonBody(req);
        const identityResult = await readOwnerIdentity(identityDirectory, payload.ownerAgent);
        if (identityResult.status !== 200) return sendJson(res, identityResult.status, identityResult);
        const result = authoring.createRetrofit(identityResult.identity, { access: accessForAuthor(actor) });
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 201, decorateAgent(result.agent));
      }
      if (method === "GET" && pathname === "/api/agents") {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const visible = authoring.listAgents().filter((agent) => authorizeAgentAction(agent, actor, "author").allowed);
        return sendJson(res, 200, visible.map(decorateAgent));
      }
      if (method === "GET" && pathname.startsWith("/api/owner-identities/poffices/")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = decodeURIComponent(pathname.slice("/api/owner-identities/poffices/".length));
        const result = await readOwnerIdentity(identityDirectory, id);
        return sendJson(res, result.status, result);
      }
      if (method === "PUT" && pathname.startsWith("/api/agents/") && pathname.endsWith("/fields")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/fields");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = authoring.setFields(id, (await readJsonBody(req)).fields);
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname.startsWith("/api/agents/") && pathname.endsWith("/copy-example")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/copy-example");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = authoring.copyExample(id);
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "GET" && pathname.startsWith("/api/agents/")) {
        const rest = pathname.slice("/api/agents/".length);
        if (!rest.includes("/")) {
          const actor = requireRole(req, res, "author");
          if (!actor) return;
          const agent = requireAgentAction(res, rest, actor, "author");
          return agent ? sendJson(res, 200, decorateAgent(agent)) : undefined;
        }
      }
      if (method === "POST" && pathname.endsWith("/unpublish")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/unpublish");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = authoring.unpublish(id);
        return result.error
          ? sendJson(res, result.status, { error: result.error })
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname.endsWith("/publish")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/publish");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = authoring.publish(id);
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
