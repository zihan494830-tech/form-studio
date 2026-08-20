function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value || "").trim();
}

function checkProfile(profile, ownerAgent) {
  if (profile?.version !== "agent-input-profile/v1") throw new TypeError("agent input profile 版本不支持");
  if (profile.ownerAgent !== ownerAgent) throw new TypeError("agent input profile 主人不一致");
  if (!Number.isInteger(profile.profileVersion) || profile.profileVersion < 1) throw new TypeError("profileVersion 非法");
  if (!text(profile.skillId)) throw new TypeError("skillId 必填");
  if (profile.inputMode !== "structured") throw new TypeError("当前只支持 structured 输入");
  if (profile.transport?.kind !== "local-recording" || !text(profile.transport.target)) {
    throw new TypeError("当前只支持明确的 local-recording transport");
  }
}

function checkMapping(mapping, profile, fields) {
  if (mapping?.version !== "agent-input-mapping/v1") throw new TypeError("agent input mapping 版本不支持");
  if (mapping.ownerAgent !== profile.ownerAgent) throw new TypeError("agent input mapping 主人不一致");
  if (mapping.profileVersion !== profile.profileVersion) throw new TypeError("profileVersion 漂移");
  if (mapping.inputMode !== profile.inputMode) throw new TypeError("inputMode 漂移");
  if (!Number.isInteger(mapping.formVersion) || mapping.formVersion < 1) throw new TypeError("formVersion 非法");
  if (!Array.isArray(mapping.fields) || !mapping.fields.length) throw new TypeError("input mapping fields[] 必填");
  const known = new Map((fields || []).map((field) => [field.id, field]));
  const fieldIds = new Set(), targetKeys = new Set();
  for (const item of mapping.fields) {
    if (!known.has(item.fieldId)) throw new TypeError(`input mapping 未知字段：${item.fieldId}`);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(item.targetKey || "")) throw new TypeError("targetKey 非法");
    if (!new Set(["string", "number", "boolean"]).has(item.transform)) throw new TypeError("transform 非法");
    if (fieldIds.has(item.fieldId) || targetKeys.has(item.targetKey)) throw new TypeError("input mapping 字段或目标键重复");
    if (item.transform === "boolean" && known.get(item.fieldId).control !== "checkbox") throw new TypeError("boolean 只能映射 checkbox");
    if (item.transform === "number" && known.get(item.fieldId).control !== "number") throw new TypeError("number 只能映射数字栏");
    fieldIds.add(item.fieldId);
    targetKeys.add(item.targetKey);
  }
}

function transformed(item, raw) {
  if (item.transform === "boolean") return raw === "true";
  if (item.transform === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new TypeError(`数字映射失败：${item.fieldId}`);
    return value;
  }
  return String(raw);
}

export function attachAgentInputConfig(agent, { profile, mapping }) {
  if (!agent?.id) throw new TypeError("agent 不存在");
  checkProfile(profile, agent.id);
  checkMapping(mapping, profile, agent.published?.fields || agent.fields || []);
  if (mapping.formVersion !== agent.published?.formVersion) throw new TypeError("mapping 必须绑定当前已发布版本");
  return { ...clone(agent), agentInput: { profile: clone(profile), mapping: clone(mapping) } };
}

export function deliveryForEnvelope(agent, envelope) {
  if (!agent?.agentInput) return null;
  const { profile, mapping } = agent.agentInput;
  checkProfile(profile, agent.id);
  checkMapping(mapping, profile, agent.published?.fields || []);
  if (mapping.formVersion !== envelope.formVersion) throw new TypeError("提交版本与 input mapping 不一致");
  const payload = {};
  for (const item of mapping.fields) {
    const raw = envelope.values[item.fieldId];
    if ((raw == null || raw === "") && item.required) throw new TypeError(`agent 输入缺字段：${item.fieldId}`);
    if (raw == null || raw === "") continue;
    payload[item.targetKey] = transformed(item, raw);
  }
  return {
    target: clone(profile.transport),
    profile: { version: profile.version, profileVersion: profile.profileVersion, skillId: profile.skillId },
    mapping: { version: mapping.version, formVersion: mapping.formVersion, profileVersion: mapping.profileVersion },
    payload,
  };
}
