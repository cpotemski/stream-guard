export function createWorkerLogger(prefix) {
  async function logWorkerEvent(event, details) {
    const payload = {
      timestamp: new Date().toISOString(),
      event,
      details
    };
    console.info(prefix, payload);
  }

  return {
    logWorkerEvent
  };
}
