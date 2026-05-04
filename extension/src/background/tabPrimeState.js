export function createTabPrimeStateStore() {
  const primeStateByTabId = new Map();

  function reset(tabId) {
    if (!Number.isInteger(tabId)) {
      return createDefaultPrimeState();
    }

    const nextState = createDefaultPrimeState();
    primeStateByTabId.set(tabId, nextState);
    return { ...nextState };
  }

  function read(tabId) {
    if (!Number.isInteger(tabId)) {
      return createDefaultPrimeState();
    }

    const current = primeStateByTabId.get(tabId);
    if (!current) {
      return reset(tabId);
    }

    return { ...current };
  }

  function markContentReady(tabId) {
    update(tabId, {
      contentReady: true
    });
  }

  function markPlaybackReady(tabId) {
    update(tabId, {
      playbackReady: true
    });
  }

  function markStreakAttempted(tabId) {
    update(tabId, {
      streakAttempted: true
    });
  }

  function clear(tabId) {
    if (!Number.isInteger(tabId)) {
      return;
    }

    primeStateByTabId.delete(tabId);
  }

  function update(tabId, patch) {
    if (!Number.isInteger(tabId)) {
      return;
    }

    const current = primeStateByTabId.get(tabId) || createDefaultPrimeState();
    primeStateByTabId.set(tabId, {
      ...current,
      ...patch
    });
  }

  return {
    reset,
    read,
    markContentReady,
    markPlaybackReady,
    markStreakAttempted,
    clear
  };
}

export function evaluateManagedTabPrimeBarrier({
  elapsedMs,
  primeState,
  playbackState,
  playbackStableForMs,
  playbackStableWindowMs,
  streakValue,
  streakTimeoutMs
}) {
  const normalizedElapsedMs = Math.max(0, Math.round(Number(elapsedMs) || 0));
  const normalizedPrimeState = primeState && typeof primeState === "object"
    ? primeState
    : createDefaultPrimeState();
  const normalizedPlaybackState = normalizePlaybackState(playbackState);
  const normalizedPlaybackStableForMs = Math.max(0, Math.round(Number(playbackStableForMs) || 0));
  const normalizedPlaybackStableWindowMs = Math.max(
    0,
    Math.round(Number(playbackStableWindowMs) || 0)
  );
  const normalizedTimeoutMs = Math.max(0, Math.round(Number(streakTimeoutMs) || 0));
  const normalizedStreakValue = normalizeStreakValue(streakValue);
  const hasPlaybackReady = normalizedPlaybackState === "ok"
    && normalizedPlaybackStableForMs >= normalizedPlaybackStableWindowMs;
  const hasContentReady = Boolean(normalizedPrimeState.contentReady);
  const hasStreakValue = Number.isInteger(normalizedStreakValue);
  const timedOut = normalizedTimeoutMs > 0 && normalizedElapsedMs >= normalizedTimeoutMs;

  if (hasContentReady && hasPlaybackReady && hasStreakValue) {
    return {
      done: true,
      reason: "ready",
      hasContentReady,
      hasPlaybackReady,
      hasStreakValue,
      timedOut: false
    };
  }

  if (timedOut) {
    return {
      done: true,
      reason: "timeout",
      hasContentReady,
      hasPlaybackReady,
      hasStreakValue,
      timedOut: true
    };
  }

  return {
    done: false,
    reason: "waiting",
    hasContentReady,
    hasPlaybackReady,
    hasStreakValue,
    timedOut: false
  };
}

function createDefaultPrimeState() {
  return {
    contentReady: false,
    playbackReady: false,
    streakAttempted: false
  };
}

function normalizeStreakValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Math.floor(Number(value));
  if (!Number.isInteger(normalized) || normalized < 0) {
    return null;
  }

  return normalized;
}

function normalizePlaybackState(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ok" || normalized === "muted" || normalized === "paused") {
    return normalized;
  }

  return null;
}
