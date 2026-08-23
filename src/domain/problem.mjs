export function problem(errorCode, status, parameters = {}) {
  return {
    errorCode: String(errorCode || "internal_error"),
    parameters: { ...parameters },
    status: Number(status) || 500,
  };
}
