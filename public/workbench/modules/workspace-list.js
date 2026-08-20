import {
  escapeHtml,
  isDirty,
  originLabel,
  publicationState,
} from "/workbench/modules/form-model.js";

function matchesFilter(agent, filter) {
  if (filter === "published") return Boolean(agent.binding) && !isDirty(agent);
  if (filter === "draft") return !agent.binding || isDirty(agent);
  return true;
}

export function renderWorkspaceList({ agents, selectedId, query, filter, container, count, onSelect }) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visible = agents.filter((agent) => {
    const matchesQuery = !normalizedQuery
      || `${agent.name} ${agent.id}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    return matchesQuery && matchesFilter(agent, filter);
  });

  count.textContent = visible.length === agents.length ? `${agents.length}` : `${visible.length} / ${agents.length}`;
  container.innerHTML = "";
  for (const agent of visible) {
    const state = publicationState(agent);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `agent${agent.id === selectedId ? " active" : ""}`;
    button.dataset.id = agent.id;
    button.innerHTML = `<span class="agent-title"><strong>${escapeHtml(agent.name)}</strong><span class="mini-status ${state.className}">${escapeHtml(state.label)}</span></span>
      <small>${escapeHtml(originLabel(agent))}</small>`;
    button.addEventListener("click", () => onSelect(agent.id));
    container.appendChild(button);
  }
  if (!visible.length) container.innerHTML = `<p class="empty-state">这个筛选下还没有用户页面。</p>`;
}
