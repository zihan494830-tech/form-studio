import { problem } from "../problem.mjs";

export const SUBMISSION_STATUSES = Object.freeze(["new", "in_review", "processed"]);

function cleanText(value) {
  return String(value ?? "").trim();
}

export function defaultSubmissionManagement(submissionId) {
  return {
    submissionId: String(submissionId),
    status: "new",
    note: "",
    tags: [],
    assignee: null,
    archivedAt: null,
    revision: 1,
    updatedAt: null,
    updatedBy: null,
  };
}

export function normalizeSubmissionManagement(current, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return problem("submission_management_invalid", 400);
  }
  const next = { ...current };
  if (Object.hasOwn(patch, "status")) {
    if (!SUBMISSION_STATUSES.includes(patch.status)) return problem("submission_status_invalid", 400);
    next.status = patch.status;
  }
  if (Object.hasOwn(patch, "note")) {
    const note = String(patch.note ?? "");
    if (note.length > 4000) return problem("submission_note_too_long", 400);
    next.note = note;
  }
  if (Object.hasOwn(patch, "tags")) {
    if (!Array.isArray(patch.tags) || patch.tags.length > 20) return problem("submission_tags_invalid", 400);
    const tags = [...new Set(patch.tags.map(cleanText))];
    if (tags.some((tag) => tag.length < 1 || tag.length > 40)) return problem("submission_tags_invalid", 400);
    next.tags = tags;
  }
  if (Object.hasOwn(patch, "assignee")) {
    const assignee = patch.assignee == null ? "" : cleanText(patch.assignee);
    if (assignee.length > 120) return problem("submission_assignee_invalid", 400);
    next.assignee = assignee || null;
  }
  if (Object.hasOwn(patch, "archived")) {
    if (typeof patch.archived !== "boolean") return problem("submission_archive_invalid", 400);
    next.archivedAt = patch.archived ? (patch.archivedAt || new Date().toISOString()) : null;
  }
  return { management: next };
}

export function normalizeCorrection(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return problem("submission_correction_invalid", 400);
  const reason = cleanText(raw.reason);
  if (reason.length < 1 || reason.length > 500) return problem("submission_correction_reason_invalid", 400);
  if (!raw.changes || typeof raw.changes !== "object" || Array.isArray(raw.changes) || !Object.keys(raw.changes).length) {
    return problem("submission_correction_changes_required", 400);
  }
  return { correction: { reason, changes: { ...raw.changes } } };
}

export function applySubmissionCorrections(originalValues, corrections) {
  return (corrections || []).reduce(
    (values, correction) => ({ ...values, ...(correction.changes || {}) }),
    { ...(originalValues || {}) },
  );
}
