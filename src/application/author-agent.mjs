import {
  archiveForm,
  changeFields,
  newBornFormAgent,
  newRetrofitFormAgent,
  publishForm,
  restoreForm,
  unpublishForm,
} from "../domain/agent/form-agent.mjs";
import { EXAMPLE_FIELDS } from "./example-form.mjs";
import { problem } from "../domain/problem.mjs";

/**
 * repository port: list/get/save/appendEnvelope/nextBornFormId/reset。
 * 真实适配器与内存适配器都只能实现 IO，不得重写产品规则。
 */
export function createAgentAuthoring(repository, { now = () => new Date().toISOString() } = {}) {
  const MAX_CREATE_ATTEMPTS = 100;
  function saveResult(result, expectedRevision) {
    if (result.errorCode) return result;
    const saved = repository.save(result.agent, { expectedRevision });
    if (!saved) {
      const current = repository.get(result.agent.id);
      return problem("agent_revision_conflict", 412, {
        expectedRevision,
        currentRevision: current?.revision || 1,
      });
    }
    return { agent: saved };
  }
  return {
    listAgents: () => repository.list(),
    getAgent: (id) => repository.get(id),
    createAgent(name, { access = null } = {}) {
      for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
        const agent = newBornFormAgent({ id: repository.nextBornFormId(), name, createdAt: now(), access });
        const saved = repository.save(agent, { expectedRevision: 0 });
        if (saved) return saved;
      }
      throw new Error("无法分配唯一的 born-form id");
    },
    createRetrofit(identity, { access = null } = {}) {
      const existing = repository.get(String(identity?.ownerAgent || ""));
      if (existing?.archivedAt) {
        return problem("owner_workspace_archived", 409);
      }
      if (existing) {
        return problem("owner_workspace_exists", 409);
      }
      const result = newRetrofitFormAgent({ identity, linkedAt: now(), access });
      if (result.errorCode) return result;
      const saved = repository.save(result.agent, { expectedRevision: 0 });
      return saved ? { agent: saved } : problem("owner_workspace_exists", 409);
    },
    setFields(id, fields, { expectedRevision } = {}) {
      return saveResult(changeFields(repository.get(id), fields), expectedRevision);
    },
    copyExample(id, { expectedRevision } = {}) {
      return saveResult(changeFields(repository.get(id), EXAMPLE_FIELDS), expectedRevision);
    },
    publish(id, { expectedRevision } = {}) {
      return saveResult(publishForm(repository.get(id)), expectedRevision);
    },
    unpublish(id, { expectedRevision } = {}) {
      return saveResult(unpublishForm(repository.get(id)), expectedRevision);
    },
    archive(id, { expectedRevision } = {}) {
      return saveResult(archiveForm(repository.get(id), now()), expectedRevision);
    },
    restore(id, { expectedRevision } = {}) {
      return saveResult(restoreForm(repository.get(id)), expectedRevision);
    },
  };
}
