export function createAgentInputRelay({ repository, port, now = () => new Date().toISOString(), maxAttempts = 5 }) {
  let running = false;
  return {
    async runOnce({ limit = 20 } = {}) {
      if (running) return [];
      running = true;
      const outcomes = [];
      try {
        const ready = repository.listDeliveries({ statuses: ["pending", "failed", "delivering"], limit })
          .filter((event) => event.attempts < maxAttempts);
        for (const candidate of ready) {
          const event = repository.claimDelivery(candidate.id, now());
          if (!event) continue;
          try {
            const receipt = await port.deliver(event);
            const delivered = repository.finishDelivery(event.id, {
              status: "delivered", at: now(), receipt,
            });
            outcomes.push(delivered);
          } catch (error) {
            const failed = repository.finishDelivery(event.id, {
              status: "failed", at: now(), error: String(error?.message || error).slice(0, 500),
            });
            outcomes.push(failed);
          }
        }
        return outcomes;
      } finally {
        running = false;
      }
    },
  };
}
