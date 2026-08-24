import { defaultSubmissionManagement } from "../domain/submission/submission-management.mjs";

export function createSqliteSubmissionManagementStore(database, {
  encode,
  decode,
  submissionExists,
  sequenceOf,
}) {
  const managementBySubmission = database.prepare("SELECT * FROM submission_management WHERE submission_sequence = ?");
  const saveManagement = database.prepare(`
    INSERT INTO submission_management (
      submission_sequence, status, note, tags_json, assignee, archived_at,
      revision, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_sequence) DO UPDATE SET
      status = excluded.status, note = excluded.note, tags_json = excluded.tags_json,
      assignee = excluded.assignee, archived_at = excluded.archived_at,
      revision = excluded.revision, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `);
  const correctionsBySubmission = database.prepare("SELECT * FROM submission_corrections WHERE submission_sequence = ? ORDER BY sequence");
  const correctionBySequence = database.prepare("SELECT * FROM submission_corrections WHERE sequence = ?");
  const insertCorrection = database.prepare(`
    INSERT INTO submission_corrections (
      submission_sequence, reason, changes_json, created_at, actor_id, actor_name
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertAudit = database.prepare(`
    INSERT INTO submission_management_audit (
      submission_sequence, revision, action, actor_id, occurred_at, detail_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const auditBySubmission = database.prepare("SELECT * FROM submission_management_audit WHERE submission_sequence = ? ORDER BY sequence");

  function managementFromRow(submissionId, row) {
    return row ? {
      submissionId,
      status: row.status,
      note: row.note,
      tags: decode(row.tags_json) || [],
      assignee: row.assignee,
      archivedAt: row.archived_at,
      revision: row.revision,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    } : defaultSubmissionManagement(submissionId);
  }

  function correctionFromRow(row) {
    return row ? {
      id: `correction-${row.sequence}`,
      reason: row.reason,
      changes: decode(row.changes_json),
      createdAt: row.created_at,
      actorId: row.actor_id,
      actorName: row.actor_name,
    } : null;
  }

  function save(sequence, management) {
    saveManagement.run(
      sequence, management.status, management.note, encode(management.tags), management.assignee,
      management.archivedAt, management.revision, management.updatedAt, management.updatedBy,
    );
  }

  return {
    getManagement(submissionId) {
      const sequence = sequenceOf(submissionId, "submission");
      return sequence ? managementFromRow(submissionId, managementBySubmission.get(sequence)) : null;
    },
    updateManagement(submissionId, next, { expectedRevision, actorId, at }) {
      const sequence = sequenceOf(submissionId, "submission");
      if (!sequence || !submissionExists(sequence)) return null;
      database.exec("BEGIN IMMEDIATE");
      try {
        const current = managementFromRow(submissionId, managementBySubmission.get(sequence));
        if (current.revision !== expectedRevision) {
          database.exec("ROLLBACK");
          return { preconditionFailed: true, currentRevision: current.revision };
        }
        const saved = { ...next, submissionId, revision: current.revision + 1, updatedAt: at, updatedBy: actorId };
        save(sequence, saved);
        insertAudit.run(sequence, saved.revision, "management_updated", actorId, at, encode(saved));
        database.exec("COMMIT");
        return saved;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    listCorrections(submissionId) {
      const sequence = sequenceOf(submissionId, "submission");
      return sequence ? correctionsBySubmission.all(sequence).map(correctionFromRow) : [];
    },
    appendCorrection(submissionId, correction, { expectedRevision }) {
      const sequence = sequenceOf(submissionId, "submission");
      if (!sequence || !submissionExists(sequence)) return null;
      database.exec("BEGIN IMMEDIATE");
      try {
        const current = managementFromRow(submissionId, managementBySubmission.get(sequence));
        if (current.revision !== expectedRevision) {
          database.exec("ROLLBACK");
          return { preconditionFailed: true, currentRevision: current.revision };
        }
        const result = insertCorrection.run(
          sequence, correction.reason, encode(correction.changes), correction.createdAt,
          correction.actorId, correction.actorName,
        );
        const item = correctionFromRow(correctionBySequence.get(result.lastInsertRowid));
        const management = { ...current, revision: current.revision + 1, updatedAt: correction.createdAt, updatedBy: correction.actorId };
        save(sequence, management);
        insertAudit.run(sequence, management.revision, "correction_added", correction.actorId, correction.createdAt, encode({ correctionId: item.id }));
        database.exec("COMMIT");
        return { correction: item, management };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    listManagementAudit(submissionId) {
      const sequence = sequenceOf(submissionId, "submission");
      return sequence ? auditBySubmission.all(sequence).map((row) => ({
        id: `management-audit-${row.sequence}`,
        submissionId,
        revision: row.revision,
        action: row.action,
        actorId: row.actor_id,
        occurredAt: row.occurred_at,
        detail: decode(row.detail_json),
      })) : [];
    },
  };
}
