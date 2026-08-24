import { locale, t } from "/presentation/messages/zh-HK.mjs";

const pageList = document.getElementById("page-list");
const submissionList = document.getElementById("submission-list");
const detailEl = document.getElementById("submission-detail");
const recordsTitle = document.getElementById("records-title");
const actorFilter = document.getElementById("actor-filter");
let selectedAgent = "";
let selectedRecord = "";
let loadSequence = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  })[char]);
}

function timeText(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "")
    : date.toLocaleString(locale, { hour12: false });
}

function fieldValueText(field) {
  if (field.control === "checkbox") return t(field.value === "true" ? "ui.common.yes" : "ui.common.no");
  return field.value;
}

async function json(url) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error(t("ui.common.network_error"));
  }
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    location.assign("/");
    throw new Error(t("ui.classroom.teacher_required"));
  }
  if (!response.ok) throw new Error(body?.error || `${t("ui.common.read_failed")} (HTTP ${response.status})`);
  return body;
}

function setActive(selector, id) {
  document.querySelectorAll(selector).forEach((button) => {
    const active = button.dataset.id === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function loadDetail(id) {
  selectedRecord = id;
  setActive(".submission-button", id);
  detailEl.innerHTML = `<p class="state">${t("ui.classroom.loading_detail")}</p>`;
  try {
    const { record } = await json(`/api/teacher/submissions/${encodeURIComponent(id)}`);
    if (selectedRecord !== id) return;
    const deliveryLabels = {
      pending: t("ui.classroom.delivery_pending"),
      delivering: t("ui.classroom.delivery_delivering"),
      delivered: t("ui.classroom.delivery_delivered"),
      failed: t("ui.classroom.delivery_failed"),
      not_configured: t("ui.classroom.delivery_none"),
    };
    detailEl.innerHTML = `<div class="detail-meta">
      <strong>${escapeHtml(record.actorName)}${record.actorName === record.actorId ? "" : ` <code>${escapeHtml(record.actorId)}</code>`}</strong>
      <time datetime="${escapeHtml(record.receivedAt)}">${escapeHtml(timeText(record.receivedAt))}</time>
      <span>${escapeHtml(record.pageName)} · 表單版本 ${escapeHtml(record.formVersion)}</span>
      <span class="delivery-status ${escapeHtml(record.delivery.status)}">${escapeHtml(deliveryLabels[record.delivery.status] || record.delivery.status)}${record.delivery.target ? ` · ${escapeHtml(record.delivery.target)}` : ""}</span>
    </div><dl>${record.fields.map((field) => `<div><dt>${escapeHtml(field.label)}<code>${escapeHtml(field.id)}</code></dt><dd>${escapeHtml(fieldValueText(field)) || t("ui.classroom.empty_value")}</dd></div>`).join("")}</dl>`;
  } catch (error) {
    detailEl.innerHTML = `<p class="state error">${escapeHtml(error.message)}</p>`;
  }
}

async function loadSubmissions(agentId) {
  const sequence = ++loadSequence;
  selectedAgent = agentId;
  selectedRecord = "";
  setActive(".page-button", agentId);
  actorFilter.disabled = false;
  submissionList.innerHTML = `<p class="state">${t("ui.classroom.loading_records")}</p>`;
  detailEl.innerHTML = `<p class="state">${t("ui.classroom.choose_record")}</p>`;
  const query = actorFilter.value.trim();
  try {
    const result = await json(`/api/teacher/agents/${encodeURIComponent(agentId)}/submissions${query ? `?actorId=${encodeURIComponent(query)}` : ""}`);
    if (sequence !== loadSequence) return;
    recordsTitle.textContent = result.page.name;
    document.getElementById("records-context").textContent = t("ui.classroom.record_context", {
      count: result.records.length,
      ownerAgent: result.page.ownerAgent,
      version: result.page.formVersion,
    });
    submissionList.innerHTML = result.records.length ? result.records.map((record) => `
      <button class="submission-button" type="button" data-id="${escapeHtml(record.id)}" aria-pressed="false">
        <span><strong>${escapeHtml(record.actorName)}</strong><small>${record.actorName === record.actorId ? "" : `${escapeHtml(record.actorId)} · `}${escapeHtml(record.id)} · ${t("ui.classroom.field_count", { count: escapeHtml(record.fieldCount) })}</small></span>
        <time datetime="${escapeHtml(record.receivedAt)}">${escapeHtml(timeText(record.receivedAt))}</time>
      </button>`).join("") : `<p class="state empty">${query ? t("ui.classroom.no_actor_submissions") : t("ui.classroom.no_submissions")}</p>`;
  } catch (error) {
    if (sequence === loadSequence) submissionList.innerHTML = `<p class="state error">${escapeHtml(error.message)}</p>`;
  }
}

async function init() {
  try {
    const session = await json("/api/session?audience=authoring");
    if (session.actor?.role !== "teacher") return location.assign("/");
    document.getElementById("actor-name").textContent = session.actor.name || session.actor.id;
    document.getElementById("classroom-name").textContent = session.classroom?.name || session.actor.scope.classId;
    const { agents } = await json("/api/teacher/agents");
    document.getElementById("page-count").textContent = t("ui.classroom.page_count", { count: agents.length });
    pageList.innerHTML = agents.length ? agents.map((agent) => `
      <button class="page-button" type="button" data-id="${escapeHtml(agent.ownerAgent)}" aria-pressed="false">
        <span><strong>${escapeHtml(agent.name)}</strong><small>ownerAgent ${escapeHtml(agent.ownerAgent)} · 表單版本 ${escapeHtml(agent.formVersion)}</small></span>
        <b>${escapeHtml(agent.submissionCount)}</b>
      </button>`).join("") : `<p class="state empty">${t("ui.classroom.no_pages")}</p>`;
    const initial = agents.find((agent) => agent.submissionCount > 0) || agents[0];
    if (initial) loadSubmissions(initial.ownerAgent);
  } catch (error) {
    pageList.innerHTML = `<p class="state error">${escapeHtml(error.message)}</p>`;
  }
}

pageList.addEventListener("click", (event) => {
  const button = event.target.closest(".page-button");
  if (button) loadSubmissions(button.dataset.id);
});
submissionList.addEventListener("click", (event) => {
  const button = event.target.closest(".submission-button");
  if (button) loadDetail(button.dataset.id);
});
actorFilter.addEventListener("input", () => {
  clearTimeout(actorFilter._timer);
  actorFilter._timer = setTimeout(() => selectedAgent && loadSubmissions(selectedAgent), 220);
});

init();
