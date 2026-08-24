import http from "node:http";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createAgentAuthoring } from "../application/author-agent.mjs";
import { decorateAgent } from "../application/agent-view.mjs";
import { readOwnerIdentity } from "../application/read-owner-identity.mjs";
import { createSubmissionReader } from "../application/read-submissions.mjs";
import { createSubmissionManager } from "../application/manage-submissions.mjs";
import { submitToAgent } from "../application/submit-to-agent.mjs";
import { authorizeAgentAction, createAgentAccess, hasCapability, verifiedActor } from "../domain/access/agent-access.mjs";
import { FORM_AUTHOR, SUBMISSION_CREATE, SUBMISSION_MANAGE, SUBMISSION_READ } from "../domain/access/capabilities.mjs";
import { activePublishedBinding } from "../domain/agent/owner-agent-binding.mjs";
import { currentReleaseVersion } from "../domain/form/published-definition.mjs";
import { problem } from "../domain/problem.mjs";
import { createClassroomSubmissionReadAuthorizer } from "../infrastructure/classroom-submission-read-authorizer.mjs";
import { createOwnerSubmissionReadAuthorizer } from "../infrastructure/owner-submission-read-authorizer.mjs";
import { inMemoryAgentRepository } from "../infrastructure/in-memory-agent-repository.mjs";
import { renderFormHtml } from "../presentation/form/render-html.mjs";
import { presentProblem, t } from "../presentation/messages/zh-HK.mjs";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  readJsonBody,
  send,
  sendJson,
  serveFile,
} from "./http-utils.mjs";
import { readIfMatchRevision, revisionEtag } from "./concurrency-etag.mjs";
import { agentIdFrom, decodePathComponent, InvalidPathEncodingError } from "./request-path.mjs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKBENCH_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function serveRendered(res, agent, fields, formVersion, options = {}) {
  send(res, 200, renderFormHtml(agent, fields, { formVersion, ...options }), {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": options.preview
      ? "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
      : "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
}
function sendProblem(res, result) {
  return sendJson(res, result.status || 500, presentProblem(result));
}
function sendAgent(res, status, agent) {
  return sendJson(res, status, decorateAgent(agent), { ETag: revisionEtag("agent", agent?.revision) });
}
function expectedRevision(req, res) {
  const result = readIfMatchRevision(req, "agent");
  if (result.errorCode) sendProblem(res, result);
  return result.revision ?? null;
}
function expectedManagementRevision(req, res) {
  const result = readIfMatchRevision(req, "submission-management");
  if (result.errorCode) sendProblem(res, result);
  return result.revision ?? null;
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
  const submissionManager = createSubmissionManager(repository, { now });
  const teacherSubmissions = {
    listAgents: submissionReader.listSources,
    list: submissionReader.list,
    get: submissionReader.get,
  };
  function requireCapability(req, res, capability, audience) {
    if (!actorResolver) {
      sendProblem(res, { ...problem("identity_provider_unconfigured", 503), mode });
      return null;
    }
    const actor = actorResolver.resolve(req, { capability, audience }) || null;
    if (!verifiedActor(actor)) {
      sendProblem(res, problem("identity_required", 401));
      return null;
    }
    if (!hasCapability(actor, capability)) {
      sendProblem(res, problem("capability_required", 403, { capability }));
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
    const defaults = actorResolver?.defaultAgentAccess?.() || {
      tenantId: actor.scope.tenantId,
      classId: actor.scope.attributes?.classId || actor.scope.classId || "default",
      teacherIds: [],
    };
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
          schemaVersion: 3,
        });
      }
      if (testRouteHandler && await testRouteHandler({ req, res, pathname, method, repository })) return;
      if (method === "GET" && pathname === "/api/session") {
        const audience = url.searchParams.get("audience") === "submission" ? "submission" : "authoring";
        if (!actorResolver) {
          return sendProblem(res, { ...problem("identity_provider_unconfigured", 503), mode });
        }
        const actor = actorResolver.resolve(req, { audience }) || null;
        return sendJson(res, 200, {
          mode: actorResolver?.mode || mode,
          audience,
          actor,
          classroom: demoEnabled ? actorResolver?.classroom || null : null,
          provenance,
        });
      }
      if (demoEnabled && method === "GET" && pathname === "/api/session/profiles") {
        const audience = url.searchParams.get("audience") === "submission" ? "submission" : "authoring";
        return sendJson(res, 200, {
          mode: actorResolver?.mode || "unconfigured",
          audience,
          profiles: actorResolver?.listProfiles?.({ audience }) || [],
          defaultProfileId: actorResolver?.defaultProfileId?.({ audience }) || null,
        });
      }
      if (demoEnabled && method === "POST" && pathname === "/api/session") {
        const payload = await readJsonBody(req);
        const audience = payload.audience === "submission" ? "submission" : "authoring";
        const actor = actorResolver?.startSession(payload.profileId, res, { audience }) || null;
        return actor ? sendJson(res, 200, { actor }) : sendProblem(res, problem("demo_profile_not_found", 400));
      }
      if (demoEnabled && method === "DELETE" && pathname === "/api/session") {
        const audience = url.searchParams.get("audience") === "submission" ? "submission" : "authoring";
        actorResolver?.endSession(req, res, { audience });
        return sendJson(res, 200, { actor: null });
      }
      if (method === "GET" && pathname === "/") {
        return serveFile(res, root, join("public", "workbench", "index.html"), { "Content-Security-Policy": WORKBENCH_CSP });
      }
      if (demoEnabled && method === "GET" && pathname === "/session") {
        return send(res, 302, "", { Location: "/" });
      }
      if (demoEnabled && method === "GET" && pathname === "/classroom") {
        return serveFile(res, root, join("public", "classroom", "index.html"), { "Content-Security-Policy": WORKBENCH_CSP });
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
      if (method === "GET" && pathname.startsWith("/preview/")) {
        const id = decodePathComponent(pathname.slice("/preview/".length));
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const agent = requireAgentAction(res, id, actor, "author");
        if (!agent) return;
        const publishedPreview = Boolean(activePublishedBinding(agent) &&
          JSON.stringify(agent.fields || []) === JSON.stringify(agent.published?.fields || []));
        const authoringMode = url.searchParams.get("mode") === "preview" ? "preview" : "design";
        return serveRendered(res, agent, agent.fields || [], agent.formVersion || 1, {
          preview: true,
          publishedPreview,
          authoringMode,
          releaseVersion: publishedPreview ? currentReleaseVersion(agent) : null,
        });
      }
      if (method === "GET" && pathname.startsWith("/a/")) {
        const id = decodePathComponent(pathname.slice(3));
        const agent = authoring.getAgent(id);
        if (!agent) return send(res, 404, t("error.agent_not_found"), { "Content-Type": "text/plain; charset=utf-8" });
        if (!activePublishedBinding(agent)) {
          if (agent.origin === "born-form") {
            return send(res, 404, t("error.form_not_published"), { "Content-Type": "text/plain; charset=utf-8" });
          }
          return serveFile(res, root, join("public", "face", "empty.html"));
        }
        return serveRendered(res, agent, agent.published.fields, agent.published.formVersion, {
          demoMode: demoEnabled,
          submissionIntentId: randomUUID(),
          releaseVersion: currentReleaseVersion(agent),
        });
      }
      if (method === "POST" && pathname.startsWith("/submit/")) {
        const id = decodePathComponent(pathname.slice("/submit/".length));
        const actor = requireCapability(req, res, SUBMISSION_CREATE, "submission");
        if (!actor) return;
        const submissionIntentId = String(req.headers["idempotency-key"] || "").trim();
        if (!submissionIntentId) return sendProblem(res, problem("submission_intent_required", 400));
        if (!UUID_PATTERN.test(submissionIntentId)) return sendProblem(res, problem("submission_intent_invalid", 400));
        const result = submitToAgent(repository, id, await readJsonBody(req), {
          actor,
          submissionIntentId,
        });
        if (result.status === 200 && deliveryRelay) {
          queueMicrotask(() => deliveryRelay.runOnce().catch(() => {}));
        }
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (demoEnabled && method === "GET" && pathname === "/api/teacher/agents") {
        const actor = requireCapability(req, res, SUBMISSION_READ, "authoring");
        if (!actor) return;
        return sendJson(res, 200, { agents: teacherSubmissions.listAgents(actor) });
      }
      if (demoEnabled && method === "GET" && pathname.startsWith("/api/teacher/agents/") && pathname.endsWith("/submissions")) {
        const actor = requireCapability(req, res, SUBMISSION_READ, "authoring");
        if (!actor) return;
        const id = decodePathComponent(pathname.slice("/api/teacher/agents/".length, -"/submissions".length));
        const result = teacherSubmissions.list(id, actor, { actorId: url.searchParams.get("actorId") || "" });
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (demoEnabled && method === "GET" && pathname.startsWith("/api/teacher/submissions/")) {
        const actor = requireCapability(req, res, SUBMISSION_READ, "authoring");
        if (!actor) return;
        const id = decodePathComponent(pathname.slice("/api/teacher/submissions/".length));
        const result = teacherSubmissions.get(id, actor);
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (method === "POST" && pathname === "/api/agents") {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const agent = authoring.createAgent((await readJsonBody(req)).name, { access: accessForAuthor(actor) });
        return sendAgent(res, 201, agent);
      }
      if (method === "POST" && pathname === "/api/retrofits") {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const payload = await readJsonBody(req);
        const identityResult = await readOwnerIdentity(identityDirectory, payload.ownerAgent);
        if (identityResult.status !== 200) return sendProblem(res, identityResult);
        const result = authoring.createRetrofit(identityResult.identity, { access: accessForAuthor(actor) });
        return result.errorCode
          ? sendProblem(res, result)
          : sendAgent(res, 201, result.agent);
      }
      if (method === "GET" && pathname === "/api/agents") {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const visible = authoring.listAgents().filter((agent) => authorizeAgentAction(agent, actor, "author").allowed);
        return sendJson(res, 200, visible.map(decorateAgent));
      }
      const ownerSubmissionMatch = /^\/api\/agents\/([^/]+)\/submissions\/([^/]+)(?:\/(management|corrections))?$/.exec(pathname);
      if (ownerSubmissionMatch) {
        const ownerAgent = decodePathComponent(ownerSubmissionMatch[1]);
        const submissionId = decodePathComponent(ownerSubmissionMatch[2]);
        const operation = ownerSubmissionMatch[3] || "detail";
        if (method === "GET" && operation === "detail") {
          const actor = requireCapability(req, res, SUBMISSION_READ, "authoring");
          if (!actor) return;
          if (!requireAgentAction(res, ownerAgent, actor, "author")) return;
          const result = submissionManager.detail(ownerAgent, submissionId);
          return result.errorCode
            ? sendProblem(res, result)
            : sendJson(res, result.status, result, { ETag: revisionEtag("submission-management", result.submission.management.revision) });
        }
        if (method === "PATCH" && operation === "management") {
          const actor = requireCapability(req, res, SUBMISSION_MANAGE, "authoring");
          if (!actor) return;
          if (!requireAgentAction(res, ownerAgent, actor, "manage-submissions")) return;
          const revision = expectedManagementRevision(req, res);
          if (revision == null) return;
          const result = submissionManager.updateManagement(ownerAgent, submissionId, await readJsonBody(req), {
            expectedRevision: revision,
            actor,
          });
          return result.errorCode
            ? sendProblem(res, result)
            : sendJson(res, result.status, result, { ETag: revisionEtag("submission-management", result.management.revision) });
        }
        if (method === "POST" && operation === "corrections") {
          const actor = requireCapability(req, res, SUBMISSION_MANAGE, "authoring");
          if (!actor) return;
          if (!requireAgentAction(res, ownerAgent, actor, "manage-submissions")) return;
          const revision = expectedManagementRevision(req, res);
          if (revision == null) return;
          const result = submissionManager.addCorrection(ownerAgent, submissionId, await readJsonBody(req), {
            expectedRevision: revision,
            actor,
          });
          return result.errorCode
            ? sendProblem(res, result)
            : sendJson(res, result.status, result, { ETag: revisionEtag("submission-management", result.management.revision) });
        }
      }
      if (method === "GET" && pathname.startsWith("/api/agents/") && pathname.endsWith("/submissions")) {
        const actor = requireCapability(req, res, SUBMISSION_READ, "authoring");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/submissions");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const result = ownerSubmissionReader.list(id, actor, { includeFields: true });
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (method === "GET" && pathname.startsWith("/api/owner-identities/poffices/")) {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const id = decodePathComponent(pathname.slice("/api/owner-identities/poffices/".length));
        const result = await readOwnerIdentity(identityDirectory, id);
        return result.errorCode ? sendProblem(res, result) : sendJson(res, result.status, result);
      }
      if (method === "PUT" && pathname.startsWith("/api/agents/") && pathname.endsWith("/fields")) {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/fields");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const revision = expectedRevision(req, res);
        if (revision == null) return;
        const result = authoring.setFields(id, (await readJsonBody(req)).fields, { expectedRevision: revision });
        return result.errorCode
          ? sendProblem(res, result)
          : sendAgent(res, 200, result.agent);
      }
      if (method === "POST" && pathname.startsWith("/api/agents/") && pathname.endsWith("/copy-example")) {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/copy-example");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const revision = expectedRevision(req, res);
        if (revision == null) return;
        const result = authoring.copyExample(id, { expectedRevision: revision });
        return result.errorCode
          ? sendProblem(res, result)
          : sendAgent(res, 200, result.agent);
      }
      if (method === "GET" && pathname.startsWith("/api/agents/")) {
        const rest = pathname.slice("/api/agents/".length);
        if (!rest.includes("/")) {
          const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
          if (!actor) return;
          const agent = requireAgentAction(res, decodePathComponent(rest), actor, "author");
          return agent ? sendAgent(res, 200, agent) : undefined;
        }
      }
      if (method === "POST" && pathname.endsWith("/unpublish")) {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/unpublish");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const revision = expectedRevision(req, res);
        if (revision == null) return;
        const result = authoring.unpublish(id, { expectedRevision: revision });
        return result.errorCode
          ? sendProblem(res, result)
          : sendAgent(res, 200, result.agent);
      }
      if (method === "POST" && pathname.endsWith("/archive")) {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/archive");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const revision = expectedRevision(req, res);
        if (revision == null) return;
        const result = authoring.archive(id, { expectedRevision: revision });
        return result.errorCode
          ? sendProblem(res, result)
          : sendAgent(res, 200, result.agent);
      }
      if (method === "POST" && pathname.endsWith("/restore")) {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/restore");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const revision = expectedRevision(req, res);
        if (revision == null) return;
        const result = authoring.restore(id, { expectedRevision: revision });
        return result.errorCode
          ? sendProblem(res, result)
          : sendAgent(res, 200, result.agent);
      }
      if (method === "POST" && pathname.endsWith("/publish")) {
        const actor = requireCapability(req, res, FORM_AUTHOR, "authoring");
        if (!actor) return;
        const id = agentIdFrom(pathname, "/publish");
        if (!requireAgentAction(res, id, actor, "author")) return;
        const revision = expectedRevision(req, res);
        if (revision == null) return;
        const result = authoring.publish(id, { expectedRevision: revision });
        return result.errorCode
          ? sendProblem(res, result)
          : sendAgent(res, 200, result.agent);
      }
      send(res, 404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      const result = error instanceof InvalidJsonError
        ? problem("invalid_json", 400)
        : error instanceof InvalidPathEncodingError
          ? problem("invalid_path_encoding", 400)
        : error instanceof UnsupportedMediaTypeError
          ? problem("unsupported_media_type", 415)
          : error instanceof PayloadTooLargeError
            ? problem("payload_too_large", 413)
            : problem("internal_error", 500);
      sendProblem(res, result);
    }
  });
}
