/**
 * 把字段列表渲成使用面 HTML。必须能被 engine 抽出同一份账本。
 * 空字段保持为空；金稿只允许由 fixture 或显式“从例子复制”引入。
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function controlHtml(field) {
  const id = escapeHtml(field.id);
  const req = field.required ? " required" : "";
  if (field.control === "textarea") {
    return `<textarea id="${id}" name="${id}"${req}></textarea>`;
  }
  if (field.control === "select") {
    const options = (field.options && field.options.length
      ? field.options
      : ["选项一", "选项二"]
    ).map((opt) => {
      const v = escapeHtml(opt);
      return `<option value="${v}">${v}</option>`;
    });
    return `<select id="${id}" name="${id}"${req}><option value="">请选择</option>${options.join("")}</select>`;
  }
  if (field.control === "checkbox") {
    return `<input id="${id}" name="${id}" type="checkbox" value="true"${req} />`;
  }
  const type = field.control === "number" ? "number" : "text";
  const extra = type === "text" ? ` autocomplete="off"` : "";
  return `<input id="${id}" name="${id}" type="${type}"${req}${extra} />`;
}

export function renderFormHtml(agent, fields, { formVersion, preview = false } = {}) {
  const list = Array.isArray(fields) ? fields : [];
  const version = formVersion || agent.formVersion || 1;
  const rows = list
    .map((field) => {
      const reqMark = field.required
        ? ` <span class="req">*</span>`
        : "";
      return `<div class="field-group" role="group" aria-labelledby="label-${escapeHtml(field.id)}">
        <label id="label-${escapeHtml(field.id)}" for="${escapeHtml(field.id)}">${escapeHtml(field.label)}${reqMark}</label>
        ${controlHtml(field)}
      </div>`;
    })
    .join("\n      ");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(agent.name || agent.id)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f1eb;
      --card: #fff;
      --ink: #171717;
      --muted: #5c5c5c;
      --line: #d6d3cb;
      --accent: #1d4ed8;
      --on-accent: #fff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 16px/1.5 "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    .top {
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--line);
      background: #fff;
    }
    .kicker {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .top h1 { margin: 0.15rem 0 0; font-size: 1.05rem; font-weight: 650; }
    main { max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
    .lead { color: var(--muted); margin: 0 0 1.1rem; font-size: 0.95rem; }
    .preview-note {
      margin: 0 0 1rem;
      padding: 0.65rem 0.75rem;
      color: #854d0e;
      background: #fef9c3;
      border: 1px solid #fde047;
      border-radius: 6px;
    }
    form {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 1.25rem;
    }
    label { display: block; font-weight: 600; margin: 0 0 0.35rem; }
    .field-group { margin-bottom: 1rem; }
    .req { color: #b91c1c; }
    input[type="text"],
    input[type="number"],
    select,
    textarea {
      width: 100%;
      font: inherit;
      padding: 0.5rem 0.6rem;
      border: 1px solid #171717;
      background: #fff;
      margin-bottom: 0;
      border-radius: 4px;
    }
    input[type="checkbox"] { margin: 0; }
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    input:user-invalid,
    select:user-invalid,
    textarea:user-invalid {
      outline: 2px solid #b91c1c;
      outline-offset: 1px;
    }
    textarea { min-height: 6rem; resize: vertical; }
    #agent-form button {
      width: 100%;
      font: inherit;
      font-weight: 650;
      padding: 0.65rem;
      border: 0;
      border-radius: 6px;
      background: var(--accent);
      color: var(--on-accent);
      cursor: pointer;
    }
    #agent-form button:disabled { opacity: 0.65; cursor: not-allowed; }
    .receipt {
      display: none;
      margin: 0 0 1rem;
      padding: 0.6rem 0.75rem;
      border: 1px solid #bbf7d0;
      background: #ecfdf3;
      color: #14532d;
      border-radius: 6px;
    }
    .receipt.show { display: block; }
    .receipt.error { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="top">
    <p class="kicker">打开时看到的页面</p>
    <h1 id="face-title">${escapeHtml(agent.name || agent.id)}</h1>
  </div>
  <main>
    ${preview ? `<p class="preview-note" role="status">这是作者草稿预览，不是已发布用户入口，不能提交。</p>` : ""}
    <p class="lead">${preview ? "检查字段名称、类型和顺序；发布后用户才会看到这一版。" : "请填完后提交。空着或格式不对，交不出去。"}</p>
    <p id="receipt" class="receipt" role="status"></p>
    <form
      id="agent-form"
      data-owner-agent="${escapeHtml(agent.id)}"
      data-agent-name="${escapeHtml(agent.name || agent.id)}"
      data-form-version="${escapeHtml(String(version))}"
    >
      <input type="hidden" name="submitterId" value="student-mock-1" />
      ${rows}
      ${preview ? `<button type="button" disabled>预览不可提交</button>` : `<button type="submit">提交</button>`}
    </form>
  </main>
  ${preview ? "" : `<script src="/runtime/face-submit.js"></script>`}
</body>
</html>
`;
}
