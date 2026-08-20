import { changeFields, newBornFormAgent, publishForm, unpublishForm } from "../domain/agent/form-agent.mjs";
import { GOLD_FIELDS } from "./example-form.mjs";

/**
 * repository port: list/get/save/appendEnvelope/nextBornFormId/reset。
 * 真实适配器与内存适配器都只能实现 IO，不得重写产品规则。
 */
export function createAgentAuthoring(repository) {
  function saveResult(result) {
    if (result.error) return result;
    return { agent: repository.save(result.agent) };
  }
  return {
    listAgents: () => repository.list(),
    getAgent: (id) => repository.get(id),
    createAgent(name) {
      const agent = newBornFormAgent({ id: repository.nextBornFormId(), name });
      return repository.save(agent);
    },
    setFields(id, fields) {
      return saveResult(changeFields(repository.get(id), fields));
    },
    copyExample(id) {
      return saveResult(changeFields(repository.get(id), GOLD_FIELDS));
    },
    bind(id) {
      return saveResult(publishForm(repository.get(id)));
    },
    unbind(id) {
      return saveResult(unpublishForm(repository.get(id)));
    },
  };
}
