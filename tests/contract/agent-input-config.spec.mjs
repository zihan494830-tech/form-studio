import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { attachAgentInputConfig, deliveryForEnvelope } from "../../src/domain/agent/agent-input-config.mjs";
import { makeOutboxEvent } from "../../src/domain/submission/outbox-event.mjs";
import { ROOT } from "../support/project-fixture.mjs";

const config = JSON.parse(readFileSync(join(ROOT, "data", "local-agent-inputs.json"), "utf8"))[0];
const fields = [
  { id: "company_name", control: "text" }, { id: "analysis_goal", control: "textarea" },
  { id: "target_market", control: "select" }, { id: "budget_wan", control: "number" },
  { id: "include_competitors", control: "checkbox" },
];
const agent = { id: "exercise-1", fields, published: { formVersion: 1, fields } };

test("3B-A profile 与 mapping 显式把 values[id] 映射为结构化输入", () => {
  const configured = attachAgentInputConfig(agent, config);
  const delivery = deliveryForEnvelope(configured, {
    ownerAgent: "exercise-1", formVersion: 1,
    values: {
      company_name: "星海科技", analysis_goal: "进入东南亚", target_market: "东南亚",
      budget_wan: "12", include_competitors: "true",
    },
  });
  expect(delivery).toMatchObject({
    target: { kind: "local-recording", target: "market-analysis-local" },
    payload: {
      companyName: "星海科技", analysisGoal: "进入东南亚", targetMarket: "东南亚",
      budgetWan: 12, includeCompetitors: true,
    },
  });
});

test("mapping 遇到未知字段、错版本或错控件类型时 fail closed", () => {
  expect(() => attachAgentInputConfig(agent, {
    ...config, mapping: { ...config.mapping, formVersion: 2 },
  })).toThrow("当前已发布版本");
  expect(() => attachAgentInputConfig(agent, {
    ...config, mapping: { ...config.mapping, fields: [{ fieldId: "missing", targetKey: "answer", transform: "string", required: true }] },
  })).toThrow("未知字段");
  expect(() => attachAgentInputConfig(agent, {
    ...config, mapping: { ...config.mapping, fields: [{ fieldId: "company_name", targetKey: "answer", transform: "number", required: true }] },
  })).toThrow("number 只能映射数字栏");
});

test("outbox event 保存 submission、mapping 与幂等键", () => {
  expect(makeOutboxEvent({
    id: "outbox-1", submissionId: "submission-1", ownerAgent: "exercise-1",
    createdAt: "2026-08-20T10:00:00.000Z", idempotencyKey: "agent-input:submission-1:p1",
    target: config.profile.transport, profile: config.profile, mapping: config.mapping, payload: { companyName: "星海科技" },
  })).toMatchObject({ status: "pending", attempts: 0, receipt: null });
});
