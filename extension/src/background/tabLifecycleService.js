import { getChannelsLiveState } from "../lib/liveStatus.js";
import { closeManagedWatchTabs, openWatchTab, reconcileWatchGroup } from "../lib/tabManager.js";
import { evaluateManagedTabPrimeBarrier } from "./tabPrimeState.js";

export function createTabLifecycleService({
  readRuntimeStateCached,
  readRuntimeStateFresh,
  writeRuntimeState,
  getExistingTab,
  getChannelFromTab,
  logWorkerEvent,
  readTabPrimeState,
  resetTabPrimeState,
  clearTabPrimeState,
  markPendingManagedTab,
  clearPendingManagedTab,
  detachedReopenCooldownMs,
  startupRecoveryReloadThresholdMs
}) {
  const managedTabPrimeTimeoutMs = 30000;
  const managedTabActivationIntervalMs = 1000;
  const managedTabPlaybackRequestIntervalMs = 1000;
  const managedTabStreakRequestIntervalMs = 2500;

  async function rebindManagedTabsAfterUpdate(managedTabsByChannel) {
    const entries = Object.entries(managedTabsByChannel || {});
    const targets = entries.filter(([, tabId]) => Number.isInteger(tabId));

    for (const [channel, tabId] of targets) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "watch:request-playback-state",
          channel
        });
      } catch (_error) {
        try {
          await chrome.tabs.reload(tabId);
          await logWorkerEvent("rebind:tab-reloaded-after-update", {
            channel,
            tabId
          });
        } catch (_reloadError) {
          await logWorkerEvent("rebind:tab-reload-failed-after-update", {
            channel,
            tabId
          });
        }
      }
    }
  }

  async function reconcileManagedTabs(settings) {
    const now = Date.now();
    const runtimeState = await readRuntimeStateCached();
    const prioritizedChannels = settings.importantChannels.map((entry) => entry.name);
    const liveStateByChannel = await getChannelsLiveState(prioritizedChannels);
    const nextLiveStatusByChannel = Object.fromEntries(
      Object.entries(liveStateByChannel).map(([channel, state]) => [channel, state.status])
    );
    const nextLiveStreamMetaByChannel = Object.fromEntries(
      Object.entries(liveStateByChannel)
        .filter(([, state]) => state?.status === "live" && state?.streamId)
        .map(([channel, state]) => [channel, { streamId: state.streamId }])
    );
    const liveChannels = [];
    for (const channel of prioritizedChannels) {
      if (liveChannels.length >= Math.max(0, Number(settings.maxStreams) || 0)) {
        break;
      }

      if (liveStateByChannel[channel]?.status === "live") {
        liveChannels.push(channel);
      }
    }
    const desiredChannels = new Set(liveChannels);
    const nextManagedTabsByChannel = { ...runtimeState.managedTabsByChannel };
    const nextDetachedUntilByChannel = { ...runtimeState.detachedUntilByChannel };
    const nextWatchSessionsByChannel = { ...runtimeState.watchSessionsByChannel };
    const nextBroadcastSessionsByChannel = { ...runtimeState.broadcastSessionsByChannel };
    const nextLastBroadcastStatsByChannel = { ...runtimeState.lastBroadcastStatsByChannel };
    const nextClaimStatsByChannel = { ...runtimeState.claimStatsByChannel };
    const nextClaimAvailabilityByChannel = { ...runtimeState.claimAvailabilityByChannel };
    const nextPlaybackStateByChannel = { ...runtimeState.playbackStateByChannel };
    const nextWatchStreakByChannel = { ...runtimeState.watchStreakByChannel };

    await logWorkerEvent("reconcile:start", {
      prioritizedChannels,
      liveChannels,
      runtimeState: summarizeRuntimeState(runtimeState)
    });

    for (const [channel, tabId] of Object.entries(runtimeState.managedTabsByChannel)) {
      if (!desiredChannels.has(channel)) {
        const keepBroadcastSession = hasPersistedBroadcastSession(
          nextBroadcastSessionsByChannel[channel]
        );
        await logWorkerEvent("reconcile:close-not-desired", {
          channel,
          tabId,
          keepBroadcastSession
        });
        await closeManagedWatchTabs([tabId]);
        markBroadcastEnded(
          nextLastBroadcastStatsByChannel,
          channel,
          nextBroadcastSessionsByChannel[channel],
          now
        );
        delete nextManagedTabsByChannel[channel];
        delete nextWatchSessionsByChannel[channel];
        delete nextClaimStatsByChannel[channel];
        delete nextClaimAvailabilityByChannel[channel];
        delete nextPlaybackStateByChannel[channel];
        if (!keepBroadcastSession) {
          delete nextBroadcastSessionsByChannel[channel];
          delete nextWatchStreakByChannel[channel];
        }
        delete nextDetachedUntilByChannel[channel];
        continue;
      }

      const tab = await getExistingTab(tabId);
      if (!tab) {
        const keepBroadcastSession = hasPersistedBroadcastSession(
          nextBroadcastSessionsByChannel[channel]
        );
        await logWorkerEvent("reconcile:drop-missing-tab", {
          channel,
          tabId,
          keepBroadcastSession
        });
        markBroadcastEnded(
          nextLastBroadcastStatsByChannel,
          channel,
          nextBroadcastSessionsByChannel[channel],
          now
        );
        delete nextManagedTabsByChannel[channel];
        delete nextWatchSessionsByChannel[channel];
        delete nextClaimStatsByChannel[channel];
        delete nextClaimAvailabilityByChannel[channel];
        delete nextPlaybackStateByChannel[channel];
        if (!keepBroadcastSession) {
          delete nextBroadcastSessionsByChannel[channel];
          delete nextWatchStreakByChannel[channel];
        }
        delete nextDetachedUntilByChannel[channel];
        continue;
      }

      const currentChannel = getChannelFromTab(tab);
      if (currentChannel === null && tab.status !== "complete") {
        await logWorkerEvent("reconcile:keep-loading-tab", {
          channel,
          tabId,
          status: tab.status,
          url: tab.pendingUrl || tab.url || null
        });
        continue;
      }

      if (currentChannel !== channel) {
        const keepBroadcastSession = hasPersistedBroadcastSession(
          nextBroadcastSessionsByChannel[channel]
        );
        await logWorkerEvent("reconcile:close-detached", {
          channel,
          tabId,
          status: tab.status,
          currentChannel,
          url: tab.pendingUrl || tab.url || null,
          keepBroadcastSession
        });
        await closeManagedWatchTabs([tabId]);
        markBroadcastEnded(
          nextLastBroadcastStatsByChannel,
          channel,
          nextBroadcastSessionsByChannel[channel],
          now
        );
        delete nextManagedTabsByChannel[channel];
        delete nextWatchSessionsByChannel[channel];
        delete nextClaimStatsByChannel[channel];
        delete nextClaimAvailabilityByChannel[channel];
        delete nextPlaybackStateByChannel[channel];
        if (!keepBroadcastSession) {
          delete nextBroadcastSessionsByChannel[channel];
          delete nextWatchStreakByChannel[channel];
        }
        nextDetachedUntilByChannel[channel] = now + detachedReopenCooldownMs;
        continue;
      }

      if (!nextWatchSessionsByChannel[channel]) {
        nextWatchSessionsByChannel[channel] = {
          startedAt: Date.now()
        };
      }
      if (!nextClaimStatsByChannel[channel]) {
        const retainedBroadcast = nextBroadcastSessionsByChannel[channel];
        const retainedClaimCount = Math.max(
          0,
          Math.floor(Number(retainedBroadcast?.claimCount) || 0)
        );
        const retainedLastClaimAt = Math.max(
          0,
          Math.round(Number(retainedBroadcast?.lastClaimAt) || 0)
        );
        nextClaimStatsByChannel[channel] = {
          count: retainedClaimCount,
          lastClaimAt: retainedLastClaimAt > 0 ? retainedLastClaimAt : 0
        };
      }

      if (!nextClaimAvailabilityByChannel[channel]) {
        nextClaimAvailabilityByChannel[channel] = {
          available: false,
          seenAt: 0
        };
      }
    }

    for (const channel of liveChannels) {
      const detachedUntil = Math.round(Number(nextDetachedUntilByChannel[channel] || 0));
      if (detachedUntil > 0 && detachedUntil <= now) {
        delete nextDetachedUntilByChannel[channel];
      }

      if (nextManagedTabsByChannel[channel] || detachedUntil > now) {
        await logWorkerEvent("reconcile:skip-open", {
          channel,
          hasTab: Boolean(nextManagedTabsByChannel[channel]),
          detachedUntil
        });
        continue;
      }

      const tabId = await openWatchTab(channel, {
        managedTabIds: Object.values(nextManagedTabsByChannel)
      });
      if (Number.isInteger(tabId)) {
        markPendingManagedTab(channel, tabId);
        resetTabPrimeState(tabId);
        nextManagedTabsByChannel[channel] = tabId;
        nextWatchSessionsByChannel[channel] = {
          startedAt: Date.now()
        };
        const keepBroadcastSession = hasPersistedBroadcastSession(
          nextBroadcastSessionsByChannel[channel]
        );
        if (!keepBroadcastSession) {
          delete nextBroadcastSessionsByChannel[channel];
          delete nextWatchStreakByChannel[channel];
        }
        const retainedBroadcast = nextBroadcastSessionsByChannel[channel];
        const retainedClaimCount = Math.max(
          0,
          Math.floor(Number(retainedBroadcast?.claimCount) || 0)
        );
        const retainedLastClaimAt = Math.max(
          0,
          Math.round(Number(retainedBroadcast?.lastClaimAt) || 0)
        );
        nextClaimStatsByChannel[channel] = {
          count: retainedClaimCount,
          lastClaimAt: retainedLastClaimAt > 0 ? retainedLastClaimAt : 0
        };
        nextClaimAvailabilityByChannel[channel] = {
          available: false,
          seenAt: 0
        };
        await logWorkerEvent("reconcile:open-tab", {
          channel,
          tabId,
          keepBroadcastSession
        });
        await writeRuntimeState({
          managedTabsByChannel: nextManagedTabsByChannel,
          detachedUntilByChannel: nextDetachedUntilByChannel,
          liveStatusByChannel: nextLiveStatusByChannel,
          liveStreamMetaByChannel: nextLiveStreamMetaByChannel,
          watchSessionsByChannel: nextWatchSessionsByChannel,
          broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
          lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel,
          claimStatsByChannel: nextClaimStatsByChannel,
          claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
          playbackStateByChannel: nextPlaybackStateByChannel,
          watchStreakByChannel: nextWatchStreakByChannel
        });
        try {
          await waitForManagedTabInitialization(channel, tabId);
        } finally {
          clearTabPrimeState(tabId);
          clearPendingManagedTab(channel, tabId);
        }
      }
    }

    await triggerStartupRecoveryReloads({
      managedTabsByChannel: nextManagedTabsByChannel,
      watchSessionsByChannel: nextWatchSessionsByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel
    });

    for (const [channel, detachedUntil] of Object.entries(nextDetachedUntilByChannel)) {
      if (!desiredChannels.has(channel) || detachedUntil <= now) {
        delete nextDetachedUntilByChannel[channel];
      }
    }

    const assignedChannels = new Set(Object.keys(nextManagedTabsByChannel));

    for (const channel of Object.keys(nextWatchSessionsByChannel)) {
      if (!assignedChannels.has(channel)) {
        delete nextWatchSessionsByChannel[channel];
      }
    }

    for (const channel of Object.keys(nextBroadcastSessionsByChannel)) {
      if (!assignedChannels.has(channel)
        && !hasPersistedBroadcastSession(nextBroadcastSessionsByChannel[channel])) {
        delete nextBroadcastSessionsByChannel[channel];
      }
    }

    for (const channel of Object.keys(nextClaimStatsByChannel)) {
      if (!assignedChannels.has(channel)) {
        delete nextClaimStatsByChannel[channel];
      }
    }

    for (const channel of Object.keys(nextClaimAvailabilityByChannel)) {
      if (!assignedChannels.has(channel)) {
        delete nextClaimAvailabilityByChannel[channel];
      }
    }

    for (const channel of Object.keys(nextPlaybackStateByChannel)) {
      if (!assignedChannels.has(channel)) {
        delete nextPlaybackStateByChannel[channel];
      }
    }

    for (const channel of Object.keys(nextWatchStreakByChannel)) {
      const hasPersistedSession = hasPersistedBroadcastSession(
        nextBroadcastSessionsByChannel[channel]
      );
      if (!assignedChannels.has(channel) && !hasPersistedSession) {
        delete nextWatchStreakByChannel[channel];
      }
    }

    await writeRuntimeState({
      managedTabsByChannel: nextManagedTabsByChannel,
      detachedUntilByChannel: nextDetachedUntilByChannel,
      liveStatusByChannel: nextLiveStatusByChannel,
      liveStreamMetaByChannel: nextLiveStreamMetaByChannel,
      watchSessionsByChannel: nextWatchSessionsByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
      lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel,
      claimStatsByChannel: nextClaimStatsByChannel,
      claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
      playbackStateByChannel: nextPlaybackStateByChannel,
      watchStreakByChannel: nextWatchStreakByChannel
    });
    await reconcileWatchGroup({
      managedTabIds: Object.values(nextManagedTabsByChannel)
    });

    void requestPlaybackStateForManagedTabs(nextManagedTabsByChannel);
    setTimeout(
      () => {
        void requestPlaybackStateForManagedTabs(nextManagedTabsByChannel);
      },
      3000
    );

    await logWorkerEvent("reconcile:done", summarizeRuntimeState({
      managedTabsByChannel: nextManagedTabsByChannel,
      detachedUntilByChannel: nextDetachedUntilByChannel,
      liveStatusByChannel: nextLiveStatusByChannel,
      liveStreamMetaByChannel: nextLiveStreamMetaByChannel,
      watchSessionsByChannel: nextWatchSessionsByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
      lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel,
      claimStatsByChannel: nextClaimStatsByChannel,
      claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
      playbackStateByChannel: nextPlaybackStateByChannel,
      watchStreakByChannel: nextWatchStreakByChannel
    }));

    return nextManagedTabsByChannel;
  }

  async function recoverManagedTabsAfterWake(settings) {
    const managedTabsByChannel = await reconcileManagedTabs(settings);
    const entries = Object.entries(managedTabsByChannel || {})
      .filter(([, tabId]) => Number.isInteger(tabId));

    for (const [channel, tabId] of entries) {
      const tab = await getExistingTab(tabId);
      if (!tab) {
        continue;
      }

      if (tab.discarded) {
        try {
          await chrome.tabs.reload(tabId);
          await logWorkerEvent("wake:tab-reloaded-discarded", {
            channel,
            tabId
          });
        } catch (_error) {
          await logWorkerEvent("wake:tab-reload-failed-discarded", {
            channel,
            tabId
          });
        }
        continue;
      }

      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "watch:request-playback-state",
          channel
        });
      } catch (_error) {
        try {
          await chrome.tabs.reload(tabId);
          await logWorkerEvent("wake:tab-reloaded-unreachable", {
            channel,
            tabId
          });
        } catch (_reloadError) {
          await logWorkerEvent("wake:tab-reload-failed-unreachable", {
            channel,
            tabId
          });
        }
      }
    }
  }

  async function requestWatchStreakForManagedTab(channel, tabId) {
    if (!channel || !Number.isInteger(tabId)) {
      return;
    }

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "watch:request-streak",
        channel
      });
    } catch (_error) {
      await logWorkerEvent("watch:streak-request-failed", {
        channel,
        tabId
      });
    }
  }

  async function waitForManagedTabInitialization(channel, tabId) {
    if (!channel || !Number.isInteger(tabId)) {
      return;
    }

    await logWorkerEvent("watch:init-wait-start", {
      channel,
      tabId
    });
    await logWorkerEvent("watch:init-start", {
      channel,
      tabId
    });

    const initializationStartedAt = Date.now();
    let lastActivationAttemptAt = 0;
    let lastPlaybackRequestAt = 0;
    let lastStreakRequestAt = 0;
    let contentReadyLogged = false;
    let streakAttemptLogged = false;

    while (true) {
      const now = Date.now();
      const elapsedMs = Math.max(0, now - initializationStartedAt);
      const runtimeState = await readRuntimeStateFresh();
      if (runtimeState.managedTabsByChannel?.[channel] !== tabId) {
        await logWorkerEvent("watch:init-aborted-reassigned", {
          channel,
          tabId
        });
        return;
      }

      if (now - lastActivationAttemptAt >= managedTabActivationIntervalMs) {
        lastActivationAttemptAt = now;
        await ensureManagedTabActive(tabId);
      }

      const primeState = readTabPrimeState(tabId);
      if (primeState.contentReady && !contentReadyLogged) {
        contentReadyLogged = true;
        await logWorkerEvent("watch:init-content-ready", {
          channel,
          tabId
        });
      }

      const barrier = evaluateManagedTabPrimeBarrier({
        elapsedMs,
        primeState,
        streakValue: runtimeState.watchStreakByChannel?.[channel]?.value,
        streakTimeoutMs: managedTabPrimeTimeoutMs
      });

      if (now - lastPlaybackRequestAt >= managedTabPlaybackRequestIntervalMs) {
        lastPlaybackRequestAt = now;
        await requestPlaybackStateForManagedTab(channel, tabId);
      }

      if (!barrier.hasStreakValue && now - lastStreakRequestAt >= managedTabStreakRequestIntervalMs) {
        lastStreakRequestAt = now;
        await requestWatchStreakForManagedTab(channel, tabId);
      }

      if (primeState.streakAttempted && !streakAttemptLogged) {
        streakAttemptLogged = true;
        await logWorkerEvent("watch:init-streak-attempted", {
          channel,
          tabId
        });
      }

      if (barrier.done) {
        await logWorkerEvent(
          barrier.timedOut ? "watch:init-timeout" : "watch:init-ready",
          {
            channel,
            tabId,
            elapsedMs,
            contentReady: primeState.contentReady,
            streakAttempted: primeState.streakAttempted,
            hasPlaybackReady: barrier.hasPlaybackReady,
            hasStreakValue: barrier.hasStreakValue,
            reason: barrier.reason
          }
        );
        return;
      }

      await wait(250);
    }
  }

  async function triggerStartupRecoveryReloads({
    managedTabsByChannel,
    watchSessionsByChannel,
    broadcastSessionsByChannel
  }) {
    const now = Date.now();
    const entries = Object.entries(managedTabsByChannel || {})
      .filter(([, tabId]) => Number.isInteger(tabId));

    for (const [channel, tabId] of entries) {
      const broadcastSession = broadcastSessionsByChannel?.[channel];
      if (!shouldTriggerStartupRecoveryReload({
        broadcastSession,
        watchSession: watchSessionsByChannel?.[channel],
        now,
        thresholdMs: startupRecoveryReloadThresholdMs
      })) {
        continue;
      }

      const tab = await getExistingTab(tabId);
      if (!tab || tab.status !== "complete") {
        continue;
      }

      try {
        await chrome.tabs.reload(tabId);
        broadcastSessionsByChannel[channel] = {
          ...broadcastSession,
          startupRecoveryReloadedAt: now
        };
        await logWorkerEvent("startup-recovery:reload-triggered", {
          channel,
          tabId,
          lastClaimAt: Math.max(0, Math.round(Number(broadcastSession?.lastClaimAt) || 0)),
          watchStartedAt: Math.max(
            0,
            Math.round(Number(watchSessionsByChannel?.[channel]?.startedAt) || 0)
          )
        });
      } catch (_error) {
        await logWorkerEvent("startup-recovery:reload-failed", {
          channel,
          tabId
        });
      }
    }
  }

  async function requestPlaybackStateForManagedTabs(managedTabsByChannel) {
    const entries = Object.entries(managedTabsByChannel || {});
    const targets = entries.filter(([, tabId]) => Number.isInteger(tabId));

    for (const [channel, tabId] of targets) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "watch:request-playback-state",
          channel
        });
      } catch (_error) {
        await logWorkerEvent("reconcile:playback-state-request-failed", {
          channel,
          tabId
        });
      }
    }
  }

  async function requestPlaybackStateForManagedTab(channel, tabId) {
    if (!channel || !Number.isInteger(tabId)) {
      return;
    }

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "watch:request-playback-state",
        channel
      });
    } catch (_error) {
      await logWorkerEvent("watch:init-playback-request-failed", {
        channel,
        tabId
      });
    }
  }

  async function ensureManagedTabActive(tabId) {
    if (!Number.isInteger(tabId)) {
      return;
    }

    try {
      const tab = await getExistingTab(tabId);
      if (!tab || tab.active) {
        return;
      }

      await chrome.tabs.update(tabId, { active: true });
    } catch (_error) {
      // Activation retries are best-effort during the prime slot.
    }
  }

  return {
    rebindManagedTabsAfterUpdate,
    reconcileManagedTabs,
    recoverManagedTabsAfterWake,
    requestWatchStreakForManagedTab
  };
}

function hasPersistedBroadcastSession(session) {
  const estimatedStartedAt = Math.round(Number(session?.estimatedStartedAt));
  return Number.isFinite(estimatedStartedAt) && estimatedStartedAt > 0;
}

function shouldTriggerStartupRecoveryReload({ broadcastSession, watchSession, now, thresholdMs }) {
  if (!broadcastSession || typeof broadcastSession !== "object") {
    return false;
  }

  const broadcastStartedAt = Math.round(Number(broadcastSession.estimatedStartedAt));
  if (!Number.isFinite(broadcastStartedAt) || broadcastStartedAt <= 0) {
    return false;
  }

  const startupRecoveryReloadedAt = Math.round(Number(broadcastSession.startupRecoveryReloadedAt));
  if (Number.isFinite(startupRecoveryReloadedAt) && startupRecoveryReloadedAt > 0) {
    return false;
  }

  const referenceAt = getStartupRecoveryReferenceAt(broadcastSession, watchSession);
  if (!Number.isFinite(referenceAt) || referenceAt <= 0) {
    return false;
  }

  return Math.max(0, now - referenceAt) >= Math.max(0, Math.round(Number(thresholdMs) || 0));
}

function getStartupRecoveryReferenceAt(broadcastSession, watchSession) {
  const lastClaimAt = Math.round(Number(broadcastSession?.lastClaimAt));
  if (Number.isFinite(lastClaimAt) && lastClaimAt > 0) {
    return lastClaimAt;
  }

  const startedAt = Math.round(Number(watchSession?.startedAt));
  if (Number.isFinite(startedAt) && startedAt > 0) {
    return startedAt;
  }

  return 0;
}

function markBroadcastEnded(nextLastBroadcastStatsByChannel, channel, broadcastSession, endedAt) {
  if (!channel || !broadcastSession || typeof broadcastSession !== "object") {
    return;
  }

  const estimatedStartedAt = Math.round(Number(broadcastSession.estimatedStartedAt));
  if (!Number.isFinite(estimatedStartedAt) || estimatedStartedAt <= 0) {
    return;
  }

  const existing = nextLastBroadcastStatsByChannel[channel];
  const normalizedEndedAt = Math.max(0, Math.round(Number(endedAt) || 0));
  nextLastBroadcastStatsByChannel[channel] = {
    streamId: String(broadcastSession.streamId || "").trim() || null,
    estimatedStartedAt,
    lastSeenAt: Math.max(0, Math.round(Number(broadcastSession.lastSeenAt) || 0)),
    lastUptimeSeconds: Math.max(0, Math.round(Number(broadcastSession.lastUptimeSeconds) || 0)),
    endedAt: normalizedEndedAt,
    claimCount: Math.max(0, Math.floor(Number(broadcastSession.claimCount) || 0)),
    lastClaimAt: Math.max(0, Math.round(Number(broadcastSession.lastClaimAt) || 0)),
    streakValue: normalizeStreakValue(broadcastSession.streakValue),
    streakSeenAt: Math.max(0, Math.round(Number(broadcastSession.streakSeenAt) || 0)),
    baselineStreakValue: normalizeStreakValue(broadcastSession.baselineStreakValue),
    baselineStreakSeenAt: Math.max(
      0,
      Math.round(Number(broadcastSession.baselineStreakSeenAt) || 0)
    ),
    streakIncreasedForStream: Boolean(
      broadcastSession.streakIncreasedForStream || existing?.streakIncreasedForStream
    ),
    streakUnexpectedJumpForStream: Boolean(
      broadcastSession.streakUnexpectedJumpForStream || existing?.streakUnexpectedJumpForStream
    )
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

function summarizeRuntimeState(runtimeState) {
  const state = runtimeState && typeof runtimeState === "object" ? runtimeState : {};

  return {
    managedChannels: Object.keys(state.managedTabsByChannel || {}),
    detachedChannels: Object.keys(state.detachedUntilByChannel || {}),
    watchSessionCount: Object.keys(state.watchSessionsByChannel || {}).length,
    broadcastSessionCount: Object.keys(state.broadcastSessionsByChannel || {}).length,
    lastBroadcastStatsCount: Object.keys(state.lastBroadcastStatsByChannel || {}).length,
    claimStatsCount: Object.keys(state.claimStatsByChannel || {}).length,
    claimAvailabilityCount: Object.keys(state.claimAvailabilityByChannel || {}).length,
    playbackStates: state.playbackStateByChannel || {},
    watchStreakCount: Object.keys(state.watchStreakByChannel || {}).length
  };
}

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.round(Number(delayMs) || 0)));
  });
}
