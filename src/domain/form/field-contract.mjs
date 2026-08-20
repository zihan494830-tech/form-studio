export const CONTROLS = ["text", "textarea", "number", "select", "checkbox"];
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function normalizeFields(fields) {
  if (!Array.isArray(fields)) return { error: "fields 必须是数组" };
  const seen = new Set();
  const normalized = [];
  for (const raw of fields) {
    const id = String(raw?.id || "").trim();
    const label = String(raw?.label || "").trim();
    const control = String(raw?.control || "text");
    if (!ID_PATTERN.test(id)) return { error: `非法字段 id：${id || "(空)"}` };
    if (seen.has(id)) return { error: `重复字段 id：${id}` };
    if (!label) return { error: "label 不能空" };
    if (!CONTROLS.includes(control)) return { error: `非法控件：${control}` };
    const field = { id, label, control, required: Boolean(raw?.required) };
    if (control === "select") {
      const options = Array.isArray(raw.options)
        ? raw.options.map((item) => String(item).trim()).filter(Boolean)
        : String(raw.options || "").split(",").map((item) => item.trim()).filter(Boolean);
      if (!options.length) return { error: `select 字段 ${id} 的 options[] 不能为空` };
      field.options = options;
    }
    seen.add(id);
    normalized.push(field);
  }
  return { fields: normalized };
}
