const TELEMETRY_SCHEMA_VERSION = 1;
const DEFAULT_STORAGE_KEY = "twWatchGuardTelemetry";
const DEFAULT_MAX_EVENTS = 1000;
const QUOTA_EXCEEDED_FRAGMENT = "quota";
const DEFAULT_FLUSH_DELAY_MS = 5000;
const DEFAULT_EAGER_FLUSH_EVENT_COUNT = 25;

export function createTelemetryStore({
  storageKey = DEFAULT_STORAGE_KEY,
  maxEvents = DEFAULT_MAX_EVENTS,
  flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
  eagerFlushEventCount = DEFAULT_EAGER_FLUSH_EVENT_COUNT
} = {}) {
  let writeQueue = Promise.resolve();
  let cachedState = null;
  let flushTimeoutId = 0;
  let pendingEventCount = 0;

  async function readState() {
    if (cachedState) {
      return cachedState;
    }

    const stored = await chrome.storage.local.get(storageKey);
    cachedState = normalizeState(stored?.[storageKey], maxEvents);
    return cachedState;
  }

  async function writeState(state) {
    let nextState = normalizeState(state, maxEvents);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await chrome.storage.local.set({
          [storageKey]: nextState
        });
        cachedState = nextState;
        return nextState;
      } catch (error) {
        if (!isQuotaExceededError(error) || nextState.events.length <= 1) {
          throw error;
        }

        nextState = dropOldestHalf(nextState);
      }
    }

    await chrome.storage.local.set({
      [storageKey]: nextState
    });
    cachedState = nextState;
    return nextState;
  }

  function withWriteLock(task) {
    writeQueue = writeQueue
      .then(task)
      .catch(task);

    return writeQueue;
  }

  function clearScheduledFlush() {
    if (!flushTimeoutId) {
      return;
    }

    clearTimeout(flushTimeoutId);
    flushTimeoutId = 0;
  }

  async function flushPendingState() {
    clearScheduledFlush();

    if (!cachedState || pendingEventCount === 0) {
      return cachedState;
    }

    pendingEventCount = 0;
    return withWriteLock(async () => writeState(cachedState));
  }

  function scheduleFlush() {
    if (pendingEventCount >= eagerFlushEventCount) {
      void flushPendingState();
      return;
    }

    if (flushTimeoutId) {
      return;
    }

    flushTimeoutId = setTimeout(() => {
      void flushPendingState();
    }, flushDelayMs);
  }

  async function append(entry) {
    const state = await readState();
    const nextEntry = normalizeEntry(entry);
    if (!nextEntry) {
      return state;
    }

    const nextEvents = [...state.events, nextEntry];
    const overflowCount = Math.max(0, nextEvents.length - maxEvents);
    const trimmedEvents = overflowCount > 0
      ? nextEvents.slice(nextEvents.length - maxEvents)
      : nextEvents;

    cachedState = {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      maxEvents,
      createdAt: state.createdAt || nextEntry.timestamp,
      updatedAt: nextEntry.timestamp,
      droppedCount: state.droppedCount + overflowCount,
      events: trimmedEvents
    };
    pendingEventCount += 1;
    scheduleFlush();
    return cachedState;
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
      clearScheduledFlush();
      pendingEventCount = 0;
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

      const persistedState = await writeState(nextState);
      return {
        clearedEvents: state.events.length,
        droppedCount: persistedState.droppedCount
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

  async function compact() {
    return withWriteLock(async () => {
      clearScheduledFlush();
      pendingEventCount = 0;
      const state = await readState();
      return writeState(state);
    });
  }

  return {
    append,
    exportSnapshot,
    clear,
    getStats,
    compact
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

function isQuotaExceededError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.toLowerCase().includes(QUOTA_EXCEEDED_FRAGMENT);
}

function dropOldestHalf(state) {
  const dropCount = Math.max(1, Math.ceil(state.events.length / 2));
  const trimmedEvents = state.events.slice(dropCount);
  const latestEvent = trimmedEvents[trimmedEvents.length - 1] || null;
  const updatedAt = latestEvent?.timestamp || new Date().toISOString();

  return {
    ...state,
    updatedAt,
    droppedCount: state.droppedCount + dropCount,
    events: trimmedEvents
  };
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
