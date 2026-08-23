function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function denied(errorCode) {
  return problem(errorCode, 403);
}

/**
 * 这里只授权 Form Studio 自己的数据域：字段、发布版本、旁路入口与 inputBag。
 * Poffices 身份始终只读；Official 也可建立隔离本地副本，但绝不因此获得平台写权。
 * 依据：https://learn.microsoft.com/azure/architecture/patterns/anti-corruption-layer
 */
export function bindingEligibility(agent) {
  if (!agent?.id) return denied("agent_not_found");
  if (agent.origin === "born-form") return { allowed: true };
  if (agent.sourceSystem === "local-fixture") return { allowed: true };
  if (agent.sourceSystem !== "poffices") return denied("binding_source_forbidden");
  if (!agent.ownerIdentity?.ownerAgent || agent.ownerIdentity.readOnly !== true) {
    return denied("binding_identity_invalid");
  }
  if (agent.authorization?.basis !== "local-shadow-only") {
    return denied("binding_scope_missing");
  }
  return { allowed: true };
}

export function createOwnerAgentBinding(agent, publishedForm) {
  const eligibility = bindingEligibility(agent);
  if (!eligibility.allowed) return eligibility;
  if (!publishedForm?.fields?.length) return problem("fields_required_for_publish", 400);
  const version = Number(publishedForm.formVersion || 0);
  if (!Number.isInteger(version) || version < 1) return problem("publish_version_invalid", 400);
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
import { problem } from "../problem.mjs";
