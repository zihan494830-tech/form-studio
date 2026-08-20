import { ownerIdentity } from "../domain/agent/owner-identity.mjs";
import { AgentDirectoryError } from "../domain/agent/agent-directory-error.mjs";

const DEFAULT_BASE_URL = "https://poffices.ai";

function endpointFor(baseUrl, id) {
  return `${baseUrl.replace(/\/+$/, "")}/wp-json/sen-bot-master/v1/agents/store/${encodeURIComponent(id)}`;
}

function validateId(value) {
  const id = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(id)) {
    throw new AgentDirectoryError("invalid_id", "Poffices agent id 必须是正整数", 400);
  }
  return id;
}

function responseError(status) {
  if (status === 401) return new AgentDirectoryError("unauthorized", "读取真实 agent 身份需要认证", 401);
  if (status === 403) return new AgentDirectoryError("forbidden", "当前身份无权读取这个 agent", 403);
  if (status === 404) return new AgentDirectoryError("not_found", "Poffices 中没有这个 agent", 404);
  return new AgentDirectoryError("upstream_error", `Poffices 身份接口返回 ${status}`, 502);
}

/**
 * Poffices 只读身份适配器。只读取公开 Store detail，不列举全库、不写回。
 * 端点依据（2026-08-20 实测）：
 * https://poffices.ai/wp-json/sen-bot-master/v1/agents/store/18
 */
export function createPofficesAgentDirectory({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  timeoutMs = 8000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Poffices adapter 缺 fetch 实现");

  return {
    async getById(value) {
      const id = validateId(value);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(endpointFor(baseUrl, id), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
      } catch {
        throw new AgentDirectoryError("unavailable", "暂时无法连接 Poffices 身份接口", 503);
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) throw responseError(response.status);

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new AgentDirectoryError("contract_invalid", "Poffices 身份响应不是合法 JSON", 502);
      }

      if (String(payload?.id ?? "") !== id || !String(payload?.name || "").trim()) {
        throw new AgentDirectoryError("contract_invalid", "Poffices 身份响应缺少匹配的 id 或 name", 502);
      }

      try {
        return ownerIdentity({
          sourceSystem: "poffices",
          externalId: payload.id,
          name: payload.name,
          agentType: payload.agent_type,
          official: payload.is_official,
          updatedAt: payload.updated_at,
          observedAt: now(),
        });
      } catch {
        throw new AgentDirectoryError("contract_invalid", "Poffices 身份无法映射为 ownerAgent", 502);
      }
    },
  };
}
