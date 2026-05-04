import { getChannelsLiveState } from "../lib/liveStatus.js";

export function createOrchestratorService({
  alarmName,
  rotationAlarmName,
  orchestratorLastTickAtKey,
  wakeGapThresholdMs,
  readSettingsFresh,
  writeSettings,
  readRuntimeStateFresh,
  writeRuntimeState,
  readRuntimeStateCached,
  rebindManagedTabsAfterUpdate,
  readSettingsCached,
  reconcileManagedTabs,
  recoverManagedTabsAfterWake,
  rotateManagedTabsIfNeeded,
  logWorkerEvent,
  reconcileWatchGroup
}) {
  async function onInstalled(details) {
    const settings = await readSettingsFresh();
    await writeSettings(settings);
    const runtimeState = await writeRuntimeState(await readRuntimeStateFresh());
    await reconcileWatchGroup({
      managedTabIds: Object.values(runtimeState.managedTabsByChannel)
    });
    if (details?.reason === "update") {
      await rebindManagedTabsAfterUpdate(runtimeState.managedTabsByChannel);
    }
    await syncAlarm(settings.autoManage);
    await updateBadge(settings);
  }

  async function onStartup() {
    const settings = await readSettingsCached();
    const runtimeState = await readRuntimeStateCached();
    await reconcileWatchGroup({
      managedTabIds: Object.values(runtimeState.managedTabsByChannel)
    });
    await syncAlarm(settings.autoManage);
    await updateBadge(settings);
  }

  async function onAlarm(alarm) {
    if (alarm?.name === rotationAlarmName) {
      const settings = await readSettingsCached();
      if (settings.autoManage) {
        await rotateManagedTabsIfNeeded();
      }
      return;
    }

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
    await chrome.alarms.clear(rotationAlarmName);

    if (enabled) {
      await chrome.alarms.create(alarmName, {
        periodInMinutes: 1
      });
      await chrome.alarms.create(rotationAlarmName, {
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
    const liveStateByChannel = await getChannelsLiveState(
      settings.importantChannels.map((entry) => entry.name)
    );
    const liveStatusByChannel = Object.fromEntries(
      Object.entries(liveStateByChannel).map(([channel, state]) => [channel, state.status])
    );
    const liveStreamMetaByChannel = Object.fromEntries(
      Object.entries(liveStateByChannel)
        .filter(([, state]) => state?.status === "live" && state?.streamId)
        .map(([channel, state]) => [channel, { streamId: state.streamId }])
    );

    await writeRuntimeState({
      liveStatusByChannel,
      liveStreamMetaByChannel
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
