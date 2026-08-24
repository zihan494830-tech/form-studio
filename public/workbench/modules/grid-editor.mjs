/** Grid defaults and pure structural update rules; the property inspector owns all editing UI. */
import { t } from "/presentation/messages/zh-HK.mjs";

export function defaultGrid() {
  return {
    rows: [
      { id: "r1", label: t("ui.workbench.grid_default_row", { index: 1 }) },
      { id: "r2", label: t("ui.workbench.grid_default_row", { index: 2 }) },
    ],
    columns: [
      { id: "c1", label: t("ui.workbench.grid_default_col", { index: 1 }), control: "text", required: false },
      { id: "c2", label: t("ui.workbench.grid_default_col", { index: 2 }), control: "text", required: false },
    ],
  };
}

function nextItemId(items, prefix) {
  let n = 1;
  const used = new Set(items.map((item) => item.id));
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function applyGridEdit(fields, index, action, itemIndex) {
  const field = fields?.[index];
  if (!field || field.control !== "grid") return null;
  const grid = JSON.parse(JSON.stringify(field.grid || { rows: [], columns: [] }));
  if (action === "add-row") {
    grid.rows.push({ id: nextItemId(grid.rows, "r"), label: t("ui.workbench.grid_default_row", { index: grid.rows.length + 1 }) });
  } else if (action === "add-col") {
    grid.columns.push({ id: nextItemId(grid.columns, "c"), label: t("ui.workbench.grid_default_col", { index: grid.columns.length + 1 }), control: "text", required: false });
  } else if (action === "del-row") {
    if (grid.rows.length <= 1) return null;
    grid.rows.splice(itemIndex, 1);
  } else if (action === "del-col") {
    if (grid.columns.length <= 1) return null;
    grid.columns.splice(itemIndex, 1);
  } else {
    return null;
  }
  return fields.map((item, fieldIndex) => (fieldIndex === index ? { ...item, grid } : item));
}

export function moveItem(items, index, offset) {
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}
