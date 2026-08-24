import { FORM_AUTHOR, SUBMISSION_CREATE, SUBMISSION_MANAGE, SUBMISSION_READ } from "../../src/domain/access/capabilities.mjs";

const profiles = new Map([
  ["author-1", { id: "author-1", name: "測試帳號", role: "author" }],
  ["teacher-1", { id: "teacher-1", name: "测试老师", role: "teacher" }],
  ["student-mock-1", { id: "student-mock-1", name: "市場研究員林悅", role: "student" }],
  ["student-2", { id: "student-2", name: "市場研究員陳凱", role: "student" }],
  ["student-other", { id: "student-other", name: "其他班学生", role: "student", classId: "other-class" }],
  ["teacher-other", { id: "teacher-other", name: "其他老师", role: "teacher", classId: "other-class" }],
]);

function actor(profile) {
  const capabilities = profile.role === "author" ? [FORM_AUTHOR, SUBMISSION_READ, SUBMISSION_MANAGE]
    : profile.role === "teacher" ? [SUBMISSION_READ]
      : profile.role === "student" ? [SUBMISSION_CREATE] : [];
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    verifiedBy: "test-actor-resolver",
    capabilities,
    scope: {
      tenantId: "test-tenant",
      attributes: { classId: profile.classId || "class-1" },
      classId: profile.classId || "class-1",
    },
  };
}

export function createTestActorResolver() {
  return {
    mode: "test",
    resolve(req, { expectedRole, audience } = {}) {
      const requested = String(req.headers["x-form-studio-test-actor"] || "");
      const fallback = audience === "submission" || expectedRole === "student" ? "student-mock-1"
        : expectedRole === "teacher" ? "teacher-1" : "author-1";
      const profile = profiles.get(requested || fallback);
      return profile ? actor(profile) : null;
    },
    listProfiles({ audience = "authoring" } = {}) {
      return [...profiles.values()]
        .filter((profile) => audience === "submission" ? profile.role === "student" : profile.role !== "student")
        .map(({ id, name, role }) => ({ id, name, role }));
    },
    defaultProfileId({ audience = "authoring" } = {}) {
      return audience === "submission" ? "student-mock-1" : "author-1";
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
