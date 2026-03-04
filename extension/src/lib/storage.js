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
  watchSessionsByChannel: {}
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

  return {
    managedTabs: managedTabs.filter((tabId) => Number.isInteger(tabId)),
    managedTabsByChannel,
    detachedChannels,
    watchSessionsByChannel
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
