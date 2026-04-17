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
    const nextLastKnownWatchStreakByChannel = {
      ...runtimeState.lastKnownWatchStreakByChannel
    };
    const nextLastBroadcastStatsByChannel = {
      ...runtimeState.lastBroadcastStatsByChannel
    };

    if (!currentBroadcast) {
      const nextBroadcastSession = createBroadcastSession({
        estimatedStartedAt,
        uptimeSeconds,
        now
      });
      nextBroadcastSessionsByChannel[channel] = nextBroadcastSession;
      nextLastBroadcastStatsByChannel[channel] = createLastBroadcastStats(nextBroadcastSession);
      await writeRuntimeState({
        broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
        lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel
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
      ...currentBroadcast,
      estimatedStartedAt,
      lastUptimeSeconds: uptimeSeconds,
      lastSeenAt: now,
      claimCount: Math.max(0, Math.floor(Number(currentBroadcast?.claimCount) || 0)),
      lastClaimAt: Math.round(Number(currentBroadcast?.lastClaimAt) || 0),
      streakValue: normalizeStreakValue(currentBroadcast?.streakValue),
      streakSeenAt: Math.round(Number(currentBroadcast?.streakSeenAt) || 0),
      baselineStreakValue: normalizeStreakValue(currentBroadcast?.baselineStreakValue),
      baselineStreakSeenAt: Math.round(Number(currentBroadcast?.baselineStreakSeenAt) || 0),
      streakIncreasedForStream: Boolean(currentBroadcast?.streakIncreasedForStream),
      streakUnexpectedJumpForStream: Boolean(currentBroadcast?.streakUnexpectedJumpForStream),
      startupRecoveryReloadedAt: Math.round(
        Number(currentBroadcast?.startupRecoveryReloadedAt) || 0
      )
    };

    if (broadcastRestarted) {
      nextBroadcastSessionsByChannel[channel] = createBroadcastSession({
        estimatedStartedAt,
        uptimeSeconds,
        now
      });
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
      delete nextWatchStreakByChannel[channel];
      await logWorkerEvent("watch:session-reset", {
        channel,
        previousBroadcast: currentBroadcast,
        uptimeSeconds,
        estimatedStartedAt
      });
    }
    nextLastBroadcastStatsByChannel[channel] = createLastBroadcastStats(
      nextBroadcastSessionsByChannel[channel]
    );

    await writeRuntimeState({
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
      watchSessionsByChannel: nextWatchSessionsByChannel,
      claimStatsByChannel: nextClaimStatsByChannel,
      claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
      watchStreakByChannel: nextWatchStreakByChannel,
      lastKnownWatchStreakByChannel: nextLastKnownWatchStreakByChannel,
      lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel
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
    const nextBroadcastSessionsByChannel = {
      ...runtimeState.broadcastSessionsByChannel
    };
    const nextLastBroadcastStatsByChannel = {
      ...runtimeState.lastBroadcastStatsByChannel
    };
    const currentBroadcast = runtimeState.broadcastSessionsByChannel?.[channel];
    if (currentBroadcast) {
      const nextBroadcast = {
        ...currentBroadcast,
        claimCount: nextClaimStatsByChannel[channel].count,
        lastClaimAt: now
      };
      nextBroadcastSessionsByChannel[channel] = nextBroadcast;
      nextLastBroadcastStatsByChannel[channel] = createLastBroadcastStats(nextBroadcast);
    }

    await writeRuntimeState({
      claimStatsByChannel: nextClaimStatsByChannel,
      claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
      lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel
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

    const currentBroadcast = runtimeState.broadcastSessionsByChannel?.[channel];
    if (!currentBroadcast) {
      return;
    }

    const highestKnownPositiveStreak = getHighestKnownPositiveStreak(runtimeState, channel);
    if (value < 1 && highestKnownPositiveStreak > 0) {
      await logWorkerEvent("streak:ignored-non-positive-after-positive", {
        channel,
        value,
        highestKnownPositiveStreak
      });
      return;
    }

    const currentBroadcastStartedAt = Math.round(Number(currentBroadcast?.estimatedStartedAt));
    const normalizedStartedAt = (
      Number.isFinite(currentBroadcastStartedAt) && currentBroadcastStartedAt > 0
        ? currentBroadcastStartedAt
        : 0
    );
    const previousReportedValue = normalizeStreakValue(currentBroadcast?.streakValue);
    if (previousReportedValue !== null && previousReportedValue === value) {
      return;
    }

    const now = Date.now();
    const existingBaseline = normalizeStreakValue(currentBroadcast?.baselineStreakValue);
    const existingBaselineSeenAt = Math.round(Number(currentBroadcast?.baselineStreakSeenAt) || 0);
    const hasKnownBaseline = existingBaseline !== null && existingBaselineSeenAt > 0;
    const streakAlreadyReached = Boolean(currentBroadcast?.streakIncreasedForStream);

    let baselineValue = hasKnownBaseline ? existingBaseline : value;
    let baselineSeenAt = hasKnownBaseline ? existingBaselineSeenAt : now;
    let increasedForThisUpdate = false;
    let unexpectedJumpForThisUpdate = false;
    const hadUnexpectedJump = Boolean(currentBroadcast?.streakUnexpectedJumpForStream);

    if (hasKnownBaseline && !streakAlreadyReached) {
      if (value === existingBaseline + 1) {
        increasedForThisUpdate = true;
      } else if (value !== existingBaseline) {
        unexpectedJumpForThisUpdate = value > existingBaseline + 1;
        // Unexpected jump/drop: keep tracking, but do not mark a streak increase.
        baselineValue = value;
        baselineSeenAt = now;
      }
    }

    const reachedForCurrentStream = (
      streakAlreadyReached
      || increasedForThisUpdate
    );
    const hasUnexpectedJumpForCurrentStream = reachedForCurrentStream
      ? false
      : (hadUnexpectedJump || unexpectedJumpForThisUpdate);

    const nextWatchStreakByChannel = {
      ...runtimeState.watchStreakByChannel,
      [channel]: {
        value,
        increased: reachedForCurrentStream,
        unexpectedJump: hasUnexpectedJumpForCurrentStream,
        seenAt: now,
        broadcastStartedAt: normalizedStartedAt
      }
    };
    const nextLastKnownWatchStreakByChannel = {
      ...runtimeState.lastKnownWatchStreakByChannel,
      [channel]: {
        value,
        seenAt: now
      }
    };
    const nextBroadcastSessionsByChannel = {
      ...runtimeState.broadcastSessionsByChannel
    };
    const nextLastBroadcastStatsByChannel = {
      ...runtimeState.lastBroadcastStatsByChannel
    };

    if (currentBroadcast) {
      const nextBroadcast = {
        ...currentBroadcast,
        streakValue: value,
        streakSeenAt: now,
        baselineStreakValue: baselineValue,
        baselineStreakSeenAt: baselineSeenAt,
        streakIncreasedForStream: reachedForCurrentStream,
        streakUnexpectedJumpForStream: hasUnexpectedJumpForCurrentStream
      };
      nextBroadcastSessionsByChannel[channel] = nextBroadcast;
      nextLastBroadcastStatsByChannel[channel] = createLastBroadcastStats(nextBroadcast);
    }

    await writeRuntimeState({
      watchStreakByChannel: nextWatchStreakByChannel,
      lastKnownWatchStreakByChannel: nextLastKnownWatchStreakByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
      lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel
    });
    await logWorkerEvent("streak:updated", {
      channel,
      value,
      reachedForCurrentStream,
      hasUnexpectedJumpForCurrentStream
    });
  }

  return {
    handleWatchUptime,
    recordClaim,
    updateClaimAvailability,
    updateWatchStreak
  };
}

function createBroadcastSession({
  estimatedStartedAt,
  uptimeSeconds,
  now
}) {
  return {
    estimatedStartedAt,
    lastUptimeSeconds: uptimeSeconds,
    lastSeenAt: now,
    claimCount: 0,
    lastClaimAt: 0,
    streakValue: null,
    streakSeenAt: 0,
    baselineStreakValue: null,
    baselineStreakSeenAt: 0,
    streakIncreasedForStream: false,
    streakUnexpectedJumpForStream: false,
    startupRecoveryReloadedAt: 0
  };
}

function createLastBroadcastStats(session) {
  const estimatedStartedAt = Math.round(Number(session?.estimatedStartedAt));
  if (!Number.isFinite(estimatedStartedAt) || estimatedStartedAt <= 0) {
    return null;
  }

  return {
    estimatedStartedAt,
    lastSeenAt: Math.round(Number(session?.lastSeenAt) || 0),
    lastUptimeSeconds: Math.max(0, Math.round(Number(session?.lastUptimeSeconds) || 0)),
    endedAt: 0,
    claimCount: Math.max(0, Math.floor(Number(session?.claimCount) || 0)),
    lastClaimAt: Math.round(Number(session?.lastClaimAt) || 0),
    streakValue: normalizeStreakValue(session?.streakValue),
    streakSeenAt: Math.round(Number(session?.streakSeenAt) || 0),
    baselineStreakValue: normalizeStreakValue(session?.baselineStreakValue),
    baselineStreakSeenAt: Math.round(Number(session?.baselineStreakSeenAt) || 0),
    streakIncreasedForStream: Boolean(session?.streakIncreasedForStream),
    streakUnexpectedJumpForStream: Boolean(session?.streakUnexpectedJumpForStream)
  };
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

function getHighestKnownPositiveStreak(runtimeState, channel) {
  if (!channel || !runtimeState || typeof runtimeState !== "object") {
    return 0;
  }

  const candidates = [
    runtimeState.watchStreakByChannel?.[channel]?.value,
    runtimeState.broadcastSessionsByChannel?.[channel]?.streakValue,
    runtimeState.broadcastSessionsByChannel?.[channel]?.baselineStreakValue,
    runtimeState.lastBroadcastStatsByChannel?.[channel]?.streakValue,
    runtimeState.lastBroadcastStatsByChannel?.[channel]?.baselineStreakValue,
    runtimeState.lastKnownWatchStreakByChannel?.[channel]?.value
  ];

  let highest = 0;
  for (const candidate of candidates) {
    const normalized = normalizeStreakValue(candidate);
    if (normalized !== null && normalized > highest) {
      highest = normalized;
    }
  }

  return highest;
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
