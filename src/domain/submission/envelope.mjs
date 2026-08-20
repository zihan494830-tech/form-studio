/**
 * 把表上的值封成交接信封。键是字段 id，不是中文标签。
 */
const META = new Set(["submitterId"]);

export function valuesFromFormData(data) {
  const values = {};
  let submitterId = "student-mock-1";
  for (const [key, value] of data.entries()) {
    if (META.has(key)) {
      submitterId = String(value);
      continue;
    }
    values[key] = String(value);
  }
  return { values, submitterId };
}

export function makeEnvelope({ ownerAgent, formVersion, submitterId, values }) {
  return {
    ownerAgent,
    formVersion: Number(formVersion) || 1,
    submittedAt: new Date().toISOString(),
    submitterId: submitterId || "student-mock-1",
    values: { ...values },
  };
}
