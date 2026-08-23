import http from "node:http";
import { join } from "node:path";
import { createAgentAuthoring } from "../application/author-agent.mjs";
import { decorateAgent } from "../application/agent-view.mjs";
import { readOwnerIdentity } from "../application/read-owner-identity.mjs";
import { createSubmissionReader } from "../application/read-submissions.mjs";
import { submitToAgent } from "../application/submit-to-agent.mjs";
import { authorizeAgentAction, createAgentAccess, verifiedActor } from "../domain/access/agent-access.mjs";
import { activePublishedBinding } from "../domain/agent/owner-agent-binding.mjs";
import { problem } from "../domain/problem.mjs";
import { createClassroomSubmissionReadAuthorizer } from "../infrastructure/classroom-submission-read-authorizer.mjs";
import { createOwnerSubmissionReadAuthorizer } from "../infrastructure/owner-submission-read-authorizer.mjs";
import { inMemoryAgentRepository } from "../infrastructure/in-memory-agent-repository.mjs";
import { renderFormHtml } from "../presentation/form/render-html.mjs";
import { presentProblem, t } from "../presentation/messages/zh-HK.mjs";
import { InvalidJsonError, readJsonBody, send, sendJson, serveFile } from "./http-utils.mjs";

function agentIdFrom(pathname, suffix) {
  return decodeURIComponent(pathname.slice("/api/agents/".length, pathname.length - suffix.length));
}
function serveRendered(res, agent, fields, formVersion, options = {}) {
  send(res, 200, renderFormHtml(agent, fields, { formVersion, ...options }), {
    "Content-Type": "text/html; charset=utf-8",
  });
}
function sendProblem(res, result) {
  return sendJson(res, result.status || 500, presentProblem(result));
}

export function createFormStudioServer({
  root,
  port = 4190,
  mode = "product",
  repository = inMemoryAgentRepository,
  identityDirectory = null,
  actorResolver = null,
  deliveryRelay = null,
  testRouteHandler = null,
  productVersion = "0.0.0-development",
  dataSource = null,
  runtimeRevision = "development",
  now = () => new Date().toISOString(),
}) {
  if (!["product", "demo", "test"].includes(mode)) throw new TypeError("server mode 非法");
  const demoEnabled = mode === "demo" || mode === "test";
  const provenance = {
    productVersion,
    runtimeRevision,
    dataSource: dataSource ? { ...dataSource } : null,
  };
  const authoring = createAgentAuthoring(repository, { now });
  const submissionReader = createSubmissionReader(repository, {
    authorizeRead: createClassroomSubmissionReadAuthorizer(repository),
  });
  const ownerSubmissionReader = createSubmissionReader(repository, {
    authorizeRead: createOwnerSubmissionReadAuthorizer(repository),
  });
  const teacherSubmissions = {
    listAgents: submissionReader.listSources,
    list: submissionReader.list,
    get: submissionReader.get,
  };
  function requireRole(req, res, expectedRole) {
    const actor = actorResolver?.resolve(req, { expectedRole }) || null;
    if (!verifiedActor(actor)) {
      sendProblem(res, problem("identity_required", 401));
      return null;
    }
    if (actor.role !== expectedRole) {
      sendProblem(res, problem("role_required", 403, { role: expectedRole }));
      return null;
    }
    return actor;
  }
  function requireAgentAction(res, id, actor, action) {
    const agent = authoring.getAgent(id);
    if (!agent) {
      sendProblem(res, problem("agent_not_found", 404));
      return null;
    }
    const decision = authorizeAgentAction(agent, actor, action);
    if (!decision.allowed) {
      sendProblem(res, decision);
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
      if (method === "GET" && pathname === "/api/health") {
        return sendJson(res, 200, {
          application: "form-studio",
          mode,
          productVersion,
          runtimeRevision,
          datasetRevision: dataSource?.datasetRevision || null,
          datasetChecksum: dataSource?.datasetChecksum || null,
          defaultScenario: dataSource?.defaultScenario || null,
        });
      }
      if (testRouteHandler && await testRouteHandler({ req, res, pathname, method, repository })) return;
      if (method === "GET" && pathname === "/api/session") {
        if (!actorResolver) {
          return sendProblem(res, { ...problem("identity_provider_unconfigured", 503), mode });
        }
        const actor = actorResolver?.resolve(req) || null;
        return sendJson(res, 200, {
          mode: actorResolver?.mode || mode,
          actor,
          classroom: demoEnabled ? actorResolver?.classroom || null : null,
          provenance,
        });
      }
      if (demoEnabled && method === "GET" && pathname === "/api/session/profiles") {
        return sendJson(res, 200, { mode: actorResolver?.mode || "unconfigured", profiles: actorResolver?.listProfiles?.() || [] });
      }
      if (demoEnabled && method === "POST" && pathname === "/api/session") {
        const actor = actorResolver?.startSession((await readJsonBody(req)).profileId, res) || null;
        return actor ? sendJson(res, 200, { actor }) : sendProblem(res, problem("demo_profile_not_found", 400));
      }
      if (demoEnabled && method === "DELETE" && pathname === "/api/session") {
        actorResolver?.endSession(req, res);
        return sendJson(res, 200, { actor: null });
      }
      if (method === "GET" && pathname === "/") {
        return serveFile(res, root, join("public", "workbench", "index.html"));
      }
      if (demoEnabled && method === "GET" && pathname === "/session") {
        return send(res, 302, "", { Location: "/" });
      }
      if (demoEnabled && method === "GET" && pathname === "/classroom") {
        return serveFile(res, root, join("public", "classroom", "index.html"));
      }
      const publicRoutes = new Map([
        ["/workbench/main.js", join("public", "workbench", "main.js")],
        ["/workbench/styles.css", join("public", "workbench", "styles.css")],
        ["/runtime/face-submit.js", join("public", "runtime", "face-submit.js")],
        ["/presentation/messages/zh-HK.mjs", join("src", "presentation", "messages", "zh-HK.mjs")],
      ]);
      if (demoEnabled) {
        publicRoutes.set("/classroom/main.js", join("public", "classroom", "main.js"));
        publicRoutes.set("/classroom/styles.css", join("public", "classroom", "styles.css"));
      }
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
        const publishedPreview = Boolean(activePublishedBinding(agent) &&
          JSON.stringify(agent.fields || []) === JSON.stringify(agent.published?.fields || []));
        const authoringMode = url.searchParams.get("mode") === "preview" ? "preview" : "design";
        return serveRendered(res, agent, agent.fields || [], agent.formVersion || 1, { preview: true, publishedPreview, authoringMode });
      }
      if (method === "GET" && pathname.startsWith("/a/")) {
        const id = decodeURIComponent(pathname.slice(3));
        const agent = authoring.getAgent(id);
        if (!agent) return send(res, 404, t("error.agent_not_found"), { "Content-Type": "text/plain; charset=utf-8" });
        if (!activePublishedBinding(agent)) {
          if (agent.origin === "born-form") {
            return send(res, 404, t("error.form_not_published"), { "Content-Type": "text/plain; charset=utf-8" });
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
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (demoEnabled && method === "GET" && pathname === "/api/teacher/agents") {
        const actor = requireRole(req, res, "teacher");
        if (!actor) return;
        return sendJson(res, 200, { agents: teacherSubmissions.listAgents(actor) });
      }
      if (demoEnabled && method === "GET" && pathname.startsWith("/api/teacher/agents/") && pathname.endsWith("/submissions")) {
        const actor = requireRole(req, res, "teacher");
        if (!actor) return;
        const id = decodeURIComponent(pathname.slice("/api/teacher/agents/".length, -"/submissions".length));
        const result = teacherSubmissions.list(id, actor, { actorId: url.searchParams.get("actorId") || "" });
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (demoEnabled && method === "GET" && pathname.startsWith("/api/teacher/submissions/")) {
        const actor = requireRole(req, res, "teacher");
        if (!actor) return;
        const id = decodeURIComponent(pathname.slice("/api/teacher/submissions/".length));
        const result = teacherSubmissions.get(id, actor);
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
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
        if (identityResult.status !== 200) return sendProblem(res, identityResult);
        const result = authoring.createRetrofit(identityResult.identity, { access: accessForAuthor(actor) });
        return result.errorCode
          ? sendProblem(res, result)
          : sendJson(res, 201, decorateAgent(result.agent));
      }
      if (method === "GET" && pathname === "/api/agents") {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const visible = authoring.listAgents().filter((agent) => authorizeAgentAction(agent, actor, "author").allowed);
        return sendJson(res, 200, visible.map(decorateAgent));
      }
      if (method === "GET" && pathname.startsWith("/api/agents/") && pathname.endsWith("/submissions")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/submissions");
        const result = ownerSubmissionReader.list(id, actor, { includeFields: true });
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (method === "GET" && pathname.startsWith("/api/owner-identities/poffices/")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = decodeURIComponent(pathname.slice("/api/owner-identities/poffices/".length));
        const result = await readOwnerIdentity(identityDirectory, id);
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (method === "PUT" && pathname.startsWith("/api/agents/") && pathname.endsWith("/fields")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/fields");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = authoring.setFields(id, (await readJsonBody(req)).fields);
        return result.errorCode
          ? sendProblem(res, result)
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname.startsWith("/api/agents/") && pathname.endsWith("/copy-example")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/copy-example");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = authoring.copyExample(id);
        return result.errorCode
          ? sendProblem(res, result)
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
        return result.errorCode
          ? sendProblem(res, result)
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      if (method === "POST" && pathname.endsWith("/publish")) {
        const actor = requireRole(req, res, "author");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/publish");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = authoring.publish(id);
        return result.errorCode
          ? sendProblem(res, result)
          : sendJson(res, 200, decorateAgent(result.agent));
      }
      send(res, 404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      const result = error instanceof InvalidJsonError
        ? problem("invalid_json", 400)
        : problem("internal_error", 500);
      sendProblem(res, result);
    }
  });
}
