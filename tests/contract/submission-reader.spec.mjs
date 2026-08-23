import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createSubmissionReader } from "../../src/application/read-submissions.mjs";
import { SUBMISSION_READ } from "../../src/domain/access/capabilities.mjs";
import { authorizeCrmSubmissionRead } from "../support/crm-submission-read-authorizer.mjs";

function repository() {
  const agent = {
    id: "sales-intake",
    name: "Sales intake",
    binding: {
      version: "owner-agent-binding/v1",
      ownerAgent: "sales-intake",
      formId: "sales-intake",
      publishedFormVersion: 1,
      entryMode: "form-studio-sidecar",
      status: "published",
    },
    published: {
      formVersion: 1,
      fields: [{ id: "company", label: "Company", control: "text", required: true }],
    },
  };
  const records = [{
    id: "submission-1",
    ownerAgent: agent.id,
    receivedAt: "2026-08-21T00:00:00.000Z",
    actor: { id: "customer-1", displayName: "Customer" },
    scope: { tenantId: "tenant-1", accountId: "account-7" },
    envelope: { ownerAgent: agent.id, formVersion: 1, values: { company: "Acme" } },
  }, {
    id: "submission-2",
    ownerAgent: agent.id,
    receivedAt: "2026-08-21T00:01:00.000Z",
    actor: { id: "customer-2", displayName: "Other customer" },
    scope: { tenantId: "tenant-2", accountId: "account-8" },
    envelope: { ownerAgent: agent.id, formVersion: 1, values: { company: "Hidden" } },
  }];
  return {
    get: (id) => id === agent.id ? agent : null,
    list: () => [agent],
    listSubmissions: ({ ownerAgent, actorId } = {}) => records.filter((record) =>
      (!ownerAgent || record.ownerAgent === ownerAgent) && (!actorId || record.actor.id === actorId)),
    getSubmission: (id) => records.find((record) => record.id === id) || null,
    getDeliveryForSubmission: () => null,
  };
}

const principal = {
  id: "crm-reader",
  capabilities: [SUBMISSION_READ],
  allowedOwnerAgents: ["sales-intake"],
  resourceScope: { tenantId: "tenant-1", accountId: "account-7" },
};

test("通用读提交端口只依赖 principal、capability 和资源属性", () => {
  const reader = createSubmissionReader(repository(), { authorizeRead: authorizeCrmSubmissionRead });

  expect(reader.listSources(principal)).toMatchObject([{ ownerAgent: "sales-intake", submissionCount: 1 }]);
  expect(reader.list("sales-intake", principal).records).toMatchObject([
    { id: "submission-1", actorId: "customer-1", fieldCount: 1 },
  ]);
  expect(reader.get("submission-1", principal)).toMatchObject({
    status: 200,
    record: { fields: [{ id: "company", value: "Acme" }] },
  });
  expect(reader.get("submission-2", principal)).toMatchObject({ status: 403 });
});

test("缺少授权适配器或 capability 时默认拒绝", () => {
  expect(createSubmissionReader(repository()).listSources(principal)).toEqual([]);
  expect(createSubmissionReader(repository(), { authorizeRead: authorizeCrmSubmissionRead })
    .get("submission-1", { id: "anonymous" }))
    .toMatchObject({ status: 403 });
});

test("通用应用端口源码不包含参考课堂词汇", () => {
  const source = readFileSync(new URL("../../src/application/read-submissions.mjs", import.meta.url), "utf8");
  expect(source).not.toMatch(/teacher|student|classroom|classId|\bteach\b/i);
});

test("历史提交按自身 formVersion 还原 grid 标签与分组，不读取当前草稿或当前发布版", () => {
  const repo = repository();
  const agent = repo.get("sales-intake");
  const grid = {
    id: "history", label: "历史收入", control: "grid", required: false,
    grid: {
      rows: [{ id: "fy2022", label: "FY2022" }],
      columns: [{ id: "revenue", label: "收入", control: "number", required: true, decimals: 2 }],
    },
  };
  agent.publishedDefinitions = [{ formVersion: 1, fields: [grid], submit: { label: "提交", to: "agent-input" } }];
  agent.published = { formVersion: 2, fields: [{ id: "company", label: "当前公司", control: "text", required: true }] };
  agent.binding.publishedFormVersion = 2;
  const old = repo.getSubmission("submission-1");
  old.envelope.values = { history_fy2022_revenue: "12.34" };

  const record = createSubmissionReader(repo, { authorizeRead: authorizeCrmSubmissionRead }).get("submission-1", principal).record;
  expect(record.formDefinitionAvailable).toBe(true);
  expect(record.fields).toEqual([{
    id: "history_fy2022_revenue", label: "FY2022 · 收入", control: "number", value: "12.34",
    grid: {
      fieldId: "history", fieldLabel: "历史收入", rowId: "fy2022", rowLabel: "FY2022", rowIndex: 0,
      columnId: "revenue", columnLabel: "收入", columnIndex: 0,
    },
  }]);
});

test("历史 definition 已缺失时显式降级为原始 ID，不拿当前版本猜标签", () => {
  const repo = repository();
  const agent = repo.get("sales-intake");
  agent.published = { formVersion: 2, fields: [{ id: "company", label: "错误的新标签", control: "text", required: true }] };
  agent.binding.publishedFormVersion = 2;
  const record = createSubmissionReader(repo, { authorizeRead: authorizeCrmSubmissionRead }).get("submission-1", principal).record;
  expect(record.formDefinitionAvailable).toBe(false);
  expect(record.fields).toEqual([{ id: "company", label: "company", control: null, value: "Acme" }]);
});
