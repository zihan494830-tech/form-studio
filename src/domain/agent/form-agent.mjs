import { normalizeFields } from "../form/field-contract.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function newBornFormAgent({ id, name }) {
  return {
    id,
    name: String(name || "").trim() || "未命名表",
    origin: "born-form",
    formId: null,
    formVersion: 1,
    fields: [],
    published: null,
    inputBag: [],
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
  if (!agent.fields?.length) return { error: "至少一栏才能设为首页", status: 400 };
  return {
    agent: {
      ...clone(agent),
      formId: agent.id,
      published: {
        formVersion: agent.formVersion || 1,
        fields: clone(agent.fields),
        submit: { label: "提交", to: "agent-input" },
      },
    },
  };
}

export function unpublishForm(agent) {
  if (!agent) return { error: "没有这个 agent", status: 404 };
  return { agent: { ...clone(agent), formId: null, published: null } };
}
