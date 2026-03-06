import { selectLiveChannels } from "../lib/liveStatus.js";
import { closeManagedWatchTabs, openWatchTab } from "../lib/tabManager.js";

export function createTabLifecycleService({
  readRuntimeStateCached,
  writeRuntimeState,
  getExistingTab,
  getChannelFromTab,
  logWorkerEvent,
  detachedReopenCooldownMs,
  broadcastSessionRetentionMs
}) {
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
    const liveChannels = await selectLiveChannels(prioritizedChannels, settings.maxStreams);
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
      runtimeState
    });

    for (const [channel, tabId] of Object.entries(runtimeState.managedTabsByChannel)) {
      if (!desiredChannels.has(channel)) {
        const keepRecentBroadcastSession = shouldRetainBroadcastSession(
          nextBroadcastSessionsByChannel[channel],
          now
        );
        await logWorkerEvent("reconcile:close-not-desired", {
          channel,
          tabId,
          keepRecentBroadcastSession
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
        if (!keepRecentBroadcastSession) {
          delete nextBroadcastSessionsByChannel[channel];
          delete nextWatchStreakByChannel[channel];
        }
        delete nextDetachedUntilByChannel[channel];
        continue;
      }

      const tab = await getExistingTab(tabId);
      if (!tab) {
        const keepRecentBroadcastSession = shouldRetainBroadcastSession(
          nextBroadcastSessionsByChannel[channel],
          now
        );
        await logWorkerEvent("reconcile:drop-missing-tab", {
          channel,
          tabId,
          keepRecentBroadcastSession
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
        if (!keepRecentBroadcastSession) {
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
        const keepRecentBroadcastSession = shouldRetainBroadcastSession(
          nextBroadcastSessionsByChannel[channel],
          now
        );
        await logWorkerEvent("reconcile:close-detached", {
          channel,
          tabId,
          status: tab.status,
          currentChannel,
          url: tab.pendingUrl || tab.url || null,
          keepRecentBroadcastSession
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
        if (!keepRecentBroadcastSession) {
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
        nextClaimStatsByChannel[channel] = {
          count: 0,
          lastClaimAt: Date.now()
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

      const tabId = await openWatchTab(channel);
      if (Number.isInteger(tabId)) {
        nextManagedTabsByChannel[channel] = tabId;
        nextWatchSessionsByChannel[channel] = {
          startedAt: Date.now()
        };
        const keepRecentBroadcastSession = shouldRetainBroadcastSession(
          nextBroadcastSessionsByChannel[channel],
          now
        );
        if (!keepRecentBroadcastSession) {
          delete nextBroadcastSessionsByChannel[channel];
          delete nextWatchStreakByChannel[channel];
        }
        nextClaimStatsByChannel[channel] = {
          count: 0,
          lastClaimAt: Date.now()
        };
        nextClaimAvailabilityByChannel[channel] = {
          available: false,
          seenAt: 0
        };
        await logWorkerEvent("reconcile:open-tab", {
          channel,
          tabId,
          keepRecentBroadcastSession
        });
      }
    }

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
        && !shouldRetainBroadcastSession(nextBroadcastSessionsByChannel[channel], now)) {
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
      const hasRecentBroadcastSession = shouldRetainBroadcastSession(
        nextBroadcastSessionsByChannel[channel],
        now
      );
      if (!assignedChannels.has(channel) && !hasRecentBroadcastSession) {
        delete nextWatchStreakByChannel[channel];
      }
    }

    await writeRuntimeState({
      managedTabsByChannel: nextManagedTabsByChannel,
      detachedUntilByChannel: nextDetachedUntilByChannel,
      watchSessionsByChannel: nextWatchSessionsByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
      lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel,
      claimStatsByChannel: nextClaimStatsByChannel,
      claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
      playbackStateByChannel: nextPlaybackStateByChannel,
      watchStreakByChannel: nextWatchStreakByChannel
    });

    void requestPlaybackStateForManagedTabs(nextManagedTabsByChannel);
    setTimeout(
      () => {
        void requestPlaybackStateForManagedTabs(nextManagedTabsByChannel);
      },
      3000
    );

    await logWorkerEvent("reconcile:done", {
      managedTabsByChannel: nextManagedTabsByChannel,
      detachedUntilByChannel: nextDetachedUntilByChannel,
      watchSessionsByChannel: nextWatchSessionsByChannel,
      broadcastSessionsByChannel: nextBroadcastSessionsByChannel,
      lastBroadcastStatsByChannel: nextLastBroadcastStatsByChannel,
      claimStatsByChannel: nextClaimStatsByChannel,
      claimAvailabilityByChannel: nextClaimAvailabilityByChannel,
      playbackStateByChannel: nextPlaybackStateByChannel,
      watchStreakByChannel: nextWatchStreakByChannel
    });

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

  function shouldRetainBroadcastSession(session, now = Date.now()) {
    const lastSeenAt = Number(session?.lastSeenAt);
    if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) {
      return false;
    }

    return Math.max(0, now - lastSeenAt) <= broadcastSessionRetentionMs;
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

  return {
    rebindManagedTabsAfterUpdate,
    reconcileManagedTabs,
    recoverManagedTabsAfterWake,
    requestWatchStreakForManagedTab
  };
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
