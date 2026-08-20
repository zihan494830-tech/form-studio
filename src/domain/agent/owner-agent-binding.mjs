function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function denied(message) {
  return { error: message, status: 403 };
}

/**
 * 本地绑定默认拒绝。Poffices Official 永不进入绑定；非官方对象也必须先有作者权限确认。
 * 依据：https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
 */
export function bindingEligibility(agent) {
  if (!agent?.id) return denied("没有这个 agent");
  if (agent.origin === "born-form") return { allowed: true };
  if (agent.sourceSystem === "local-fixture") return { allowed: true };
  if (agent.sourceSystem !== "poffices") return denied("身份来源未授权绑定");
  if (agent.ownerIdentity?.official) return denied("Official agent 不允许本地改装");
  if (agent.authorization?.basis !== "author-confirmed") {
    return denied("尚未确认拥有或获授权管理该 agent");
  }
  return { allowed: true };
}

export function createOwnerAgentBinding(agent, publishedForm) {
  const eligibility = bindingEligibility(agent);
  if (!eligibility.allowed) return eligibility;
  if (!publishedForm?.fields?.length) return { error: "至少添加一个字段才能发布用户页面", status: 400 };
  const version = Number(publishedForm.formVersion || 0);
  if (!Number.isInteger(version) || version < 1) return { error: "发布版本非法", status: 400 };
  return {
    binding: {
      version: "owner-agent-binding/v1",
      ownerAgent: String(agent.id),
      sourceSystem: String(agent.sourceSystem || "form-studio"),
      formId: String(agent.id),
      publishedFormVersion: version,
      entryMode: "form-studio-sidecar",
      status: "published",
      authorization: clone(agent.authorization || { basis: "born-form", confirmedAt: null }),
    },
  };
}

export function activePublishedBinding(agent) {
  const binding = agent?.binding;
  const published = agent?.published;
  if (!binding || !published?.fields?.length) return null;
  if (binding.version !== "owner-agent-binding/v1" || binding.status !== "published") return null;
  if (binding.entryMode !== "form-studio-sidecar") return null;
  if (String(binding.ownerAgent) !== String(agent.id) || String(binding.formId) !== String(agent.id)) return null;
  if (binding.publishedFormVersion !== published.formVersion) return null;
  return clone(binding);
}
