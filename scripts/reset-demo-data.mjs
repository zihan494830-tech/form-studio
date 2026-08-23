/**
 * 显式把已经受管的 desktop demo 恢复为 canonical mock catalog。
 * 未受 catalog 管理的数据库会 fail closed，避免误删 product 数据。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCanonicalMockCatalog } from "../src/infrastructure/canonical-mock-catalog.mjs";
import { synchronizeDemoDataset } from "../src/infrastructure/synchronize-demo-dataset.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = process.env.FORM_STUDIO_DB_PATH || join(ROOT, "data", "form-studio.sqlite");
const catalog = loadCanonicalMockCatalog();
const result = synchronizeDemoDataset({ databasePath, catalog, force: true });

process.stdout.write(`demo reset -> ${result.datasetRevision} (${result.datasetChecksum})\n`);
