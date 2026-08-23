import { authorizeAgentAction } from "../domain/access/agent-access.mjs";
import { SUBMISSION_READ } from "../domain/access/capabilities.mjs";
import { problem } from "../domain/problem.mjs";

/** Maps owner-author access onto the generic submission:read capability. */
export function createOwnerSubmissionReadAuthorizer(repository) {
  return ({ principal, capability, resource }) => {
    if (capability !== SUBMISSION_READ) {
      return { allowed: false, ...problem("operation_forbidden", 403) };
    }
    const agent = repository.get(resource.ownerAgent);
    if (!agent) return { allowed: false, ...problem("user_page_not_found", 404) };
    return authorizeAgentAction(agent, principal, "author");
  };
}
