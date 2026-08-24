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
    if (raw != null && !["string", "boolean", "number"].includes(typeof raw)) {
      return { value: "false", invalid: true };
    }
    return { value: raw === true || raw === "true" || raw === "on" ? "true" : "false", invalid: false };
  }
  if (raw == null) return { value: "", invalid: false };
  if (!["string", "number", "boolean"].includes(typeof raw)) return { value: "", invalid: true };
  return { value: String(raw), invalid: false };
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

export function validateSubmissionValues(fields, rawValues) {
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) {
    return problem("field_values_invalid", 400);
  }
  const incoming = rawValues;
  const expanded = expandFields(fields);
  if (expanded.errorCode) return problem("form_definition_invalid", 409, { reason: expanded.errorCode });
  const values = {};
  const missing = [];
  const invalid = [];
  const knownIds = new Set(expanded.fields.map((field) => field.id));
  for (const key of Object.keys(incoming)) {
    if (!knownIds.has(key)) invalid.push(key);
  }
  for (const field of expanded.fields) {
    const read = readValue(field, incoming);
    const value = read.value;
    if (read.invalid) invalid.push(field.id);
    if (field.required) {
      const empty = field.control === "checkbox" ? value !== "true" : value.trim() === "";
      if (empty) missing.push(field.id);
    }
    if (value !== "" && field.control === "number" && !isNumberValid(value, field.decimals)) invalid.push(field.id);
    if (value !== "" && (field.control === "select" || field.control === "radio") && !field.options.includes(value)) invalid.push(field.id);
    values[field.id] = value;
  }
  if (invalid.length) {
    const rejected = [...new Set(invalid)];
    return { ...problem("field_values_invalid", 400, { fields: rejected }), invalid: rejected };
  }
  if (missing.length) return { ...problem("required_fields_missing", 400, { fields: missing }), missing };
  return { values };
}

export function submitToAgent(repository, agentId, payload, { actor = null, submissionIntentId = "" } = {}) {
  const agent = repository.get(agentId);
  if (!agent) {
    return problem("agent_not_found", 404);
  }
  if (!activePublishedBinding(agent)) {
    return problem("form_not_published", 409);
  }
  const access = authorizeAgentAction(agent, actor, "submit");
  if (!access.allowed) return access;

  const submittedVersion = Number(payload?.formVersion);
  if (!Number.isInteger(submittedVersion) || submittedVersion < 1) {
    return problem("form_version_invalid", 400);
  }
  if (submittedVersion !== agent.published.formVersion) {
    return problem("form_version_conflict", 409, {
      submittedVersion,
      currentVersion: agent.published.formVersion,
    });
  }

  const validated = validateSubmissionValues(agent.published.fields, payload?.values);
  if (validated.errorCode) return validated;
  const values = validated.values;

  const envelope = makeEnvelope({
    ownerAgent: agentId,
    formVersion: submittedVersion,
    submitterId: actor.id,
    values,
  });

  let delivery = null;
  let deliveryStatus = { status: "not_configured" };
  try {
    delivery = deliveryForEnvelope(agent, envelope);
    if (delivery) deliveryStatus = { status: "pending" };
  } catch (error) {
    const reason = error?.code || "invalid_mapping";
    deliveryStatus = { status: "mapping_review_required", reason };
    delivery = {
      status: "mapping_review_required",
      target: { kind: "mapping-review", target: agent.id },
      profile: {
        version: agent.agentInput?.profile?.version || "agent-input-profile/v1",
        profileVersion: agent.agentInput?.profile?.profileVersion || 1,
        skillId: agent.agentInput?.profile?.skillId || "mapping-review",
      },
      mapping: {
        version: agent.agentInput?.mapping?.version || "agent-input-mapping/v1",
        formVersion: envelope.formVersion,
        profileVersion: agent.agentInput?.mapping?.profileVersion || 1,
      },
      payload: {},
      lastError: reason,
    };
  }
  const options = {
    principal: { id: actor.id, displayName: actor.name || actor.id, verifiedBy: actor.verifiedBy },
    scope: {
      tenantId: actor.scope.tenantId,
      attributes: { ...(actor.scope.attributes || {}), ...(actor.scope.classId ? { classId: actor.scope.classId } : {}) },
    },
    submissionIntentId,
    fingerprintSource: JSON.stringify({ formVersion: submittedVersion, values }),
    delivery,
  };
  if (repository.appendSubmission) {
    const appended = repository.appendSubmission(agentId, envelope, options);
    if (appended?.conflict) return problem("submission_intent_conflict", 409);
    return {
      status: 200,
      envelope: appended.submission.envelope,
      submissionId: appended.submission.id,
      replayed: Boolean(appended.replayed),
      delivery: appended.delivery ? { status: appended.delivery.status, eventId: appended.delivery.id } : deliveryStatus,
    };
  }
  const updated = repository.appendEnvelope(agentId, envelope, options);
  if (!updated) return problem("agent_not_found", 404);
  return { status: 200, envelope, delivery: { status: "not_configured" } };
}
