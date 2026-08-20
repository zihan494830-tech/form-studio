/**
 * 运行时只做入口：浏览器已 checkValidity 后，服务端封信封并追加进袋子。
 * 无表 409。空必填栏不得入袋。不覆盖快照。按该 agent 已发布字段收值。
 */
import { makeEnvelope } from "../domain/submission/envelope.mjs";

function readValue(field, values) {
  const raw = values[field.id];
  if (field.control === "checkbox") {
    if (raw === true || raw === "true" || raw === "on") return "true";
    return "false";
  }
  if (raw == null) return "";
  return String(raw);
}

export function submitToAgent(repository, agentId, payload) {
  const agent = repository.get(agentId);
  if (!agent) {
    return { status: 404, error: "没有这个 agent" };
  }
  if (!agent.formId || !agent.published?.fields?.length) {
    return { status: 409, error: "该 agent 没有首页表" };
  }

  const incoming =
    payload?.values && typeof payload.values === "object" ? payload.values : {};
  const fields = agent.published.fields;
  const values = {};
  const missing = [];

  for (const field of fields) {
    const value = readValue(field, incoming);
    if (field.required) {
      const empty =
        field.control === "checkbox" ? value !== "true" : value.trim() === "";
      if (empty) missing.push(field.id);
    }
    values[field.id] = value;
  }

  if (missing.length) {
    return { status: 400, error: "缺必填栏不得入袋", missing };
  }

  const envelope = makeEnvelope({
    ownerAgent: agentId,
    formVersion: agent.published.formVersion || payload.formVersion || 1,
    submitterId: payload.submitterId,
    values,
  });

  const updated = repository.appendEnvelope(agentId, envelope);
  return { status: 200, agent: updated, envelope };
}
