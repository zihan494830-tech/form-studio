function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 兼容既有 agent repository port，同时把逻辑 inputBag 投影自独立 submission repository。
 * application/domain 不需要知道物理迁移细节。
 */
export function createSubmissionAwareAgentRepository({ agents, submissions, now = () => new Date().toISOString() }) {
  function stripBag(agent) {
    return { ...clone(agent), inputBag: [] };
  }

  function hydrate(agent) {
    if (!agent) return null;
    const inputBag = submissions.list({ ownerAgent: agent.id }).map((record) => record.envelope);
    return { ...clone(agent), inputBag };
  }

  function migrate(agent) {
    const legacy = Array.isArray(agent.inputBag) ? agent.inputBag : [];
    if (!legacy.length) return agent;
    submissions.importLegacy(agent.id, legacy);
    return agents.save({
      ...stripBag(agent),
      submissionMigration: {
        version: "input-bag-to-submission-record/v1",
        migratedAt: now(),
        count: legacy.length,
      },
    });
  }

  function migrateAll() {
    agents.list().forEach(migrate);
  }

  migrateAll();

  return {
    list() {
      return agents.list().map(hydrate);
    },
    get(id) {
      return hydrate(agents.get(id));
    },
    save(agent) {
      return hydrate(agents.save(stripBag(agent)));
    },
    appendEnvelope(agentId, envelope, { actor = null, scope = null } = {}) {
      if (!agents.get(agentId)) return null;
      submissions.append({
        ownerAgent: agentId,
        receivedAt: envelope.submittedAt,
        actor,
        scope,
        envelope,
      });
      return this.get(agentId);
    },
    nextBornFormId() {
      return agents.nextBornFormId();
    },
    listSubmissions(query = {}) {
      return submissions.list(query);
    },
    getSubmission(id) {
      return submissions.get(id);
    },
    reset() {
      submissions.reset();
      agents.reset();
      migrateAll();
      return this.list();
    },
    close() {
      submissions.close?.();
      agents.close?.();
    },
  };
}
