/**
 * 从页面抽出字段账本。机器不发明栏；控件 name = 字段 id。
 * grid 以 fieldset[data-grid] 声明，逐格交叉校验后重建声明；
 * radio 组按 name 合并为单个字段。没有 ownerAgent 的账本非法。
 */
import { parseHTML } from "linkedom";
import { normalizeFields } from "../form/field-contract.mjs";
import { expandFields } from "../form/expand-fields.mjs";

const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

export function extractFromHtml(html) {
  const { document } = parseHTML(html);
  const form = document.querySelector("form");
  if (!form) {
    throw new Error("已发布页面里没有 form");
  }
  return extract(form);
}

export function extract(form) {
  const ownerAgent = form.getAttribute("data-owner-agent");
  if (!ownerAgent) {
    throw new Error("没有 ownerAgent 的账本非法");
  }
  const formVersion = Number(form.getAttribute("data-form-version") || "1");
  const fields = [];
  const covered = new Set();
  const ordered = [];
  const radioSeen = new Set();

  for (const node of form.querySelectorAll("fieldset[data-grid], input, textarea, select")) {
    if (node.tagName === "FIELDSET") {
      ordered.push({ kind: "field", field: extractGrid(form, node) });
      for (const el of node.querySelectorAll("input, textarea, select")) covered.add(el);
      continue;
    }
    if (covered.has(node)) continue;
    const type = (node.getAttribute("type") || "text").toLowerCase();
    if (node.tagName === "INPUT" && SKIP_TYPES.has(type)) continue;
    const id = node.getAttribute("name");
    if (!id) continue;
    if (type === "radio") {
      if (!radioSeen.has(id)) {
        radioSeen.add(id);
        ordered.push({ kind: "radio", id });
      }
      continue;
    }
    ordered.push({ kind: "field", field: fieldFromElement(form, node, id, type) });
  }

  const radioGroups = new Map();
  for (const el of form.querySelectorAll('input[type="radio"]')) {
    const id = el.getAttribute("name");
    if (!id || covered.has(el)) continue;
    if (!radioGroups.has(id)) radioGroups.set(id, []);
    radioGroups.get(id).push(el);
  }

  for (const entry of ordered) {
    if (entry.kind === "field") {
      fields.push(entry.field);
      continue;
    }
    const group = radioGroups.get(entry.id) || [];
    fields.push({
      id: entry.id,
      label: readLabel(form, group[0], entry.id),
      control: "radio",
      required: group.some((el) => el.hasAttribute("required")),
      options: [...new Set(group.map((el) => (el.getAttribute("value") || "").trim()).filter(Boolean))],
    });
  }

  const submitBtn = form.querySelector("button[type=submit], input[type=submit]");
  const submitLabel = submitBtn
    ? (submitBtn.textContent || submitBtn.getAttribute("value") || "提交").trim()
    : "提交";
  const normalized = normalizeFields(fields);
  if (normalized.errorCode) throw new Error(`表单账本损坏：${normalized.errorCode}`);

  return {
    version: "form-ledger/v1",
    ownerAgent,
    formVersion: Number.isFinite(formVersion) && formVersion >= 1 ? formVersion : 1,
    status: "published",
    fields: normalized.fields,
    submit: { label: submitLabel, to: "agent-input" },
  };
}

function extractGrid(form, fieldset) {
  const gridId = fieldset.getAttribute("data-field-id");
  if (!gridId) throw new Error("grid 声明缺失 data-field-id");
  const rows = [...fieldset.querySelectorAll("tbody tr")].map((row) => {
    const header = row.querySelector("th[data-grid-row-id]");
    if (!header) throw new Error(`grid 行声明缺失：${gridId}`);
    return { id: header.getAttribute("data-grid-row-id"), label: cleanLabel(header.textContent) };
  });
  const columnHeaders = [...fieldset.querySelectorAll("thead th[data-grid-column-id]")];
  const columns = columnHeaders.map((header) => {
    const id = header.getAttribute("data-grid-column-id");
    const cellId = `${gridId}_${rows[0]?.id || ""}_${id}`;
    const shape = cellShape(fieldset, cellId);
    return { id, label: cleanLabel(header.textContent), ...shape };
  });
  const legend = fieldset.querySelector("legend");
  const label = legend ? cleanLabel(legend.textContent) : readLabel(form, fieldset, gridId);
  const normalized = normalizeFields([{ id: gridId, label, control: "grid", required: false, grid: { rows, columns } }]);
  if (normalized.errorCode) throw new Error(`grid 声明损坏：${gridId} (${normalized.errorCode})`);
  const definition = normalized.fields[0];
  const expanded = expandFields([definition]);
  if (expanded.errorCode) throw new Error(`grid 声明损坏：${gridId} (${expanded.errorCode})`);
  const expectedIds = new Set(expanded.fields.map((field) => field.id));
  for (const cell of expanded.fields) {
    const actual = cellShape(fieldset, cell.id);
    if (actual.control !== cell.control) throw new Error(`grid 格控件类型不符：${cell.id}`);
    if (actual.required !== cell.required) throw new Error(`grid 格必填不符：${cell.id}`);
    if (JSON.stringify(actual.options || []) !== JSON.stringify(cell.options || [])) {
      throw new Error(`grid 格选项不符：${cell.id}`);
    }
    if ((actual.decimals ?? 0) !== (cell.decimals ?? 0)) throw new Error(`grid 格 step 不符：${cell.id}`);
  }
  for (const el of fieldset.querySelectorAll("input, textarea, select")) {
    const name = el.getAttribute("name");
    if (name && !expectedIds.has(name)) throw new Error(`grid 含未声明格：${name}`);
  }
  return definition;
}

function namedControls(root, name) {
  return [...root.querySelectorAll("input, textarea, select")].filter((el) => el.getAttribute("name") === name);
}

function cellShape(fieldset, cellId) {
  const els = namedControls(fieldset, cellId);
  if (!els.length) throw new Error(`grid 格缺失：${cellId}`);
  const first = els[0];
  const type = (first.getAttribute("type") || "text").toLowerCase();
  const control = type === "radio" ? "radio" : controlOf(first, type);
  if (control === "radio" ? els.some((el) => (el.getAttribute("type") || "").toLowerCase() !== "radio") : els.length !== 1) {
    throw new Error(`grid 格控件数量不符：${cellId}`);
  }
  const shape = { control, required: els.some((el) => el.hasAttribute("required")) };
  if (control === "radio") {
    shape.options = els.map((el) => (el.getAttribute("value") || "").trim()).filter(Boolean);
  } else if (control === "select") {
    shape.options = [...first.querySelectorAll("option")]
      .map((opt) => (opt.getAttribute("value") ?? opt.textContent ?? "").trim()).filter(Boolean);
  } else if (control === "number") {
    const decimals = decimalsFromStep(first.getAttribute("step"), cellId);
    if (decimals !== null) shape.decimals = decimals;
  }
  return shape;
}

function fieldFromElement(form, el, id, type) {
  const field = {
    id,
    label: readLabel(form, el, id),
    control: controlOf(el, type),
    required: el.hasAttribute("required"),
  };
  if (field.control === "select") {
    field.options = [...el.querySelectorAll("option")]
      .map((opt) => (opt.getAttribute("value") ?? opt.textContent ?? "").trim())
      .filter(Boolean);
  }
  if (field.control === "number") {
    const decimals = decimalsFromStep(el.getAttribute("step"), id);
    if (decimals !== null) field.decimals = decimals;
  }
  return field;
}

function decimalsFromStep(step, id) {
  if (!step) return null;
  const numeric = Number(step);
  for (let decimals = 0; decimals <= 6; decimals += 1) {
    if (Math.abs(numeric - (10 ** -decimals)) <= Number.EPSILON * 8) return decimals;
  }
  throw new Error(`number step 不支持：${id}`);
}

function controlOf(el, type) {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (type === "checkbox") return "checkbox";
  if (type === "number") return "number";
  return "text";
}

function cleanLabel(text) {
  return text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function readLabel(form, el, id) {
  const byFor = form.querySelector(`label[for="${id}"]`);
  if (byFor) {
    return cleanLabel(byFor.textContent);
  }
  const byId = form.querySelector(`#label-${id}`);
  if (byId) {
    return cleanLabel(byId.textContent);
  }
  const parent = el?.parentElement;
  if (parent && parent.tagName === "LABEL") {
    return cleanLabel(parent.textContent);
  }
  return id;
}
