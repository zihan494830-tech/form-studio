function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sameDefinition(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
