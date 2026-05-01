export function createMessageRouter({
  readSettingsCached,
  readRuntimeStateCached,
  writeSettings,
  syncAlarm,
  reconcileManagedTabs,
  updateBadge,
  toggleImportantChannel,
  logWorkerEvent,
  closeManagedWatchTabs,
  reconcileWatchGroup,
  writeRuntimeState,
  handleWatchUptime,
  canManageWatchTab,
  canManageChannelForTab,
  recordClaim,
  updateClaimAvailability,
  updateWatchStreak,
  markTabContentReady,
  logTabTelemetryEvent,
  exportTelemetrySnapshot,
  clearTelemetry,
  getTelemetryStats
}) {
  return async function handleMessage(message, sender) {
    switch (message?.type) {
      case "settings:get": {
        const settings = await readSettingsCached();
        return { settings };
      }
      case "status:get": {
        const settings = await readSettingsCached();
        const runtimeState = await readRuntimeStateCached();
        const telemetry = await getTelemetryStats();
        return { settings, runtimeState, telemetry };
      }
      case "channel:toggle": {
        const previousSettings = await readSettingsCached();
        const settings = await toggleImportantChannel(message.channel);
        const removedChannels = getRemovedChannels(
          previousSettings.importantChannels,
          settings.importantChannels
        );
        if (settings.autoManage) {
          await reconcileManagedTabs(settings);
        }
        if (removedChannels.length > 0) {
          await clearRuntimeStateForChannels(removedChannels, writeRuntimeState);
        }
        await updateBadge(settings);
        return { settings };
      }
      case "settings:update": {
        const previousSettings = await readSettingsCached();
        const settings = await writeSettings(message.settings || {});
        const removedChannels = getRemovedChannels(
          previousSettings.importantChannels,
          settings.importantChannels
        );
        await syncAlarm(settings.autoManage);
        if (settings.autoManage) {
          await reconcileManagedTabs(settings);
        }
        if (removedChannels.length > 0) {
          await clearRuntimeStateForChannels(removedChannels, writeRuntimeState);
        }
        await updateBadge(settings);
        return { settings };
      }
      case "watch:start": {
        await logWorkerEvent("watch:start", {});
        const settings = await writeSettings({ autoManage: true });
        const managedTabsByChannel = await reconcileManagedTabs(settings);
        await syncAlarm(true);
        await updateBadge(settings);
        return { settings, openedTabs: Object.keys(managedTabsByChannel).length };
      }
      case "watch:stop": {
        await logWorkerEvent("watch:stop", {});
        const runtimeState = await readRuntimeStateCached();
        const closedTabs = await closeManagedWatchTabs(
          Object.values(runtimeState.managedTabsByChannel)
        );
        await writeRuntimeState({
          managedTabsByChannel: {},
          detachedUntilByChannel: {},
          watchSessionsByChannel: {},
          claimAvailabilityByChannel: {},
          playbackStateByChannel: {}
        });
        await reconcileWatchGroup({
          managedTabIds: []
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

        await logWorkerEvent("watch:playback-corrected", { channel });
        return {};
      }
      case "watch:playback-resumed": {
        const channel = String(message?.channel || "").toLowerCase();
        const authorized = await canManageChannelForTab(channel, sender?.tab?.id);
        if (!authorized) {
          return {};
        }

        await logWorkerEvent("watch:playback-resumed", { channel });
        return {};
      }
      case "watch:playback-state": {
        const channel = String(message?.channel || "").toLowerCase();
        const senderTabId = sender?.tab?.id;
        if (!channel || !Number.isInteger(senderTabId)) {
          await logWorkerEvent("playback-state:invalid", {
            channel,
            tabId: senderTabId
          });
          return {};
        }

        const authorized = await canManageChannelForTab(channel, senderTabId);
        if (!authorized) {
          await logWorkerEvent("playback-state:ignored", {
            channel,
            senderTabId
          });
          return {};
        }

        const runtimeState = await readRuntimeStateCached();
        const state = message?.state === "paused"
          ? "paused"
          : message?.state === "muted" ? "muted" : "ok";
        await logWorkerEvent("playback-state:updated", {
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
      case "content:ready": {
        markTabContentReady(sender?.tab?.id);
        return {};
      }
      case "claim:authorize": {
        return {
          authorized: await canManageWatchTab(message, sender)
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
      case "streak:probe-log": {
        const channel = String(message?.channel || "").toLowerCase();
        const senderTabId = sender?.tab?.id;
        const reason = String(message?.reason || "").toLowerCase();
        const details = message?.details && typeof message.details === "object"
          ? message.details
          : {};

        if (!channel || !reason || !Number.isInteger(senderTabId)) {
          await logWorkerEvent("streak:probe-log:invalid", {
            channel,
            reason,
            senderTabId
          });
          return {};
        }

        const authorized = await canManageChannelForTab(channel, senderTabId);
        if (!authorized) {
          return {};
        }

        await logWorkerEvent("streak:probe-log", {
          channel,
          reason,
          details
        });
        return {};
      }
      case "telemetry:tab-event": {
        const event = String(message?.event || "").toLowerCase();
        const details = message?.details && typeof message.details === "object"
          ? message.details
          : {};
        const senderTabId = sender?.tab?.id;

        if (!event || !Number.isInteger(senderTabId)) {
          return {};
        }

        await logTabTelemetryEvent({
          event,
          details,
          sender
        });
        return {};
      }
      case "telemetry:export": {
        const snapshot = await exportTelemetrySnapshot();
        return { snapshot };
      }
      case "telemetry:clear": {
        const result = await clearTelemetry();
        return result;
      }
      default:
        throw new Error("Unsupported message type.");
    }
  };
}

function getRemovedChannels(previousChannels, nextChannels) {
  const previousNames = new Set(
    (Array.isArray(previousChannels) ? previousChannels : [])
      .map((entry) => String(entry?.name || "").toLowerCase())
      .filter(Boolean)
  );
  const nextNames = new Set(
    (Array.isArray(nextChannels) ? nextChannels : [])
      .map((entry) => String(entry?.name || "").toLowerCase())
      .filter(Boolean)
  );

  return [...previousNames].filter((channel) => !nextNames.has(channel));
}

async function clearRuntimeStateForChannels(channels, writeRuntimeState) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return;
  }

  const currentState = await readRuntimeStateCached();
  const nextState = {
    managedTabsByChannel: { ...currentState.managedTabsByChannel },
    detachedUntilByChannel: { ...currentState.detachedUntilByChannel },
    liveStatusByChannel: { ...currentState.liveStatusByChannel },
    watchSessionsByChannel: { ...currentState.watchSessionsByChannel },
    broadcastSessionsByChannel: { ...currentState.broadcastSessionsByChannel },
    lastBroadcastStatsByChannel: { ...currentState.lastBroadcastStatsByChannel },
    claimStatsByChannel: { ...currentState.claimStatsByChannel },
    claimAvailabilityByChannel: { ...currentState.claimAvailabilityByChannel },
    playbackStateByChannel: { ...currentState.playbackStateByChannel },
    watchStreakByChannel: { ...currentState.watchStreakByChannel },
    lastKnownWatchStreakByChannel: { ...currentState.lastKnownWatchStreakByChannel }
  };

  for (const channel of channels) {
    delete nextState.managedTabsByChannel[channel];
    delete nextState.detachedUntilByChannel[channel];
    delete nextState.liveStatusByChannel[channel];
    delete nextState.watchSessionsByChannel[channel];
    delete nextState.broadcastSessionsByChannel[channel];
    delete nextState.lastBroadcastStatsByChannel[channel];
    delete nextState.claimStatsByChannel[channel];
    delete nextState.claimAvailabilityByChannel[channel];
    delete nextState.playbackStateByChannel[channel];
    delete nextState.watchStreakByChannel[channel];
    delete nextState.lastKnownWatchStreakByChannel[channel];
  }

  await writeRuntimeState(nextState);
}
