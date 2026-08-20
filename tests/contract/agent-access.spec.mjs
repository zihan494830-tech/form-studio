import { expect, test } from "@playwright/test";
import { authorizeAgentAction, createAgentAccess } from "../../src/domain/access/agent-access.mjs";

const access = createAgentAccess({
  tenantId: "school-1",
  classId: "class-1",
  authorIds: ["author-1"],
  teacherIds: ["teacher-1"],
});
const agent = { id: "exercise-1", access };
const actor = (id, role, classId = "class-1") => ({
  id,
  role,
  verifiedBy: "contract-test",
  scope: { tenantId: "school-1", classId },
});

test("agent-access/v1 只允许匹配范围和角色的操作", () => {
  expect(authorizeAgentAction(agent, actor("author-1", "author"), "author").allowed).toBe(true);
  expect(authorizeAgentAction(agent, actor("teacher-1", "teacher"), "teach").allowed).toBe(true);
  expect(authorizeAgentAction(agent, actor("student-1", "student"), "submit").allowed).toBe(true);
  expect(authorizeAgentAction(agent, actor("student-1", "student"), "teach")).toMatchObject({ status: 403 });
});

test("跨班级和未验证身份默认拒绝", () => {
  expect(authorizeAgentAction(agent, actor("student-2", "student", "class-2"), "submit")).toMatchObject({
    status: 403,
    error: "无权访问其他班级或租户的数据",
  });
  expect(authorizeAgentAction(agent, null, "submit")).toMatchObject({ status: 401 });
});
