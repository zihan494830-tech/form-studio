import { expect, test } from "@playwright/test";
import { changeFields, newRetrofitFormAgent, publishForm, unpublishForm } from "../../src/domain/agent/form-agent.mjs";
import { activePublishedBinding, createOwnerAgentBinding } from "../../src/domain/agent/owner-agent-binding.mjs";

function identity(overrides = {}) {
  return {
    version: "owner-agent-identity/v1",
    ownerAgent: "42",
    name: "Research Sandbox",
    origin: "retrofit",
    sourceSystem: "poffices",
    externalId: "42",
    agentType: "agent",
    official: false,
    updatedAt: null,
    observedAt: "2026-08-20T08:00:00.000Z",
    readOnly: true,
    ...overrides,
  };
}

test.describe("2B owner-agent-binding/v1 合同", () => {
  test("Official 只读身份可以创建隔离的本地副本", () => {
    const created = newRetrofitFormAgent({
      identity: identity({ ownerAgent: "18", externalId: "18", name: "Market Analysis", official: true }),
      linkedAt: "2026-08-20T09:00:00.000Z",
    });
    expect(created.agent).toMatchObject({
      id: "18",
      name: "Market Analysis",
      ownerIdentity: { ownerAgent: "18", official: true, readOnly: true },
      authorization: { basis: "local-shadow-only", confirmedAt: "2026-08-20T09:00:00.000Z" },
      fields: [],
      published: null,
      binding: null,
    });
  });

  test("无效或未知身份来源仍然拒绝创建本地副本", () => {
    expect(newRetrofitFormAgent({ identity: identity({ readOnly: false }) })).toMatchObject({ status: 400 });
    expect(newRetrofitFormAgent({ identity: identity({ sourceSystem: "unknown" }) })).toMatchObject({ status: 400 });
  });

  test("只读主人发布后形成一表一 agent 的本地绑定", () => {
    const created = newRetrofitFormAgent({
      identity: identity(), linkedAt: "2026-08-20T09:00:00.000Z",
    });
    const agent = {
      ...created.agent,
      fields: [{ id: "question", label: "问题", control: "text", required: true }],
    };
    const result = publishForm(agent);
    expect(result.agent.binding).toEqual({
      version: "owner-agent-binding/v1",
      ownerAgent: "42",
      sourceSystem: "poffices",
      formId: "42",
      publishedFormVersion: 1,
      entryMode: "form-studio-sidecar",
      status: "published",
      authorization: { basis: "local-shadow-only", confirmedAt: "2026-08-20T09:00:00.000Z" },
    });
    expect(activePublishedBinding(result.agent)).toEqual(result.agent.binding);
  });

  test("伪造主人或版本的绑定不能打开使用面", () => {
    const agent = {
      id: "42", sourceSystem: "poffices", origin: "retrofit", ownerIdentity: identity(),
      authorization: { basis: "local-shadow-only", confirmedAt: null },
    };
    const binding = createOwnerAgentBinding(agent, {
      formVersion: 2, fields: [{ id: "q", label: "Q", control: "text", required: true }],
    }).binding;
    const published = { formVersion: 2, fields: [{ id: "q", label: "Q", control: "text", required: true }] };
    expect(activePublishedBinding({ ...agent, published, binding: { ...binding, ownerAgent: "99" } })).toBeNull();
    expect(activePublishedBinding({ ...agent, published, binding: { ...binding, publishedFormVersion: 1 } })).toBeNull();
  });

  test("解除绑定保留 inputBag", () => {
    const result = unpublishForm({ id: "42", published: {}, binding: {}, inputBag: [{ values: { q: "keep" } }] });
    expect(result.agent).toMatchObject({ published: null, binding: null, inputBag: [{ values: { q: "keep" } }] });
  });

  test("每次发布追加不可变版本定义，下架不会删除历史真相", () => {
    const base = {
      ...newRetrofitFormAgent({ identity: identity() }).agent,
      fields: [{ id: "question", label: "问题 v1", control: "text", required: true }],
    };
    const first = publishForm(base).agent;
    const edited = changeFields(first, [{ id: "question", label: "问题 v2", control: "text", required: true }]).agent;
    const second = publishForm(edited).agent;
    expect(second.publishedDefinitions).toEqual([
      { formVersion: 1, fields: base.fields, submit: { label: "提交", to: "agent-input" } },
      { formVersion: 2, fields: edited.fields, submit: { label: "提交", to: "agent-input" } },
    ]);
    expect(unpublishForm(second).agent.publishedDefinitions).toEqual(second.publishedDefinitions);
  });
});
