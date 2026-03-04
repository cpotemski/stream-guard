export const DEFAULT_SETTINGS = {
  autoManage: false,
  maxStreams: 3,
  openMode: "silent",
  importantChannels: []
};

export const DEFAULT_RUNTIME_STATE = {
  managedTabs: [],
  managedTabsByChannel: {},
  detachedChannels: [],
  watchSessionsByChannel: {},
  broadcastSessionsByChannel: {},
  claimStatsByChannel: {},
  claimAvailabilityByChannel: {},
  playbackStateByChannel: {}
};

function normalizeChannel(entry, fallbackPriority) {
  return {
    name: String(entry.name || "").toLowerCase(),
    priority: Number.isInteger(entry.priority) ? entry.priority : fallbackPriority
  };
}

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const channels = Array.isArray(stored.importantChannels)
    ? stored.importantChannels
    : [];

  return {
    autoManage: Boolean(stored.autoManage),
    maxStreams: clampMaxStreams(stored.maxStreams),
    openMode: stored.openMode === "always" ? "always" : "silent",
    importantChannels: channels
      .map((entry, index) => normalizeChannel(entry, index + 1))
      .filter((entry) => entry.name)
      .sort((left, right) => left.priority - right.priority)
  };
}

export async function setSettings(partialSettings) {
  const current = await getSettings();
  const next = {
    ...current,
    ...partialSettings
  };

  if (partialSettings.maxStreams !== undefined) {
    next.maxStreams = clampMaxStreams(partialSettings.maxStreams);
  }

  if (partialSettings.importantChannels !== undefined) {
    next.importantChannels = normalizeChannels(partialSettings.importantChannels);
  }

  await chrome.storage.sync.set(next);
  return next;
}

export async function getRuntimeState() {
  const stored = await chrome.storage.local.get(DEFAULT_RUNTIME_STATE);
  const managedTabs = Array.isArray(stored.managedTabs) ? stored.managedTabs : [];
  const managedTabsByChannel = normalizeManagedTabsByChannel(stored.managedTabsByChannel);
  const detachedChannels = normalizeChannelList(stored.detachedChannels);
  const watchSessionsByChannel = normalizeWatchSessionsByChannel(stored.watchSessionsByChannel);
  const broadcastSessionsByChannel = normalizeBroadcastSessionsByChannel(
    stored.broadcastSessionsByChannel
  );
  const claimStatsByChannel = normalizeClaimStatsByChannel(stored.claimStatsByChannel);
  const claimAvailabilityByChannel = normalizeClaimAvailabilityByChannel(
    stored.claimAvailabilityByChannel
  );
  const playbackStateByChannel = normalizePlaybackStateByChannel(stored.playbackStateByChannel);

  return {
    managedTabs: managedTabs.filter((tabId) => Number.isInteger(tabId)),
    managedTabsByChannel,
    detachedChannels,
    watchSessionsByChannel,
    broadcastSessionsByChannel,
    claimStatsByChannel,
    claimAvailabilityByChannel,
    playbackStateByChannel
  };
}

export async function setRuntimeState(partialState) {
  const current = await getRuntimeState();
  const next = {
    ...current,
    ...partialState
  };

  if (partialState.managedTabs !== undefined) {
    next.managedTabs = Array.isArray(partialState.managedTabs)
      ? partialState.managedTabs.filter((tabId) => Number.isInteger(tabId))
      : [];
  }

  if (partialState.managedTabsByChannel !== undefined) {
    next.managedTabsByChannel = normalizeManagedTabsByChannel(partialState.managedTabsByChannel);
    next.managedTabs = Object.values(next.managedTabsByChannel);
  }

  if (partialState.detachedChannels !== undefined) {
    next.detachedChannels = normalizeChannelList(partialState.detachedChannels);
  }

  if (partialState.watchSessionsByChannel !== undefined) {
    next.watchSessionsByChannel = normalizeWatchSessionsByChannel(partialState.watchSessionsByChannel);
  }

  if (partialState.broadcastSessionsByChannel !== undefined) {
    next.broadcastSessionsByChannel = normalizeBroadcastSessionsByChannel(
      partialState.broadcastSessionsByChannel
    );
  }

  if (partialState.claimStatsByChannel !== undefined) {
    next.claimStatsByChannel = normalizeClaimStatsByChannel(partialState.claimStatsByChannel);
  }

  if (partialState.claimAvailabilityByChannel !== undefined) {
    next.claimAvailabilityByChannel = normalizeClaimAvailabilityByChannel(
      partialState.claimAvailabilityByChannel
    );
  }

  if (partialState.playbackStateByChannel !== undefined) {
    next.playbackStateByChannel = normalizePlaybackStateByChannel(partialState.playbackStateByChannel);
  }

  await chrome.storage.local.set(next);
  return next;
}

export async function toggleImportantChannel(channelName) {
  const normalizedName = String(channelName || "").toLowerCase();
  if (!normalizedName) {
    return getSettings();
  }

  const settings = await getSettings();
  const existingIndex = settings.importantChannels.findIndex(
    (entry) => entry.name === normalizedName
  );

  if (existingIndex >= 0) {
    settings.importantChannels.splice(existingIndex, 1);
  } else {
    settings.importantChannels.push({
      name: normalizedName,
      priority: settings.importantChannels.length + 1
    });
  }

  settings.importantChannels = normalizeChannels(settings.importantChannels);
  await chrome.storage.sync.set({
    importantChannels: settings.importantChannels
  });

  return settings;
}

export function normalizeChannels(channels) {
  return (Array.isArray(channels) ? channels : [])
    .map((entry) => ({
      name: String(entry?.name || "").toLowerCase()
    }))
    .filter((entry) => entry.name)
    .map((entry, index) => ({
      name: entry.name,
      priority: index + 1
    }));
}

function clampMaxStreams(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SETTINGS.maxStreams;
  }

  return Math.max(1, Math.min(3, Math.round(numeric)));
}

function normalizeManagedTabsByChannel(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});

  return Object.fromEntries(
    entries
      .map(([channel, tabId]) => [String(channel || "").toLowerCase(), tabId])
      .filter(([channel, tabId]) => channel && Number.isInteger(tabId))
  );
}

function normalizeChannelList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((channel) => String(channel || "").toLowerCase())
    .filter(Boolean))];
}

function normalizeWatchSessionsByChannel(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});

  return Object.fromEntries(
    entries
      .map(([channel, session]) => [
        String(channel || "").toLowerCase(),
        normalizeWatchSession(session)
      ])
      .filter(([channel, session]) => channel && session)
  );
}

function normalizeWatchSession(value) {
  const startedAt = Math.round(Number(value?.startedAt));

  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return null;
  }

  return { startedAt };
}

function normalizeBroadcastSessionsByChannel(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});

  return Object.fromEntries(
    entries
      .map(([channel, session]) => [
        String(channel || "").toLowerCase(),
        normalizeBroadcastSession(session)
      ])
      .filter(([channel, session]) => channel && session)
  );
}

function normalizeBroadcastSession(value) {
  const estimatedStartedAt = Math.round(Number(value?.estimatedStartedAt));
  const lastUptimeSeconds = Math.round(Number(value?.lastUptimeSeconds));

  if (!Number.isFinite(estimatedStartedAt) || estimatedStartedAt <= 0) {
    return null;
  }

  return {
    estimatedStartedAt,
    lastUptimeSeconds: Number.isFinite(lastUptimeSeconds) && lastUptimeSeconds >= 0
      ? lastUptimeSeconds
      : 0
  };
}

function normalizeClaimStatsByChannel(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});

  return Object.fromEntries(
    entries
      .map(([channel, stats]) => [
        String(channel || "").toLowerCase(),
        normalizeClaimStats(stats)
      ])
      .filter(([channel, stats]) => channel && stats)
  );
}

function normalizeClaimStats(value) {
  const count = Math.max(0, Math.floor(Number(value?.count) || 0));
  const lastClaimAt = Math.round(Number(value?.lastClaimAt));

  return {
    count,
    lastClaimAt: Number.isFinite(lastClaimAt) && lastClaimAt > 0 ? lastClaimAt : 0
  };
}

function normalizeClaimAvailabilityByChannel(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});

  return Object.fromEntries(
    entries
      .map(([channel, state]) => [
        String(channel || "").toLowerCase(),
        normalizeClaimAvailability(state)
      ])
      .filter(([channel, state]) => channel && state)
  );
}

function normalizeClaimAvailability(value) {
  const available = Boolean(value?.available);
  const seenAt = Math.round(Number(value?.seenAt));

  return {
    available,
    seenAt: Number.isFinite(seenAt) && seenAt > 0 ? seenAt : 0
  };
}

function normalizePlaybackStateByChannel(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});

  return Object.fromEntries(
    entries
      .map(([channel, rawState]) => [
        String(channel || "").toLowerCase(),
        normalizePlaybackState(rawState)
      ])
      .filter(([channel, state]) => channel && state)
  );
}

function normalizePlaybackState(value) {
  const state = String(value || "").toLowerCase();
  if (state === "paused" || state === "muted" || state === "ok") {
    return state;
  }
  return null;
}
