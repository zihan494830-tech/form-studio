import {
  changeFields,
  newBornFormAgent,
  newRetrofitFormAgent,
  publishForm,
  unpublishForm,
} from "../domain/agent/form-agent.mjs";
import { EXAMPLE_FIELDS } from "./example-form.mjs";
import { problem } from "../domain/problem.mjs";

/**
 * repository port: list/get/save/appendEnvelope/nextBornFormId/reset。
 * 真实适配器与内存适配器都只能实现 IO，不得重写产品规则。
 */
export function createAgentAuthoring(repository, { now = () => new Date().toISOString() } = {}) {
  function saveResult(result) {
    if (result.errorCode) return result;
    return { agent: repository.save(result.agent) };
  }
  return {
    listAgents: () => repository.list(),
    getAgent: (id) => repository.get(id),
    createAgent(name, { access = null } = {}) {
      const agent = newBornFormAgent({ id: repository.nextBornFormId(), name, createdAt: now(), access });
      return repository.save(agent);
    },
    createRetrofit(identity, { access = null } = {}) {
      if (repository.get(String(identity?.ownerAgent || ""))) {
        return problem("owner_workspace_exists", 409);
      }
      const result = newRetrofitFormAgent({ identity, linkedAt: now(), access });
      return result.errorCode ? result : { agent: repository.save(result.agent) };
    },
    setFields(id, fields) {
      return saveResult(changeFields(repository.get(id), fields));
    },
    copyExample(id) {
      return saveResult(changeFields(repository.get(id), EXAMPLE_FIELDS));
    },
    publish(id) {
      return saveResult(publishForm(repository.get(id)));
    },
    unpublish(id) {
      return saveResult(unpublishForm(repository.get(id)));
    },
  };
}
