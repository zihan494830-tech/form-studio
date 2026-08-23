import { SUBMISSION_READ } from "../../src/domain/access/capabilities.mjs";

/**
 * Test-only CRM adapter. It proves that a consumer can bind its own account scope
 * to the generic submission port without adding CRM concepts to application code.
 */
export function authorizeCrmSubmissionRead({ principal, capability, resource }) {
  if (capability !== SUBMISSION_READ
    || !principal?.capabilities?.includes(SUBMISSION_READ)
    || !principal.allowedOwnerAgents?.includes(resource.ownerAgent)) {
    return { allowed: false, status: 403 };
  }
  if (resource.scope == null) return { allowed: true };
  const allowed = Object.entries(principal.resourceScope || {})
    .every(([key, value]) => resource.scope?.[key] === value);
  return { allowed, status: allowed ? 200 : 403 };
}
