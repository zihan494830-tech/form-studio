function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sameDefinition(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function knownPublishedDefinitions(agent) {
  const byVersion = new Map();
  for (const definition of Array.isArray(agent?.publishedDefinitions) ? agent.publishedDefinitions : []) {
    if (Number.isInteger(definition?.formVersion) && definition.formVersion > 0) {
      byVersion.set(definition.formVersion, clone(definition));
    }
  }
  if (Number.isInteger(agent?.published?.formVersion) && agent.published.formVersion > 0) {
    byVersion.set(agent.published.formVersion, clone(agent.published));
  }
  return [...byVersion.values()].sort((left, right) => left.formVersion - right.formVersion);
}

/**
 * Public release labels are a projection over provable immutable definitions.
 * Internal integer formVersion remains the storage/submission contract key.
 */
export function releaseHistory(agent) {
  return knownPublishedDefinitions(agent).map((definition, index) => ({
    formVersion: definition.formVersion,
    releaseVersion: `v1.${index}`,
  }));
}

export function releaseVersionForFormVersion(agent, formVersion) {
  const version = Number(formVersion);
  return releaseHistory(agent).find((item) => item.formVersion === version)?.releaseVersion || null;
}

export function currentReleaseVersion(agent) {
  return releaseVersionForFormVersion(agent, agent?.published?.formVersion);
}

/**
 * Published definitions are immutable snapshots keyed by formVersion.
 * The current `published` pointer may move, while historical submissions
 * always resolve through the version carried by their envelope.
 */
export function publishedDefinitionForVersion(agent, formVersion) {
  const version = Number(formVersion);
  if (!Number.isInteger(version) || version < 1) return null;
  const history = Array.isArray(agent?.publishedDefinitions) ? agent.publishedDefinitions : [];
  const historical = history.find((item) => item?.formVersion === version);
  if (historical) return clone(historical);
  if (agent?.published?.formVersion === version) return clone(agent.published);
  return null;
}

export function appendPublishedDefinition(agent, definition) {
  const history = Array.isArray(agent?.publishedDefinitions)
    ? clone(agent.publishedDefinitions)
    : [];
  if (agent?.published && !history.some((item) => item.formVersion === agent.published.formVersion)) {
    history.push(clone(agent.published));
  }
  const existing = history.find((item) => item.formVersion === definition.formVersion);
  if (existing && !sameDefinition(existing, definition)) {
    return { conflict: true, publishedDefinitions: history };
  }
  if (!existing) history.push(clone(definition));
  history.sort((left, right) => left.formVersion - right.formVersion);
  return { conflict: false, publishedDefinitions: history };
}
