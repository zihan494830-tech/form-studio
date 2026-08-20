import {
  changeFields,
  newBornFormAgent,
  newRetrofitFormAgent,
  publishForm,
  unpublishForm,
} from "../domain/agent/form-agent.mjs";
import { GOLD_FIELDS } from "./example-form.mjs";

/**
 * repository port: list/get/save/appendEnvelope/nextBornFormId/reset。
 * 真实适配器与内存适配器都只能实现 IO，不得重写产品规则。
 */
export function createAgentAuthoring(repository, { now = () => new Date().toISOString() } = {}) {
  function saveResult(result) {
    if (result.error) return result;
    return { agent: repository.save(result.agent) };
  }
  return {
    listAgents: () => repository.list(),
    getAgent: (id) => repository.get(id),
    createAgent(name) {
      const agent = newBornFormAgent({ id: repository.nextBornFormId(), name, createdAt: now() });
      return repository.save(agent);
    },
    createRetrofit(identity, authorizationConfirmed) {
      if (repository.get(String(identity?.ownerAgent || ""))) {
        return { error: "该 ownerAgent 已有本地设计工作区", status: 409 };
      }
      const result = newRetrofitFormAgent({ identity, authorizationConfirmed, confirmedAt: now() });
      return result.error ? result : { agent: repository.save(result.agent) };
    },
    setFields(id, fields) {
      return saveResult(changeFields(repository.get(id), fields));
    },
    copyExample(id) {
      return saveResult(changeFields(repository.get(id), GOLD_FIELDS));
    },
    publish(id) {
      return saveResult(publishForm(repository.get(id)));
    },
    unpublish(id) {
      return saveResult(unpublishForm(repository.get(id)));
    },
  };
}
