export function createStreamSessionService({
  readRuntimeStateCached,
  writeRuntimeState,
  canManageChannelForTab,
  requestWatchStreakForManagedTab,
  logWorkerEvent
}) {
  const CLAIM_RECORD_BLOCK_WINDOW_MS = 120000;
  const claimBlockedUntilByChannel = new Map();

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
    const liveStreamId = String(
      runtimeState.liveStreamMetaByChannel?.[channel]?.streamId || ""
    ).trim();
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

    let missingStreamId = false;
    if (!liveStreamId) {
      missingStreamId = true;
      await logWorkerEvent("stream-id:missing", {
        channel,
        tabId,
        uptimeSeconds
      });
    }

    if (!currentBroadcast) {
      const nextBroadcastSession = createBroadcastSession({
        streamId: liveStreamId || null,
        estimatedStartedAt,
        uptimeSeconds,
        now
      });
      nextBroadcastSessionsByChannel[channel] = nextBroadcastSession;
      await writeRuntimeState({
        broadcastSessionsByChannel: nextBroadcastSessionsByChannel
      });
      await logWorkerEvent("watch:uptime-init", {
        channel,
        streamId: liveStreamId || null,
        uptimeSeconds,
        estimatedStartedAt
      });
      await requestWatchStreakForManagedTab(channel, managedTabId);
      return { missingStreamId };
    }

    const broadcastRestarted = hasBroadcastRestarted(
      currentBroadcast,
      liveStreamId || null
    );

    nextBroadcastSessionsByChannel[channel] = {
      ...currentBroadcast,
      streamId: currentBroadcast?.streamId || liveStreamId || null,
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
        streamId: liveStreamId || null,
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
        previousStreamId: currentBroadcast?.streamId || null,
        streamId: liveStreamId || null,
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
      watchStreakByChannel: nextWatchStreakByChannel,
      lastKnownWatchStreakByChannel: nextLastKnownWatchStreakByChannel
    });

    if (broadcastRestarted) {
      await requestWatchStreakForManagedTab(channel, managedTabId);
    }

    return { missingStreamId };
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
    const blockedUntil = Math.round(Number(claimBlockedUntilByChannel.get(channel) || 0));

    if (blockedUntil > now) {
      await logWorkerEvent("claim:blocked-duplicate", {
        channel,
        blockedUntil
      });
      return;
    }

    claimBlockedUntilByChannel.set(channel, now + CLAIM_RECORD_BLOCK_WINDOW_MS);

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
    const currentBroadcast = runtimeState.broadcastSessionsByChannel?.[channel];
    if (currentBroadcast) {
      const nextBroadcast = {
        ...currentBroadcast,
        claimCount: nextClaimStatsByChannel[channel].count,
        lastClaimAt: now
      };
      nextBroadcastSessionsByChannel[channel] = nextBroadcast;
    }

    await writeRuntimeState({
      claimStatsByChannel: nextClaimStatsByChannel,
      claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel
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
    }

    await writeRuntimeState({
      watchStreakByChannel: nextWatchStreakByChannel,
      lastKnownWatchStreakByChannel: nextLastKnownWatchStreakByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel
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
  streamId,
  estimatedStartedAt,
  uptimeSeconds,
  now
}) {
  return {
    streamId: String(streamId || "").trim() || null,
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

function hasBroadcastRestarted(currentBroadcast, nextStreamId) {
  const previousStreamId = String(currentBroadcast?.streamId || "").trim();
  const normalizedNextStreamId = String(nextStreamId || "").trim();

  if (!previousStreamId || !normalizedNextStreamId) {
    return false;
  }

  return previousStreamId !== normalizedNextStreamId;
}
