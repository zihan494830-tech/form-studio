/**
 * 从页面抽出字段账本。机器不发明栏；控件 name = 字段 id。
 * 没有 ownerAgent 的账本非法。
 */
import { parseHTML } from "linkedom";

const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

export function extractFromHtml(html) {
  const { document } = parseHTML(html);
  const form = document.querySelector("form");
  if (!form) {
    throw new Error("金稿里没有 form");
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

  for (const el of form.querySelectorAll("input, textarea, select")) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (el.tagName === "INPUT" && SKIP_TYPES.has(type)) continue;

    const id = el.getAttribute("name");
    if (!id) continue;

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
    fields.push(field);
  }

  const submitBtn = form.querySelector("button[type=submit], input[type=submit]");
  const submitLabel = submitBtn
    ? (submitBtn.textContent || submitBtn.getAttribute("value") || "提交").trim()
    : "提交";

  return {
    version: "form-ledger/v1",
    ownerAgent,
    formVersion: Number.isFinite(formVersion) && formVersion >= 1 ? formVersion : 1,
    status: "published",
    fields,
    submit: { label: submitLabel, to: "agent-input" },
  };
}

function controlOf(el, type) {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (type === "checkbox") return "checkbox";
  if (type === "number") return "number";
  return "text";
}

function readLabel(form, el, id) {
  const byFor = form.querySelector(`label[for="${id}"]`);
  if (byFor) {
    return byFor.textContent.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  }
  const parent = el.parentElement;
  if (parent && parent.tagName === "LABEL") {
    return parent.textContent.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  }
  return id;
}
