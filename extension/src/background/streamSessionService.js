export function createStreamSessionService({
  readRuntimeStateCached,
  writeRuntimeState,
  canManageChannelForTab,
  requestWatchStreakForManagedTab,
  logWorkerEvent
}) {
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

    const now = Date.now();
    const estimatedStartedAt = now - (uptimeSeconds * 1000);
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
        lastUptimeSeconds: uptimeSeconds,
        lastSeenAt: now,
        streakIncreasedForStream: false
      };
      await writeRuntimeState({
        broadcastSessionsByChannel: nextBroadcastSessionsByChannel
      });
      await logWorkerEvent("watch:uptime-init", {
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
      lastUptimeSeconds: uptimeSeconds,
      lastSeenAt: now,
      streakIncreasedForStream: Boolean(currentBroadcast?.streakIncreasedForStream)
    };

    if (broadcastRestarted) {
      nextBroadcastSessionsByChannel[channel] = {
        estimatedStartedAt,
        lastUptimeSeconds: uptimeSeconds,
        lastSeenAt: now,
        streakIncreasedForStream: false
      };
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
      await logWorkerEvent("watch:session-reset", {
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
    await logWorkerEvent("claim:recorded", {
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
    await logWorkerEvent(available ? "claim:available" : "claim:cleared", {
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
    const currentBroadcast = runtimeState.broadcastSessionsByChannel?.[channel];
    const reachedForCurrentStream = Boolean(currentBroadcast?.streakIncreasedForStream) || increased;

    const nextWatchStreakByChannel = {
      ...runtimeState.watchStreakByChannel,
      [channel]: {
        value,
        increased,
        seenAt: Date.now()
      }
    };
    const nextBroadcastSessionsByChannel = {
      ...runtimeState.broadcastSessionsByChannel
    };

    if (currentBroadcast) {
      nextBroadcastSessionsByChannel[channel] = {
        ...currentBroadcast,
        streakIncreasedForStream: reachedForCurrentStream
      };
    }

    await writeRuntimeState({
      watchStreakByChannel: nextWatchStreakByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel
    });
    await logWorkerEvent("streak:updated", {
      channel,
      value,
      reachedForCurrentStream
    });
  }

  return {
    handleWatchUptime,
    recordClaim,
    updateClaimAvailability,
    updateWatchStreak
  };
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
