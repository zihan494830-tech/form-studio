function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function makeSubmissionRecord({ id, ownerAgent, receivedAt, envelope, actor = null, scope = null }) {
  const recordId = String(id || "");
  const owner = String(ownerAgent || "");
  if (!/^submission-[1-9][0-9]*$/.test(recordId)) throw new TypeError("submission record id 非法");
  if (!owner || envelope?.ownerAgent !== owner) throw new TypeError("submission record 主人与信封不一致");
  if (!receivedAt) throw new TypeError("submission record 缺少接收时间");
  return {
    version: "submission-record/v1",
    id: recordId,
    ownerAgent: owner,
    receivedAt: String(receivedAt),
    actor: clone(actor),
    scope: clone(scope),
    envelope: clone(envelope),
  };
}
