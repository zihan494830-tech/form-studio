/** 作者面共享的纯模型规则；不读写 DOM，也不发网络请求。 */
import { t } from "/presentation/messages/zh-HK.mjs";

export const CONTROLS = [
  { value: "text", label: t("ui.workbench.control_text") },
  { value: "textarea", label: t("ui.workbench.control_textarea") },
  { value: "number", label: t("ui.workbench.control_number") },
  { value: "select", label: t("ui.workbench.control_select") },
  { value: "checkbox", label: t("ui.workbench.control_checkbox") },
  { value: "radio", label: t("ui.workbench.control_radio") },
  { value: "grid", label: t("ui.workbench.control_grid") },
];

export function controlLabel(value) {
  return CONTROLS.find((item) => item.value === value)?.label || value;
}
export function originLabel(agent) {
  return agent.origin === "born-form" ? t("ui.workbench.origin_born") : t("ui.workbench.origin_retrofit");
}
export function nextFieldId(fields) {
  const used = new Set((fields || []).map((field) => field.id));
  let n = 1;
  while (used.has(`f${n}`)) n += 1;
  return `f${n}`;
}
export function isDirty(agent) {
  return Boolean(agent?.binding && agent.published &&
    JSON.stringify(agent.fields || []) !== JSON.stringify(agent.published.fields || []));
}
export function publicationState(agent) {
  if (isDirty(agent)) return { label: t("ui.workbench.release_pending", { release: agent.releaseVersion || "v1.x" }), className: "dirty" };
  if (agent.binding && agent.published) {
    return { label: t("ui.workbench.release_published", { release: agent.releaseVersion || "v1.x" }), className: "published" };
  }
  return { label: t("ui.workbench.not_published"), className: "draft" };
}
export function versionSummary(agent) {
  if (!agent?.published?.formVersion) return t("ui.workbench.release_unpublished");
  if (isDirty(agent)) return t("ui.workbench.release_summary_pending", { release: agent.releaseVersion || "v1.x" });
  return t("ui.workbench.release_summary", { release: agent.releaseVersion || "v1.x" });
}
export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
