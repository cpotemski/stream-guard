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
        const endedAt = Date.now();
        await writeRuntimeState({
          broadcastSessionsByChannel: {},
          lastBroadcastStatsByChannel: mergeEndedBroadcastStats(
            runtimeState.lastBroadcastStatsByChannel,
            runtimeState.broadcastSessionsByChannel,
            endedAt
          ),
          managedTabsByChannel: {},
          detachedUntilByChannel: {},
          watchSessionsByChannel: {},
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

function mergeEndedBroadcastStats(currentLastBroadcastStatsByChannel, broadcastSessionsByChannel, endedAt) {
  const nextLastBroadcastStatsByChannel = {
    ...(currentLastBroadcastStatsByChannel && typeof currentLastBroadcastStatsByChannel === "object"
      ? currentLastBroadcastStatsByChannel
      : {})
  };

  for (const [channel, session] of Object.entries(broadcastSessionsByChannel || {})) {
    const estimatedStartedAt = Math.round(Number(session?.estimatedStartedAt));
    if (!channel || !Number.isFinite(estimatedStartedAt) || estimatedStartedAt <= 0) {
      continue;
    }

    const existing = nextLastBroadcastStatsByChannel[channel];
    nextLastBroadcastStatsByChannel[channel] = {
      estimatedStartedAt,
      lastSeenAt: Math.max(0, Math.round(Number(session?.lastSeenAt) || 0)),
      lastUptimeSeconds: Math.max(0, Math.round(Number(session?.lastUptimeSeconds) || 0)),
      endedAt: Math.max(0, Math.round(Number(endedAt) || 0)),
      claimCount: Math.max(0, Math.floor(Number(session?.claimCount) || 0)),
      lastClaimAt: Math.max(0, Math.round(Number(session?.lastClaimAt) || 0)),
      streakValue: normalizeStreakValue(session?.streakValue),
      streakSeenAt: Math.max(0, Math.round(Number(session?.streakSeenAt) || 0)),
      baselineStreakValue: normalizeStreakValue(session?.baselineStreakValue),
      baselineStreakSeenAt: Math.max(
        0,
        Math.round(Number(session?.baselineStreakSeenAt) || 0)
      ),
      streakIncreasedForStream: Boolean(
        session?.streakIncreasedForStream || existing?.streakIncreasedForStream
      ),
      streakUnexpectedJumpForStream: Boolean(
        session?.streakUnexpectedJumpForStream || existing?.streakUnexpectedJumpForStream
      )
    };
  }

  return nextLastBroadcastStatsByChannel;
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
