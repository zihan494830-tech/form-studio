import { normalizeFields } from "../form/field-contract.mjs";
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
    binding: null,
    inputBag: [],
  };
}

export function newRetrofitFormAgent({ identity, linkedAt = null, access = null }) {
  if (!identity?.ownerAgent || identity.sourceSystem !== "poffices" || identity.readOnly !== true) {
    return { error: "真实身份合同无效", status: 400 };
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
      binding: null,
      inputBag: [],
    },
  };
}

export function changeFields(agent, fields) {
  if (!agent) return { error: "没有这个 agent", status: 404 };
  const normalized = normalizeFields(fields);
  if (normalized.error) return { error: normalized.error, status: 400 };
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
  if (!agent) return { error: "没有这个 agent", status: 404 };
  if (!agent.fields?.length) return { error: "至少添加一个字段才能发布用户页面", status: 400 };
  const published = {
    formVersion: agent.formVersion || 1,
    fields: clone(agent.fields),
    submit: { label: "提交", to: "agent-input" },
  };
  const bindingResult = createOwnerAgentBinding(agent, published);
  if (bindingResult.error) return bindingResult;
  return {
    agent: {
      ...clone(agent),
      published,
      binding: bindingResult.binding,
    },
  };
}

export function unpublishForm(agent) {
  if (!agent) return { error: "没有这个 agent", status: 404 };
  return { agent: { ...clone(agent), published: null, binding: null } };
}
