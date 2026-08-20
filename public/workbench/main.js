import {
  CONTROLS,
  controlLabel,
  escapeHtml,
  isDirty,
  nextFieldId,
  originLabel,
  publicationState,
} from "/workbench/modules/form-model.js";
import { createOwnerFlow } from "/workbench/modules/owner-flow.js";
import { renderWorkspaceList } from "/workbench/modules/workspace-list.js";
import { requireAuthorSession } from "/workbench/modules/session-gate.js";

const $ = (id) => document.getElementById(id);
const listEl = $("agent-list"), hintEl = $("face-hint"), frameEl = $("face");
const ledgerEl = $("ledger"), bagEl = $("bag"), bindBtn = $("bind-btn"), unbindBtn = $("unbind-btn");
const stageTitle = $("stage-title"), stageStatus = $("stage-status"), saveStatusEl = $("save-status");
const publicationBadge = $("publication-badge"), designerEl = $("designer"), fieldListEl = $("field-list");
const addControlEl = $("add-control"), addFieldBtn = $("add-field"), copyExampleBtn = $("copy-example");
const agentSearchEl = $("agent-search"), newWorkspaceBtn = $("new-workspace-btn");
const actionErrorEl = $("action-error"), recordsEl = $("records"), recordsBtn = $("records-btn");
const recordsCloseBtn = $("records-close"), recordsScrim = $("records-scrim"), recordsSearchEl = $("records-search");
const recordCountEl = $("record-count"), refreshBtn = $("refresh-btn"), userPageLink = $("user-page-link");
const faceModeEl = $("face-mode"), splitterEl = $("splitter"), confirmDialog = $("confirm-dialog");
const confirmTitle = $("confirm-title"), confirmBody = $("confirm-body"), confirmAccept = $("confirm-accept");
const onboardingEl = $("onboarding"), workspaceEl = $("workspace"), ownerContextEl = $("owner-context");
const listCountEl = $("list-count"), listFilterButtons = [...document.querySelectorAll("[data-list-filter]")];

let agents = [], selectedId = null, currentFacePath = null;
let listFilter = "all";
let saveTail = Promise.resolve(), pendingSaves = 0;

function showError(message) {
  actionErrorEl.hidden = !message;
  actionErrorEl.textContent = message || "";
}
function setSaveStatus(text, state = "idle") {
  saveStatusEl.textContent = text;
  saveStatusEl.dataset.state = state;
}
async function loadAgents() {
  const res = await fetch("/api/agents");
  if (!res.ok) throw new Error("无法读取 agent");
  agents = await res.json();
  renderList(); renderDesigner(); renderContract(); updateStage(); updateActions();
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

function facePathFor(agent) {
  const draftPreview = !agent.binding || isDirty(agent);
  return { path: `${draftPreview ? "/preview/" : "/a/"}${encodeURIComponent(agent.id)}`, draftPreview };
}
function loadFace(agent, force = true) {
  if (!agent) return;
  const { path, draftPreview } = facePathFor(agent);
  currentFacePath = path;
  hintEl.hidden = true;
  if (force) {
    frameEl.hidden = true;
    frameEl.addEventListener("load", () => {
      if (currentFacePath === path) frameEl.hidden = false;
    }, { once: true });
    frameEl.src = `${path}?r=${Date.now()}`;
  } else {
    frameEl.hidden = false;
  }
  faceModeEl.textContent = draftPreview ? "草稿预览" : "已发布用户页面 · 可提交";
  faceModeEl.className = `face-mode ${draftPreview ? "draft" : "published"}`;
  userPageLink.href = `/a/${encodeURIComponent(agent.id)}`;
  const unavailable = !agent.binding;
  userPageLink.setAttribute("aria-disabled", String(unavailable));
  userPageLink.tabIndex = unavailable ? -1 : 0;
  refreshBtn.disabled = false;
}
function select(id, { reloadFace = true } = {}) {
  selectedId = id;
  const agent = currentAgent();
  onboardingEl.hidden = true; workspaceEl.hidden = false;
  renderList(); showError(""); renderDesigner(); renderContract(); updateStage(); updateActions();
  if (agent) loadFace(agent, reloadFace);
  if (!splitterEl.hidden && !isWideWorkspace()) resizeDesigner(designerEl.getBoundingClientRect().height);
  setSaveStatus(pendingSaves ? "保存中…" : "已保存", pendingSaves ? "saving" : "saved");
}

function updateStage() {
  const agent = currentAgent();
  if (!agent) {
    stageTitle.textContent = "先从左侧选一个，或新建一张表";
    publicationBadge.hidden = true;
    return;
  }
  const state = publicationState(agent);
  stageTitle.textContent = agent.name;
  const source = agent.sourceSystem === "poffices" ? "Poffices" : agent.origin === "born-form" ? "Form Studio" : "本地示例";
  const entry = agent.binding ? "本地旁路入口" : "仅本地草稿";
  const identityLabel = agent.sourceSystem === "poffices" ? "Poffices agent ID" : "本地页面 ID";
  ownerContextEl.innerHTML = `<span>${escapeHtml(source)}</span><span>${escapeHtml(originLabel(agent))}</span><span>${escapeHtml(entry)}</span>
    <details class="owner-details"><summary>页面身份</summary><span><b>${escapeHtml(identityLabel)}:</b><code>${escapeHtml(agent.id)}</code></span></details>`;
  publicationBadge.hidden = false;
  publicationBadge.textContent = state.label;
  publicationBadge.className = `status-badge ${state.className}`;
  if (isDirty(agent)) stageStatus.textContent = "改动已保存为草稿；用户入口仍显示上一已发布版本。再次发布后才会更新。";
  else if (agent.binding) stageStatus.textContent = "当前版本已发布到 Form Studio 本地入口；不修改 Poffices agent 本体。";
  else if ((agent.fields || []).length) stageStatus.textContent = "草稿已有字段，但用户入口尚未发布。";
  else stageStatus.textContent = agent.origin === "born-form"
    ? "这是 Form Studio 管理的新 agent form。先加字段，再发布用户页面；它不会自动连接 Poffices agent。"
    : "这是已有 Poffices agent 的本地改装页面。先加字段，再发布到 Form Studio 本地旁路入口。";
}
function updateActions() {
  const agent = currentAgent();
  if (!agent) {
    bindBtn.disabled = true; unbindBtn.disabled = true; unbindBtn.hidden = true; bindBtn.textContent = "发布用户页面";
    return;
  }
  const dirty = isDirty(agent), hasFields = (agent.fields || []).length > 0;
  bindBtn.disabled = !(hasFields && (!agent.binding || dirty));
  bindBtn.textContent = agent.binding
    ? dirty ? `发布新版本 v${agent.formVersion}` : `已发布 v${agent.published?.formVersion || agent.formVersion}`
    : "发布用户页面";
  unbindBtn.disabled = !agent.binding;
  unbindBtn.hidden = !agent.binding;
  unbindBtn.textContent = agent.origin === "born-form" ? "下架本地页面" : "解除本地绑定";
}

function renderDesigner() {
  const agent = currentAgent();
  if (!agent) {
    designerEl.hidden = true; fieldListEl.innerHTML = ""; splitterEl.hidden = true; return;
  }
  designerEl.hidden = false; splitterEl.hidden = false;
  const showIds = $("show-ids")?.checked;
  designerEl.classList.toggle("ids-visible", Boolean(showIds));
  const fields = agent.fields || [];
  if (!fields.length) {
    fieldListEl.innerHTML = `<p class="empty-state">还没有字段。可以添加字段，或复制完整示例作为起点。</p>`;
    return;
  }
  fieldListEl.innerHTML = fields.map((field, index) => {
    const options = field.control === "select"
      ? `<input class="design-options" data-k="options" data-index="${index}" value="${escapeAttr((field.options || []).join(", "))}" placeholder="选项，用逗号分开" aria-label="${escapeAttr(field.label)}的选项" />` : "";
    const controlOpts = CONTROLS.map((item) =>
      `<option value="${item.value}"${item.value === field.control ? " selected" : ""}>${item.label}</option>`).join("");
    return `<div class="design-row${field.control === "select" ? " with-options" : ""}" role="group" aria-label="字段 ${index + 1}：${escapeAttr(field.label)}">
      <div class="name-cell"><input data-k="label" data-index="${index}" value="${escapeAttr(field.label)}" aria-label="字段 ${index + 1} 的展示名称" placeholder="填写的人看到的名称" />
        <label class="id-line">稳定 ID<input class="field-id" data-k="id" data-index="${index}" value="${escapeAttr(field.id)}" aria-label="${escapeAttr(field.label)}的稳定 ID" /></label></div>
      <select data-k="control" data-index="${index}" aria-label="${escapeAttr(field.label)}的控件类型">${controlOpts}</select>
      <label class="required-toggle"><input data-k="required" data-index="${index}" type="checkbox"${field.required ? " checked" : ""} /> 必填</label>
      <button class="del" type="button" data-index="${index}" aria-label="删除字段 ${escapeAttr(field.label)}">删除</button>${options}</div>`;
  }).join("");
}
function readDesignerFields() {
  return [...fieldListEl.querySelectorAll(".design-row")].map((row) => {
    const field = {
      id: row.querySelector("[data-k=id]").value.trim(), label: row.querySelector("[data-k=label]").value.trim(),
      control: row.querySelector("[data-k=control]").value, required: row.querySelector("[data-k=required]").checked,
    };
    const optionsEl = row.querySelector("[data-k=options]");
    if (field.control === "select") field.options = optionsEl ? optionsEl.value : "";
    return field;
  });
}

function saveFields(fields) {
  if (!selectedId) return Promise.resolve(false);
  const agentId = selectedId, snapshot = JSON.parse(JSON.stringify(fields));
  pendingSaves += 1; setSaveStatus("保存中…", "saving");
  const task = saveTail.then(async () => {
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/fields`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: snapshot }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "保存失败");
      if (selectedId === agentId) setSaveStatus("保存失败，改动仍在本页", "error");
      return false;
    }
    replaceAgent(data); showError("");
    if (selectedId === agentId) {
      renderList(); renderDesigner(); renderContract(); updateStage(); updateActions(); loadFace(data, true);
    }
    return true;
  }).catch((error) => {
    showError(error.message || "保存失败");
    if (selectedId === agentId) setSaveStatus("保存失败，改动仍在本页", "error");
    return false;
  }).finally(() => {
    pendingSaves -= 1;
    if (selectedId === agentId && pendingSaves === 0 && !actionErrorEl.textContent) setSaveStatus("已保存", "saved");
  });
  saveTail = task.then(() => undefined);
  return task;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString("zh-CN", { hour12: false });
}
function renderContract() {
  const agent = currentAgent();
  if (!agent) {
    ledgerEl.innerHTML = `<span class="muted">还没选</span>`; bagEl.innerHTML = ""; recordCountEl.textContent = ""; return;
  }
  if (!agent.ledger) ledgerEl.innerHTML = `<span class="muted">还没有字段</span>`;
  else ledgerEl.innerHTML = `<div class="ledger-meta"><code>${escapeHtml(agent.ledger.ownerAgent)}</code><span>${escapeHtml(agent.ledger.status === "published" ? "已发布" : "草稿")} v${escapeHtml(agent.ledger.formVersion)}</span></div>${agent.ledger.fields.map((field) =>
    `<div class="field-row"><div><strong>${escapeHtml(field.label)}</strong><code>${escapeHtml(field.id)}</code></div><span>${escapeHtml(controlLabel(field.control))}${field.required ? " · 必填" : ""}</span></div>`).join("")}`;
  const all = [...(agent.inputBag || [])].reverse();
  const query = recordsSearchEl.value.trim().toLocaleLowerCase("zh-CN");
  const bag = all.filter((item) => !query || JSON.stringify(item).toLocaleLowerCase("zh-CN").includes(query));
  recordCountEl.textContent = query ? `${bag.length}/${all.length}` : `${all.length} 条`;
  if (!bag.length) {
    bagEl.innerHTML = `<p class="empty-state">${all.length ? "没有匹配的填写记录。" : "还没有提交。"}</p>`; return;
  }
  bagEl.innerHTML = bag.map((item) => {
    const values = Object.entries(item.values || {}).map(([id, value]) =>
      `<div class="value-row"><code>${escapeHtml(id)}</code> <span>${escapeHtml(String(value))}</span></div>`).join("");
    return `<section class="bag-item"><div class="bag-head"><strong>${escapeHtml(item.submitterId || "未知填写人")}</strong><time datetime="${escapeAttr(item.submittedAt || "")}">${escapeHtml(formatTime(item.submittedAt))}</time></div>
      <div class="envelope-meta">页面主人 <code>${escapeHtml(item.ownerAgent || agent.id)}</code> · 表 v${escapeHtml(item.formVersion || "?")}</div>${values}</section>`;
  }).join("");
}

function confirmAction({ title, body, confirmLabel = "确认" }) {
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
  if (!res.ok) return showError(data.error || "无法发布");
  replaceAgent(data); select(id, { reloadFace: true }); setSaveStatus("已发布", "saved");
});
unbindBtn.addEventListener("click", async () => {
  const agent = currentAgent(); if (!agent) return;
  const isBorn = agent.origin === "born-form";
  const ok = await confirmAction({
    title: isBorn ? "下架这个 agent form 的本地页面？" : "解除本地绑定？",
    body: `${isBorn ? "下架后 Form Studio 入口将无法打开它" : "解除后 Form Studio 入口将回到无表状态"}；已有提交信封仍保留在 inputBag。不会调用 Poffices 写接口。`,
    confirmLabel: isBorn ? "确认下架" : "确认解除本地绑定",
  });
  if (!ok) return;
  const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/unpublish`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) return showError(data.error || "操作失败");
  replaceAgent(data); select(agent.id, { reloadFace: true });
});
addFieldBtn.addEventListener("click", async () => {
  const agent = currentAgent(); if (!agent) return;
  const fields = [...(agent.fields || [])], control = addControlEl.value;
  const next = { id: nextFieldId(fields), label: `字段 ${fields.length + 1}`, control, required: true };
  if (control === "select") next.options = ["选项一", "选项二"];
  fields.push(next); await saveFields(fields);
});
copyExampleBtn.addEventListener("click", async () => {
  const agent = currentAgent(); if (!agent) return;
  if ((agent.fields || []).length) {
    const ok = await confirmAction({ title: "用例子覆盖当前字段？",
      body: "当前字段将被一套完整的市场分析需求字段替换；已发布版本和历史提交不会立刻改变。", confirmLabel: "确认覆盖" });
    if (!ok) return;
  }
  const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/copy-example`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) return showError(data.error || "复制失败");
  replaceAgent(data); select(agent.id, { reloadFace: true });
});
const ownerFlow = createOwnerFlow({
  onCreated(agent) {
    replaceAgent(agent); select(agent.id, { reloadFace: true });
  },
});
newWorkspaceBtn.addEventListener("click", () => {
  selectedId = null; renderList(); workspaceEl.hidden = true; onboardingEl.hidden = false; ownerFlow.showChoice();
});

fieldListEl.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-k]"); if (!input) return;
  if (input.dataset.k === "id") {
    const index = Number(input.dataset.index), oldId = currentAgent()?.fields?.[index]?.id || "", nextId = input.value.trim();
    if (oldId && nextId !== oldId) {
      const ok = await confirmAction({ title: "修改稳定 ID？",
        body: `历史提交仍保留旧键 ${oldId}；新提交将改用 ${nextId || "空 ID"}。展示文案应优先改 label。`, confirmLabel: "确认修改 ID" });
      if (!ok) { input.value = oldId; return; }
    }
  }
  await saveFields(readDesignerFields());
});
fieldListEl.addEventListener("click", async (event) => {
  const btn = event.target.closest(".del"); if (!btn) return;
  const index = Number(btn.dataset.index), agent = currentAgent(), field = agent?.fields?.[index];
  if (!agent || !field) return;
  const ok = await confirmAction({ title: `删除字段「${field.label}」？`,
    body: `草稿将不再包含稳定 ID ${field.id}；历史提交信封仍按旧 values[id] 保留。`, confirmLabel: "确认删除" });
  if (!ok) return;
  const fields = [...agent.fields]; fields.splice(index, 1); await saveFields(fields);
});

$("show-ids").addEventListener("change", (event) => {
  designerEl.classList.toggle("ids-visible", event.currentTarget.checked);
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
function setRecordsOpen(open) {
  recordsEl.hidden = !open; recordsScrim.hidden = !open;
  recordsBtn.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("records-open", open);
  if (open) recordsCloseBtn.focus(); else recordsBtn.focus();
}
recordsBtn.addEventListener("click", () => setRecordsOpen(recordsEl.hidden));
recordsCloseBtn.addEventListener("click", () => setRecordsOpen(false));
recordsScrim.addEventListener("click", () => setRecordsOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !recordsEl.hidden && !confirmDialog.open) setRecordsOpen(false);
});
refreshBtn.addEventListener("click", () => {
  if (currentFacePath) frameEl.src = `${currentFacePath}?r=${Date.now()}`;
});
userPageLink.addEventListener("click", (event) => {
  if (userPageLink.getAttribute("aria-disabled") === "true") event.preventDefault();
});

function resizeDesigner(next) {
  if (isWideWorkspace()) {
    designerEl.style.removeProperty("height");
    return;
  }
  const min = 160, max = Math.max(min, window.innerHeight - 300), height = Math.min(Math.max(next, min), max);
  designerEl.style.height = `${height}px`;
  splitterEl.setAttribute("aria-valuemin", String(min));
  splitterEl.setAttribute("aria-valuemax", String(max));
  splitterEl.setAttribute("aria-valuenow", String(Math.round(height)));
}
function isWideWorkspace() {
  return $("split").clientWidth >= 1280;
}
splitterEl.addEventListener("pointerdown", (event) => {
  if (isWideWorkspace()) return;
  event.preventDefault();
  const startY = event.clientY, startH = designerEl.getBoundingClientRect().height;
  document.body.classList.add("resizing");
  const move = (ev) => resizeDesigner(startH + ev.clientY - startY);
  const up = () => {
    document.body.classList.remove("resizing"); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
});
// WCAG 2.2 keyboard accessibility: https://www.w3.org/TR/WCAG22/#keyboard-accessible
splitterEl.addEventListener("keydown", (event) => {
  if (isWideWorkspace()) return;
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = designerEl.getBoundingClientRect().height;
  if (event.key === "ArrowUp") resizeDesigner(current - 24);
  if (event.key === "ArrowDown") resizeDesigner(current + 24);
  if (event.key === "Home") resizeDesigner(160);
  if (event.key === "End") resizeDesigner(window.innerHeight);
});
window.addEventListener("resize", () => {
  if (isWideWorkspace()) designerEl.style.removeProperty("height");
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
function escapeAttr(value) { return escapeHtml(value); }
requireAuthorSession().then((session) => {
  if (!session) return;
  $("actor-name").textContent = session.actor.name || session.actor.id;
  loadAgents().catch((error) => showError(error.message));
}).catch((error) => showError(error.message));
