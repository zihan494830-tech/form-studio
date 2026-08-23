import {
  controlLabel,
  escapeHtml,
  isDirty,
  nextFieldId,
  originLabel,
  publicationState,
  versionSummary,
} from "/workbench/modules/form-model.js";
import { createOwnerFlow } from "/workbench/modules/owner-flow.js";
import { createFieldContractPanel } from "/workbench/modules/field-contract-panel.js";
import { renderWorkspaceList } from "/workbench/modules/workspace-list.js";
import { createPreviewCanvas } from "/workbench/modules/preview-canvas.mjs";
import { createPropertyInspector } from "/workbench/modules/property-inspector.mjs";
import { defaultGrid } from "/workbench/modules/grid-editor.mjs";
import { requireAuthorSession } from "/workbench/modules/session-gate.js";
import { createSubmissionView } from "/workbench/modules/submission-view.js";
import { locale, t } from "/presentation/messages/zh-HK.mjs";
const $ = (id) => document.getElementById(id);
document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
const listEl = $("agent-list"), hintEl = $("face-hint"), frameEl = $("face");
const ledgerEl = $("ledger"), bagEl = $("bag"), bindBtn = $("bind-btn"), unbindBtn = $("unbind-btn");
const stageTitle = $("stage-title"), stageStatus = $("stage-status"), saveStatusEl = $("save-status");
const publicationBadge = $("publication-badge"), designerEl = $("designer");
const addFieldMenuEl = $("add-field-menu"), addFieldButtons = [...document.querySelectorAll("[data-add-control]")], copyExampleBtn = $("copy-example");
const agentSearchEl = $("agent-search"), newWorkspaceBtn = $("new-workspace-btn");
const actionErrorEl = $("action-error"), recordsEl = $("records"), recordsSearchEl = $("records-search");
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
const viewPanels = { design: designerEl, submissions: recordsEl };
let agents = [], selectedId = null, currentFacePath = null;
let listFilter = "all";
let activeView = "design";
let saveTail = Promise.resolve(), pendingSaves = 0;
let previewZoom = 1;
let canvasMode = "design", selectedTarget = { kind: "form" };
const submissionRecords = new Map();
const PREVIEW_ZOOM_MIN = 0.6, PREVIEW_ZOOM_MAX = 1.4, PREVIEW_ZOOM_STEP = 0.1;
const submissionView = createSubmissionView({ ledgerEl, bagEl, recordCountEl, viewRecordCountEl, recordsSearchEl,
  getAgent: currentAgent, submissionRecords, controlLabel, escapeHtml, locale, t });
function renderContract() { submissionView.render(); }
function showError(message) {
  actionErrorEl.hidden = !message;
  actionErrorEl.textContent = message || "";
}
function setSaveStatus(text, state = "idle") {
  saveStatusEl.textContent = text;
  saveStatusEl.dataset.state = state;
}
async function loadAgents(defaultScenario = null) {
  const res = await fetch("/api/agents");
  if (!res.ok) throw new Error(t("ui.workbench.load_agents_failed"));
  agents = await res.json();
  if (!selectedId && defaultScenario && agents.some((agent) => agent.id === defaultScenario)) {
    select(defaultScenario);
    return;
  }
  renderList(); renderDesigner(); renderContract(); updateStage(); updateActions(); setWorkspaceView(activeView);
}
function currentAgent() { return agents.find((item) => item.id === selectedId) || null; }
function replaceAgent(next) {
  const index = agents.findIndex((item) => item.id === next.id);
  if (index >= 0) agents[index] = next; else agents.push(next);
}
function renderList() {
  renderWorkspaceList({
    agents, selectedId, query: agentSearchEl.value, filter: listFilter,
    container: listEl, count: listCountEl, onSelect: (id) => select(id),
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
  selectedTarget = normalizeSelection(currentAgent());
  propertyInspector.render();
  previewCanvas.applySelection(selectedTarget);
}
function setSelection(selection, { source = "program" } = {}) {
  selectedTarget = normalizeSelection(currentAgent(), selection);
  renderDesigner();
  if (source === "canvas" && window.innerWidth < 1280) setInspectorOpen(true);
}
function setInspectorOpen(open) {
  designerEl.classList.toggle("inspector-open", open);
  inspectorToggleBtn.setAttribute("aria-expanded", String(open));
  if (!open) previewCanvas.focusSelection();
}

function facePathFor(agent) {
  const draftPreview = !agent.binding || isDirty(agent);
  return { path: `/preview/${encodeURIComponent(agent.id)}?mode=${encodeURIComponent(canvasMode)}`, draftPreview };
}
function setPreviewZoom(next) {
  previewZoom = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, Math.round(next * 10) / 10));
  previewZoomValueEl.value = `${Math.round(previewZoom * 100)}%`;
  previewZoomValueEl.textContent = previewZoomValueEl.value;
  previewZoomOutBtn.disabled = previewZoom <= PREVIEW_ZOOM_MIN;
  previewZoomInBtn.disabled = previewZoom >= PREVIEW_ZOOM_MAX;
  try {
    frameEl.contentDocument.documentElement.style.zoom = String(previewZoom);
  } catch {
    // The preview is same-origin in Form Studio; keep the toolbar stable if a future adapter is not.
  }
}
function onPreviewWheel(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  setPreviewZoom(previewZoom + (event.deltaY < 0 ? PREVIEW_ZOOM_STEP : -PREVIEW_ZOOM_STEP));
}
function attachPreviewZoom() {
  setPreviewZoom(previewZoom);
  frameEl.contentDocument?.addEventListener("wheel", onPreviewWheel, { passive: false });
}
function loadFace(agent, force = true) {
  if (!agent) return;
  const { path, draftPreview } = facePathFor(agent);
  currentFacePath = path;
  hintEl.hidden = true;
  if (force) {
    frameEl.hidden = true;
    frameEl.addEventListener("load", () => {
      if (currentFacePath === path) {
        const ready = previewCanvas.attach();
        frameEl.hidden = !ready; hintEl.hidden = ready;
        if (!ready) hintEl.innerHTML = `<p>${escapeHtml(t("ui.workbench.canvas_load_failed"))}</p>`;
        else { attachPreviewZoom(); requestAnimationFrame(() => previewCanvas.applySelection()); }
      }
    }, { once: true });
    frameEl.src = `${path}&r=${Date.now()}`;
  } else {
    frameEl.hidden = false;
    previewCanvas.applySelection();
  }
  faceModeEl.textContent = draftPreview ? t("ui.workbench.face_draft") : t("ui.workbench.face_published");
  faceModeEl.className = `face-mode ${draftPreview ? "draft" : "published"}`;
  userPageLink.href = `/a/${encodeURIComponent(agent.id)}`;
  const unavailable = !agent.binding;
  userPageLink.setAttribute("aria-disabled", String(unavailable));
  userPageLink.tabIndex = unavailable ? -1 : 0;
  refreshBtn.disabled = false;
}
function viewNameFromTab(tab) {
  return tab.id.replace("view-", "");
}
async function refreshSelectedAgent() {
  const id = selectedId;
  if (!id) return;
  const [response, submissionsResponse] = await Promise.all([
    fetch(`/api/agents/${encodeURIComponent(id)}`),
    fetch(`/api/agents/${encodeURIComponent(id)}/submissions`),
  ]);
  if (!response.ok || !submissionsResponse.ok || selectedId !== id) return;
  replaceAgent(await response.json());
  const submissionData = await submissionsResponse.json();
  submissionRecords.set(id, submissionData.records || []);
  renderList();
  renderDesigner();
  renderContract();
  updateStage();
  updateActions();
}
function setWorkspaceView(view, { reloadFace = false, focusPanel = false } = {}) {
  if (!viewPanels[view]) return;
  activeView = view;
  for (const tab of viewTabs) {
    const selected = viewNameFromTab(tab) === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const [name, panel] of Object.entries(viewPanels)) panel.hidden = name !== view;
  const agent = currentAgent();
  if (view === "design" && agent) {
    const expectedPath = facePathFor(agent).path;
    loadFace(agent, reloadFace || currentFacePath !== expectedPath);
  }
  if (view === "submissions") {
    renderContract();
    refreshSelectedAgent().catch((error) => showError(error.message));
  }
  if (focusPanel) viewPanels[view].focus();
}
function select(id, { reloadFace = true } = {}) {
  selectedId = id;
  selectedTarget = defaultSelection(currentAgent());
  setInspectorOpen(false);
  onboardingEl.hidden = true; workspaceEl.hidden = false;
  renderList(); showError(""); renderDesigner(); renderContract(); updateStage(); updateActions();
  setWorkspaceView(activeView, { reloadFace });
  setSaveStatus(pendingSaves ? t("ui.workbench.saving") : t("ui.workbench.saved"), pendingSaves ? "saving" : "saved");
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
  ownerContextEl.innerHTML = `<span class="context-summary">${escapeHtml(originLabel(agent))} · ${escapeHtml(entry)}</span>
    <span class="version-summary">${escapeHtml(versionSummary(agent))}</span>
    <details class="owner-details"><summary>${t("ui.workbench.page_identity")}</summary><div class="owner-popover"><span><b>${escapeHtml(identityLabel)}:</b><code>${escapeHtml(agent.id)}</code></span><span><b>來源</b>${escapeHtml(source)}</span><p>這裡只管理 Form Studio 的頁面、發布版本與提交，不修改 agent 本體。</p></div></details>`;
  publicationBadge.hidden = false;
  publicationBadge.textContent = state.label;
  publicationBadge.className = `status-badge ${state.className}`;
  if (isDirty(agent)) stageStatus.textContent = t("ui.workbench.status_dirty");
  else if (agent.binding) stageStatus.textContent = t("ui.workbench.status_published");
  else if ((agent.fields || []).length) stageStatus.textContent = t("ui.workbench.status_fields_draft");
  else stageStatus.textContent = agent.origin === "born-form"
    ? t("ui.workbench.status_born_empty")
    : t("ui.workbench.status_retrofit_empty");
}
function updateActions() {
  const agent = currentAgent();
  if (!agent) {
    bindBtn.disabled = true; unbindBtn.disabled = true; unbindBtn.hidden = true; bindBtn.textContent = t("ui.workbench.publish");
    return;
  }
  const dirty = isDirty(agent), hasFields = (agent.fields || []).length > 0;
  bindBtn.disabled = !(hasFields && (!agent.binding || dirty));
  bindBtn.textContent = agent.binding
    ? dirty ? t("ui.workbench.publish_version", { version: agent.formVersion }) : t("ui.workbench.published_version", { version: agent.published?.formVersion || agent.formVersion })
    : t("ui.workbench.publish");
  unbindBtn.disabled = !agent.binding;
  unbindBtn.hidden = !agent.binding;
  unbindBtn.textContent = agent.origin === "born-form" ? t("ui.workbench.unpublish") : t("ui.workbench.unbind");
}

const fieldContractPanel = createFieldContractPanel({
  dialog: $("field-contract-dialog"), openButton: null, list: $("field-contract-list"),
  status: $("field-contract-status"), getAgent: currentAgent, getSelection: () => selectedTarget, saveFields, t,
});
const previewCanvas = createPreviewCanvas({
  frame: frameEl, getMode: () => canvasMode, getSelection: () => selectedTarget,
  onSelect: setSelection,
});
const propertyInspector = createPropertyInspector({
  root: inspectorContentEl, getAgent: currentAgent, getSelection: () => selectedTarget,
  setSelection, saveFields, settleSaves: () => saveTail.then(() => undefined),
  confirmAction, showError, openContract: async (trigger) => { await saveTail; fieldContractPanel.open(trigger); },
  onClose: () => setInspectorOpen(false), t,
});

function saveFields(fields, { selectionAfterSave = selectedTarget } = {}) {
  if (!selectedId) return Promise.resolve(false);
  const agentId = selectedId, snapshot = JSON.parse(JSON.stringify(fields));
  pendingSaves += 1; setSaveStatus(t("ui.workbench.saving"), "saving");
  const task = saveTail.then(async () => {
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/fields`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: snapshot }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || t("ui.workbench.save_failed"));
      if (selectedId === agentId) setSaveStatus(t("ui.workbench.save_failed_local"), "error");
      return false;
    }
    replaceAgent(data); showError("");
    if (selectedId === agentId) {
      selectedTarget = normalizeSelection(data, selectionAfterSave);
      renderList(); renderDesigner(); renderContract(); updateStage(); updateActions();
      setWorkspaceView(activeView, { reloadFace: activeView === "design" });
    }
    return true;
  }).catch((error) => {
    showError(error.message || t("ui.workbench.save_failed"));
    if (selectedId === agentId) setSaveStatus(t("ui.workbench.save_failed_local"), "error");
    return false;
  }).finally(() => {
    pendingSaves -= 1;
    if (selectedId === agentId && pendingSaves === 0 && !actionErrorEl.textContent) setSaveStatus(t("ui.workbench.saved"), "saved");
  });
  saveTail = task.then(() => undefined);
  return task;
}

previewZoomOutBtn.addEventListener("click", () => setPreviewZoom(previewZoom - PREVIEW_ZOOM_STEP));
previewZoomResetBtn.addEventListener("click", () => setPreviewZoom(1));
previewZoomInBtn.addEventListener("click", () => setPreviewZoom(previewZoom + PREVIEW_ZOOM_STEP));

function confirmAction({ title, body, confirmLabel = t("ui.common.confirm") }) {
  confirmTitle.textContent = title; confirmBody.textContent = body; confirmAccept.textContent = confirmLabel;
  confirmDialog.returnValue = "cancel"; confirmDialog.showModal();
  return new Promise((resolve) => confirmDialog.addEventListener("close",
    () => resolve(confirmDialog.returnValue === "confirm"), { once: true }));
}

bindBtn.addEventListener("click", async () => {
  if (!selectedId) return;
  await saveTail;
  const id = selectedId, res = await fetch(`/api/agents/${encodeURIComponent(id)}/publish`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) return showError(data.error || t("ui.workbench.publish_failed"));
  replaceAgent(data); select(id, { reloadFace: true }); setSaveStatus(t("ui.workbench.published_done"), "saved");
});
unbindBtn.addEventListener("click", async () => {
  const agent = currentAgent(); if (!agent) return;
  const ok = await confirmAction({
    title: t("ui.workbench.deactivate_title"),
    body: t("ui.workbench.deactivate_body"),
    confirmLabel: t("ui.workbench.deactivate_confirm"),
  });
  if (!ok) return;
  const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/unpublish`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) return showError(data.error || t("ui.workbench.operation_failed"));
  replaceAgent(data); select(agent.id, { reloadFace: true });
});
addFieldButtons.forEach((button) => button.addEventListener("click", async () => {
  await saveTail;
  const agent = currentAgent(); if (!agent) return;
  const fields = [...(agent.fields || [])], control = button.dataset.addControl;
  const next = { id: nextFieldId(fields), label: t("ui.workbench.new_field", { index: fields.length + 1 }), control, required: control !== "grid" };
  if (control === "select" || control === "radio") next.options = [t("ui.workbench.option_one"), t("ui.workbench.option_two")];
  if (control === "grid") next.grid = defaultGrid();
  fields.push(next);
  addFieldMenuEl.open = false;
  await saveFields(fields, { selectionAfterSave: { kind: "field", fieldId: next.id } });
}));
copyExampleBtn.addEventListener("click", async () => {
  const agent = currentAgent(); if (!agent) return;
  if ((agent.fields || []).length) {
    const ok = await confirmAction({ title: "用例子覆蓋目前欄位？",
      body: "目前欄位將被一套完整的市場分析需求欄位替換；已發布版本和歷史提交不會立刻改變。", confirmLabel: "確認覆蓋" });
    if (!ok) return;
  }
  const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/copy-example`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) return showError(data.error || t("ui.workbench.copy_failed"));
  replaceAgent(data); select(agent.id, { reloadFace: true });
});
const ownerFlow = createOwnerFlow({
  onCreated(agent) {
    replaceAgent(agent); select(agent.id, { reloadFace: true });
  },
});
newWorkspaceBtn.addEventListener("click", () => {
  selectedId = null; activeView = "design"; renderList(); workspaceEl.hidden = true; onboardingEl.hidden = false; ownerFlow.showChoice();
});

agentSearchEl.addEventListener("input", renderList);
listFilterButtons.forEach((button) => button.addEventListener("click", () => {
  listFilter = button.dataset.listFilter;
  listFilterButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  renderList();
}));
recordsSearchEl.addEventListener("input", renderContract);
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
function setCanvasMode(mode, { focus = false } = {}) {
  if (!['design', 'preview'].includes(mode)) return;
  canvasMode = mode;
  for (const tab of canvasModeTabs) {
    const selected = tab.dataset.canvasMode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  $("face-wrap").setAttribute("aria-labelledby", `canvas-mode-${mode}`);
  const agent = currentAgent();
  if (agent) loadFace(agent, true);
  if (focus) canvasModeTabs.find((tab) => tab.dataset.canvasMode === mode)?.focus();
}
canvasModeTabs.forEach((tab) => tab.addEventListener("click", () => setCanvasMode(tab.dataset.canvasMode)));
$("canvas-mode-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = Math.max(0, canvasModeTabs.indexOf(document.activeElement));
  const next = event.key === "Home" ? 0
    : event.key === "End" ? canvasModeTabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + canvasModeTabs.length) % canvasModeTabs.length;
  setCanvasMode(canvasModeTabs[next].dataset.canvasMode, { focus: true });
});
inspectorToggleBtn.addEventListener("click", () => setInspectorOpen(!designerEl.classList.contains("inspector-open")));
refreshBtn.addEventListener("click", () => {
  if (currentFacePath) frameEl.src = `${currentFacePath}&r=${Date.now()}`;
});
userPageLink.addEventListener("click", (event) => {
  if (userPageLink.getAttribute("aria-disabled") === "true") event.preventDefault();
});
window.addEventListener("message", async (event) => {
  if (!event.data || event.data.type !== "form-studio:submitted") return;
  const id = String(event.data.agentId || "");
  const local = agents.find((agent) => agent.id === id);
  const envelope = event.data.envelope;
  if (local && envelope && !(local.inputBag || []).some((item) => item.submittedAt === envelope.submittedAt)) {
    local.inputBag = [...(local.inputBag || []), envelope];
    if (selectedId === id) renderContract();
  }
  const res = await fetch(`/api/agents/${encodeURIComponent(id)}`);
  if (!res.ok) return;
  replaceAgent(await res.json());
  renderList();
  if (selectedId === id) renderContract();
});
requireAuthorSession().then((session) => {
  if (!session) return;
  $("actor-name").textContent = session.actor.name || session.actor.id;
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
  loadAgents(defaultScenario).catch((error) => showError(error.message));
}).catch((error) => showError(error.message));
