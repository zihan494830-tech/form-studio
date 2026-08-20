import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createAgentInputRelay } from "../../src/application/relay-agent-input.mjs";
import { createInMemoryAgentInputPort, createSqliteLocalAgentInputPort } from "../../src/infrastructure/local-agent-input-port.mjs";
import { createInMemorySubmissionRepository } from "../../src/infrastructure/in-memory-submission-repository.mjs";
import { createSqliteSubmissionRepository } from "../../src/infrastructure/sqlite-submission-repository.mjs";

const envelope = {
  ownerAgent: "exercise-1", formVersion: 1, submittedAt: "2026-08-20T10:00:00.000Z",
  submitterId: "student-1", values: { company_name: "星海科技" },
};
const delivery = {
  target: { kind: "local-recording", target: "market-analysis-local" },
  profile: { version: "agent-input-profile/v1", profileVersion: 1, skillId: "market-analysis" },
  mapping: { version: "agent-input-mapping/v1", formVersion: 1, profileVersion: 1 },
  payload: { companyName: "星海科技" },
};

test("3B-B relay 失败可重试，目标按幂等键只消费一次", async () => {
  const repository = createInMemorySubmissionRepository();
  repository.append({ ownerAgent: "exercise-1", receivedAt: envelope.submittedAt, envelope, delivery });
  const realPort = createInMemoryAgentInputPort({ now: () => "2026-08-20T10:00:02.000Z" });
  let first = true;
  const uncertainPort = {
    async deliver(event) {
      const receipt = await realPort.deliver(event);
      if (first) { first = false; throw new Error("目标已收，但回执丢失"); }
      return receipt;
    },
  };
  const times = ["2026-08-20T10:00:01.000Z", "2026-08-20T10:00:03.000Z", "2026-08-20T10:00:04.000Z", "2026-08-20T10:00:05.000Z"];
  const relay = createAgentInputRelay({ repository, port: uncertainPort, now: () => times.shift() });

  expect((await relay.runOnce())[0]).toMatchObject({ status: "failed", attempts: 1 });
  expect((await relay.runOnce())[0]).toMatchObject({ status: "delivered", attempts: 2, receipt: { duplicate: true } });
  expect(realPort.list()).toHaveLength(1);
});

test("3B-B SQLite 中 payload 无法序列化时 submission 与 outbox 一起回滚", () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-outbox-"));
  const repository = createSqliteSubmissionRepository({ databasePath: join(directory, "test.sqlite") });
  try {
    const circular = {}; circular.self = circular;
    expect(() => repository.append({
      ownerAgent: "exercise-1", receivedAt: envelope.submittedAt, envelope,
      delivery: { ...delivery, payload: circular },
    })).toThrow();
    expect(repository.list()).toEqual([]);
    expect(repository.listDeliveries()).toEqual([]);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("3B-C 本地 AgentInputPort 跨重启按幂等键只保留一份输入", async () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-local-port-"));
  const path = join(directory, "test.sqlite");
  const repository = createInMemorySubmissionRepository();
  repository.append({ ownerAgent: "exercise-1", receivedAt: envelope.submittedAt, envelope, delivery });
  const event = repository.listDeliveries()[0];
  let port = createSqliteLocalAgentInputPort({ databasePath: path, now: () => "2026-08-20T10:00:02.000Z" });
  try {
    expect(await port.deliver(event)).toMatchObject({ duplicate: false, submissionId: "submission-1" });
    expect(await port.deliver(event)).toMatchObject({ duplicate: true, submissionId: "submission-1" });
    port.close();
    port = createSqliteLocalAgentInputPort({ databasePath: path });
    expect(port.list()).toHaveLength(1);
    expect(port.list()[0].event.payload).toEqual({ companyName: "星海科技" });
  } finally {
    port.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
