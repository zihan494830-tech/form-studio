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
