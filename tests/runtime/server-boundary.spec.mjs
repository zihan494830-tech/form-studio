import { expect, test } from "@playwright/test";
import { request as httpRequest } from "node:http";
import { createInMemoryAgentRepository } from "../../src/infrastructure/in-memory-agent-repository.mjs";
import { submitToAgent } from "../../src/application/submit-to-agent.mjs";
import { createFormStudioServer } from "../../src/server/create-server.mjs";
import { ROOT } from "../support/project-fixture.mjs";
import { SUBMISSION_CREATE } from "../../src/domain/access/capabilities.mjs";

const TEST_PORT = Number(process.env.FORM_STUDIO_TEST_PORT || 4191);

const studentActor = {
  id: "student-mock-1",
  name: "测试学生",
  role: "student",
  verifiedBy: "server-boundary-test",
  capabilities: [SUBMISSION_CREATE],
  scope: { tenantId: "test-tenant", attributes: { classId: "class-1" }, classId: "class-1" },
};

function seed() {
  return [{
    id: "exercise-1",
    name: "市场分析需求",
    origin: "retrofit",
    sourceSystem: "local-fixture",
    authorization: { basis: "local-fixture", confirmedAt: null },
    access: { version: "agent-access/v1", tenantId: "test-tenant", classId: "class-1", authorIds: ["author-1"], teacherIds: ["teacher-1"] },
    formVersion: 1,
    fields: [{ id: "q1", label: "题目", control: "text", required: true }],
    published: {
      formVersion: 1,
      fields: [{ id: "q1", label: "题目", control: "text", required: true }],
      submit: { label: "提交", to: "agent-input" },
    },
    binding: {
      version: "owner-agent-binding/v1", ownerAgent: "exercise-1", sourceSystem: "local-fixture",
      formId: "exercise-1", publishedFormVersion: 1, entryMode: "form-studio-sidecar",
      status: "published", authorization: { basis: "local-fixture", confirmedAt: null },
    },
    inputBag: [],
  }, {
    id: "exercise-2", name: "客户回访记录", origin: "retrofit", sourceSystem: "local-fixture",
    authorization: { basis: "local-fixture", confirmedAt: null }, formVersion: 1,
    access: { version: "agent-access/v1", tenantId: "test-tenant", classId: "class-1", authorIds: ["author-1"], teacherIds: ["teacher-1"] },
    fields: [], published: null, binding: null, inputBag: [],
  }];
}

function rawPost(path, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: TEST_PORT, path, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Idempotency-Key": "6bc7a75b-60dd-4b00-b5db-c0831ea8993f",
      } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: TEST_PORT, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("绕过浏览器时，404/409/缺必填 400 仍由服务端守住", () => {
  const repository = createInMemoryAgentRepository(seed());
  expect(submitToAgent(repository, "missing", { values: {} }).status).toBe(404);
  expect(submitToAgent(repository, "exercise-2", { values: {} }).status).toBe(409);
  const missing = submitToAgent(repository, "exercise-1", { formVersion: 1, values: {} }, { actor: studentActor });
  expect(missing).toMatchObject({ status: 400, missing: ["q1"] });
  expect(repository.get("exercise-1").inputBag).toHaveLength(0);
});

test("坏 JSON 返回 400，不冒充服务端 500", async () => {
  const response = await rawPost("/submit/exercise-1", "{bad-json");
  expect(response.status).toBe(400);
  expect(JSON.parse(response.body)).toMatchObject({ errorCode: "invalid_json" });
});

test("坏 URL 百分号编码返回 400，不冒充服务端 500", async () => {
  const response = await rawGet("/preview/%E0%A4%A");
  expect(response.status).toBe(400);
  expect(JSON.parse(response.body)).toMatchObject({ errorCode: "invalid_path_encoding" });
});

test("普通服务不注册 fixture 与 reset 测试钩子", async () => {
  const repository = createInMemoryAgentRepository(seed());
  const server = createFormStudioServer({ root: ROOT, repository });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    expect((await fetch(`http://127.0.0.1:${port}/fixture/exercise-1`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/api/test/reset`, { method: "POST" })).status).toBe(404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("健康端点公开当前运行源码指纹，供启动器拒绝复用旧进程", async () => {
  const server = createFormStudioServer({ root: ROOT, repository: createInMemoryAgentRepository(seed()), runtimeRevision: "test-revision" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      application: "form-studio",
      mode: "product",
      productVersion: "0.0.0-development",
      runtimeRevision: "test-revision",
      datasetRevision: null,
      datasetChecksum: null,
      defaultScenario: null,
      schemaVersion: 3,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("product 模式不注册本地身份和课堂参考应用", async () => {
  const repository = createInMemoryAgentRepository(seed());
  const server = createFormStudioServer({ root: ROOT, repository, mode: "product" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    expect((await fetch(`${base}/api/session`)).status).toBe(503);
    expect((await fetch(`${base}/api/session/profiles`)).status).toBe(404);
    expect((await fetch(`${base}/session`)).status).toBe(404);
    expect((await fetch(`${base}/session/main.js`)).status).toBe(404);
    expect((await fetch(`${base}/classroom`)).status).toBe(404);
    expect((await fetch(`${base}/classroom/main.js`)).status).toBe(404);
    expect((await fetch(`${base}/api/teacher/agents`)).status).toBe(404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("站点根跳转只采用显式 PUBLIC_ORIGIN，否则保持相对路径", async () => {
  for (const [publicOrigin, expected] of [
    [null, "/"],
    ["https://form-studio.example", "https://form-studio.example/"],
  ]) {
    const server = createFormStudioServer({
      root: ROOT, repository: createInMemoryAgentRepository(seed()), mode: "demo", publicOrigin,
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/session`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(expected);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});
