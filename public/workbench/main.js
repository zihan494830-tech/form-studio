import { controlLabel, escapeHtml, isDirty, nextFieldId, originLabel,
  publicationState, versionSummary } from "/workbench/modules/form-model.js";
import { createOwnerFlow } from "/workbench/modules/owner-flow.js";
import { createFieldContractPanel } from "/workbench/modules/field-contract-panel.js";
import { renderWorkspaceList } from "/workbench/modules/workspace-list.js";
import { createPreviewCanvas } from "/workbench/modules/preview-canvas.mjs";
import { createPropertyInspector } from "/workbench/modules/property-inspector.mjs";
import { defaultGrid } from "/workbench/modules/grid-editor.mjs";
import { createCanvasController } from "/workbench/modules/canvas-controller.mjs";
import { createPublishPreflight } from "/workbench/modules/publish-preflight.mjs";
import { requireAuthorSession } from "/workbench/modules/session-gate.js";
import { createSubmissionView } from "/workbench/modules/submission-view.js";
import { createSubmissionLoader } from "/workbench/modules/submission-loader.mjs";
import { createUnsavedGuard } from "/workbench/modules/unsaved-guard.mjs";
import { wireMoreActionsMenu } from "/workbench/modules/more-actions-menu.mjs";
import { createWorkspaceLifecycle } from "/workbench/modules/workspace-lifecycle.mjs";
import { createConfirmationDialog } from "/workbench/modules/confirmation-dialog.mjs";
import { createInspectorSplitter } from "/workbench/modules/inspector-splitter.mjs";
import { createCanvasModeTabs } from "/workbench/modules/canvas-mode-tabs.mjs";
import { locale, t } from "/presentation/messages/zh-HK.mjs";
const $ = (id) => document.getElementById(id);
document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
const listEl = $("agent-list"), hintEl = $("face-hint"), frameEl = $("face");
const ledgerEl = $("ledger"), bagEl = $("bag"), bindBtn = $("bind-btn"), unbindBtn = $("unbind-btn"), archiveBtn = $("archive-btn");
const stageTitle = $("stage-title"), stageStatus = $("stage-status"), saveStatusEl = $("save-status"), saveRetryBtn = $("save-retry-btn");
const publicationBadge = $("publication-badge"), designerEl = $("designer");
const addFieldMenuEl = $("add-field-menu"), addFieldButtons = [...document.querySelectorAll("[data-add-control]")], copyExampleBtn = $("copy-example");
const agentSearchEl = $("agent-search"), newWorkspaceBtn = $("new-workspace-btn");
const actionErrorEl = $("action-error"), recordsEl = $("records"), recordsSearchEl = $("records-search");
const onboardingStatusEl = $("onboarding-status");
const recordCountEl = $("record-count"), refreshBtn = $("refresh-btn"), userPageLink = $("user-page-link");
const faceModeEl = $("face-mode"), confirmDialog = $("confirm-dialog");
const previewZoomOutBtn = $("preview-zoom-out"), previewZoomResetBtn = $("preview-zoom-reset");
const previewZoomInBtn = $("preview-zoom-in"), previewZoomValueEl = $("preview-zoom-value");
const confirmTitle = $("confirm-title"), confirmBody = $("confirm-body"), confirmAccept = $("confirm-accept");
const onboardingEl = $("onboarding"), workspaceEl = $("workspace"), ownerContextEl = $("owner-context");
const listCountEl = $("list-count"), listFilterButtons = [...document.querySelectorAll("[data-list-filter]")];
const viewRecordCountEl = $("view-record-count");
const viewTabs = [...document.querySelectorAll('#workspace-tabs [role="tab"]')];
const canvasModeTabs = [...document.querySelectorAll('[data-canvas-mode]')];
const inspectorContentEl = $("property-inspector-content"), inspectorToggleBtn = $("inspector-toggle");
const faceWrapEl = $("face-wrap"), canvasLoadingEl = $("canvas-loading"), emptyGuideEl = $("empty-guide"), emptyGuideDismissBtn = $("empty-guide-dismiss");
const publishReceiptEl = $("publish-receipt"), moreActionsEl = $("more-actions");
const viewPanels = { design: designerEl, submissions: recordsEl };
createInspectorSplitter({ splitter: $("property-splitter") });
let agents = [], selectedId = null;
let listFilter = "all";
let activeView = "design";
let saveTail = Promise.resolve(), pendingSaves = 0;
let canvasMode = "design", selectedTarget = { kind: "form" };
let localEditState = "clean", saveFailed = false, publishing = false, workspaceLifecycle;
const submissionRecords = new Map();
const submissionLoadStates = new Map();
const unloadGuard = createUnsavedGuard();
const loadSubmissions = createSubmissionLoader({ records: submissionRecords, states: submissionLoadStates,
  getSelectedId: () => selectedId, onStateChange: () => renderContract(), t });
const confirmAction = createConfirmationDialog({ dialog: confirmDialog, title: confirmTitle, body: confirmBody, accept: confirmAccept, t });
const submissionView = createSubmissionView({ ledgerEl, bagEl, recordCountEl, viewRecordCountEl, recordsSearchEl,
  detailEl: $("submission-detail"), statusFilterEl: $("records-status-filter"), archivedFilterEl: $("records-archived-filter"),
  getAgent: currentAgent, submissionRecords, submissionLoadStates, refreshSubmissions: loadSubmissions,
  controlLabel, escapeHtml, locale, t, showError, confirmAction });
function renderContract() { submissionView.render(); }
function showError(message) {
  actionErrorEl.hidden = !message;
  actionErrorEl.textContent = message || "";
  onboardingStatusEl.hidden = !message || onboardingEl.hidden;
  onboardingStatusEl.textContent = message || "";
  onboardingStatusEl.dataset.state = message ? "error" : "";
}
function showOnboardingStatus(message, state = "success") {
  onboardingStatusEl.textContent = message || "";
  onboardingStatusEl.dataset.state = state;
  onboardingStatusEl.hidden = !message || onboardingEl.hidden;
}
function setSaveStatus(text, state = "idle") {
  saveStatusEl.textContent = text;
  saveStatusEl.dataset.state = state;
  saveRetryBtn.hidden = state !== "error";
}
function updateUnloadGuard() {
  const shouldWarn = localEditState !== "clean" || pendingSaves > 0 || saveFailed;
  unloadGuard.update(shouldWarn);
}
function handleEditState(state, { discarded = false } = {}) {
  localEditState = state;
  if (discarded) { saveFailed = false; showError(""); }
  if (state === "dirty") setSaveStatus(t("ui.workbench.unsaved"), "dirty");
  else if (state === "error") setSaveStatus(t("ui.workbench.save_failed_local"), "error");
  else if (!pendingSaves && !saveFailed) setSaveStatus(t("ui.workbench.saved"), "saved");
  updateActions();
  updateUnloadGuard();
}
async function loadAgents(defaultScenario = null, { explicit = false } = {}) {
  const res = await fetch("/api/agents");
  if (!res.ok) throw new Error(t("ui.workbench.load_agents_failed"));
  agents = await res.json();
  if (!selectedId && defaultScenario && agents.some((agent) => agent.id === defaultScenario && !agent.archivedAt)) {
    await select(defaultScenario);
    return;
  }
  if (explicit && defaultScenario) showError(t("ui.workbench.scenario_unavailable"));
  renderList(); renderDesigner(); renderContract(); updateStage(); updateActions(); setWorkspaceView(activeView);
}
function currentAgent() { return agents.find((item) => item.id === selectedId) || null; }
function agentEtag(agent) { return `"agent-${Number(agent?.revision) || 1}"`; }
function replaceAgent(next) {
  const index = agents.findIndex((item) => item.id === next.id);
  if (index >= 0) agents[index] = next; else agents.push(next);
}
function renderList() {
  renderWorkspaceList({
    agents, selectedId, query: agentSearchEl.value, filter: listFilter,
    container: listEl, count: listCountEl, onSelect: (id) => select(id), onRestore: (id) => workspaceLifecycle.restore(id),
  });
}
function defaultSelection(agent) {
  const first = agent?.fields?.[0];
  return first ? { kind: "field", fieldId: first.id } : { kind: "form" };
}
function normalizeSelection(agent, selection = selectedTarget) {
  if (!agent || selection?.kind === "form") return { kind: "form" };
  const field = (agent.fields || []).find((item) => item.id === selection?.fieldId);
  if (!field) return defaultSelection(agent);
  if (selection.kind === "grid-row" && field.control === "grid" && field.grid.rows.some((row) => row.id === selection.rowId)) return selection;
  if (selection.kind === "grid-column" && field.control === "grid" && field.grid.columns.some((column) => column.id === selection.columnId)) return selection;
  return { kind: "field", fieldId: field.id };
}
function renderDesigner() {
  const agent = currentAgent();
  selectedTarget = normalizeSelection(agent);
  propertyInspector.render();
  previewCanvas.applySelection(selectedTarget);
  const empty = !(agent?.fields || []).length;
  emptyGuideEl.hidden = !workspaceLifecycle.shouldShowGuide(agent);
  copyExampleBtn.hidden = !empty;
}
async function setSelection(selection, { source = "program" } = {}) {
  if (!await propertyInspector.flushPending()) return false;
  selectedTarget = normalizeSelection(currentAgent(), selection);
  renderDesigner();
  if (source === "canvas" && window.innerWidth < 1280) await setInspectorOpen(true);
  return true;
}
async function setInspectorOpen(open) {
  if (!open && !await propertyInspector.flushPending()) return false;
  designerEl.classList.toggle("inspector-open", open);
  inspectorToggleBtn.setAttribute("aria-expanded", String(open));
  if (!open) previewCanvas.focusSelection();
  return true;
}
function viewNameFromTab(tab) {
  return tab.id.replace("view-", "");
}
async function setWorkspaceView(view, { reloadFace = false, focusPanel = false } = {}) {
  if (!viewPanels[view]) return;
  if (view !== activeView && !await propertyInspector.flushPending()) return false;
  activeView = view;
  for (const tab of viewTabs) {
    const selected = viewNameFromTab(tab) === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const [name, panel] of Object.entries(viewPanels)) panel.hidden = name !== view;
  const agent = currentAgent();
  if (view === "design" && agent) canvasController.ensure(agent, { force: reloadFace });
  if (view === "submissions") {
    renderContract();
    loadSubmissions(selectedId, { force: true });
  }
  if (focusPanel) viewPanels[view].focus();
  return true;
}
async function select(id, { reloadFace = true } = {}) {
  if (selectedId && selectedId !== id && !await propertyInspector.flushPending()) return false;
  selectedId = id;
  loadSubmissions(id, { force: true });
  selectedTarget = defaultSelection(currentAgent());
  designerEl.classList.remove("inspector-open");
  inspectorToggleBtn.setAttribute("aria-expanded", "false");
  onboardingEl.hidden = true; workspaceEl.hidden = false;
  publishReceiptEl.hidden = true;
  const url = new URL(location.href);
  url.searchParams.set("scenario", id);
  history.replaceState({}, "", url);
  renderList(); showError(""); renderDesigner(); renderContract(); updateStage(); updateActions();
  await setWorkspaceView(activeView, { reloadFace });
  setSaveStatus(pendingSaves ? t("ui.workbench.saving") : t("ui.workbench.saved"), pendingSaves ? "saving" : "saved");
  return true;
}
function updateStage() {
  const agent = currentAgent();
  if (!agent) {
    stageTitle.textContent = t("ui.workbench.choose_or_create");
    publicationBadge.hidden = true;
    return;
  }
  const state = publicationState(agent);
  stageTitle.textContent = agent.name;
  const source = agent.sourceSystem === "poffices" ? "Poffices" : agent.origin === "born-form" ? "Form Studio" : t("ui.workbench.source_local_example");
  const entry = agent.binding ? t("ui.workbench.entry_sidecar") : t("ui.workbench.entry_draft");
  const identityLabel = agent.sourceSystem === "poffices" ? "Poffices agent ID" : t("ui.workbench.identity_local");
  ownerContextEl.innerHTML = `<details class="owner-details"><summary>${t("ui.workbench.page_identity")}</summary><div class="owner-popover"><span><b>${escapeHtml(identityLabel)}:</b><code>${escapeHtml(agent.id)}</code></span><span><b>來源</b>${escapeHtml(source)} · ${escapeHtml(originLabel(agent))}</span><span><b>版本</b>${escapeHtml(versionSummary(agent))}</span><span><b>入口</b>${escapeHtml(entry)}</span><p>這裡只管理 Form Studio 的表單、發布版本與提交，不修改 Agent 本體。</p></div></details>`;
  publicationBadge.hidden = false;
  publicationBadge.textContent = state.label;
  publicationBadge.className = `status-badge ${state.className}`;
  if (isDirty(agent)) stageStatus.textContent = t("ui.workbench.status_dirty");
  else if (agent.binding) stageStatus.textContent = t("ui.workbench.status_published");
  else if ((agent.fields || []).length) stageStatus.textContent = t("ui.workbench.publish_required_for_submit");
  else stageStatus.textContent = agent.origin === "born-form"
    ? t("ui.workbench.status_born_empty")
    : t("ui.workbench.status_retrofit_empty");
}
function updateActions() {
  const agent = currentAgent();
  if (!agent) {
    bindBtn.disabled = true; bindBtn.hidden = false; userPageLink.hidden = true; userPageLink.setAttribute("aria-disabled", "true");
    moreActionsEl.hidden = true; unbindBtn.disabled = true; unbindBtn.hidden = true; archiveBtn.disabled = true; bindBtn.textContent = t("ui.workbench.publish");
    return;
  }
  const dirty = isDirty(agent), hasFields = (agent.fields || []).length > 0;
  const localDirty = localEditState === "dirty";
  const pendingRelease = dirty || localDirty;
  bindBtn.hidden = Boolean(agent.binding && !pendingRelease);
  // Keep the publish action clickable while a blur-triggered save starts; the handler flushes that queue before opening preflight.
  bindBtn.disabled = !(hasFields && (!agent.binding || pendingRelease)) || localEditState === "error" || saveFailed || publishing;
  bindBtn.textContent = agent.binding ? t("ui.workbench.publish_update") : t("ui.workbench.publish");
  const previewTab = canvasModeTabs.find((tab) => tab.dataset.canvasMode === "preview");
  if (previewTab) previewTab.disabled = !hasFields;
  userPageLink.hidden = !agent.binding;
  userPageLink.textContent = pendingRelease
    ? t("ui.workbench.open_release", { release: agent.releaseVersion || "v1.x" })
    : t("ui.workbench.go_fill");
  userPageLink.classList.toggle("primary-action", Boolean(agent.binding && !pendingRelease));
  userPageLink.classList.toggle("secondary-action", Boolean(agent.binding && pendingRelease));
  moreActionsEl.hidden = false;
  unbindBtn.disabled = !agent.binding || pendingSaves > 0 || localEditState !== "clean" || saveFailed;
  unbindBtn.hidden = !agent.binding;
  unbindBtn.textContent = agent.origin === "born-form" ? t("ui.workbench.unpublish") : t("ui.workbench.unbind");
  archiveBtn.disabled = pendingSaves > 0 || localEditState !== "clean" || saveFailed || publishing;
}
const fieldContractPanel = createFieldContractPanel({
  dialog: $("field-contract-dialog"), openButton: null, list: $("field-contract-list"),
  status: $("field-contract-status"), getAgent: currentAgent, getSelection: () => selectedTarget, saveFields, t,
});
const previewCanvas = createPreviewCanvas({
  frame: frameEl, getMode: () => canvasMode, getSelection: () => selectedTarget,
  onSelect: setSelection,
});
const canvasController = createCanvasController({
  frame: frameEl, hint: hintEl, wrap: faceWrapEl, loading: canvasLoadingEl,
  faceMode: faceModeEl, userPageLink, refreshButton: refreshBtn,
  zoomOut: previewZoomOutBtn, zoomReset: previewZoomResetBtn, zoomIn: previewZoomInBtn,
  zoomValue: previewZoomValueEl, previewCanvas, getAgent: currentAgent, getMode: () => canvasMode,
  isDirty, escapeHtml, t,
});
const canvasModes = createCanvasModeTabs({
  tabs: canvasModeTabs, tablist: $("canvas-mode-tabs"), panel: faceWrapEl,
  flushPending: () => propertyInspector.flushPending(),
  hasFields: () => Boolean((currentAgent()?.fields || []).length),
  showEmptyError: () => showError(t("ui.workbench.tryout_requires_fields")),
  applyMode: (mode) => canvasController.setMode(mode),
  onChange: (mode) => { canvasMode = mode; },
});
const propertyInspector = createPropertyInspector({
  root: inspectorContentEl, getAgent: currentAgent, getSelection: () => selectedTarget,
  setSelection, saveFields, settleSaves: () => saveTail.then(() => undefined),
  confirmAction, showError, openContract: async (trigger) => {
    if (await propertyInspector.flushPending()) fieldContractPanel.open(trigger);
  },
  onClose: () => setInspectorOpen(false), onEditState: handleEditState, t,
});
const publishPreflight = createPublishPreflight({
  dialog: $("publish-dialog"), summary: $("publish-summary"), warnings: $("publish-warnings"),
  confirmButton: $("publish-confirm"), escapeHtml, t,
});
function saveFields(fields, { selectionAfterSave = selectedTarget, refreshInspector = true } = {}) {
  if (!selectedId) return Promise.resolve(false);
  const agentId = selectedId;
  const snapshot = JSON.parse(JSON.stringify(fields));
  const selectionSnapshot = JSON.parse(JSON.stringify(selectionAfterSave));
  pendingSaves += 1; setSaveStatus(t("ui.workbench.saving"), "saving"); updateActions(); updateUnloadGuard();
  const task = saveTail.then(async () => {
    const revisionAgent = agents.find((item) => item.id === agentId);
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": agentEtag(revisionAgent) },
      body: JSON.stringify({ fields: snapshot }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.error || t("ui.workbench.save_failed"));
      saveFailed = true;
      if (selectedId === agentId) setSaveStatus(t("ui.workbench.save_failed_local"), "error");
      return false;
    }
    replaceAgent(data); showError(""); saveFailed = false;
    if (selectedId === agentId) {
      selectedTarget = normalizeSelection(data, selectionSnapshot);
      renderList();
      if (refreshInspector) renderDesigner();
      else previewCanvas.applySelection(selectedTarget);
      renderContract(); updateStage(); updateActions();
      if (activeView === "design") canvasController.load(data, { force: true });
    }
    return true;
  }).catch((error) => {
    showError(error.message || t("ui.workbench.save_failed"));
    saveFailed = true;
    if (selectedId === agentId) setSaveStatus(t("ui.workbench.save_failed_local"), "error");
    return false;
  }).finally(() => {
    pendingSaves -= 1;
    if (selectedId === agentId && pendingSaves === 0 && localEditState === "clean" && !saveFailed) setSaveStatus(t("ui.workbench.saved"), "saved");
    updateActions();
    updateUnloadGuard();
  });
  saveTail = task.then(() => undefined);
  return task;
}
bindBtn.addEventListener("click", async () => {
  if (!selectedId || publishing) return;
  publishing = true; updateActions();
  try {
    if (!await propertyInspector.flushPending()) return;
    const agent = currentAgent();
    if (!agent || !await publishPreflight.open(agent)) return;
    const id = selectedId;
    const res = await fetch(`/api/agents/${encodeURIComponent(id)}/publish`, {
      method: "POST", headers: { "If-Match": agentEtag(agent) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showError(data.error || t("ui.workbench.publish_failed"));
    replaceAgent(data); await select(id, { reloadFace: true }); setSaveStatus(t("ui.workbench.published_done"), "saved");
    publishReceiptEl.hidden = false;
    publishReceiptEl.innerHTML = `${escapeHtml(t("ui.workbench.publish_receipt", { version: data.releaseVersion || "v1.x" }))} <a href="/a/${encodeURIComponent(id)}" target="_blank" rel="noopener">${escapeHtml(t("ui.workbench.publish_open"))}</a> <button id="receipt-submissions" type="button">${escapeHtml(t("ui.workbench.view_submissions"))}</button>`;
    $("receipt-submissions")?.addEventListener("click", () => setWorkspaceView("submissions", { focusPanel: true }));
  } catch (error) {
    showError(error.message || t("ui.workbench.publish_failed"));
  } finally {
    publishing = false; updateActions();
  }
});
addFieldButtons.forEach((button) => button.addEventListener("click", async () => {
  if (!await propertyInspector.flushPending()) return;
  const agent = currentAgent(); if (!agent) return;
  const fields = [...(agent.fields || [])], control = button.dataset.addControl;
  const next = { id: nextFieldId(fields), label: t("ui.workbench.new_field", { index: fields.length + 1 }), control, required: false };
  if (control === "select" || control === "radio") next.options = [t("ui.workbench.option_one"), t("ui.workbench.option_two")];
  if (control === "grid") next.grid = defaultGrid();
  fields.push(next);
  addFieldMenuEl.open = false;
  await saveFields(fields, { selectionAfterSave: { kind: "field", fieldId: next.id } });
}));
copyExampleBtn.addEventListener("click", async () => {
  const agent = currentAgent(); if (!agent) return;
  if ((agent.fields || []).length || !await propertyInspector.flushPending()) return;
  if (copyExampleBtn.disabled) return;
  copyExampleBtn.disabled = true;
  copyExampleBtn.setAttribute("aria-busy", "true");
  try {
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/copy-example`, {
      method: "POST", headers: { "If-Match": agentEtag(agent) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showError(data.error || t("ui.workbench.copy_failed"));
    replaceAgent(data); await select(agent.id, { reloadFace: true });
  } catch {
    showError(t("ui.workbench.copy_failed"));
  } finally {
    copyExampleBtn.disabled = false;
    copyExampleBtn.removeAttribute("aria-busy");
  }
});
const ownerFlow = createOwnerFlow({
  onCreated(agent) {
    replaceAgent(agent); select(agent.id, { reloadFace: true });
  },
});
function showWorkspaceChoice(message = "") {
  selectedId = null;
  activeView = "design";
  publishReceiptEl.hidden = true;
  renderList();
  workspaceEl.hidden = true;
  onboardingEl.hidden = false;
  ownerFlow.showChoice();
  const url = new URL(location.href);
  url.searchParams.delete("scenario");
  history.replaceState({}, "", url);
  if (message) showOnboardingStatus(message);
}
workspaceLifecycle = createWorkspaceLifecycle({
  unbindButton: unbindBtn, archiveButton: archiveBtn,
  guide: emptyGuideEl, guideDismissButton: emptyGuideDismissBtn, addFieldButton: $("add-field"),
  listFilterButtons, getAgent: currentAgent, flushPending: () => propertyInspector.flushPending(),
  getAgentById: (id) => agents.find((agent) => agent.id === id),
  confirmAction, replaceAgent, select, showError, t,
  onArchived: (agent) => {
    showWorkspaceChoice(t("ui.workbench.removed", { name: agent.name }));
    queueMicrotask(() => newWorkspaceBtn.focus());
  },
  onRestored: (agent) => setSaveStatus(t("ui.workbench.restored", { name: agent.name }), "saved"),
  onFilterChange: (filter) => { listFilter = filter; renderList(); },
});
newWorkspaceBtn.addEventListener("click", () => {
  propertyInspector.flushPending().then((ready) => {
    if (!ready) return;
    showWorkspaceChoice();
  });
});
agentSearchEl.addEventListener("input", renderList);
viewTabs.forEach((tab) => tab.addEventListener("click", () => setWorkspaceView(viewNameFromTab(tab), { focusPanel: true })));
$("workspace-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = Math.max(0, viewTabs.indexOf(document.activeElement));
  const next = event.key === "Home" ? 0
    : event.key === "End" ? viewTabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + viewTabs.length) % viewTabs.length;
  viewTabs[next].focus();
  setWorkspaceView(viewNameFromTab(viewTabs[next]));
});
inspectorToggleBtn.addEventListener("click", () => setInspectorOpen(!designerEl.classList.contains("inspector-open")));
saveRetryBtn.addEventListener("click", () => propertyInspector.retryPending());
wireMoreActionsMenu(moreActionsEl);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") propertyInspector.flushPending();
  else if (selectedId) loadSubmissions(selectedId, { force: true });
});
requireAuthorSession().then((session) => {
  if (!session) return;
  $("actor-name").textContent = session.actor.name || session.actor.id;
  $("product-version-label").textContent = session.provenance?.productVersion === "1.0.0-alpha.1"
    ? "v1.0 Alpha 1" : session.provenance?.productVersion || "development";
  const source = session.provenance?.dataSource;
  const sourceBadge = $("demo-badge");
  sourceBadge.hidden = !source;
  if (source) {
    const modeLabel = session.mode === "test" ? "TEST MOCK" : "DEV MOCK";
    const revision = session.provenance.runtimeRevision === "development"
      ? "development"
      : session.provenance.runtimeRevision.slice(0, 8);
    sourceBadge.textContent = `${modeLabel} · ${session.provenance.productVersion} · ${source.datasetRevision} · ${revision}`;
    sourceBadge.title = `mode=${session.mode}; dataset=${source.datasetRevision}; build=${session.provenance.runtimeRevision}`;
  }
  const requestedScenario = new URLSearchParams(location.search).get("scenario");
  const defaultScenario = requestedScenario || (session.mode === "local-demo" ? source?.defaultScenario : null);
  loadAgents(defaultScenario, { explicit: Boolean(requestedScenario) }).catch((error) => showError(error.message));
}).catch((error) => showError(error.message));
