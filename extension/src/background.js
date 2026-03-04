import {
  getRuntimeState,
  getSettings,
  setRuntimeState,
  setSettings,
  toggleImportantChannel
} from "./lib/storage.js";
import { selectLiveChannels } from "./lib/liveStatus.js";
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function handleMessage(message) {
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
      await setRuntimeState({ managedTabsByChannel: {}, detachedChannels: [] });
      const settings = await setSettings({ autoManage: false });
      await syncAlarm(false);
      await updateBadge(settings);
      return { settings, closedTabs };
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
      nextDetachedChannels.add(channel);
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

  await setRuntimeState({
    managedTabsByChannel: nextManagedTabsByChannel,
    detachedChannels: [...nextDetachedChannels]
  });
  await appendDebugLog("reconcile:done", {
    managedTabsByChannel: nextManagedTabsByChannel,
    detachedChannels: [...nextDetachedChannels]
  });
  return nextManagedTabsByChannel;
}

async function updateBadge(settings) {
  const count = settings.importantChannels.length;
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
    detachedChannels: []
  });
  await appendDebugLog("reset:done", {});
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
