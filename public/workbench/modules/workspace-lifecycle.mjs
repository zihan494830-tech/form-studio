export function createWorkspaceLifecycle({
  unbindButton,
  archiveButton,
  guide,
  guideDismissButton,
  addFieldButton,
  listFilterButtons,
  getAgent,
  getAgentById,
  flushPending,
  confirmAction,
  replaceAgent,
  select,
  onArchived,
  onRestored,
  onFilterChange,
  showError,
  t,
  request = globalThis.fetch,
}) {
  const dismissedGuideFor = new Set();
  const inFlight = new Set();
  const etag = (agent) => `"agent-${Number(agent?.revision) || 1}"`;

  function setFilter(filter) {
    listFilterButtons.forEach((item) => {
      const active = item.dataset.listFilter === filter;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    onFilterChange(filter);
  }

  async function restore(id) {
    if (inFlight.has(`restore:${id}`)) return;
    inFlight.add(`restore:${id}`);
    try {
      const agent = getAgentById(id);
      const res = await request(`/api/agents/${encodeURIComponent(id)}/restore`, {
        method: "POST", headers: { "If-Match": etag(agent) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showError(data.error || t("ui.workbench.restore_failed"));
      replaceAgent(data);
      setFilter("all");
      await select(id, { reloadFace: true });
      onRestored(data);
    } catch {
      showError(t("ui.workbench.restore_failed"));
    } finally {
      inFlight.delete(`restore:${id}`);
    }
  }

  unbindButton.addEventListener("click", async () => {
    if (!await flushPending()) return;
    const agent = getAgent();
    if (!agent) return;
    const ok = await confirmAction({
      title: t("ui.workbench.deactivate_title"),
      body: t("ui.workbench.deactivate_body"),
      confirmLabel: t("ui.workbench.deactivate_confirm"),
    });
    if (!ok) return;
    if (inFlight.has("unpublish")) return;
    inFlight.add("unpublish");
    unbindButton.disabled = true;
    unbindButton.setAttribute("aria-busy", "true");
    try {
      const res = await request(`/api/agents/${encodeURIComponent(agent.id)}/unpublish`, {
        method: "POST", headers: { "If-Match": etag(agent) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showError(data.error || t("ui.workbench.operation_failed"));
      replaceAgent(data);
      await select(agent.id, { reloadFace: true });
    } catch {
      showError(t("ui.workbench.operation_failed"));
    } finally {
      inFlight.delete("unpublish");
      unbindButton.removeAttribute("aria-busy");
      if (getAgent()?.binding) unbindButton.disabled = false;
    }
  });

  archiveButton.addEventListener("click", async () => {
    if (!await flushPending()) return;
    const agent = getAgent();
    if (!agent) return;
    const ok = await confirmAction({
      title: t("ui.workbench.remove_title", { name: agent.name }),
      body: t("ui.workbench.remove_body", { count: (agent.inputBag || []).length }),
      confirmLabel: t("ui.workbench.remove_confirm"),
    });
    if (!ok) return;
    if (inFlight.has("archive")) return;
    inFlight.add("archive");
    archiveButton.disabled = true;
    archiveButton.setAttribute("aria-busy", "true");
    try {
      const res = await request(`/api/agents/${encodeURIComponent(agent.id)}/archive`, {
        method: "POST", headers: { "If-Match": etag(agent) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showError(data.error || t("ui.workbench.operation_failed"));
      replaceAgent(data);
      onArchived(data);
    } catch {
      showError(t("ui.workbench.operation_failed"));
    } finally {
      inFlight.delete("archive");
      archiveButton.removeAttribute("aria-busy");
      if (getAgent()) archiveButton.disabled = false;
    }
  });

  guideDismissButton.addEventListener("click", () => {
    const agent = getAgent();
    if (agent) dismissedGuideFor.add(agent.id);
    guide.hidden = true;
    addFieldButton.focus();
  });
  listFilterButtons.forEach((button) => button.addEventListener("click", () => setFilter(button.dataset.listFilter)));

  return {
    restore,
    shouldShowGuide(agent) {
      return Boolean(agent && !(agent.fields || []).length && !dismissedGuideFor.has(agent.id));
    },
  };
}
