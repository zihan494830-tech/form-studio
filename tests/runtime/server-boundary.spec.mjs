import { expect, test } from "@playwright/test";
import { request as httpRequest } from "node:http";
import { createInMemoryAgentRepository } from "../../src/infrastructure/in-memory-agent-repository.mjs";
import { submitToAgent } from "../../src/application/submit-to-agent.mjs";
import { createFormStudioServer } from "../../src/server/create-server.mjs";
import { ROOT } from "../support/project-fixture.mjs";

function seed() {
  return [{
    id: "exercise-1",
    name: "练习一",
    origin: "retrofit",
    sourceSystem: "local-fixture",
    authorization: { basis: "local-fixture", confirmedAt: null },
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
    id: "exercise-2", name: "练习二", origin: "retrofit", sourceSystem: "local-fixture",
    authorization: { basis: "local-fixture", confirmedAt: null }, formVersion: 1,
    fields: [], published: null, binding: null, inputBag: [],
  }];
}

function rawPost(path, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: 4190, path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("绕过浏览器时，404/409/缺必填 400 仍由服务端守住", () => {
  const repository = createInMemoryAgentRepository(seed());
  expect(submitToAgent(repository, "missing", { values: {} }).status).toBe(404);
  expect(submitToAgent(repository, "exercise-2", { values: {} }).status).toBe(409);
  const missing = submitToAgent(repository, "exercise-1", { values: {} });
  expect(missing).toMatchObject({ status: 400, missing: ["q1"] });
  expect(repository.get("exercise-1").inputBag).toHaveLength(0);
});

test("坏 JSON 返回 400，不冒充服务端 500", async () => {
  const response = await rawPost("/submit/exercise-1", "{bad-json");
  expect(response.status).toBe(400);
  expect(JSON.parse(response.body).error).toContain("JSON 格式错误");
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
