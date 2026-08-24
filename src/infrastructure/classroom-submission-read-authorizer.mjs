import { authorizeAgentAction } from "../domain/access/agent-access.mjs";
import { SUBMISSION_READ } from "../domain/access/capabilities.mjs";
import { problem } from "../domain/problem.mjs";

/** Maps the current classroom access contract onto the generic read capability. */
export function createClassroomSubmissionReadAuthorizer(repository) {
  return ({ principal, capability, resource }) => {
    if (capability !== SUBMISSION_READ) {
      return { allowed: false, ...problem("operation_forbidden", 403) };
    }
    const agent = repository.get(resource.ownerAgent);
    if (!agent) return { allowed: false, ...problem("user_page_not_found", 404) };
    const decision = authorizeAgentAction(agent, principal, "teach");
    if (!decision.allowed || resource.scope == null) return decision;
    const scope = resource.scope;
    const resourceClassId = scope.attributes?.classId || scope.classId;
    const principalClassId = principal.scope.attributes?.classId || principal.scope.classId;
    if (scope.tenantId !== agent.access.tenantId
      || resourceClassId !== agent.access.classId
      || scope.tenantId !== principal.scope.tenantId
      || resourceClassId !== principalClassId) {
      return { allowed: false, ...problem("cross_scope_forbidden", 403) };
    }
    return decision;
  };
}
