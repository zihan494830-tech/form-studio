import { AgentDirectoryError } from "../../src/domain/agent/agent-directory-error.mjs";
import { ownerIdentity } from "../../src/domain/agent/owner-identity.mjs";

const IDENTITIES = new Map([
  ["18", { name: "Market Analysis", agentType: "app", official: true }],
  ["42", { name: "Research Sandbox", agentType: "agent", official: false }],
]);

export function createTestOwnerDirectory() {
  return {
    async getById(value) {
      const id = String(value || "").trim();
      if (!/^[1-9]\d*$/.test(id)) throw new AgentDirectoryError("invalid_id", "agent id 必须是正整数", 400);
      const found = IDENTITIES.get(id);
      if (!found) throw new AgentDirectoryError("not_found", "没有这个测试 agent", 404);
      return ownerIdentity({
        sourceSystem: "poffices",
        externalId: id,
        name: found.name,
        agentType: found.agentType,
        official: found.official,
        updatedAt: null,
        observedAt: "2026-08-20T08:00:00.000Z",
      });
    },
  };
}
