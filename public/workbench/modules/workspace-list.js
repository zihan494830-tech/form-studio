import {
  escapeHtml,
  isDirty,
  originLabel,
  publicationState,
  versionSummary,
} from "/workbench/modules/form-model.js";
import { t } from "/presentation/messages/zh-HK.mjs";

function matchesFilter(agent, filter) {
  if (filter === "archived") return Boolean(agent.archivedAt);
  if (agent.archivedAt) return false;
  if (filter === "published") return Boolean(agent.binding) && !isDirty(agent);
  if (filter === "draft") return !agent.binding || isDirty(agent);
  return true;
}

export function renderWorkspaceList({ agents, selectedId, query, filter, container, count, onSelect, onRestore }) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-HK");
  const inFilter = agents.filter((agent) => matchesFilter(agent, filter));
  const visible = agents.filter((agent) => {
    const matchesQuery = !normalizedQuery
      || `${agent.name} ${agent.id}`.toLocaleLowerCase("zh-HK").includes(normalizedQuery);
    return matchesQuery && matchesFilter(agent, filter);
  });

  count.textContent = visible.length === inFilter.length ? `${inFilter.length}` : `${visible.length} / ${inFilter.length}`;
  container.innerHTML = "";
  for (const agent of visible) {
    if (agent.archivedAt) {
      const row = document.createElement("div");
      row.className = "archived-agent";
      row.innerHTML = `<div><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(t("ui.workbench.removed_status"))} · ${escapeHtml(originLabel(agent))}</small></div>`;
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "restore-agent";
      restore.textContent = t("ui.workbench.restore");
      restore.setAttribute("aria-label", `${t("ui.workbench.restore")} ${agent.name}`);
      restore.addEventListener("click", async () => {
        restore.disabled = true;
        try { await onRestore(agent.id); } finally { restore.disabled = false; }
      });
      row.appendChild(restore);
      container.appendChild(row);
      continue;
    }
    const state = publicationState(agent);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `agent${agent.id === selectedId ? " active" : ""}`;
    button.dataset.id = agent.id;
    button.title = `${state.label} · ${versionSummary(agent)}`;
    button.innerHTML = `<span class="agent-title"><strong>${escapeHtml(agent.name)}</strong><span class="mini-status ${state.className}">${escapeHtml(state.label)}</span></span>
      <small>${escapeHtml(originLabel(agent))}</small>`;
    button.addEventListener("click", () => onSelect(agent.id));
    container.appendChild(button);
  }
  if (!visible.length) container.innerHTML = `<p class="empty-state">${t("ui.workbench.empty_filter")}</p>`;
}
