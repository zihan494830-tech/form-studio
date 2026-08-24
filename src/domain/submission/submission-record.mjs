function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDateTime(value, message) {
  const result = requiredText(value, message);
  if (!DATE_TIME_PATTERN.test(result) || Number.isNaN(Date.parse(result))) throw new TypeError(message);
  return result;
}

function validEnvelope(envelope, owner) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new TypeError("submission envelope 非法");
  if (envelope.ownerAgent !== owner) throw new TypeError("submission record 主人与信封不一致");
  if (!Number.isInteger(envelope.formVersion) || envelope.formVersion < 1) throw new TypeError("submission envelope formVersion 非法");
  validDateTime(envelope.submittedAt, "submission envelope submittedAt 非法");
  requiredText(envelope.submitterId, "submission envelope submitterId 缺失");
  if (!envelope.values || typeof envelope.values !== "object" || Array.isArray(envelope.values)) throw new TypeError("submission envelope values 非法");
  if (Object.values(envelope.values).some((value) => typeof value !== "string")) throw new TypeError("submission envelope values 必须是字符串");
}

export function makeSubmissionRecord({ id, ownerAgent, receivedAt, envelope, actor = null, scope = null }) {
  const recordId = String(id || "");
  const owner = String(ownerAgent || "");
  if (!/^submission-[1-9][0-9]*$/.test(recordId)) throw new TypeError("submission record id 非法");
  if (!owner) throw new TypeError("submission record 缺少主人");
  validEnvelope(envelope, owner);
  const received = validDateTime(receivedAt, "submission record 缺少接收时间");
  if (actor !== null) {
    requiredText(actor?.id, "submission actor 缺少 id");
    requiredText(actor?.verifiedBy, "submission actor 缺少 verifiedBy");
    if (!["student", "teacher", "author"].includes(actor?.role)) throw new TypeError("submission actor role 非法");
  }
  if (scope !== null) {
    requiredText(scope?.tenantId, "submission scope 缺少 tenantId");
    requiredText(scope?.classId, "submission scope 缺少 classId");
  }
  return {
    version: "submission-record/v1",
    id: recordId,
    ownerAgent: owner,
    receivedAt: received,
    actor: clone(actor),
    scope: clone(scope),
    envelope: clone(envelope),
  };
}

function requiredText(value, message) {
  const result = String(value || "").trim();
  if (!result) throw new TypeError(message);
  return result;
}

export function makeSubmissionRecordV2({
  id,
  ownerAgent,
  receivedAt,
  envelope,
  principal,
  scope,
  submissionIntentId,
}) {
  const recordId = requiredText(id, "submission record id 非法");
  const owner = requiredText(ownerAgent, "submission record 缺少主人");
  if (!/^submission-[1-9][0-9]*$/.test(recordId)) throw new TypeError("submission record id 非法");
  validEnvelope(envelope, owner);
  const principalId = requiredText(principal?.id, "submission principal 缺少 id");
  const verifiedBy = requiredText(principal?.verifiedBy, "submission principal 缺少 verifiedBy");
  if (envelope?.submitterId !== principalId) throw new TypeError("submission principal 与信封填写人不一致");
  const tenantId = requiredText(scope?.tenantId, "submission scope 缺少 tenantId");
  const attributes = scope?.attributes && typeof scope.attributes === "object" && !Array.isArray(scope.attributes)
    ? Object.fromEntries(Object.entries(scope.attributes).map(([key, value]) => {
      if (!["string", "number", "boolean"].includes(typeof value) && value !== null) throw new TypeError("submission scope attribute 非法");
      return [String(key), value];
    }))
    : {};
  const intent = requiredText(submissionIntentId, "submission intent 缺失");
  if (!UUID_PATTERN.test(intent)) throw new TypeError("submission intent 必须是 UUID");
  return {
    version: "submission-record/v2",
    id: recordId,
    ownerAgent: owner,
    receivedAt: validDateTime(receivedAt, "submission record 接收时间非法"),
    principal: {
      id: principalId,
      ...(principal.displayName ? { displayName: String(principal.displayName) } : {}),
      verifiedBy,
    },
    authorization: { capability: "submission:create" },
    scope: { tenantId, attributes },
    submissionIntentId: intent,
    envelope: clone(envelope),
  };
}
