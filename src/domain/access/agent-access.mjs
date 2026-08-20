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
  if (!verifiedActor(actor)) return { allowed: false, status: 401, error: "需要已验证身份" };
  const access = agent?.access;
  if (access?.version !== "agent-access/v1") {
    return { allowed: false, status: 403, error: "页面尚未配置访问范围" };
  }
  if (actor.scope.tenantId !== access.tenantId || actor.scope.classId !== access.classId) {
    return { allowed: false, status: 403, error: "无权访问其他班级或租户的数据" };
  }
  if (action === "submit" && actor.role === "student") return { allowed: true };
  if (action === "teach" && actor.role === "teacher" && access.teacherIds.includes(actor.id)) return { allowed: true };
  if (action === "author" && actor.role === "author" && access.authorIds.includes(actor.id)) return { allowed: true };
  return { allowed: false, status: 403, error: "当前身份没有这个操作权限" };
}
