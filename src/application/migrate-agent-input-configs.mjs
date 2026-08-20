import { attachAgentInputConfig } from "../domain/agent/agent-input-config.mjs";

export function migrateAgentInputConfigs(repository, configs = []) {
  const result = { attached: 0, errors: [] };
  for (const config of configs) {
    const agent = repository.get(config.ownerAgent);
    if (!agent || agent.agentInput) continue;
    if (agent.sourceSystem !== "local-fixture") continue;
    try {
      repository.save(attachAgentInputConfig(agent, config));
      result.attached += 1;
    } catch (error) {
      result.errors.push({ ownerAgent: config.ownerAgent, error: String(error?.message || error) });
    }
  }
  return result;
}
