import { problem } from "../problem.mjs";

export const CONTROLS = ["text", "textarea", "number", "select", "checkbox", "radio", "grid"];
export const GRID_COLUMN_CONTROLS = ["text", "textarea", "number", "select", "radio", "checkbox"];
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

function normalizeOptions(raw) {
  const options = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : String(raw || "").split(",").map((item) => item.trim()).filter(Boolean);
  return [...new Set(options)];
}

function normalizeDecimals(raw, errorCode, parameters) {
  if (raw === undefined || raw === null || raw === "") return { ok: true, decimals: null };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    return { ok: false, problem: problem(errorCode, 400, parameters) };
  }
  return { ok: true, decimals: value };
}

function normalizeGridColumn(raw, gridId, index) {
  const id = String(raw?.id || "").trim();
  const label = String(raw?.label || "").trim();
  const control = String(raw?.control || "text");
  if (!ID_PATTERN.test(id)) return problem("grid_column_id_invalid", 400, { grid: gridId, column: index });
  if (!label) return problem("grid_column_label_required", 400, { grid: gridId, column: index });
  if (!GRID_COLUMN_CONTROLS.includes(control)) {
    return problem("grid_column_control_invalid", 400, { grid: gridId, column: index, control });
  }
  const column = { id, label, control, required: Boolean(raw?.required) };
  if (control === "select" || control === "radio") {
    const options = normalizeOptions(raw?.options);
    if (!options.length) return problem("grid_column_options_required", 400, { grid: gridId, column: index });
    column.options = options;
  }
  if (control === "number") {
    const decimals = normalizeDecimals(raw?.decimals, "grid_column_decimals_invalid", { grid: gridId, column: index });
    if (!decimals.ok) return decimals.problem;
    if (decimals.decimals !== null) column.decimals = decimals.decimals;
  }
  return column;
}

function normalizeGrid(gridId, raw) {
  const rows = Array.isArray(raw?.rows) ? raw.rows : null;
  const columns = Array.isArray(raw?.columns) ? raw.columns : null;
  if (!rows || !rows.length) return problem("grid_rows_required", 400, { id: gridId });
  if (!columns || !columns.length) return problem("grid_columns_required", 400, { id: gridId });

  const normalizedRows = [];
  const seenRows = new Set();
  for (const [index, item] of rows.entries()) {
    const rowId = String(item?.id || "").trim();
    const rowLabel = String(item?.label || "").trim();
    if (!ID_PATTERN.test(rowId)) return problem("grid_row_id_invalid", 400, { grid: gridId, row: index });
    if (!rowLabel) return problem("grid_row_label_required", 400, { grid: gridId, row: index });
    if (seenRows.has(rowId)) return problem("grid_row_id_duplicate", 400, { grid: gridId, row: index });
    seenRows.add(rowId);
    normalizedRows.push({ id: rowId, label: rowLabel });
  }

  const normalizedColumns = [];
  const seenColumns = new Set();
  for (const [index, item] of columns.entries()) {
    const column = normalizeGridColumn(item, gridId, index);
    if (column.errorCode) return column;
    if (seenColumns.has(column.id)) return problem("grid_column_id_duplicate", 400, { grid: gridId, column: index });
    seenColumns.add(column.id);
    normalizedColumns.push(column);
  }
  return { rows: normalizedRows, columns: normalizedColumns };
}

export function normalizeFields(fields) {
  if (!Array.isArray(fields)) return problem("fields_not_array", 400);
  const seen = new Set();
  const normalized = [];
  for (const raw of fields) {
    const id = String(raw?.id || "").trim();
    const label = String(raw?.label || "").trim();
    const control = String(raw?.control || "text");
    if (!ID_PATTERN.test(id)) return problem("field_id_invalid", 400, { id });
    if (seen.has(id)) return problem("field_id_duplicate", 400, { id });
    if (!label) return problem("field_label_required", 400, { id });
    if (!CONTROLS.includes(control)) return problem("field_control_invalid", 400, { id, control });
    // A grid is a composite definition: requiredness belongs to each leaf column.
    const field = { id, label, control, required: control === "grid" ? false : Boolean(raw?.required) };
    if (control === "select" || control === "radio") {
      const options = normalizeOptions(raw?.options);
      if (!options.length) {
        return problem(control === "radio" ? "radio_options_required" : "select_options_required", 400, { id });
      }
      field.options = options;
    }
    if (control === "number") {
      const decimals = normalizeDecimals(raw?.decimals, "decimals_invalid", { id });
      if (!decimals.ok) return decimals.problem;
      if (decimals.decimals !== null) field.decimals = decimals.decimals;
    }
    if (control === "grid") {
      const grid = normalizeGrid(id, raw?.grid);
      if (grid.errorCode) return grid;
      field.grid = grid;
    }
    seen.add(id);
    normalized.push(field);
  }
  return { fields: normalized };
}
