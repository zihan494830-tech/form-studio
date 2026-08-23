/**
 * 使用面提交：浏览器 checkValidity 拦空/非法；通过才 POST。
 * 禁止 alert / confirm。成功后轻回执，并通知工作台刷新袋子。
 */
import { t } from "/presentation/messages/zh-HK.mjs";

(() => {
  const form = document.getElementById("agent-form");
  if (!form) return;

  const agentId = form.getAttribute("data-owner-agent");
  const agentName = form.getAttribute("data-agent-name") || agentId;
  const receipt = document.getElementById("receipt");
  const button = form.querySelector("[type=submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = t("ui.face.submitting");
    }
    if (receipt) {
      receipt.classList.remove("show", "error");
      receipt.textContent = "";
    }

    const values = {};
    for (const el of form.elements) {
      if (!el.name || el.type === "submit") continue;
      if (el.type === "checkbox") {
        values[el.name] = el.checked ? "true" : "false";
        continue;
      }
      if (el.type === "radio") {
        if (el.checked) values[el.name] = String(el.value ?? "");
        continue;
      }
      values[el.name] = String(el.value ?? "");
    }

    try {
      const res = await fetch(`/submit/${encodeURIComponent(agentId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values,
          formVersion: Number(form.getAttribute("data-form-version") || "1"),
        }),
      });
      if (!res.ok) {
        let message = t("ui.face.submit_failed");
        try {
          const data = await res.json();
          if (data.error) message = data.error;
        } catch {
          // 非 JSON 错误仍给用户可恢复的反馈。
        }
        if (receipt) {
          receipt.textContent = message;
          receipt.classList.add("show", "error");
        }
        return;
      }
      const result = await res.json();
      if (receipt) {
        receipt.textContent = result.delivery?.status === "pending"
          ? t("ui.face.saved_pending", { agent: agentName })
          : t("ui.face.saved", { agent: agentName });
        receipt.classList.remove("error");
        receipt.classList.add("show");
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "form-studio:submitted", agentId, envelope: result.envelope },
          "*",
        );
      }
    } catch {
      if (receipt) {
        receipt.textContent = t("ui.face.network_error");
        receipt.classList.add("show", "error");
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = t("ui.face.submit");
      }
    }
  });
})();
