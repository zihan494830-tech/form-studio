function cleanIds(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function createAgentAccess({ tenantId, classId, authorIds, teacherIds = [] }) {
  const tenant = String(tenantId || "").trim();
  const classroom = String(classId || "").trim();
  const authors = cleanIds(authorIds);
  const teachers = cleanIds(teacherIds);
  if (!tenant || !classroom || !authors.length) throw new TypeError("agent access 范围不完整");
  return {
    version: "agent-access/v1",
    tenantId: tenant,
    classId: classroom,
    authorIds: authors,
    teacherIds: teachers,
  };
}

export function verifiedActor(actor, role = null) {
  if (!actor?.id || !actor.verifiedBy || !actor.scope?.tenantId || !actor.scope?.classId) return null;
  if (role && actor.role !== role) return null;
  return actor;
}

export function authorizeAgentAction(agent, actor, action) {
  if (!verifiedActor(actor)) return { allowed: false, ...problem("identity_required", 401) };
  const access = agent?.access;
  if (access?.version !== "agent-access/v1") {
    return { allowed: false, ...problem("access_scope_unconfigured", 403) };
  }
  if (actor.scope.tenantId !== access.tenantId || actor.scope.classId !== access.classId) {
    return { allowed: false, ...problem("cross_scope_forbidden", 403) };
  }
  if (action === "submit" && actor.role === "student") return { allowed: true };
  if (action === "teach" && actor.role === "teacher" && access.teacherIds.includes(actor.id)) return { allowed: true };
  if (action === "author" && actor.role === "author" && access.authorIds.includes(actor.id)) return { allowed: true };
  return { allowed: false, ...problem("operation_forbidden", 403) };
}
import { problem } from "../problem.mjs";
