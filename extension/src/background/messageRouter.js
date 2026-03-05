export function createMessageRouter({
  readSettingsCached,
  readRuntimeStateCached,
  writeSettings,
  syncAlarm,
  reconcileManagedTabs,
  updateBadge,
  toggleImportantChannel,
  logWorkerEvent,
  resetManagedWatchState,
  closeManagedWatchTabs,
  writeRuntimeState,
  handleWatchUptime,
  canManageWatchTab,
  canManageChannelForTab,
  recordClaim,
  updateClaimAvailability,
  updateWatchStreak
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
        return { settings, runtimeState };
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
        await logWorkerEvent("watch:start", {});
        await resetManagedWatchState();
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
      default:
        throw new Error("Unsupported message type.");
    }
  };
}
