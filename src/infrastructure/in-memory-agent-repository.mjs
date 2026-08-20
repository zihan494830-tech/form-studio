import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTROLS, GOLD_FIELDS, ID_PATTERN } from "../domain/form/field-contract.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOCKS_PATH = join(ROOT, "data", "mock-agents.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSeed() {
  return clone(JSON.parse(readFileSync(MOCKS_PATH, "utf8")));
}

let agents = loadSeed();

export function resetStore() {
  agents = loadSeed();
  return listAgents();
}

export function listAgents() {
  return clone(agents);
}

export function getAgent(id) {
  const found = agents.find((agent) => agent.id === id);
  return found ? clone(found) : null;
}

export function appendEnvelope(agentId, envelope) {
  const found = agents.find((agent) => agent.id === agentId);
  if (!found) return null;
  found.inputBag.push(clone(envelope));
  return clone(found);
}

export function unbind(agentId) {
  const found = agents.find((agent) => agent.id === agentId);
  if (!found) return null;
  found.formId = null;
  found.published = null;
  return clone(found);
}

export function bind(agentId) {
  const found = agents.find((agent) => agent.id === agentId);
  if (!found) return { error: "没有这个 agent", status: 404 };
  if (!found.fields || found.fields.length < 1) {
    return { error: "至少一栏才能设为首页", status: 400 };
  }
  found.published = {
    formVersion: found.formVersion || 1,
    fields: clone(found.fields),
    submit: { label: "提交", to: "agent-input" },
  };
  found.formId = found.id;
  return { agent: clone(found) };
}

export function setFields(agentId, fields) {
  const found = agents.find((agent) => agent.id === agentId);
  if (!found) return { error: "没有这个 agent", status: 404 };
  const normalized = normalizeFields(fields);
  if (normalized.error) return { error: normalized.error, status: 400 };
  const before = JSON.stringify(found.fields || []);
  const after = JSON.stringify(normalized.fields);
  found.fields = normalized.fields;
  if (before !== after) {
    found.formVersion = (found.formVersion || 1) + 1;
  }
  return { agent: clone(found) };
}

export function copyExample(agentId) {
  const found = agents.find((agent) => agent.id === agentId);
  if (!found) return { error: "没有这个 agent", status: 404 };
  found.fields = clone(GOLD_FIELDS);
  found.formVersion = (found.formVersion || 1) + 1;
  return { agent: clone(found) };
}

export function createAgent(name) {
  const trimmed = String(name || "").trim() || "未命名表";
  let n = 1;
  const used = new Set(agents.map((agent) => agent.id));
  while (used.has(`form-${n}`)) n += 1;
  const agent = {
    id: `form-${n}`,
    name: trimmed,
    origin: "born-form",
    formId: null,
    formVersion: 1,
    fields: [],
    published: null,
    inputBag: [],
  };
  agents.push(agent);
  return clone(agent);
}

export function normalizeFields(fields) {
  if (!Array.isArray(fields)) {
    return { error: "fields 必须是数组" };
  }
  const seen = new Set();
  const out = [];
  for (const raw of fields) {
    const id = String(raw?.id || "").trim();
    const label = String(raw?.label || "").trim();
    const control = String(raw?.control || "text");
    if (!ID_PATTERN.test(id)) {
      return { error: `非法字段 id：${id || "(空)"}` };
    }
    if (seen.has(id)) {
      return { error: `重复字段 id：${id}` };
    }
    if (!label) {
      return { error: "label 不能空" };
    }
    if (!CONTROLS.includes(control)) {
      return { error: `非法控件：${control}` };
    }
    seen.add(id);
    const field = {
      id,
      label,
      control,
      required: Boolean(raw?.required),
    };
    if (control === "select") {
      const options = Array.isArray(raw.options)
        ? raw.options.map((item) => String(item).trim()).filter(Boolean)
        : String(raw.options || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
      field.options = options.length ? options : ["选项一", "选项二"];
    }
    out.push(field);
  }
  return { fields: out };
}
