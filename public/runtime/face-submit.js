/**
 * 使用面提交：浏览器 checkValidity 拦空/非法；通过才 POST。
 * 禁止 alert / confirm。成功后轻回执，并通知工作台刷新袋子。
 */
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
      button.textContent = "提交中…";
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
        let message = "提交失败，请检查后重试。";
        try {
          const data = await res.json();
          if (data.error) message = data.error;
        } catch {
          // 非 JSON 错误仍给用户可恢复的反馈。
        }
        if (receipt) {
          receipt.textContent = message;
          if (res.status === 401 || res.status === 403) {
            const link = document.createElement("a");
            link.href = `/session?next=${encodeURIComponent(`/a/${agentId}`)}`;
            link.textContent = "选择学生身份";
            link.style.marginLeft = "0.6em";
            receipt.append(link);
          }
          receipt.classList.add("show", "error");
        }
        return;
      }
      const result = await res.json();
      if (receipt) {
        receipt.textContent = result.delivery?.status === "pending"
          ? `提交已保存，正在交给 ${agentName}`
          : `提交已保存到 ${agentName}`;
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
        receipt.textContent = "网络异常，提交信封没有入袋。请重试。";
        receipt.classList.add("show", "error");
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "提交";
      }
    }
  });
})();
