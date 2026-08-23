const profiles = new Map([
  ["author-1", { id: "author-1", name: "测试作者", role: "author" }],
  ["teacher-1", { id: "teacher-1", name: "测试老师", role: "teacher" }],
  ["student-mock-1", { id: "student-mock-1", name: "市場研究員林悅", role: "student" }],
  ["student-2", { id: "student-2", name: "市場研究員陳凱", role: "student" }],
  ["student-other", { id: "student-other", name: "其他班学生", role: "student", classId: "other-class" }],
  ["teacher-other", { id: "teacher-other", name: "其他老师", role: "teacher", classId: "other-class" }],
]);

function actor(profile) {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    verifiedBy: "test-actor-resolver",
    scope: { tenantId: "test-tenant", classId: profile.classId || "class-1" },
  };
}

export function createTestActorResolver() {
  return {
    mode: "test",
    resolve(req, { expectedRole } = {}) {
      const requested = String(req.headers["x-form-studio-test-actor"] || "");
      const fallback = expectedRole === "student" ? "student-mock-1"
        : expectedRole === "teacher" ? "teacher-1" : "author-1";
      const profile = profiles.get(requested || fallback);
      return profile ? actor(profile) : null;
    },
    listProfiles() {
      return [...profiles.values()].map(({ id, name, role }) => ({ id, name, role }));
    },
    startSession(profileId) {
      const profile = profiles.get(String(profileId || ""));
      return profile ? actor(profile) : null;
    },
    endSession() {},
    defaultAgentAccess() {
      return { tenantId: "test-tenant", classId: "class-1", authorIds: ["author-1"], teacherIds: ["teacher-1"] };
    },
    classroom: { tenantId: "test-tenant", classId: "class-1", name: "测试课堂" },
  };
}
