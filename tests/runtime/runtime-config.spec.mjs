import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFormStudioServer } from "../../src/server/create-server.mjs";
import { readRuntimeConfig, requestUsesSecureTransport } from "../../src/server/runtime-config.mjs";
import { ROOT } from "../support/project-fixture.mjs";

test("运行时配置默认保持本地 product 与 127.0.0.1", () => {
  expect(readRuntimeConfig({ env: {}, root: ROOT, argv: [] })).toEqual({
    host: "127.0.0.1",
    port: 4190,
    databasePath: join(ROOT, "data", "form-studio.sqlite"),
    mode: "product",
    trustProxy: false,
    publicOrigin: null,
    runtimeRevision: "development",
  });
});

test("显式 0.0.0.0 可作为监听地址而不改变默认值", async () => {
  const runtime = readRuntimeConfig({ env: { FORM_STUDIO_HOST: "0.0.0.0" }, root: ROOT, argv: [] });
  const server = createFormStudioServer({ root: ROOT });
  await new Promise((resolve) => server.listen(0, runtime.host, resolve));
  try {
    expect(server.address()).toMatchObject({ address: "0.0.0.0" });
    expect((await fetch(`http://127.0.0.1:${server.address().port}/api/health`)).status).toBe(200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

for (const [name, env] of [
  ["host", { FORM_STUDIO_HOST: "localhost" }],
  ["trust proxy", { FORM_STUDIO_TRUST_PROXY: "1" }],
  ["port", { FORM_STUDIO_PORT: "0" }],
  ["mode", { FORM_STUDIO_MODE: "preview" }],
  ["public origin protocol", { FORM_STUDIO_PUBLIC_ORIGIN: "ftp://form-studio.example" }],
  ["public origin path", { FORM_STUDIO_PUBLIC_ORIGIN: "https://form-studio.example/prefix" }],
]) {
  test(`非法 ${name} 直接拒绝启动配置`, () => {
    expect(() => readRuntimeConfig({ env, root: ROOT, argv: [] })).toThrow(/非法/);
  });
}

test("PUBLIC_ORIGIN 只接受并规范化 http(s) origin", () => {
  const runtime = readRuntimeConfig({
    env: { FORM_STUDIO_PUBLIC_ORIGIN: "https://form-studio.example:8443/" }, root: ROOT, argv: [],
  });
  expect(runtime.publicOrigin).toBe("https://form-studio.example:8443");
  expect(requestUsesSecureTransport({ headers: {} }, runtime)).toBe(true);
});

test("只有显式信任代理后才采用 X-Forwarded-Proto", () => {
  const forged = { headers: { "x-forwarded-proto": "https" } };
  expect(requestUsesSecureTransport(forged, { trustProxy: false })).toBe(false);
  expect(requestUsesSecureTransport(forged, { trustProxy: true })).toBe(true);
  expect(requestUsesSecureTransport(
    { headers: { "x-forwarded-proto": "https, http" } }, { trustProxy: true },
  )).toBe(false);
});
