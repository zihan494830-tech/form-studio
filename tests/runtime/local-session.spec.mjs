import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createLocalSessionActorResolver } from "../../src/infrastructure/local-session-actor-resolver.mjs";
import { ROOT } from "../support/project-fixture.mjs";

test("本地演示身份只由 HttpOnly 会话 cookie 恢复", () => {
  const resolver = createLocalSessionActorResolver({ configPath: join(ROOT, "data", "local-classroom.json") });
  let setCookie = "";
  const response = { setHeader(name, value) { if (name === "Set-Cookie") setCookie = value; } };
  const selected = resolver.startSession("teacher-1", response);

  expect(selected).toMatchObject({ id: "teacher-1", role: "teacher", verifiedBy: "local-demo-session" });
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Strict");
  expect(resolver.resolve({ headers: { cookie: setCookie.split(";")[0] } })).toMatchObject({ id: "teacher-1" });
  expect(resolver.resolve({ headers: { "x-form-studio-test-actor": "student-1" } })).toBeNull();
});

test("作者工作台与正式填写会话使用两个独立 HttpOnly Cookie", () => {
  const resolver = createLocalSessionActorResolver({ configPath: join(ROOT, "data", "local-classroom.json") });
  const cookies = [];
  const response = { setHeader(name, value) { if (name === "Set-Cookie") cookies.push(value); } };
  resolver.startSession("author-1", response, { audience: "authoring" });
  resolver.startSession("student-1", response, { audience: "submission" });
  const cookieHeader = cookies.map((value) => value.split(";")[0]).join("; ");
  const req = { headers: { cookie: cookieHeader } };

  expect(resolver.resolve(req, { audience: "authoring" })).toMatchObject({
    id: "author-1", capabilities: expect.arrayContaining(["form:author"]),
  });
  expect(resolver.resolve(req, { audience: "submission" })).toMatchObject({
    id: "student-1", capabilities: expect.arrayContaining(["submission:create"]),
  });

  const clear = [];
  resolver.endSession(req, { setHeader(name, value) { if (name === "Set-Cookie") clear.push(value); } }, { audience: "submission" });
  expect(clear[0]).toContain("form_studio_submission_session=");
  expect(resolver.resolve(req, { audience: "authoring" })?.id).toBe("author-1");
});

test("畸形会话 Cookie 按未登录处理而不抛出异常", () => {
  const resolver = createLocalSessionActorResolver({ configPath: join(ROOT, "data", "local-classroom.json") });
  expect(resolver.resolve({ headers: { cookie: "form_studio_authoring_session=%E0%A4%A" } }, { audience: "authoring" })).toBeNull();
});
