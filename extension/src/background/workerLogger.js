export function createWorkerLogger(
  prefix,
  appendTelemetryEvent = null,
  {
    shouldMirrorToConsole = defaultShouldMirrorToConsole,
    shouldPersistEvent = defaultShouldPersistEvent
  } = {}
) {
  async function logWorkerEvent(event, details) {
    const payload = {
      timestamp: new Date().toISOString(),
      event,
      details
    };
    if (shouldMirrorToConsole(event, details)) {
      console.info(prefix, payload);
    }

    if (typeof appendTelemetryEvent === "function" && shouldPersistEvent(event, details)) {
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

function defaultShouldMirrorToConsole() {
  return true;
}

function defaultShouldPersistEvent() {
  return true;
}
