import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { migrateSqliteSchema } from "../src/infrastructure/migrate-sqlite-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = process.env.FORM_STUDIO_DB_PATH || join(ROOT, "data", "form-studio.sqlite");
const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const database = new DatabaseSync(databasePath, { readOnly: true });
const sourceVersion = Number(database.prepare("PRAGMA user_version").get().user_version);
database.close();
const backupPath = join(ROOT, "data", "backups", `form-studio-schema-v${sourceVersion}-${stamp}.sqlite`);
const result = migrateSqliteSchema({ databasePath, backupPath, requireManaged: true });

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
