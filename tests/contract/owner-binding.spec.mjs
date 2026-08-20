import { expect, test } from "@playwright/test";
import { newRetrofitFormAgent, publishForm, unpublishForm } from "../../src/domain/agent/form-agent.mjs";
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
  test("Official 和未确认权限对象默认拒绝", () => {
    expect(newRetrofitFormAgent({ identity: identity({ official: true }), authorizationConfirmed: true }))
      .toMatchObject({ status: 403 });
    expect(newRetrofitFormAgent({ identity: identity(), authorizationConfirmed: false }))
      .toMatchObject({ status: 403 });
  });

  test("获授权主人发布后形成一表一 agent 的本地绑定", () => {
    const created = newRetrofitFormAgent({
      identity: identity(), authorizationConfirmed: true, confirmedAt: "2026-08-20T09:00:00.000Z",
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
      authorization: { basis: "author-confirmed", confirmedAt: "2026-08-20T09:00:00.000Z" },
    });
    expect(activePublishedBinding(result.agent)).toEqual(result.agent.binding);
  });

  test("伪造主人或版本的绑定不能打开使用面", () => {
    const agent = {
      id: "42", sourceSystem: "poffices", origin: "retrofit", ownerIdentity: identity(),
      authorization: { basis: "author-confirmed", confirmedAt: null },
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
});
