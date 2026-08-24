/**
 * 只读连接正在运行的 desktop demo，生成带运行/数据/表单身份的视觉证据。
 * 测试与 demo 不共享数据；本命令拒绝在非 demo 模式截图。
 *
 * 依据：
 * - Playwright isolation: https://playwright.dev/docs/browser-contexts
 * - OpenTelemetry version attributes: https://opentelemetry.io/docs/specs/semconv/resource/
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = join(ROOT, ".learnings", "screens");
const baseURL = String(process.env.FORM_STUDIO_VISUAL_URL || "http://127.0.0.1:4190").replace(/\/$/, "");
const capturedAt = new Date().toISOString();
const stamp = capturedAt.replace(/[:.]/g, "-");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function relativePath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const api = await request.newContext({ baseURL });
const healthResponse = await api.get("/api/health");
if (!healthResponse.ok()) throw new Error(`Form Studio health 失败：${healthResponse.status()}`);
const health = await healthResponse.json();
if (health.application !== "form-studio" || health.mode !== "demo") {
  throw new Error(`visual:local 只接受 demo，当前是 ${health.application || "unknown"}/${health.mode || "unknown"}`);
}
if (!health.defaultScenario || !health.datasetRevision) {
  throw new Error("demo 未公开 canonical mock provenance");
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 900 } });
const screenshots = [];
let fieldContractCellIds = [];

async function capture(page, name, viewport, { fullPage = false } = {}) {
  await page.setViewportSize(viewport);
  const path = join(OUTPUT_DIR, `${stamp}-${name}.png`);
  await page.screenshot({ path, fullPage });
  screenshots.push({
    name,
    path: relativePath(path),
    sha256: sha256(path),
    viewport,
    fullPage,
    pageOverflowX: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  });
}

try {
  const workbench = await context.newPage();
  await workbench.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  const scenarioButton = workbench.locator(`#agent-list [data-id="${health.defaultScenario}"]`);
  await scenarioButton.waitFor({ state: "visible" });
  const canvas = workbench.frameLocator('iframe[name="face"]');
  await canvas.locator(".grid-table").waitFor({ state: "visible" });
  await capture(workbench, "workbench-top-actions", { width: 1600, height: 900 });
  await canvas.locator('[data-field-id="overall_rating"]').click();
  await capture(workbench, "workbench-field-selected", { width: 1920, height: 900 });
  await canvas.locator('[data-grid-column-id="revenue"]').click();
  await capture(workbench, "workbench-grid-column-selected", { width: 1920, height: 900 });
  await workbench.locator("#preview-zoom-out").click({ clickCount: 3 });
  await capture(workbench, "workbench-grid-column-selected-70", { width: 1920, height: 900 });
  await workbench.locator("#preview-zoom-reset").click();

  await workbench.setViewportSize({ width: 1600, height: 1400 });
  await workbench.locator('[data-inspector-action="open-contract"]').click();
  await workbench.locator("#field-contract-dialog").waitFor({ state: "visible" });
  fieldContractCellIds = await workbench.locator('[data-contract-action="copy-cell"]').evaluateAll((buttons) =>
    buttons.map((button) => button.dataset.cellId));
  await capture(workbench, "field-contract", { width: 1600, height: 1400 });
  await workbench.keyboard.press("Escape");

  await workbench.setViewportSize({ width: 1180, height: 800 });
  await canvas.locator('[data-grid-column-id="revenue"]').click();
  await workbench.locator("#property-inspector").waitFor({ state: "visible" });
  await workbench.waitForTimeout(180);
  await capture(workbench, "workbench-drawer", { width: 1180, height: 800 });

  await workbench.setViewportSize({ width: 390, height: 844 });
  await workbench.getByRole("button", { name: "← 返回畫布" }).click();
  await workbench.waitForTimeout(180);
  await capture(workbench, "workbench-mobile-canvas", { width: 390, height: 844 });
  await canvas.locator('[data-field-id="overall_rating"]').click();
  await workbench.waitForTimeout(180);
  await capture(workbench, "workbench-mobile-inspector", { width: 390, height: 844 });

  await workbench.setViewportSize({ width: 1600, height: 900 });
  await workbench.locator("#view-submissions").click();
  await workbench.locator("#submission-detail").waitFor({ state: "visible" });
  await capture(workbench, "submission-management", { width: 1600, height: 900 });
  await capture(workbench, "submission-single-column", { width: 920, height: 800 });

  const agent = await workbench.evaluate(async (ownerAgent) => {
    const response = await fetch(`/api/agents/${encodeURIComponent(ownerAgent)}`);
    if (!response.ok) throw new Error(`agent ${ownerAgent} 读取失败`);
    return response.json();
  }, health.defaultScenario);

  const face = await context.newPage();
  const faceURL = `${baseURL}/a/${encodeURIComponent(health.defaultScenario)}`;
  await face.goto(faceURL, { waitUntil: "networkidle" });
  await face.locator(".grid-table").waitFor({ state: "visible" });
  await capture(face, "user-face-wide", { width: 1440, height: 1000 });
  await capture(face, "user-face-narrow", { width: 390, height: 844 });

  const manifest = {
    evidenceKind: "local-demo-live-data",
    mutation: "none",
    storage: "sqlite-demo",
    application: health.application,
    mode: health.mode,
    productVersion: health.productVersion,
    schemaVersion: health.schemaVersion,
    runtimeRevision: health.runtimeRevision,
    datasetRevision: health.datasetRevision,
    datasetChecksum: health.datasetChecksum,
    ownerAgent: agent.id,
    formVersion: agent.published?.formVersion || agent.formVersion,
    releaseVersion: agent.releaseVersion || null,
    capturedAt,
    urls: { workbench: `${baseURL}/`, userFace: faceURL },
    observations: {
      fieldContractCellCount: fieldContractCellIds.length,
      fieldContractCellIds,
    },
    screenshots,
  };
  const manifestPath = join(OUTPUT_DIR, `${stamp}-manifest.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`VISUAL_EVIDENCE_MANIFEST=${manifestPath}\n`);
} finally {
  await context.close();
  await browser.close();
  await api.dispose();
}
