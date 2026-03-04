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
const DEBUG_LOG_KEY = "debugLog";
const DEBUG_LOG_LIMIT = 40;

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await setSettings(settings);
  await setRuntimeState(await getRuntimeState());
  await syncAlarm(settings.autoManage);
  await updateBadge(settings);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await syncAlarm(settings.autoManage);
  await updateBadge(settings);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ORCHESTRATOR_ALARM) {
    return;
  }

  const settings = await getSettings();
  if (settings.autoManage) {
    await reconcileManagedTabs(settings);
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
      const settings = await getSettings();
      return { settings };
    }
    case "debug:get": {
      const settings = await getSettings();
      const runtimeState = await getRuntimeState();
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
      const settings = await setSettings(message.settings || {});
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
      const settings = await setSettings({ autoManage: true });
      const managedTabsByChannel = await reconcileManagedTabs(settings);
      await syncAlarm(true);
      await updateBadge(settings);
      return { settings, openedTabs: Object.keys(managedTabsByChannel).length };
    }
    case "watch:stop": {
      await appendDebugLog("watch:stop", {});
      const runtimeState = await getRuntimeState();
      const closedTabs = await closeManagedWatchTabs(
        Object.values(runtimeState.managedTabsByChannel)
      );
      await setRuntimeState({
        managedTabsByChannel: {},
        detachedChannels: [],
        watchSessionsByChannel: {},
        broadcastSessionsByChannel: {},
        claimStatsByChannel: {},
        claimAvailabilityByChannel: {}
      });
      const settings = await setSettings({ autoManage: false });
      await syncAlarm(false);
      await updateBadge(settings);
      return { settings, closedTabs };
    }
    case "watch:uptime": {
      await handleWatchUptime(message);
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

async function reconcileManagedTabs(settings) {
  const runtimeState = await getRuntimeState();
  const prioritizedChannels = settings.importantChannels.map((entry) => entry.name);
  const liveChannels = await selectLiveChannels(prioritizedChannels, settings.maxStreams);
  const desiredChannels = new Set(liveChannels);
  const nextManagedTabsByChannel = { ...runtimeState.managedTabsByChannel };
  const nextDetachedChannels = new Set(runtimeState.detachedChannels);
  const nextWatchSessionsByChannel = { ...runtimeState.watchSessionsByChannel };
  const nextBroadcastSessionsByChannel = { ...runtimeState.broadcastSessionsByChannel };
  const nextClaimStatsByChannel = { ...runtimeState.claimStatsByChannel };
  const nextClaimAvailabilityByChannel = { ...runtimeState.claimAvailabilityByChannel };

  await appendDebugLog("reconcile:start", {
    prioritizedChannels,
    liveChannels,
    runtimeState
  });

  if (
    Object.keys(nextManagedTabsByChannel).length === 0 &&
    runtimeState.managedTabs.length > 0
  ) {
    await appendDebugLog("reconcile:close-legacy-tabs", {
      tabIds: runtimeState.managedTabs
    });
    await closeManagedWatchTabs(runtimeState.managedTabs);
  }

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
        lastClaimAt: 0
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
        lastClaimAt: 0
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

  for (const channel of Object.keys(nextWatchSessionsByChannel)) {
    if (!nextManagedTabsByChannel[channel]) {
      delete nextWatchSessionsByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextBroadcastSessionsByChannel)) {
    if (!nextManagedTabsByChannel[channel]) {
      delete nextBroadcastSessionsByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextClaimStatsByChannel)) {
    if (!nextManagedTabsByChannel[channel]) {
      delete nextClaimStatsByChannel[channel];
    }
  }

  for (const channel of Object.keys(nextClaimAvailabilityByChannel)) {
    if (!nextManagedTabsByChannel[channel]) {
      delete nextClaimAvailabilityByChannel[channel];
    }
  }

  await setRuntimeState({
    managedTabsByChannel: nextManagedTabsByChannel,
    detachedChannels: [...nextDetachedChannels],
    watchSessionsByChannel: nextWatchSessionsByChannel,
    broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
    claimStatsByChannel: nextClaimStatsByChannel,
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel
  });
  await appendDebugLog("reconcile:done", {
    managedTabsByChannel: nextManagedTabsByChannel,
    detachedChannels: [...nextDetachedChannels],
    watchSessionsByChannel: nextWatchSessionsByChannel,
    broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
    claimStatsByChannel: nextClaimStatsByChannel,
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel
  });
  return nextManagedTabsByChannel;
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
  const runtimeState = await getRuntimeState();
  const trackedTabIds = new Set([
    ...runtimeState.managedTabs,
    ...Object.values(runtimeState.managedTabsByChannel)
  ]);

  await appendDebugLog("reset:start", {
    runtimeState,
    trackedTabIds: [...trackedTabIds]
  });
  await closeManagedWatchTabs([...trackedTabIds]);
  await setRuntimeState({
    managedTabs: [],
    managedTabsByChannel: {},
    detachedChannels: [],
    watchSessionsByChannel: {},
    broadcastSessionsByChannel: {},
    claimStatsByChannel: {},
    claimAvailabilityByChannel: {}
  });
  await appendDebugLog("reset:done", {});
}

async function handleWatchUptime(message) {
  const channel = String(message?.channel || "").toLowerCase();
  const uptimeSeconds = Math.floor(Number(message?.uptimeSeconds));

  if (!channel || !Number.isFinite(uptimeSeconds) || uptimeSeconds < 0) {
    return;
  }

  const runtimeState = await getRuntimeState();
  if (!runtimeState.managedTabsByChannel[channel]) {
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

  if (!currentBroadcast) {
    nextBroadcastSessionsByChannel[channel] = {
      estimatedStartedAt,
      lastUptimeSeconds: uptimeSeconds
    };
    await setRuntimeState({
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel
    });
    await appendDebugLog("watch:uptime-init", {
      channel,
      uptimeSeconds,
      estimatedStartedAt
    });
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
      lastClaimAt: 0
    };
    nextClaimAvailabilityByChannel[channel] = {
      available: false,
      seenAt: 0
    };
    await appendDebugLog("watch:session-reset", {
      channel,
      previousBroadcast: currentBroadcast,
      uptimeSeconds,
      estimatedStartedAt
    });
  }

  await setRuntimeState({
    broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
    watchSessionsByChannel: nextWatchSessionsByChannel,
    claimStatsByChannel: nextClaimStatsByChannel,
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel
  });
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
  const channel = String(message?.channel || "").toLowerCase();
  const tabId = sender?.tab?.id;
  if (!channel || !Number.isInteger(tabId)) {
    return false;
  }

  const settings = await getSettings();
  if (!settings.autoManage) {
    return false;
  }

  const runtimeState = await getRuntimeState();
  return runtimeState.managedTabsByChannel[channel] === tabId;
}

async function recordClaim(message, sender) {
  const channel = String(message?.channel || "").toLowerCase();
  const tabId = sender?.tab?.id;
  if (!channel || !Number.isInteger(tabId)) {
    return;
  }

  const runtimeState = await getRuntimeState();
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

  await setRuntimeState({
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

  const runtimeState = await getRuntimeState();
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

  await setRuntimeState({
    claimAvailabilityByChannel: nextClaimAvailabilityByChannel
  });
  await appendDebugLog(available ? "claim:available" : "claim:cleared", {
    channel
  });
}

async function appendDebugLog(event, details) {
  const current = await chrome.storage.local.get({ [DEBUG_LOG_KEY]: [] });
  const next = Array.isArray(current[DEBUG_LOG_KEY]) ? current[DEBUG_LOG_KEY] : [];
  next.push({
    timestamp: new Date().toISOString(),
    event,
    details
  });

  await chrome.storage.local.set({
    [DEBUG_LOG_KEY]: next.slice(-DEBUG_LOG_LIMIT)
  });
}

async function clearDebugLog() {
  await chrome.storage.local.set({
    [DEBUG_LOG_KEY]: []
  });
}

async function getDebugLog() {
  const stored = await chrome.storage.local.get({ [DEBUG_LOG_KEY]: [] });
  return Array.isArray(stored[DEBUG_LOG_KEY]) ? stored[DEBUG_LOG_KEY] : [];
}
