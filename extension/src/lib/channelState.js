(function initializeChannelState(globalScope) {
  function getClaimCount(stats) {
    const count = Number(stats?.count);
    return Number.isInteger(count) && count >= 0 ? count : null;
  }

  function getWatchStreakLabel(streakState, broadcastState) {
    const value = Number(streakState?.value);
    const reachedForCurrentStream = Boolean(broadcastState?.streakIncreasedForStream);
    const hasUnexpectedJump = Boolean(
      broadcastState?.streakUnexpectedJumpForStream || streakState?.unexpectedJump
    );

    if (!Number.isInteger(value) || value < 0) {
      if (hasUnexpectedJump) {
        return "🔥 ⚠️";
      }
      return reachedForCurrentStream ? "🔥 ✅" : null;
    }

    if (hasUnexpectedJump) {
      return `🔥 ${value} ⚠️`;
    }

    return reachedForCurrentStream ? `🔥 ${value} ✅` : `🔥 ${value}`;
  }

  function isClaimAvailable(state) {
    return Boolean(state?.available);
  }

  function getClaimStatsForDisplay(channel, runtimeState, broadcastStats) {
    const runtimeStats = runtimeState?.claimStatsByChannel?.[channel];
    const activeBroadcast = runtimeState?.broadcastSessionsByChannel?.[channel];

    if (runtimeStats && isSameBroadcast(activeBroadcast, broadcastStats)) {
      return runtimeStats;
    }

    if (!broadcastStats) {
      return runtimeStats || null;
    }

    return {
      count: Math.max(0, Math.floor(Number(broadcastStats.claimCount) || 0)),
      lastClaimAt: Math.max(0, Math.round(Number(broadcastStats.lastClaimAt) || 0))
    };
  }

  function getWatchStreakForDisplay(channel, runtimeState, broadcastStats) {
    const runtimeStreak = runtimeState?.watchStreakByChannel?.[channel];
    if (runtimeStreak && isWatchStreakForBroadcast(runtimeStreak, broadcastStats)) {
      return runtimeStreak;
    }

    const streakValue = Math.floor(Number(broadcastStats?.streakValue));
    if (!Number.isInteger(streakValue) || streakValue < 0) {
      return runtimeStreak || runtimeState?.lastKnownWatchStreakByChannel?.[channel] || null;
    }

    return {
      value: streakValue,
      increased: Boolean(broadcastStats?.streakIncreasedForStream),
      unexpectedJump: Boolean(broadcastStats?.streakUnexpectedJumpForStream),
      seenAt: Math.max(0, Math.round(Number(broadcastStats?.streakSeenAt) || 0))
    };
  }

  function getChannelBroadcastStats(channel, runtimeState) {
    if (!channel || !runtimeState || typeof runtimeState !== "object") {
      return null;
    }

    const activeBroadcast = runtimeState.broadcastSessionsByChannel?.[channel];
    if (isValidBroadcastStats(activeBroadcast)) {
      return activeBroadcast;
    }

    const lastBroadcast = runtimeState.lastBroadcastStatsByChannel?.[channel];
    if (isValidBroadcastStats(lastBroadcast)) {
      return lastBroadcast;
    }

    return null;
  }

  function isValidBroadcastStats(stats) {
    const startedAt = Math.round(Number(stats?.estimatedStartedAt));
    return Number.isFinite(startedAt) && startedAt > 0;
  }

  function isSameBroadcast(left, right) {
    const leftStartedAt = Math.round(Number(left?.estimatedStartedAt));
    const rightStartedAt = Math.round(Number(right?.estimatedStartedAt));
    if (!Number.isFinite(leftStartedAt) || !Number.isFinite(rightStartedAt)) {
      return false;
    }

    return leftStartedAt === rightStartedAt;
  }

  function isWatchStreakForBroadcast(streak, broadcastStats) {
    const streakStartedAt = Math.round(Number(streak?.broadcastStartedAt));
    const broadcastStartedAt = Math.round(Number(broadcastStats?.estimatedStartedAt));
    if (!Number.isFinite(streakStartedAt) || !Number.isFinite(broadcastStartedAt)) {
      return false;
    }

    return streakStartedAt > 0 && streakStartedAt === broadcastStartedAt;
  }

  function hasActiveRuntimeSession(channel, runtimeState) {
    if (!channel || !runtimeState || typeof runtimeState !== "object") {
      return false;
    }

    if (Number.isInteger(runtimeState.managedTabsByChannel?.[channel])) {
      return true;
    }

    const broadcast = runtimeState.broadcastSessionsByChannel?.[channel];
    return isValidBroadcastStats(broadcast);
  }

  globalScope.StreamGuardChannelState = {
    getClaimCount,
    getWatchStreakLabel,
    isClaimAvailable,
    getClaimStatsForDisplay,
    getWatchStreakForDisplay,
    getChannelBroadcastStats,
    isValidBroadcastStats,
    isSameBroadcast,
    isWatchStreakForBroadcast,
    hasActiveRuntimeSession
  };
})(globalThis);
