/**
 * 外部 agent 经适配后进入 Form Studio 的最小身份合同。
 * 这里只确认“谁是主人”，不携带表、输入袋或任何绑定能力。
 */
export function ownerIdentity({
  sourceSystem,
  externalId,
  name,
  agentType = null,
  official = false,
  updatedAt = null,
  observedAt,
}) {
  const source = String(sourceSystem || "").trim();
  const id = String(externalId ?? "").trim();
  const displayName = String(name || "").trim();
  const observationTime = String(observedAt || "").trim();

  if (!source) throw new Error("真实身份缺 sourceSystem");
  if (!id) throw new Error("真实身份缺 externalId");
  if (!displayName) throw new Error("真实身份缺 name");
  if (!observationTime) throw new Error("真实身份缺 observedAt");

  return {
    version: "owner-agent-identity/v1",
    ownerAgent: id,
    name: displayName,
    origin: "retrofit",
    sourceSystem: source,
    externalId: id,
    agentType: agentType == null ? null : String(agentType),
    official: Boolean(official),
    updatedAt: updatedAt == null ? null : String(updatedAt),
    observedAt: observationTime,
    readOnly: true,
  };
}
