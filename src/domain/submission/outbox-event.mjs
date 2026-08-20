function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function makeOutboxEvent({
  id,
  submissionId,
  ownerAgent,
  status = "pending",
  createdAt,
  updatedAt = createdAt,
  attempts = 0,
  idempotencyKey,
  target,
  profile,
  mapping,
  payload,
  lastError = null,
  receipt = null,
}) {
  if (!/^outbox-[1-9][0-9]*$/.test(String(id || ""))) throw new TypeError("outbox id 非法");
  if (!/^submission-[1-9][0-9]*$/.test(String(submissionId || ""))) throw new TypeError("outbox submissionId 非法");
  if (!ownerAgent || !createdAt || !idempotencyKey) throw new TypeError("outbox 关键字段缺失");
  if (!["pending", "delivering", "delivered", "failed"].includes(status)) throw new TypeError("outbox status 非法");
  return {
    version: "agent-input-outbox-event/v1",
    id: String(id),
    submissionId: String(submissionId),
    ownerAgent: String(ownerAgent),
    status,
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),
    attempts: Number(attempts),
    idempotencyKey: String(idempotencyKey),
    target: clone(target),
    profile: clone(profile),
    mapping: clone(mapping),
    payload: clone(payload),
    lastError: lastError == null ? null : String(lastError),
    receipt: clone(receipt),
  };
}
