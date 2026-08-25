import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createInMemoryAgentRepository } from "../../src/infrastructure/in-memory-agent-repository.mjs";
import { createLocalSessionActorResolver } from "../../src/infrastructure/local-session-actor-resolver.mjs";
import { createFormStudioServer } from "../../src/server/create-server.mjs";
import { requestUsesSecureTransport } from "../../src/server/runtime-config.mjs";
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

test("可信 HTTPS 代理为创建和清除会话 Cookie 添加 Secure", () => {
  const resolver = createLocalSessionActorResolver({
    configPath: join(ROOT, "data", "local-classroom.json"),
    useSecureCookie: (req) => requestUsesSecureTransport(req, { trustProxy: true }),
  });
  const req = { headers: { "x-forwarded-proto": "https" } };
  const cookies = [];
  const response = { setHeader(name, value) { if (name === "Set-Cookie") cookies.push(value); } };
  resolver.startSession("author-1", response, { req });
  resolver.endSession(req, response);
  expect(cookies).toHaveLength(2);
  expect(cookies.every((cookie) => cookie.includes("; Secure"))).toBe(true);
});

test("未信任代理时伪造 X-Forwarded-Proto 不改变 Cookie", () => {
  const resolver = createLocalSessionActorResolver({
    configPath: join(ROOT, "data", "local-classroom.json"),
    useSecureCookie: (req) => requestUsesSecureTransport(req, { trustProxy: false }),
  });
  let cookie = "";
  resolver.startSession("author-1", {
    setHeader(name, value) { if (name === "Set-Cookie") cookie = value; },
  }, { req: { headers: { "x-forwarded-proto": "https" } } });
  expect(cookie).not.toContain("; Secure");
});

test("HTTP session 路由把代理协议上下文交给 Cookie 策略", async () => {
  for (const [trustProxy, expectedSecure] of [[true, true], [false, false]]) {
    const resolver = createLocalSessionActorResolver({
      configPath: join(ROOT, "data", "local-classroom.json"),
      useSecureCookie: (req) => requestUsesSecureTransport(req, { trustProxy }),
    });
    const server = createFormStudioServer({
      root: ROOT, mode: "demo", repository: createInMemoryAgentRepository([]), actorResolver: resolver,
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
        body: JSON.stringify({ profileId: "author-1" }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")?.includes("; Secure")).toBe(expectedSecure);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});
