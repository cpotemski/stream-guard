import {
  getRuntimeState,
  getSettings,
  setRuntimeState,
  setSettings,
  toggleImportantChannel
} from "./lib/storage.js";
import { getChannelsLiveStatus, selectLiveChannels } from "./lib/liveStatus.js";
import { closeManagedWatchTabs, openWatchTab } from "./lib/tabManager.js";

const ORCHESTRATOR_ALARM = "orchestrator-tick";
const ORCHESTRATOR_LAST_TICK_AT_KEY = "orchestratorLastTickAt";
const DEBUG_LOG_KEY = "debugLog";
const DEBUG_LOG_LIMIT = 40;
const WATCH_GROUP_TITLE = "TW Watch";
const STATE_CACHE_TTL_MS = 1500;
const AUTH_CACHE_TTL_MS = 3000;
const DEBUG_LOG_FLUSH_DELAY_MS = 800;
const WAKE_GAP_THRESHOLD_MS = 180000;

let cachedSettings = null;
let cachedSettingsExpiresAt = 0;
let cachedRuntimeState = null;
let cachedRuntimeStateExpiresAt = 0;
const authorizationCache = new Map();
let pendingDebugLogEntries = [];
let debugLogFlushTimeoutId = 0;
let debugLogFlushInFlight = null;

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await readSettingsFresh();
  await writeSettings(settings);
  const runtimeState = await writeRuntimeState(await readRuntimeStateFresh());
  if (details?.reason === "update") {
    await rebindManagedTabsAfterUpdate(runtimeState.managedTabsByChannel);
  }
  await syncAlarm(settings.autoManage);
  await updateBadge(settings);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await readSettingsCached();
  await syncAlarm(settings.autoManage);
  await updateBadge(settings);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ORCHESTRATOR_ALARM) {
    return;
  }

  const wakeGapMs = await recordAndGetOrchestratorWakeGapMs();
  const settings = await readSettingsCached();
  if (settings.autoManage) {
    if (wakeGapMs >= WAKE_GAP_THRESHOLD_MS) {
      await appendDebugLog("orchestrator:wake-detected", { wakeGapMs });
      await recoverManagedTabsAfterWake(settings);
    } else {
      await reconcileManagedTabs(settings);
    }
  }
  await updateBadge(settings);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "settings:get": {
      const settings = await readSettingsCached();
      return { settings };
    }
    case "debug:get": {
      const settings = await readSettingsCached();
      const runtimeState = await readRuntimeStateCached();
      const debugLog = await getDebugLog();
      return { settings, runtimeState, debugLog };
    }
    case "channel:toggle": {
      const settings = await toggleImportantChannel(message.channel);
      if (settings.autoManage) {
        await reconcileManagedTabs(settings);
      }
      await updateBadge(settings);
      return { settings };
    }
    case "settings:update": {
      const settings = await writeSettings(message.settings || {});
      await syncAlarm(settings.autoManage);
      if (settings.autoManage) {
        await reconcileManagedTabs(settings);
      }
      await updateBadge(settings);
      return { settings };
    }
    case "watch:start": {
      await clearDebugLog();
      await appendDebugLog("watch:start", {});
      await resetManagedWatchState();
      const settings = await writeSettings({ autoManage: true });
      const managedTabsByChannel = await reconcileManagedTabs(settings);
      await syncAlarm(true);
      await updateBadge(settings);
      return { settings, openedTabs: Object.keys(managedTabsByChannel).length };
    }
    case "watch:stop": {
      await appendDebugLog("watch:stop", {});
      const runtimeState = await readRuntimeStateCached();
      const closedTabs = await closeManagedWatchTabs(
        Object.values(runtimeState.managedTabsByChannel)
      );
      await writeRuntimeState({
        managedTabsByChannel: {},
        detachedChannels: [],
        watchSessionsByChannel: {},
        broadcastSessionsByChannel: {},
        claimStatsByChannel: {},
        claimAvailabilityByChannel: {},
        playbackStateByChannel: {},
        watchStreakByChannel: {}
      });
      const settings = await writeSettings({ autoManage: false });
      await syncAlarm(false);
      await updateBadge(settings);
      return { settings, closedTabs };
    }
    case "watch:uptime": {
      await handleWatchUptime(message, sender);
      return {};
    }
    case "watch:authorize": {
      return {
        authorized: await canManageWatchTab(message, sender)
      };
    }
    case "watch:playback-corrected": {
      const channel = String(message?.channel || "").toLowerCase();
      const authorized = await canManageChannelForTab(channel, sender?.tab?.id);
      if (!authorized) {
        return {};
      }

      await appendDebugLog("watch:playback-corrected", { channel });
      return {};
    }
    case "watch:playback-resumed": {
      const channel = String(message?.channel || "").toLowerCase();
      const authorized = await canManageChannelForTab(channel, sender?.tab?.id);
      if (!authorized) {
        return {};
      }

      await appendDebugLog("watch:playback-resumed", { channel });
      return {};
    }
    case "watch:playback-state": {
      const channel = String(message?.channel || "").toLowerCase();
      const senderTabId = sender?.tab?.id;
      if (!channel || !Number.isInteger(senderTabId)) {
        await appendDebugLog("playback-state:invalid", {
          channel,
          tabId: senderTabId
        });
        return {};
      }

      const authorized = await canManageChannelForTab(channel, senderTabId);
      if (!authorized) {
        await appendDebugLog("playback-state:ignored", {
          channel,
          senderTabId
        });
        return {};
      }

      const runtimeState = await readRuntimeStateCached();
      const state = message?.state === "paused" ? "paused" : message?.state === "muted" ? "muted" : "ok";
      await appendDebugLog("playback-state:updated", {
        channel,
        state
      });
      await writeRuntimeState({
        playbackStateByChannel: {
          ...runtimeState.playbackStateByChannel,
          [channel]: state
        }
      });
      return {};
    }
    case "claim:authorize": {
      return {
        authorized: await canAutoClaim(message, sender)
      };
    }
    case "claim:record": {
      await recordClaim(message, sender);
      return {};
    }
    case "claim:status": {
      await updateClaimAvailability(message, sender);
      return {};
    }
    case "streak:report": {
      await updateWatchStreak(message, sender);
      return {};
    }
    default:
      throw new Error("Unsupported message type.");
  }
}

async function syncAlarm(enabled) {
  await chrome.alarms.clear(ORCHESTRATOR_ALARM);

  if (enabled) {
    await chrome.alarms.create(ORCHESTRATOR_ALARM, {
      periodInMinutes: 1
    });
  }
}

async function rebindManagedTabsAfterUpdate(managedTabsByChannel) {
  const entries = Object.entries(managedTabsByChannel || {});
  const targets = entries.filter(([, tabId]) => Number.isInteger(tabId));

  for (const [channel, tabId] of targets) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "watch:request-playback-state",
        channel
      });
    } catch (_error) {
      try {
        await chrome.tabs.reload(tabId);
        await appendDebugLog("rebind:tab-reloaded-after-update", {
          channel,
          tabId
        });
      } catch (_reloadError) {
        await appendDebugLog("rebind:tab-reload-failed-after-update", {
          channel,
          tabId
        });
      }
    }
  }
}

async function reconcileManagedTabs(settings) {
  const runtimeState = await readRuntimeStateCached();
  const prioritizedChannels = settings.importantChannels.map((entry) => entry.name);
  const liveChannels = await selectLiveChannels(prioritizedChannels, settings.maxStreams);
  const desiredChannels = new Set(liveChannels);
  const nextManagedTabsByChannel = { ...runtimeState.managedTabsByChannel };
  const nextDetachedChannels = new Set(runtimeState.detachedChannels);
  const nextWatchSessionsByChannel = { ...runtimeState.watchSessionsByChannel };
  const nextBroadcastSessionsByChannel = { ...runtimeState.broadcastSessionsByChannel };
  const nextClaimStatsByChannel = { ...runtimeState.claimStatsByChannel };
  const nextClaimAvailabilityByChannel = { ...runtimeState.claimAvailabilityByChannel };
  const nextPlaybackStateByChannel = { ...runtimeState.playbackStateByChannel };
  const nextWatchStreakByChannel = { ...runtimeState.watchStreakByChannel };

  await appendDebugLog("reconcile:start", {
    prioritizedChannels,
    liveChannels,
    runtimeState
  });

  for (const [channel, tabId] of Object.entries(runtimeState.managedTabsByChannel)) {
    if (!desiredChannels.has(channel)) {
      await appendDebugLog("reconcile:close-not-desired", {
        channel,
        tabId
      });
      await closeManagedWatchTabs([tabId]);
      delete nextManagedTabsByChannel[channel];
      delete nextWatchSessionsByChannel[channel];
      delete nextBroadcastSessionsByChannel[channel];
      delete nextClaimStatsByChannel[channel];
      delete nextClaimAvailabilityByChannel[channel];
      delete nextPlaybackStateByChannel[channel];
      delete nextWatchStreakByChannel[channel];
      nextDetachedChannels.delete(channel);
      continue;
    }

    const tab = await getExistingTab(tabId);
    if (!tab) {
      await appendDebugLog("reconcile:drop-missing-tab", {
        channel,
        tabId
      });
      delete nextManagedTabsByChannel[channel];
      delete nextWatchSessionsByChannel[channel];
      delete nextBroadcastSessionsByChannel[channel];
      delete nextClaimStatsByChannel[channel];
      delete nextClaimAvailabilityByChannel[channel];
      delete nextPlaybackStateByChannel[channel];
      delete nextWatchStreakByChannel[channel];
      continue;
    }

    const currentChannel = getChannelFromTab(tab);
    if (currentChannel === null && tab.status !== "complete") {
      await appendDebugLog("reconcile:keep-loading-tab", {
        channel,
        tabId,
        status: tab.status,
        url: tab.pendingUrl || tab.url || null
      });
      continue;
    }

    if (currentChannel !== channel) {
      await appendDebugLog("reconcile:close-detached", {
        channel,
        tabId,
        status: tab.status,
        currentChannel,
        url: tab.pendingUrl || tab.url || null
      });
      await closeManagedWatchTabs([tabId]);
      delete nextManagedTabsByChannel[channel];
      delete nextWatchSessionsByChannel[channel];
      delete nextBroadcastSessionsByChannel[channel];
      delete nextClaimStatsByChannel[channel];
      delete nextClaimAvailabilityByChannel[channel];
      delete nextPlaybackStateByChannel[channel];
      delete nextWatchStreakByChannel[channel];
      nextDetachedChannels.add(channel);
      continue;
    }

    if (!nextWatchSessionsByChannel[channel]) {
      nextWatchSessionsByChannel[channel] = {
        startedAt: Date.now()
      };
    }
    if (!nextClaimStatsByChannel[channel]) {
      nextClaimStatsByChannel[channel] = {
        count: 0,
        lastClaimAt: Date.now()
      };
    }

    if (!nextClaimAvailabilityByChannel[channel]) {
      nextClaimAvailabilityByChannel[channel] = {
        available: false,
        seenAt: 0
      };
    }
  }

  for (const channel of liveChannels) {
    if (nextManagedTabsByChannel[channel] || nextDetachedChannels.has(channel)) {
      await appendDebugLog("reconcile:skip-open", {
        channel,
        hasTab: Boolean(nextManagedTabsByChannel[channel]),
        detached: nextDetachedChannels.has(channel)
      });
      continue;
    }

    const tabId = await openWatchTab(channel);
    if (Number.isInteger(tabId)) {
      nextManagedTabsByChannel[channel] = tabId;
      nextWatchSessionsByChannel[channel] = {
        startedAt: Date.now()
      };
      delete nextBroadcastSessionsByChannel[channel];
      nextClaimStatsByChannel[channel] = {
        count: 0,
        lastClaimAt: Date.now()
      };
      nextClaimAvailabilityByChannel[channel] = {
        available: false,
        seenAt: 0
      };
      await appendDebugLog("reconcile:open-tab", {
        channel,
        tabId
      });
    }
  }

  for (const channel of nextDetachedChannels) {
    if (!desiredChannels.has(channel)) {
      nextDetachedChannels.delete(channel);
    }
  }

  const assignedChannels = new Set(Object.keys(nextManagedTabsByChannel));

  for (const channel of Object.keys(nextWatchSessionsByChannel)) {
    if (!assignedChannels.has(channel)) {
      delete nextWatchSessionsByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextBroadcastSessionsByChannel)) {
    if (!assignedChannels.has(channel)) {
      delete nextBroadcastSessionsByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextClaimStatsByChannel)) {
    if (!assignedChannels.has(channel)) {
      delete nextClaimStatsByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextClaimAvailabilityByChannel)) {
    if (!assignedChannels.has(channel)) {
      delete nextClaimAvailabilityByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextPlaybackStateByChannel)) {
    if (!assignedChannels.has(channel)) {
      delete nextPlaybackStateByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextWatchStreakByChannel)) {
    if (!assignedChannels.has(channel)) {
      delete nextWatchStreakByChannel[channel];
    }
  }

  await writeRuntimeState({
    managedTabsByChannel: nextManagedTabsByChannel,
    detachedChannels: [...nextDetachedChannels],
    watchSessionsByChannel: nextWatchSessionsByChannel,
    broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
    claimStatsByChannel: nextClaimStatsByChannel,
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
    playbackStateByChannel: nextPlaybackStateByChannel,
    watchStreakByChannel: nextWatchStreakByChannel
  });
  void requestPlaybackStateForManagedTabs(nextManagedTabsByChannel);
  setTimeout(
    () => {
      void requestPlaybackStateForManagedTabs(nextManagedTabsByChannel);
    },
    3000
  );
  await appendDebugLog("reconcile:done", {
    managedTabsByChannel: nextManagedTabsByChannel,
    detachedChannels: [...nextDetachedChannels],
    watchSessionsByChannel: nextWatchSessionsByChannel,
    broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
    claimStatsByChannel: nextClaimStatsByChannel,
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
    playbackStateByChannel: nextPlaybackStateByChannel,
    watchStreakByChannel: nextWatchStreakByChannel
  });
  return nextManagedTabsByChannel;
}

async function requestPlaybackStateForManagedTabs(managedTabsByChannel) {
  const entries = Object.entries(managedTabsByChannel || {});
  const targets = entries.filter(([, tabId]) => Number.isInteger(tabId));

  for (const [channel, tabId] of targets) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "watch:request-playback-state",
        channel
      });
    } catch (_error) {
      await appendDebugLog("reconcile:playback-state-request-failed", {
        channel,
        tabId
      });
    }
  }
}

async function recoverManagedTabsAfterWake(settings) {
  const managedTabsByChannel = await reconcileManagedTabs(settings);
  const entries = Object.entries(managedTabsByChannel || {})
    .filter(([, tabId]) => Number.isInteger(tabId));

  for (const [channel, tabId] of entries) {
    const tab = await getExistingTab(tabId);
    if (!tab) {
      continue;
    }

    if (tab.discarded) {
      try {
        await chrome.tabs.reload(tabId);
        await appendDebugLog("wake:tab-reloaded-discarded", {
          channel,
          tabId
        });
      } catch (_error) {
        await appendDebugLog("wake:tab-reload-failed-discarded", {
          channel,
          tabId
        });
      }
      continue;
    }

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "watch:request-playback-state",
        channel
      });
    } catch (_error) {
      try {
        await chrome.tabs.reload(tabId);
        await appendDebugLog("wake:tab-reloaded-unreachable", {
          channel,
          tabId
        });
      } catch (_reloadError) {
        await appendDebugLog("wake:tab-reload-failed-unreachable", {
          channel,
          tabId
        });
      }
    }
  }
}

async function requestWatchStreakForManagedTab(channel, tabId) {
  if (!channel || !Number.isInteger(tabId)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "watch:request-streak",
      channel
    });
  } catch (_error) {
    await appendDebugLog("watch:streak-request-failed", {
      channel,
      tabId
    });
  }
}

async function updateBadge(settings) {
  const liveStatusByChannel = await getChannelsLiveStatus(
    settings.importantChannels.map((entry) => entry.name)
  );
  const count = Object.values(liveStatusByChannel)
    .filter((status) => status === "live")
    .length;
  const text = count > 0 ? String(count) : "";
  const color = settings.autoManage ? "#1f9d55" : "#6b7280";

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

async function getExistingTab(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }

  try {
    return await chrome.tabs.get(tabId);
  } catch (_error) {
    return null;
  }
}

function getChannelFromTab(tab) {
  const rawUrl = tab?.pendingUrl || tab?.url;
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "www.twitch.tv" && url.hostname !== "twitch.tv") {
      return null;
    }

    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!path || path.includes("/")) {
      return null;
    }

    return path.toLowerCase();
  } catch (_error) {
    return null;
  }
}

async function resetManagedWatchState() {
  const runtimeState = await readRuntimeStateCached();
  const trackedTabIds = new Set([
    ...runtimeState.managedTabs,
    ...Object.values(runtimeState.managedTabsByChannel)
  ]);

  await appendDebugLog("reset:start", {
    runtimeState,
    trackedTabIds: [...trackedTabIds]
  });
  await closeManagedWatchTabs([...trackedTabIds]);
  await writeRuntimeState({
    managedTabs: [],
    managedTabsByChannel: {},
    detachedChannels: [],
    watchSessionsByChannel: {},
    broadcastSessionsByChannel: {},
    claimStatsByChannel: {},
    claimAvailabilityByChannel: {},
    playbackStateByChannel: {},
    watchStreakByChannel: {}
  });
  await appendDebugLog("reset:done", {});
}

async function handleWatchUptime(message, sender) {
  const channel = String(message?.channel || "").toLowerCase();
  const tabId = sender?.tab?.id;
  const uptimeSeconds = Math.floor(Number(message?.uptimeSeconds));

  if (!channel || !Number.isFinite(uptimeSeconds) || uptimeSeconds < 0 || !Number.isInteger(tabId)) {
    return;
  }

  const authorized = await canManageChannelForTab(channel, tabId);
  if (!authorized) {
    return;
  }

  const runtimeState = await readRuntimeStateCached();
  const managedTabId = runtimeState.managedTabsByChannel[channel];
  if (!managedTabId) {
    return;
  }

  const estimatedStartedAt = Date.now() - (uptimeSeconds * 1000);
  const currentBroadcast = runtimeState.broadcastSessionsByChannel[channel];
  const nextBroadcastSessionsByChannel = {
    ...runtimeState.broadcastSessionsByChannel
  };
  const nextWatchSessionsByChannel = {
    ...runtimeState.watchSessionsByChannel
  };
  const nextClaimStatsByChannel = {
    ...runtimeState.claimStatsByChannel
  };
  const nextClaimAvailabilityByChannel = {
    ...runtimeState.claimAvailabilityByChannel
  };
  const nextWatchStreakByChannel = {
    ...runtimeState.watchStreakByChannel
  };

  if (!currentBroadcast) {
    nextBroadcastSessionsByChannel[channel] = {
      estimatedStartedAt,
      lastUptimeSeconds: uptimeSeconds
    };
    await writeRuntimeState({
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel
    });
    await appendDebugLog("watch:uptime-init", {
      channel,
      uptimeSeconds,
      estimatedStartedAt
    });
    await requestWatchStreakForManagedTab(channel, managedTabId);
    return;
  }

  const broadcastRestarted = hasBroadcastRestarted(
    currentBroadcast,
    estimatedStartedAt,
    uptimeSeconds
  );

  nextBroadcastSessionsByChannel[channel] = {
    estimatedStartedAt,
    lastUptimeSeconds: uptimeSeconds
  };

  if (broadcastRestarted) {
    nextWatchSessionsByChannel[channel] = {
      startedAt: Date.now()
    };
    nextClaimStatsByChannel[channel] = {
      count: 0,
      lastClaimAt: Date.now()
    };
    nextClaimAvailabilityByChannel[channel] = {
      available: false,
      seenAt: 0
    };
    delete nextWatchStreakByChannel[channel];
    await appendDebugLog("watch:session-reset", {
      channel,
      previousBroadcast: currentBroadcast,
      uptimeSeconds,
      estimatedStartedAt
    });
  }

  await writeRuntimeState({
    broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
    watchSessionsByChannel: nextWatchSessionsByChannel,
    claimStatsByChannel: nextClaimStatsByChannel,
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
    watchStreakByChannel: nextWatchStreakByChannel
  });

  if (broadcastRestarted) {
    await requestWatchStreakForManagedTab(channel, managedTabId);
  }
}

function hasBroadcastRestarted(currentBroadcast, nextEstimatedStartedAt, nextUptimeSeconds) {
  const previousEstimatedStartedAt = Number(currentBroadcast?.estimatedStartedAt);
  const previousUptimeSeconds = Number(currentBroadcast?.lastUptimeSeconds);

  if (!Number.isFinite(previousEstimatedStartedAt) || previousEstimatedStartedAt <= 0) {
    return false;
  }

  if (!Number.isFinite(previousUptimeSeconds) || previousUptimeSeconds < 0) {
    return false;
  }

  if (nextUptimeSeconds + 30 < previousUptimeSeconds) {
    return true;
  }

  return Math.abs(nextEstimatedStartedAt - previousEstimatedStartedAt) > 120000;
}

async function canAutoClaim(message, sender) {
  return canManageWatchTab(message, sender);
}

async function canManageWatchTab(message, sender) {
  const channel = String(message?.channel || "").toLowerCase();
  const tabId = sender?.tab?.id;
  return canManageChannelForTab(channel, tabId);
}

async function canManageChannelForTab(channel, tabId) {
  if (!channel || !Number.isInteger(tabId)) {
    return false;
  }

  const authorizationKey = `${channel}:${tabId}`;
  const cachedAuthorization = authorizationCache.get(authorizationKey);
  if (cachedAuthorization && cachedAuthorization.expiresAt > Date.now()) {
    return cachedAuthorization.allowed;
  }

  const settings = await readSettingsCached();
  if (!settings.autoManage) {
    cacheAuthorizationResult(authorizationKey, false);
    return false;
  }
  const isImportant = settings.importantChannels.some((entry) => entry.name === channel);
  if (!isImportant) {
    cacheAuthorizationResult(authorizationKey, false);
    return false;
  }

  const runtimeState = await readRuntimeStateCached();
  if (runtimeState.managedTabsByChannel[channel] !== tabId) {
    cacheAuthorizationResult(authorizationKey, false);
    return false;
  }

  const tab = await getExistingTab(tabId);
  if (!tab) {
    cacheAuthorizationResult(authorizationKey, false);
    return false;
  }

  const tabChannel = getChannelFromTab(tab);
  if (tabChannel !== channel) {
    cacheAuthorizationResult(authorizationKey, false);
    return false;
  }

  if (!Number.isInteger(tab.groupId) || tab.groupId < 0) {
    cacheAuthorizationResult(authorizationKey, false);
    return false;
  }

  try {
    const group = await chrome.tabGroups.get(tab.groupId);
    const allowed = group?.title === WATCH_GROUP_TITLE;
    cacheAuthorizationResult(authorizationKey, allowed);
    return allowed;
  } catch (_error) {
    cacheAuthorizationResult(authorizationKey, false);
    return false;
  }
}

async function recordClaim(message, sender) {
  const channel = String(message?.channel || "").toLowerCase();
  const tabId = sender?.tab?.id;
  if (!channel || !Number.isInteger(tabId)) {
    return;
  }

  const authorized = await canManageChannelForTab(channel, tabId);
  if (!authorized) {
    return;
  }

  const runtimeState = await readRuntimeStateCached();
  if (runtimeState.managedTabsByChannel[channel] !== tabId) {
    return;
  }

  const currentStats = runtimeState.claimStatsByChannel[channel] || {
    count: 0,
    lastClaimAt: 0
  };
  const now = Date.now();

  if (currentStats.lastClaimAt > 0 && now - currentStats.lastClaimAt < 10000) {
    return;
  }

  const nextClaimStatsByChannel = {
    ...runtimeState.claimStatsByChannel,
    [channel]: {
      count: currentStats.count + 1,
      lastClaimAt: now
    }
  };
  const nextClaimAvailabilityByChannel = {
    ...runtimeState.claimAvailabilityByChannel,
    [channel]: {
      available: false,
      seenAt: now
    }
  };

  await writeRuntimeState({
    claimStatsByChannel: nextClaimStatsByChannel,
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel
  });
  await appendDebugLog("claim:recorded", {
    channel,
    count: nextClaimStatsByChannel[channel].count
  });
}

async function updateClaimAvailability(message, sender) {
  const channel = String(message?.channel || "").toLowerCase();
  const tabId = sender?.tab?.id;
  if (!channel || !Number.isInteger(tabId)) {
    return;
  }

  const authorized = await canManageChannelForTab(channel, tabId);
  if (!authorized) {
    return;
  }

  const runtimeState = await readRuntimeStateCached();
  if (runtimeState.managedTabsByChannel[channel] !== tabId) {
    return;
  }

  const available = Boolean(message?.available);
  const currentState = runtimeState.claimAvailabilityByChannel[channel];
  if (currentState?.available === available) {
    return;
  }

  const nextClaimAvailabilityByChannel = {
    ...runtimeState.claimAvailabilityByChannel,
    [channel]: {
      available,
      seenAt: Date.now()
    }
  };

  await writeRuntimeState({
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel
  });
  await appendDebugLog(available ? "claim:available" : "claim:cleared", {
    channel
  });
}

async function updateWatchStreak(message, sender) {
  const channel = String(message?.channel || "").toLowerCase();
  const tabId = sender?.tab?.id;
  const value = Math.floor(Number(message?.value));

  if (!channel || !Number.isInteger(tabId)) {
    return;
  }

  if (!Number.isInteger(value) || value < 0) {
    return;
  }

  const authorized = await canManageChannelForTab(channel, tabId);
  if (!authorized) {
    return;
  }

  const runtimeState = await readRuntimeStateCached();
  if (runtimeState.managedTabsByChannel[channel] !== tabId) {
    return;
  }

  const current = runtimeState.watchStreakByChannel?.[channel];
  if (current?.value === value) {
    return;
  }
  const increased = Number.isInteger(current?.value) && value > current.value;

  const nextWatchStreakByChannel = {
    ...runtimeState.watchStreakByChannel,
    [channel]: {
      value,
      increased,
      seenAt: Date.now()
    }
  };

  await writeRuntimeState({
    watchStreakByChannel: nextWatchStreakByChannel
  });
  await appendDebugLog("streak:updated", {
    channel,
    value
  });
}

async function appendDebugLog(event, details) {
  pendingDebugLogEntries.push({
    timestamp: new Date().toISOString(),
    event,
    details
  });
  scheduleDebugLogFlush(DEBUG_LOG_FLUSH_DELAY_MS);
}

async function clearDebugLog() {
  pendingDebugLogEntries = [];
  if (debugLogFlushTimeoutId) {
    clearTimeout(debugLogFlushTimeoutId);
    debugLogFlushTimeoutId = 0;
  }
  await flushDebugLogEntries();
  await chrome.storage.local.set({
    [DEBUG_LOG_KEY]: []
  });
}

async function getDebugLog() {
  await flushDebugLogEntries();
  const stored = await chrome.storage.local.get({ [DEBUG_LOG_KEY]: [] });
  return Array.isArray(stored[DEBUG_LOG_KEY]) ? stored[DEBUG_LOG_KEY] : [];
}

async function recordAndGetOrchestratorWakeGapMs() {
  const now = Date.now();
  const stored = await chrome.storage.local.get({
    [ORCHESTRATOR_LAST_TICK_AT_KEY]: 0
  });
  const previousTickAt = Math.round(Number(stored[ORCHESTRATOR_LAST_TICK_AT_KEY]));
  await chrome.storage.local.set({
    [ORCHESTRATOR_LAST_TICK_AT_KEY]: now
  });

  if (!Number.isFinite(previousTickAt) || previousTickAt <= 0) {
    return 0;
  }

  return Math.max(0, now - previousTickAt);
}

function cacheAuthorizationResult(key, allowed) {
  authorizationCache.set(key, {
    allowed,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS
  });
}

function clearAuthorizationCache() {
  authorizationCache.clear();
}

async function readSettingsFresh() {
  const settings = await getSettings();
  cachedSettings = settings;
  cachedSettingsExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
  return settings;
}

async function readSettingsCached() {
  if (cachedSettings && cachedSettingsExpiresAt > Date.now()) {
    return cachedSettings;
  }
  return readSettingsFresh();
}

async function writeSettings(partialSettings) {
  const settings = await setSettings(partialSettings);
  cachedSettings = settings;
  cachedSettingsExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
  clearAuthorizationCache();
  return settings;
}

async function readRuntimeStateFresh() {
  const runtimeState = await getRuntimeState();
  cachedRuntimeState = runtimeState;
  cachedRuntimeStateExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
  return runtimeState;
}

async function readRuntimeStateCached() {
  if (cachedRuntimeState && cachedRuntimeStateExpiresAt > Date.now()) {
    return cachedRuntimeState;
  }
  return readRuntimeStateFresh();
}

async function writeRuntimeState(partialState) {
  const runtimeState = await setRuntimeState(partialState);
  cachedRuntimeState = runtimeState;
  cachedRuntimeStateExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
  clearAuthorizationCache();
  return runtimeState;
}

function scheduleDebugLogFlush(delayMs) {
  if (debugLogFlushTimeoutId || pendingDebugLogEntries.length === 0) {
    return;
  }

  debugLogFlushTimeoutId = setTimeout(() => {
    debugLogFlushTimeoutId = 0;
    void flushDebugLogEntries();
  }, delayMs);
}

async function flushDebugLogEntries() {
  if (debugLogFlushInFlight) {
    return debugLogFlushInFlight;
  }

  if (pendingDebugLogEntries.length === 0) {
    return;
  }

  const entriesToPersist = pendingDebugLogEntries;
  pendingDebugLogEntries = [];

  debugLogFlushInFlight = (async () => {
    const current = await chrome.storage.local.get({ [DEBUG_LOG_KEY]: [] });
    const existing = Array.isArray(current[DEBUG_LOG_KEY]) ? current[DEBUG_LOG_KEY] : [];
    const next = [...existing, ...entriesToPersist].slice(-DEBUG_LOG_LIMIT);
    await chrome.storage.local.set({
      [DEBUG_LOG_KEY]: next
    });
  })();

  try {
    await debugLogFlushInFlight;
  } finally {
    debugLogFlushInFlight = null;
    if (pendingDebugLogEntries.length > 0) {
      scheduleDebugLogFlush(100);
    }
  }
}
