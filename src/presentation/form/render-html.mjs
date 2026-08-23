/**
 * 把字段列表渲成使用面 HTML。必须能被 engine 抽出同一份账本。
 * 空字段保持为空；示例字段只允许由 fixture 或显式“从例子复制”引入。
 */
import { locale, t } from "../messages/zh-HK.mjs";
import { expandFields } from "../../domain/form/expand-fields.mjs";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function controlHtml(field, { labelledBy = "" } = {}) {
  const id = escapeHtml(field.id);
  const req = field.required ? " required" : "";
  const aria = labelledBy ? ` aria-labelledby="${escapeHtml(labelledBy)}"` : "";
  if (field.control === "textarea") {
    return `<textarea id="${id}" name="${id}"${req}${aria}></textarea>`;
  }
  if (field.control === "select") {
    const options = (field.options && field.options.length
      ? field.options
      : ["選項一", "選項二"]
    ).map((opt) => {
      const v = escapeHtml(opt);
      return `<option value="${v}">${v}</option>`;
    });
    return `<select id="${id}" name="${id}"${req}${aria}><option value="">${t("ui.face.select")}</option>${options.join("")}</select>`;
  }
  if (field.control === "radio") {
    const options = field.options && field.options.length ? field.options : ["選項一", "選項二"];
    const radios = options
      .map((opt, index) => {
        const v = escapeHtml(opt);
        const optionId = `option-${id}-${index + 1}`;
        const optionAria = labelledBy ? ` aria-labelledby="${escapeHtml(`${labelledBy} ${optionId}`)}"` : "";
        return `<label class="radio-item"><input type="radio" name="${id}" value="${v}"${req}${optionAria} /><span id="${optionId}">${v}</span></label>`;
      })
      .join("");
    return `<div class="radio-group"${aria ? ` role="group"${aria}` : ""}>${radios}</div>`;
  }
  if (field.control === "checkbox") {
    return `<input id="${id}" name="${id}" type="checkbox" value="true"${req}${aria} />`;
  }
  const type = field.control === "number" ? "number" : "text";
  const step = field.control === "number" && Number.isInteger(field.decimals)
    ? ` step="${Math.pow(10, -field.decimals)}"`
    : "";
  const extra = type === "text" ? ` autocomplete="off"` : "";
  return `<input id="${id}" name="${id}" type="${type}"${req}${step}${extra}${aria} />`;
}

function gridHtml(field, cells) {
  const gridId = escapeHtml(field.id);
  const headers = '<th scope="col" aria-hidden="true"></th>'
    + (field.grid?.columns || [])
      .map((column) => `<th id="${gridId}-col-${escapeHtml(column.id)}" scope="col" data-grid-column-id="${escapeHtml(column.id)}">${escapeHtml(column.label)}${column.required ? ' <span class="req">*</span>' : ""}</th>`)
      .join("");
  const body = (field.grid?.rows || [])
    .map((row) => {
      const rowCells = (field.grid?.columns || [])
        .map((column) => {
          const cell = cells.get(`${field.id}_${row.id}_${column.id}`);
          if (!cell) throw new Error(`grid 格缺失：${field.id}_${row.id}_${column.id}`);
          // Concatenate the grid, row and column labels as in W3C ARIA9's table-input example:
          // https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA9.html
          const labelledBy = `label-${field.id} ${field.id}-row-${row.id} ${field.id}-col-${column.id}`;
          return `<td>${controlHtml(cell, { labelledBy })}</td>`;
        })
        .join("");
      return `<tr><th id="${gridId}-row-${escapeHtml(row.id)}" scope="row" data-grid-row-id="${escapeHtml(row.id)}">${escapeHtml(row.label)}</th>${rowCells}</tr>`;
    })
    .join("");
  const minWidth = 7 + ((field.grid?.columns || []).length * 10);
  return `<fieldset class="field-grid" data-field-id="${gridId}" data-grid>
      <legend id="label-${gridId}">${escapeHtml(field.label)}</legend>
      <div class="grid-scroll"><table class="grid-table" aria-labelledby="label-${gridId}" style="--grid-min-width:${minWidth}rem">
        <thead><tr>${headers}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </fieldset>`;
}

function submitAreaHtml({ preview, publishedPreview, authoringMode }) {
  if (!preview) return `<button type="submit">${t("ui.face.submit")}</button>`;
  const state = authoringMode === "design"
    ? "design"
    : publishedPreview ? "published" : "draft";
  return `<p class="preview-submit-note">${t(`ui.face.preview_${state}_note`)}</p>
            <button type="button" disabled>${t(`ui.face.preview_${state}_submit`)}</button>`;
}

export function renderFormHtml(agent, fields, { formVersion, preview = false, publishedPreview = false, authoringMode = null } = {}) {
  const list = Array.isArray(fields) ? fields : [];
  const version = formVersion || agent.formVersion || 1;
  const expanded = expandFields(list);
  if (expanded.errorCode) throw new Error(`字段展开失败：${expanded.errorCode}`);
  const gridCells = new Map(expanded.fields.filter((field) => field.grid).map((field) => [field.id, field]));
  const rows = list
    .map((field) => {
      if (field.control === "grid") return gridHtml(field, gridCells);
      const reqMark = field.required
        ? ` <span class="req">*</span>`
        : "";
      const id = escapeHtml(field.id);
      const label = escapeHtml(field.label);
      if (field.control === "radio") {
        return `<fieldset class="field-group field-radio" data-field-id="${id}">
        <legend id="label-${id}">${label}${reqMark}</legend>
        ${controlHtml(field)}
      </fieldset>`;
      }
      return `<div class="field-group field-${escapeHtml(field.control)}" data-field-id="${id}" role="group" aria-labelledby="label-${id}">
        <label id="label-${id}" for="${id}">${label}${reqMark}</label>
        ${controlHtml(field)}
      </div>`;
    })
    .join("\n      ");

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(agent.name || agent.id)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #edf4f2;
      --card: #fff;
      --ink: #17332e;
      --muted: #61736f;
      --line: #d6e2df;
      --line-strong: #aebfbb;
      --accent: #0f766e;
      --accent-hover: #115e59;
      --on-accent: #fff;
      --danger: #b42318;
      --shadow: 0 26px 70px rgba(23, 51, 46, 0.13);
    }
    * { box-sizing: border-box; }
    html { min-height: 100%; }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 82% 4%, rgba(15, 118, 110, 0.11), transparent 30rem),
        linear-gradient(145deg, #f8fbfa 0%, var(--bg) 100%);
      font: 16px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    }
    main {
      width: min(100% - 2rem, 48rem);
      margin: 0 auto;
      padding: clamp(1rem, 3vw, 2rem) 0;
    }
    body[data-authoring-mode] main { width: min(100% - 1.5rem, 58rem); }
    .form-shell {
      overflow: hidden;
      background: var(--card);
      border: 1px solid rgba(174, 191, 187, 0.78);
      border-radius: 1.25rem;
      box-shadow: var(--shadow);
    }
    .top {
      position: relative;
      padding: clamp(1.25rem, 3vw, 2rem) clamp(1.25rem, 4vw, 2.5rem) 1.4rem;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(223, 245, 240, 0.88), rgba(255, 255, 255, 0.98) 62%);
    }
    .top::before {
      content: "";
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      height: 0.35rem;
      background: var(--accent);
    }
    .kicker {
      margin: 0 0 0.45rem;
      color: var(--accent);
      font-size: 0.75rem;
      font-weight: 750;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .top h1 {
      max-width: 34rem;
      margin: 0;
      font-size: clamp(1.6rem, 3.5vw, 2.1rem);
      font-weight: 720;
      line-height: 1.16;
      letter-spacing: -0.025em;
    }
    .form-meta { max-width: 36rem; margin: 0.55rem 0 0; color: var(--muted); font-size: 0.88rem; }
    .form-body { padding: clamp(1.25rem, 3vw, 2rem) clamp(1.25rem, 4vw, 2.5rem) clamp(1.75rem, 4vw, 2.6rem); }
    .lead { margin: 0 0 1.6rem; color: var(--muted); font-size: 0.98rem; }
    form { margin: 0; }
    .field-group { margin: 0; padding: 0 0 1.45rem; }
    .field-group + .field-group { padding-top: 0.1rem; }
    label { display: block; margin: 0 0 0.48rem; font-size: 1rem; font-weight: 680; }
    .req { color: var(--danger); }
    input[type="text"], input[type="number"], select, textarea {
      width: 100%;
      min-height: 3rem;
      margin: 0;
      padding: 0.7rem 0.8rem;
      color: var(--ink);
      background: #fff;
      border: 1px solid var(--line-strong);
      border-radius: 0.55rem;
      box-shadow: inset 0 1px 1px rgba(23, 51, 46, 0.035);
      font: inherit;
    }
    input[type="checkbox"] { width: 1.25rem; height: 1.25rem; margin: 0.25rem 0 0; accent-color: var(--accent); }
    input[type="radio"] { width: 1.15rem; height: 1.15rem; margin: 0; accent-color: var(--accent); }
    .field-radio { min-inline-size: 0; border: 0; margin: 0; padding: 0 0 1.45rem; }
    .field-radio legend { display: block; margin: 0 0 0.48rem; padding: 0; font-size: 1rem; font-weight: 680; }
    .radio-group { display: flex; flex-direction: column; gap: 0.55rem; }
    .radio-item { display: flex; align-items: center; gap: 0.55rem; margin: 0; font-weight: 500; }
    .field-grid { min-inline-size: 0; border: 0; margin: 0; padding: 0 0 1.45rem; }
    .field-grid legend { display: block; margin: 0 0 0.48rem; font-size: 1rem; font-weight: 680; }
    .grid-scroll {
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      border-radius: 0.45rem;
      overscroll-behavior-inline: contain;
    }
    .grid-table {
      width: 100%;
      min-width: var(--grid-min-width, 100%);
      table-layout: fixed;
      border-collapse: collapse;
      background: #fff;
      font-size: 0.9rem;
    }
    .grid-table th, .grid-table td {
      border: 1px solid #ced9d6;
      padding: 0.45rem 0.5rem;
      text-align: left;
      vertical-align: middle;
    }
    .grid-table thead th {
      background: #f6f8f7;
      color: #29423d;
      font-size: 0.86rem;
      font-weight: 680;
      line-height: 1.35;
      text-align: center;
    }
    .grid-table thead th:first-child,
    .grid-table tbody th { width: 6.25rem; }
    .grid-table tbody th {
      background: #fafbfa;
      font-size: 0.88rem;
      font-weight: 680;
      white-space: nowrap;
    }
    .grid-table td { background: #fff; }
    .grid-table input[type="text"],
    .grid-table input[type="number"],
    .grid-table select,
    .grid-table textarea {
      min-height: 2.625rem;
      padding: 0.48rem 0.58rem;
      border-color: #c5d2cf;
      border-radius: 0.38rem;
      box-shadow: none;
      font-size: 0.92rem;
    }
    .grid-table textarea { min-height: 4.75rem; }
    .grid-table .radio-group { gap: 0.3rem; }
    input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
      border-color: var(--accent);
      outline: 3px solid rgba(15, 118, 110, 0.24);
      outline-offset: 1px;
    }
    input:user-invalid, select:user-invalid, textarea:user-invalid {
      outline: 2px solid var(--danger);
      outline-offset: 1px;
    }
    textarea { min-height: 7.5rem; resize: vertical; }
    .form-footer { margin-top: 0.35rem; padding-top: 1.4rem; border-top: 1px solid var(--line); }
    .required-note { margin: 0 0 0.8rem; color: var(--muted); font-size: 0.82rem; }
    .preview-submit-note { margin: 0 0 0.75rem; color: var(--muted); font-size: 0.86rem; line-height: 1.45; }
    #agent-form button {
      width: 100%;
      min-height: 3.1rem;
      padding: 0.75rem 1rem;
      color: var(--on-accent);
      background: var(--accent);
      border: 1px solid var(--accent);
      border-radius: 0.65rem;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }
    #agent-form button:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
    #agent-form button:disabled { opacity: 0.65; cursor: not-allowed; }
    .receipt {
      display: none;
      margin: 0 0 1rem;
      padding: 0.85rem 1rem;
      color: #14532d;
      background: #ecfdf3;
      border: 1px solid #bbf7d0;
      border-radius: 0.75rem;
    }
    .receipt.show { display: block; }
    ${preview && authoringMode === "design" ? `
    body[data-authoring-mode="design"] [data-field-id] { cursor: pointer; border-radius: 0.55rem; transition: outline-color 120ms ease, background-color 120ms ease; }
    body[data-authoring-mode="design"] [data-field-id]:hover { outline: 1px solid #7cb8ae; outline-offset: 0.35rem; }
    body[data-authoring-mode="design"] [data-field-id]:focus-visible,
    body[data-authoring-mode="design"] [data-grid-row-id]:focus-visible,
    body[data-authoring-mode="design"] [data-grid-column-id]:focus-visible { outline: 2px solid var(--accent); outline-offset: 0.2rem; }
    body[data-authoring-mode="design"] [data-authoring-selected="field"],
    body[data-authoring-mode="design"] [data-authoring-selected="grid"] { outline: 2px solid var(--accent); outline-offset: 0.4rem; background: rgba(223, 245, 240, 0.2); }
    body[data-authoring-mode="design"] tr[data-authoring-selected="row"] > *,
    body[data-authoring-mode="design"] [data-authoring-selected="column"] { background: #dff5f0 !important; }
    body[data-authoring-mode="design"] [data-authoring-selected="row-header"],
    body[data-authoring-mode="design"] [data-authoring-selected="column-header"] { color: #075e57; box-shadow: inset 0 0 0 2px var(--accent); }
    body[data-authoring-mode="design"] input,
    body[data-authoring-mode="design"] textarea,
    body[data-authoring-mode="design"] select,
    body[data-authoring-mode="design"] button { pointer-events: none; }
    ` : ""}
    .receipt.error { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    @media (max-width: 34rem) {
      main { width: min(100% - 1rem, 48rem); padding: 0.5rem 0; }
      .form-shell { border-radius: 0.9rem; }
      .top { padding-top: 2.25rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
    }
  </style>
</head>
<body${preview && authoringMode ? ` data-authoring-mode="${escapeHtml(authoringMode)}"` : ""}>
  <main>
    <article class="form-shell" aria-labelledby="face-title">
      <header class="top">
        <p class="kicker">${t("ui.face.kicker")}</p>
        <h1 id="face-title">${escapeHtml(agent.name || agent.id)}</h1>
        <p class="form-meta">${t("ui.face.form_meta")}</p>
      </header>
      <div class="form-body">
        ${preview ? "" : `<p class="lead">${t("ui.face.lead")}</p>`}
        <p id="receipt" class="receipt" role="status"></p>
        <form
          id="agent-form"
          data-owner-agent="${escapeHtml(agent.id)}"
          data-agent-name="${escapeHtml(agent.name || agent.id)}"
          data-form-version="${escapeHtml(String(version))}"
        >
          <div class="fields-stack">${rows}</div>
          <div class="form-footer">
            <p class="required-note">${t("ui.face.required_note")}</p>
            ${submitAreaHtml({ preview, publishedPreview, authoringMode })}
          </div>
        </form>
      </div>
    </article>
  </main>
  ${preview ? "" : `<script type="module" src="/runtime/face-submit.js"></script>`}
</body>
</html>
`;
}
