import { attachAgentInputConfig, rebaseAgentInputConfig } from "../domain/agent/agent-input-config.mjs";

export function migrateAgentInputConfigs(repository, configs = []) {
  const result = { attached: 0, rebound: 0, reviewRequired: 0, errors: [] };
  for (const config of configs) {
    const agent = repository.get(config.ownerAgent);
    if (!agent) continue;
    if (agent.sourceSystem !== "local-fixture") continue;
    try {
      const publishedVersion = agent.published?.formVersion;
      const publishedFields = agent.published?.fields || agent.fields || [];
      if (agent.agentInput) {
        const rebased = rebaseAgentInputConfig(agent, publishedFields, publishedVersion || agent.formVersion || 1);
        if (rebased.readiness.status === "blocked") {
          result.reviewRequired += 1;
          result.errors.push({
            ownerAgent: agent.id,
            code: "mapping_review_required",
            reasons: rebased.readiness.reasons,
          });
          continue;
        }
        if (rebased.readiness.status === "rebaseable") {
          repository.save({ ...rebased.agent, revision: (agent.revision || 1) + 1 });
          result.rebound += 1;
        }
        continue;
      }
      const candidate = publishedVersion && config.mapping?.formVersion !== publishedVersion
        ? { ...config, mapping: { ...config.mapping, formVersion: publishedVersion } }
        : config;
      repository.save({ ...attachAgentInputConfig(agent, candidate), revision: (agent.revision || 1) + 1 });
      result.attached += 1;
    } catch (error) {
      result.errors.push({ ownerAgent: config.ownerAgent, code: "mapping_contract_invalid", error: String(error?.message || error) });
    }
  }
  return result;
}
