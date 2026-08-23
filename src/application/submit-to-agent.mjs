/**
 * 运行时只做入口：浏览器已 checkValidity 后，服务端封信封并追加进袋子。
 * 无表 409。空必填栏不得入袋。不覆盖快照。按该 agent 已发布字段收值。
 * grid 先经唯一展开函数展开为格子字段，逐格按同一套规则校验（v0.27）。
 */
import { makeEnvelope } from "../domain/submission/envelope.mjs";
import { activePublishedBinding } from "../domain/agent/owner-agent-binding.mjs";
import { authorizeAgentAction } from "../domain/access/agent-access.mjs";
import { deliveryForEnvelope } from "../domain/agent/agent-input-config.mjs";
import { expandFields } from "../domain/form/expand-fields.mjs";
import { problem } from "../domain/problem.mjs";

function readValue(field, values) {
  const raw = values[field.id];
  if (field.control === "checkbox") {
    if (raw === true || raw === "true" || raw === "on") return "true";
    return "false";
  }
  if (raw == null) return "";
  return String(raw);
}

function isNumberValid(value, decimals) {
  // Match HTML number step semantics (numeric multiples), rather than counting source-text digits:
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number
  const text = String(value).trim();
  if (!/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return false;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return false;
  const places = Number.isInteger(decimals) ? decimals : 0;
  const scaled = numeric * (10 ** places);
  const tolerance = Math.max(1e-9, Number.EPSILON * Math.abs(scaled) * 8);
  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

export function submitToAgent(repository, agentId, payload, { actor = null } = {}) {
  const agent = repository.get(agentId);
  if (!agent) {
    return problem("agent_not_found", 404);
  }
  if (!activePublishedBinding(agent)) {
    return problem("form_not_published", 409);
  }
  const access = authorizeAgentAction(agent, actor, "submit");
  if (!access.allowed) return access;

  const incoming =
    payload?.values && typeof payload.values === "object" ? payload.values : {};
  const expanded = expandFields(agent.published.fields);
  if (expanded.errorCode) {
    return { ...problem("form_definition_invalid", 409, { reason: expanded.errorCode }) };
  }
  const values = {};
  const missing = [];
  const invalid = [];

  for (const field of expanded.fields) {
    const value = readValue(field, incoming);
    if (field.required) {
      const empty =
        field.control === "checkbox" ? value !== "true" : value.trim() === "";
      if (empty) missing.push(field.id);
    }
    if (value !== "" && field.control === "number" && !isNumberValid(value, field.decimals)) invalid.push(field.id);
    if (value !== "" && (field.control === "select" || field.control === "radio") && !field.options.includes(value)) invalid.push(field.id);
    values[field.id] = value;
  }

  if (missing.length) {
    return { ...problem("required_fields_missing", 400, { fields: missing }), missing };
  }
  if (invalid.length) {
    return { ...problem("field_values_invalid", 400, { fields: invalid }), invalid };
  }

  const envelope = makeEnvelope({
    ownerAgent: agentId,
    formVersion: agent.published.formVersion || payload.formVersion || 1,
    submitterId: actor.id,
    values,
  });

  let delivery = null;
  try {
    delivery = deliveryForEnvelope(agent, envelope);
  } catch (error) {
    return problem("agent_input_mapping_unavailable", 409, { reason: error?.code || "invalid_mapping" });
  }
  const options = {
    actor: { id: actor.id, displayName: actor.name || actor.id, role: actor.role, verifiedBy: actor.verifiedBy },
    scope: { tenantId: actor.scope.tenantId, classId: actor.scope.classId },
    delivery,
  };
  if (repository.appendSubmission) {
    const appended = repository.appendSubmission(agentId, envelope, options);
    return {
      status: 200,
      agent: appended.agent,
      envelope,
      submissionId: appended.submission.id,
      delivery: appended.delivery ? { status: appended.delivery.status, eventId: appended.delivery.id } : { status: "not_configured" },
    };
  }
  const updated = repository.appendEnvelope(agentId, envelope, options);
  return { status: 200, agent: updated, envelope, delivery: { status: "not_configured" } };
}
