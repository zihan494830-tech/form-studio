/**
 * 运行时只做入口：浏览器已 checkValidity 后，服务端封信封并追加进袋子。
 * 无表 409。空必填栏不得入袋。不覆盖快照。按该 agent 已发布字段收值。
 */
import { makeEnvelope } from "../domain/submission/envelope.mjs";
import { activePublishedBinding } from "../domain/agent/owner-agent-binding.mjs";
import { authorizeAgentAction } from "../domain/access/agent-access.mjs";
import { deliveryForEnvelope } from "../domain/agent/agent-input-config.mjs";

function readValue(field, values) {
  const raw = values[field.id];
  if (field.control === "checkbox") {
    if (raw === true || raw === "true" || raw === "on") return "true";
    return "false";
  }
  if (raw == null) return "";
  return String(raw);
}

export function submitToAgent(repository, agentId, payload, { actor = null } = {}) {
  const agent = repository.get(agentId);
  if (!agent) {
    return { status: 404, error: "没有这个 agent" };
  }
  if (!activePublishedBinding(agent)) {
    return { status: 409, error: "该 agent 没有首页表" };
  }
  const access = authorizeAgentAction(agent, actor, "submit");
  if (!access.allowed) return access;

  const incoming =
    payload?.values && typeof payload.values === "object" ? payload.values : {};
  const fields = agent.published.fields;
  const values = {};
  const missing = [];
  const invalid = [];

  for (const field of fields) {
    const value = readValue(field, incoming);
    if (field.required) {
      const empty =
        field.control === "checkbox" ? value !== "true" : value.trim() === "";
      if (empty) missing.push(field.id);
    }
    if (value !== "" && field.control === "number" && !Number.isInteger(Number(value))) invalid.push(field.id);
    if (value !== "" && field.control === "select" && !field.options.includes(value)) invalid.push(field.id);
    values[field.id] = value;
  }

  if (missing.length) {
    return { status: 400, error: "缺必填栏不得入袋", missing };
  }
  if (invalid.length) {
    return { status: 400, error: "栏位格式不正确", invalid };
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
    return { status: 409, error: `agent 输入映射不可用：${error.message}` };
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
