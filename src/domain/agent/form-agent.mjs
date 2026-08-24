import { normalizeFields } from "../form/field-contract.mjs";
import { appendPublishedDefinition } from "../form/published-definition.mjs";
import { problem } from "../problem.mjs";
import { rebaseAgentInputConfig } from "./agent-input-config.mjs";
import { createOwnerAgentBinding } from "./owner-agent-binding.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function revisionOf(agent) {
  return Number.isInteger(agent?.revision) && agent.revision > 0 ? agent.revision : 1;
}

function withRevision(agent, next) {
  const current = { ...clone(agent), revision: revisionOf(agent) };
  const candidate = { ...clone(next), revision: revisionOf(agent) };
  if (JSON.stringify(current) === JSON.stringify(candidate)) return candidate;
  return { ...candidate, revision: revisionOf(agent) + 1 };
}

export function newBornFormAgent({ id, name, createdAt = null, access = null }) {
  return {
    id,
    name: String(name || "").trim() || "未命名表",
    origin: "born-form",
    sourceSystem: "form-studio",
    ownerIdentity: null,
    authorization: { basis: "born-form", confirmedAt: createdAt },
    access: clone(access),
    revision: 1,
    formVersion: 1,
    fields: [],
    published: null,
    publishedDefinitions: [],
    binding: null,
    inputBag: [],
  };
}

export function newRetrofitFormAgent({ identity, linkedAt = null, access = null }) {
  if (!identity?.ownerAgent || identity.sourceSystem !== "poffices" || identity.readOnly !== true) {
    return problem("owner_identity_invalid", 400);
  }
  return {
    agent: {
      id: String(identity.ownerAgent),
      name: String(identity.name),
      origin: "retrofit",
      sourceSystem: "poffices",
      ownerIdentity: clone(identity),
      authorization: { basis: "local-shadow-only", confirmedAt: linkedAt },
      access: clone(access),
      revision: 1,
      formVersion: 1,
      fields: [],
      published: null,
      publishedDefinitions: [],
      binding: null,
      inputBag: [],
    },
  };
}

export function changeFields(agent, fields) {
  if (!agent) return problem("agent_not_found", 404);
  if (agent.archivedAt) return problem("agent_archived", 409);
  const normalized = normalizeFields(fields);
  if (normalized.errorCode) return normalized;
  const changed = JSON.stringify(agent.fields || []) !== JSON.stringify(normalized.fields);
  return {
    agent: withRevision(agent, {
      ...clone(agent),
      fields: normalized.fields,
      formVersion: changed ? (agent.formVersion || 1) + 1 : (agent.formVersion || 1),
    }),
  };
}

export function publishForm(agent) {
  if (!agent) return problem("agent_not_found", 404);
  if (agent.archivedAt) return problem("agent_archived", 409);
  if (!agent.fields?.length) return problem("fields_required_for_publish", 400);
  const published = {
    formVersion: agent.formVersion || 1,
    fields: clone(agent.fields),
    submit: { label: "提交", to: "agent-input" },
  };
  const recorded = appendPublishedDefinition(agent, published);
  if (recorded.conflict) return problem("form_version_conflict", 409, { formVersion: published.formVersion });
  const bindingResult = createOwnerAgentBinding(agent, published);
  if (bindingResult.errorCode) return bindingResult;
  const rebased = rebaseAgentInputConfig(agent, published.fields, published.formVersion);
  if (rebased.readiness.status === "blocked") {
    return problem("agent_input_mapping_review_required", 409, {
      formVersion: published.formVersion,
      reasons: rebased.readiness.reasons,
    });
  }
  return {
    agent: withRevision(agent, {
      ...clone(rebased.agent),
      published,
      publishedDefinitions: recorded.publishedDefinitions,
      binding: bindingResult.binding,
    }),
  };
}

export function unpublishForm(agent) {
  if (!agent) return problem("agent_not_found", 404);
  if (agent.archivedAt) return problem("agent_archived", 409);
  return { agent: withRevision(agent, { ...clone(agent), published: null, binding: null }) };
}

/**
 * 作者面的“移除”是可恢复归档，不删除不可变发布定义或历史提交。
 * 移除时同时撤掉 Form Studio 用户页，避免隐藏对象继续对外开放。
 */
export function archiveForm(agent, archivedAt) {
  if (!agent) return problem("agent_not_found", 404);
  const at = String(archivedAt || "").trim();
  if (!at) return problem("archive_time_required", 400);
  if (agent.archivedAt) return { agent: clone(agent) };
  return { agent: withRevision(agent, { ...clone(agent), published: null, binding: null, archivedAt: at }) };
}

export function restoreForm(agent) {
  if (!agent) return problem("agent_not_found", 404);
  const restored = clone(agent);
  delete restored.archivedAt;
  return { agent: withRevision(agent, restored) };
}
