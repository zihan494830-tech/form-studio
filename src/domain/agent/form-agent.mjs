import { normalizeFields } from "../form/field-contract.mjs";
import { appendPublishedDefinition } from "../form/published-definition.mjs";
import { problem } from "../problem.mjs";
import { createOwnerAgentBinding } from "./owner-agent-binding.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  const normalized = normalizeFields(fields);
  if (normalized.errorCode) return normalized;
  const changed = JSON.stringify(agent.fields || []) !== JSON.stringify(normalized.fields);
  return {
    agent: {
      ...clone(agent),
      fields: normalized.fields,
      formVersion: changed ? (agent.formVersion || 1) + 1 : (agent.formVersion || 1),
    },
  };
}

export function publishForm(agent) {
  if (!agent) return problem("agent_not_found", 404);
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
  return {
    agent: {
      ...clone(agent),
      published,
      publishedDefinitions: recorded.publishedDefinitions,
      binding: bindingResult.binding,
    },
  };
}

export function unpublishForm(agent) {
  if (!agent) return problem("agent_not_found", 404);
  return { agent: { ...clone(agent), published: null, binding: null } };
}
