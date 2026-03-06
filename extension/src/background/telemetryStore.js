const TELEMETRY_SCHEMA_VERSION = 1;
const DEFAULT_STORAGE_KEY = "twWatchGuardTelemetry";
const DEFAULT_MAX_EVENTS = 5000;

export function createTelemetryStore({
  storageKey = DEFAULT_STORAGE_KEY,
  maxEvents = DEFAULT_MAX_EVENTS
} = {}) {
  let writeQueue = Promise.resolve();

  async function readState() {
    const stored = await chrome.storage.local.get(storageKey);
    return normalizeState(stored?.[storageKey], maxEvents);
  }

  async function writeState(state) {
    await chrome.storage.local.set({
      [storageKey]: state
    });
  }

  function withWriteLock(task) {
    writeQueue = writeQueue
      .then(task)
      .catch(task);

    return writeQueue;
  }

  async function append(entry) {
    return withWriteLock(async () => {
      const state = await readState();
      const nextEntry = normalizeEntry(entry);
      const nextEvents = [...state.events, nextEntry];
      const overflowCount = Math.max(0, nextEvents.length - maxEvents);
      const trimmedEvents = overflowCount > 0
        ? nextEvents.slice(nextEvents.length - maxEvents)
        : nextEvents;

      const nextState = {
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        maxEvents,
        createdAt: state.createdAt || nextEntry.timestamp,
        updatedAt: nextEntry.timestamp,
        droppedCount: state.droppedCount + overflowCount,
        events: trimmedEvents
      };

      await writeState(nextState);
      return nextState;
    });
  }

  async function exportSnapshot() {
    const state = await readState();
    const manifestVersion = chrome.runtime.getManifest()?.version || "unknown";

    return {
      exportedAt: new Date().toISOString(),
      extensionVersion: manifestVersion,
      telemetry: state
    };
  }

  async function clear() {
    return withWriteLock(async () => {
      const state = await readState();
      const nowIso = new Date().toISOString();
      const nextState = {
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        maxEvents,
        createdAt: nowIso,
        updatedAt: nowIso,
        droppedCount: state.droppedCount,
        events: []
      };

      await writeState(nextState);
      return {
        clearedEvents: state.events.length
      };
    });
  }

  async function getStats() {
    const state = await readState();
    return {
      eventCount: state.events.length,
      droppedCount: state.droppedCount,
      updatedAt: state.updatedAt
    };
  }

  return {
    append,
    exportSnapshot,
    clear,
    getStats
  };
}

function normalizeState(value, maxEvents) {
  const source = value && typeof value === "object" ? value : {};
  const events = Array.isArray(source.events)
    ? source.events.map(normalizeEntry).filter(Boolean)
    : [];
  const trimmedEvents = events.slice(Math.max(0, events.length - maxEvents));
  const droppedByTrim = Math.max(0, events.length - trimmedEvents.length);
  const createdAt = asIsoString(source.createdAt) || new Date().toISOString();
  const updatedAt = asIsoString(source.updatedAt) || createdAt;
  const droppedCount = Math.max(
    0,
    Math.round(Number(source.droppedCount) || 0)
  ) + droppedByTrim;

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    maxEvents,
    createdAt,
    updatedAt,
    droppedCount,
    events: trimmedEvents
  };
}

function normalizeEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const timestamp = asIsoString(source.timestamp) || new Date().toISOString();
  const event = String(source.event || "").trim().slice(0, 120);
  if (!event) {
    return null;
  }

  const normalized = {
    timestamp,
    source: normalizeSource(source.source),
    event,
    details: normalizeDetails(source.details)
  };

  if (source.context && typeof source.context === "object") {
    normalized.context = normalizeDetails(source.context);
  }

  return normalized;
}

function normalizeSource(source) {
  const normalized = String(source || "").toLowerCase();
  return normalized || "worker";
}

function asIsoString(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeDetails(details, depth = 0) {
  if (depth > 4) {
    return "[max-depth]";
  }

  if (details === null || details === undefined) {
    return null;
  }

  if (typeof details === "string") {
    return details.slice(0, 400);
  }

  if (typeof details === "number" || typeof details === "boolean") {
    return details;
  }

  if (Array.isArray(details)) {
    return details.slice(0, 30).map((item) => normalizeDetails(item, depth + 1));
  }

  if (typeof details === "object") {
    const entries = Object.entries(details).slice(0, 40);
    return Object.fromEntries(
      entries.map(([key, value]) => [
        String(key).slice(0, 80),
        normalizeDetails(value, depth + 1)
      ])
    );
  }

  return String(details).slice(0, 200);
}
