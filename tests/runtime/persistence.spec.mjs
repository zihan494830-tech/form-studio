import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFormStudioServer } from "../../src/server/create-server.mjs";
import { migrateAgentAccess } from "../../src/application/migrate-agent-access.mjs";
import { createSqliteAgentRepository } from "../../src/infrastructure/sqlite-agent-repository.mjs";
import { createSqliteSubmissionRepository } from "../../src/infrastructure/sqlite-submission-repository.mjs";
import { createSubmissionAwareAgentRepository } from "../../src/infrastructure/submission-aware-agent-repository.mjs";
import { ROOT } from "../support/project-fixture.mjs";
import { createTestActorResolver } from "../support/test-actor-resolver.mjs";

function persistentRepository(databasePath) {
  return createSubmissionAwareAgentRepository({
    agents: createSqliteAgentRepository({ databasePath, seed: [] }),
    submissions: createSqliteSubmissionRepository({ databasePath }),
  });
}

async function listen(repository, port = 0) {
  const actorResolver = createTestActorResolver();
  migrateAgentAccess(repository, actorResolver.defaultAgentAccess());
  const server = createFormStudioServer({ root: ROOT, port, repository, actorResolver });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const actualPort = server.address().port;
  return { server, port: actualPort, base: `http://127.0.0.1:${actualPort}` };
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function json(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  return { response, body: await response.json() };
}

test("2C 新生身份、发布版本和提交跨服务重启保持", async () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-2c-"));
  const databasePath = join(directory, "studio.sqlite");
  let repository = persistentRepository(databasePath);
  let running = await listen(repository);

  try {
    const created = await json(running.base, "/api/agents", {
      method: "POST", body: JSON.stringify({ name: "持久练习" }),
    });
    expect(created.response.status).toBe(201);
    expect(created.body.id).toBe("form-1");

    await json(running.base, "/api/agents/form-1/fields", {
      method: "PUT",
      body: JSON.stringify({ fields: [{ id: "answer", label: "答案", control: "textarea", required: true }] }),
    });
    const published = await json(running.base, "/api/agents/form-1/publish", { method: "POST" });
    expect(published.body).toMatchObject({
      id: "form-1",
      formVersion: 2,
      binding: { ownerAgent: "form-1", formId: "form-1", publishedFormVersion: 2 },
    });
    await json(running.base, "/api/agents/form-1/fields", {
      method: "PUT",
      body: JSON.stringify({ fields: [
        { id: "answer", label: "答案", control: "textarea", required: true },
        { id: "teacher_note", label: "作者草稿备注", control: "text", required: false },
      ] }),
    });
    const submitted = await json(running.base, "/submit/form-1", {
      method: "POST",
      body: JSON.stringify({ submitterId: "student-1", values: { answer: "保留下来" } }),
    });
    expect(submitted.response.status).toBe(200);

    await close(running.server);
    repository.close();
    repository = persistentRepository(databasePath);
    running = await listen(repository);

    const restored = await json(running.base, "/api/agents/form-1");
    expect(restored.body).toMatchObject({
      id: "form-1",
      name: "持久练习",
      formVersion: 3,
      fields: [
        { id: "answer", label: "答案", control: "textarea", required: true },
        { id: "teacher_note", label: "作者草稿备注", control: "text", required: false },
      ],
      published: {
        formVersion: 2,
        fields: [{ id: "answer", label: "答案", control: "textarea", required: true }],
      },
      publishedDefinitions: [{
        formVersion: 2,
        fields: [{ id: "answer", label: "答案", control: "textarea", required: true }],
      }],
      binding: { ownerAgent: "form-1", publishedFormVersion: 2 },
      inputBag: [{ ownerAgent: "form-1", formVersion: 2, values: { answer: "保留下来" } }],
    });
    const face = await fetch(`${running.base}/a/form-1`);
    expect(face.status).toBe(200);
    const faceHtml = await face.text();
    expect(faceHtml).toContain('id="answer"');
    expect(faceHtml).not.toContain('id="teacher_note"');
    const secondBorn = await json(running.base, "/api/agents", {
      method: "POST", body: JSON.stringify({ name: "第二张持久表" }),
    });
    expect(secondBorn.body.id).toBe("form-2");

    await json(running.base, "/api/agents/form-1/unpublish", { method: "POST" });
    await close(running.server);
    repository.close();
    repository = persistentRepository(databasePath);
    running = await listen(repository);

    expect((await fetch(`${running.base}/a/form-1`)).status).toBe(404);
    const afterUnpublish = await json(running.base, "/api/agents/form-1");
    expect(afterUnpublish.body.binding).toBeNull();
    expect(afterUnpublish.body.publishedDefinitions).toHaveLength(1);
    expect(afterUnpublish.body.inputBag[0].values).toEqual({ answer: "保留下来" });
    const history = await json(running.base, "/api/agents/form-1/submissions");
    expect(history.body.records[0]).toMatchObject({
      formVersion: 2,
      formDefinitionAvailable: true,
      fields: [{ id: "answer", label: "答案", value: "保留下来" }],
    });
  } finally {
    if (running.server.listening) await close(running.server);
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
