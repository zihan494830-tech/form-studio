/**
 * grid 的唯一展开函数：把 grid 字段展开为扁平格子字段。
 * 渲染、抽取、提交校验、agent input 映射与收件箱投影共用本函数，
 * 任何一层不得另写行列规则（docs/architecture.md 已冻结）。
 *
 * 格子 id   = `${gridId}_${rowId}_${colId}`（三段各自匹配字段 id 规则）
 * 格 label  = `${rowLabel} · ${colLabel}`（收件箱平铺展示用）
 * 格子携带 `grid` 元数据 { fieldId, rowId, columnId }，供收件箱分组投影；信封不携带。
 */
import { problem } from "../problem.mjs";

export function expandFields(fields) {
  if (!Array.isArray(fields)) return problem("fields_not_array", 400);
  const expanded = [];
  const seen = new Set();
  for (const field of fields) {
    if (field.control !== "grid") {
      if (seen.has(field.id)) return problem("field_id_duplicate", 400, { id: field.id });
      seen.add(field.id);
      expanded.push(field);
      continue;
    }
    for (const row of field.grid?.rows || []) {
      for (const column of field.grid?.columns || []) {
        const cell = {
          id: `${field.id}_${row.id}_${column.id}`,
          label: `${row.label} · ${column.label}`,
          control: column.control,
          required: Boolean(column.required),
          grid: {
            fieldId: field.id,
            fieldLabel: field.label,
            rowId: row.id,
            rowLabel: row.label,
            rowIndex: field.grid.rows.indexOf(row),
            columnId: column.id,
            columnLabel: column.label,
            columnIndex: field.grid.columns.indexOf(column),
          },
        };
        if (column.control === "select" || column.control === "radio") {
          cell.options = [...(column.options || [])];
        }
        if (column.control === "number" && Number.isInteger(column.decimals)) {
          cell.decimals = column.decimals;
        }
        if (seen.has(cell.id)) {
          return problem("grid_cell_id_conflict", 400, { id: cell.id, grid: field.id });
        }
        seen.add(cell.id);
        expanded.push(cell);
      }
    }
  }
  return { fields: expanded };
}
