import { escapeHtml } from "/workbench/modules/form-model.js";
import { t } from "/presentation/messages/zh-HK.mjs";

const $ = (id) => document.getElementById(id);

export function createOwnerFlow({ onCreated }) {
  const choice = $("path-choice"), retrofit = $("retrofit-flow"), born = $("born-flow");
  const retrofitStart = $("retrofit-start"), bornStart = $("born-start");
  const identityId = $("identity-id"), identityButton = $("identity-check-btn");
  const identityResult = $("identity-result"), localCopyStep = $("local-copy-step");
  const createRetrofit = $("create-retrofit-btn");
  const newName = $("new-name"), createBorn = $("create-btn"), bornStatus = $("born-status");
  let verifiedIdentity = null;

  function setPanel(panel) {
    choice.hidden = panel !== "choice";
    retrofit.hidden = panel !== "retrofit";
    born.hidden = panel !== "born";
    retrofitStart.setAttribute("aria-expanded", String(panel === "retrofit"));
    bornStart.setAttribute("aria-expanded", String(panel === "born"));
    const target = panel === "retrofit" ? identityId : panel === "born" ? newName : retrofitStart;
    queueMicrotask(() => target.focus());
  }

  function resetIdentity() {
    verifiedIdentity = null;
    identityResult.dataset.state = "idle";
    identityResult.textContent = "";
    localCopyStep.hidden = true;
    createRetrofit.disabled = true;
  }

  function showChoice() {
    resetIdentity();
    bornStatus.textContent = "";
    setPanel("choice");
  }

  function renderIdentity(identity) {
    verifiedIdentity = identity;
    identityResult.dataset.state = "verified";
    identityResult.innerHTML = `<div class="identity-card">
      <div><span class="context-label">候選主人</span><strong>${escapeHtml(identity.name)}</strong></div>
      <span class="identity-state source">${identity.official ? "Official · 只讀來源" : "Poffices · 只讀來源"}</span>
      <span class="identity-state eligible">可建立隔離的本地頁面</span>
      <dl><div><dt>Poffices agent ID:</dt><dd>${escapeHtml(identity.ownerAgent)}</dd></div>
      <div><dt>來源:</dt><dd>Poffices · 只讀</dd></div></dl>
      <p><strong>不會改動 Poffices。</strong>Form Studio 只引用這個 agent ID，在自己的資料域內管理頁面、版本和提交。</p>
    </div>`;
    localCopyStep.hidden = false;
    createRetrofit.disabled = false;
    createRetrofit.focus();
  }

  async function checkIdentity() {
    const id = identityId.value.trim();
    resetIdentity();
    identityButton.disabled = true;
    identityResult.dataset.state = "loading";
    identityResult.textContent = t("ui.owner.lookup");
    try {
      const response = await fetch(`/api/owner-identities/poffices/${encodeURIComponent(id)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("ui.owner.lookup_failed"));
      renderIdentity(result.identity);
    } catch (error) {
      identityResult.dataset.state = "error";
      identityResult.textContent = error.message || t("ui.owner.lookup_failed");
    } finally {
      identityButton.disabled = false;
    }
  }

  async function createRetrofitWorkspace() {
    if (!verifiedIdentity) return;
    createRetrofit.disabled = true;
    identityResult.dataset.state = "loading";
    identityResult.textContent = t("ui.owner.creating_workspace");
    try {
      const response = await fetch("/api/retrofits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAgent: verifiedIdentity.ownerAgent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("ui.owner.workspace_failed"));
      onCreated(result);
    } catch (error) {
      identityResult.dataset.state = "error";
      identityResult.textContent = error.message || t("ui.owner.workspace_failed");
      createRetrofit.disabled = false;
    }
  }

  async function createBornWorkspace() {
    createBorn.disabled = true;
    bornStatus.textContent = t("ui.owner.creating");
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("ui.owner.create_failed"));
      newName.value = "";
      bornStatus.textContent = "";
      onCreated(result);
    } catch (error) {
      bornStatus.textContent = error.message || t("ui.owner.create_failed");
    } finally {
      createBorn.disabled = false;
    }
  }

  retrofitStart.addEventListener("click", () => setPanel("retrofit"));
  bornStart.addEventListener("click", () => setPanel("born"));
  document.querySelectorAll("[data-back-to-paths]").forEach((button) => button.addEventListener("click", showChoice));
  identityButton.addEventListener("click", checkIdentity);
  identityId.addEventListener("keydown", (event) => { if (event.key === "Enter") checkIdentity(); });
  createRetrofit.addEventListener("click", createRetrofitWorkspace);
  createBorn.addEventListener("click", createBornWorkspace);
  newName.addEventListener("keydown", (event) => { if (event.key === "Enter") createBornWorkspace(); });

  return { showChoice };
}
