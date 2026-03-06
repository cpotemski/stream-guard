export function createWorkerLogger(prefix, appendTelemetryEvent = null) {
  async function logWorkerEvent(event, details) {
    const payload = {
      timestamp: new Date().toISOString(),
      event,
      details
    };
    console.info(prefix, payload);

    if (typeof appendTelemetryEvent === "function") {
      try {
        await appendTelemetryEvent({
          source: "worker",
          event,
          details
        });
      } catch (_error) {
        // Never interrupt worker flow when telemetry persistence fails.
      }
    }
  }

  return {
    logWorkerEvent
  };
}
