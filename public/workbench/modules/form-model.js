/** 作者面共享的纯模型规则；不读写 DOM，也不发网络请求。 */
export const CONTROLS = [
  { value: "text", label: "单行文字" },
  { value: "textarea", label: "多行文字" },
  { value: "number", label: "数字" },
  { value: "select", label: "下拉选择" },
  { value: "checkbox", label: "勾选" },
];

export function controlLabel(value) {
  return CONTROLS.find((item) => item.value === value)?.label || value;
}
export function originLabel(agent) {
  return agent.origin === "born-form" ? "新生" : "改装";
}
export function nextFieldId(fields) {
  const used = new Set((fields || []).map((field) => field.id));
  let n = 1;
  while (used.has(`f${n}`)) n += 1;
  return `f${n}`;
}
export function isDirty(agent) {
  return Boolean(agent?.formId && agent.published &&
    JSON.stringify(agent.fields || []) !== JSON.stringify(agent.published.fields || []));
}
export function publicationState(agent) {
  if (isDirty(agent)) return { label: "有未发布改动", className: "dirty" };
  if (agent.formId && agent.published) {
    return { label: `已发布 v${agent.published.formVersion}`, className: "published" };
  }
  return { label: `草稿 v${agent.formVersion || 1}`, className: "draft" };
}
export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
