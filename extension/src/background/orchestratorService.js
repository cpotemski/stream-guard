import { getChannelsLiveStatus } from "../lib/liveStatus.js";

export function createOrchestratorService({
  alarmName,
  orchestratorLastTickAtKey,
  wakeGapThresholdMs,
  readSettingsFresh,
  writeSettings,
  readRuntimeStateFresh,
  writeRuntimeState,
  rebindManagedTabsAfterUpdate,
  readSettingsCached,
  reconcileManagedTabs,
  recoverManagedTabsAfterWake,
  logWorkerEvent
}) {
  async function onInstalled(details) {
    const settings = await readSettingsFresh();
    await writeSettings(settings);
    const runtimeState = await writeRuntimeState(await readRuntimeStateFresh());
    if (details?.reason === "update") {
      await rebindManagedTabsAfterUpdate(runtimeState.managedTabsByChannel);
    }
    await syncAlarm(settings.autoManage);
    await updateBadge(settings);
  }

  async function onStartup() {
    const settings = await readSettingsCached();
    await syncAlarm(settings.autoManage);
    await updateBadge(settings);
  }

  async function onAlarm(alarm) {
    if (alarm?.name !== alarmName) {
      return;
    }

    const wakeGapMs = await recordAndGetOrchestratorWakeGapMs();
    const settings = await readSettingsCached();
    if (settings.autoManage) {
      if (wakeGapMs >= wakeGapThresholdMs) {
        await logWorkerEvent("orchestrator:wake-detected", { wakeGapMs });
        await recoverManagedTabsAfterWake(settings);
      } else {
        await reconcileManagedTabs(settings);
      }
    }
    await updateBadge(settings);
  }

  async function syncAlarm(enabled) {
    await chrome.alarms.clear(alarmName);

    if (enabled) {
      await chrome.alarms.create(alarmName, {
        periodInMinutes: 1
      });
    }
  }

  async function updateBadge(settings) {
    const liveStatusByChannel = await refreshLiveStatus(settings);
    const count = Object.values(liveStatusByChannel)
      .filter((status) => status === "live")
      .length;
    const text = count > 0 ? String(count) : "";
    const color = settings.autoManage ? "#1f9d55" : "#6b7280";

    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  }

  async function refreshLiveStatus(settings) {
    const liveStatusByChannel = await getChannelsLiveStatus(
      settings.importantChannels.map((entry) => entry.name)
    );

    await writeRuntimeState({
      liveStatusByChannel
    });

    return liveStatusByChannel;
  }

  async function recordAndGetOrchestratorWakeGapMs() {
    const now = Date.now();
    const stored = await chrome.storage.local.get({
      [orchestratorLastTickAtKey]: 0
    });
    const previousTickAt = Math.round(Number(stored[orchestratorLastTickAtKey]));
    await chrome.storage.local.set({
      [orchestratorLastTickAtKey]: now
    });

    if (!Number.isFinite(previousTickAt) || previousTickAt <= 0) {
      return 0;
    }

    return Math.max(0, now - previousTickAt);
  }

  return {
    onInstalled,
    onStartup,
    onAlarm,
    syncAlarm,
    updateBadge,
    refreshLiveStatus
  };
}
