import { expect, test } from "@playwright/test";
import { readOwnerIdentity } from "../../src/application/read-owner-identity.mjs";
import { createPofficesAgentDirectory } from "../../src/infrastructure/poffices-agent-directory.mjs";

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test.describe("2A 真实身份合同", () => {
  test("把真实 Poffices id 映射成稳定 ownerAgent，不带绑定能力", async () => {
    const calls = [];
    const directory = createPofficesAgentDirectory({
      baseUrl: "https://poffices.example/",
      now: () => "2026-08-20T08:00:00.000Z",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return response(200, {
          id: 18,
          name: "Market Analysis",
          agent_type: "app",
          is_official: true,
          updated_at: "2026-08-18T07:40:08.000Z",
          prompts: { ignored: true },
        });
      },
    });

    const result = await readOwnerIdentity(directory, "18");
    expect(result.status).toBe(200);
    expect(result.identity).toEqual({
      version: "owner-agent-identity/v1",
      ownerAgent: "18",
      name: "Market Analysis",
      origin: "retrofit",
      sourceSystem: "poffices",
      externalId: "18",
      agentType: "app",
      official: true,
      updatedAt: "2026-08-18T07:40:08.000Z",
      observedAt: "2026-08-20T08:00:00.000Z",
      readOnly: true,
    });
    expect(result.identity).not.toHaveProperty("prompts");
    expect(result.identity).not.toHaveProperty("fields");
    expect(result.identity).not.toHaveProperty("inputBag");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://poffices.example/wp-json/sen-bot-master/v1/agents/store/18");
    expect(calls[0].init).toMatchObject({ method: "GET", headers: { Accept: "application/json" } });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  for (const [upstream, status, code] of [
    [401, 401, "unauthorized"],
    [403, 403, "forbidden"],
    [404, 404, "not_found"],
    [500, 502, "upstream_error"],
  ]) {
    test(`外部 ${upstream} 明确映射为 ${code}`, async () => {
      const directory = createPofficesAgentDirectory({ fetchImpl: async () => response(upstream, {}) });
      expect(await readOwnerIdentity(directory, "18")).toMatchObject({ status, errorCode: code });
    });
  }

  test("拒绝非法 id，不向外部发请求", async () => {
    let called = false;
    const directory = createPofficesAgentDirectory({ fetchImpl: async () => { called = true; } });
    expect(await readOwnerIdentity(directory, "../agents")).toMatchObject({ status: 400, errorCode: "invalid_id" });
    expect(called).toBe(false);
  });

  test("网络失败与坏响应分别 fail closed", async () => {
    const unavailable = createPofficesAgentDirectory({ fetchImpl: async () => { throw new Error("offline"); } });
    const malformed = createPofficesAgentDirectory({ fetchImpl: async () => response(200, { id: 99 }) });
    expect(await readOwnerIdentity(unavailable, "18")).toMatchObject({ status: 503, errorCode: "unavailable" });
    expect(await readOwnerIdentity(malformed, "18")).toMatchObject({ status: 502, errorCode: "contract_invalid" });
  });

  test("外部读取超时后明确失败", async () => {
    const directory = createPofficesAgentDirectory({
      timeoutMs: 1,
      fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    });
    expect(await readOwnerIdentity(directory, "18")).toMatchObject({ status: 503, errorCode: "unavailable" });
  });
});
