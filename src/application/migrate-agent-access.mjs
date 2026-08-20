import { createAgentAccess } from "../domain/access/agent-access.mjs";

/** 给第 0–2 段本地记录补明确范围；只用于本地课堂适配器。 */
export function migrateAgentAccess(repository, defaults) {
  const access = createAgentAccess(defaults);
  let changed = 0;
  for (const agent of repository.list()) {
    if (agent.access?.version === "agent-access/v1") continue;
    repository.save({ ...agent, access });
    changed += 1;
  }
  return changed;
}
