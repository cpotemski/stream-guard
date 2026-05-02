import assert from "node:assert/strict";
import test from "node:test";

import { createStreamSessionService } from "../extension/src/background/streamSessionService.js";

test("updateWatchStreak persists a reported 0 even when the channel previously had a positive streak", async () => {
  const writes = [];
  const events = [];
  const runtimeState = {
    managedTabsByChannel: {
      fps_shaka: 41
    },
    watchStreakByChannel: {
      fps_shaka: {
        value: 1,
        increased: false,
        unexpectedJump: false,
        seenAt: 1_700_000_000_000,
        broadcastStartedAt: 1_700_000_100_000
      }
    },
    lastKnownWatchStreakByChannel: {
      fps_shaka: {
        value: 1,
        seenAt: 1_700_000_000_000
      }
    },
    broadcastSessionsByChannel: {
      fps_shaka: {
        estimatedStartedAt: 1_700_000_100_000,
        lastUptimeSeconds: 500,
        lastSeenAt: 1_700_000_600_000,
        claimCount: 0,
        lastClaimAt: 0,
        streakValue: 1,
        streakSeenAt: 1_700_000_000_000,
        baselineStreakValue: 1,
        baselineStreakSeenAt: 1_700_000_000_000,
        streakIncreasedForStream: false,
        streakUnexpectedJumpForStream: false,
        startupRecoveryReloadedAt: 0
      }
    },
    lastBroadcastStatsByChannel: {}
  };

  const service = createStreamSessionService({
    readRuntimeStateCached: async () => runtimeState,
    writeRuntimeState: async (nextState) => {
      writes.push(nextState);
    },
    canManageChannelForTab: async () => true,
    requestWatchStreakForManagedTab: async () => {},
    logWorkerEvent: async (type, payload) => {
      events.push({ type, payload });
    }
  });

  await service.updateWatchStreak(
    {
      channel: "fps_shaka",
      value: 0
    },
    {
      tab: {
        id: 41
      }
    }
  );

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].watchStreakByChannel.fps_shaka.value, 0);
  assert.deepEqual(writes[0].lastKnownWatchStreakByChannel.fps_shaka.value, 0);
  assert.deepEqual(writes[0].broadcastSessionsByChannel.fps_shaka.streakValue, 0);
  assert.deepEqual(writes[0].broadcastSessionsByChannel.fps_shaka.baselineStreakValue, 0);
  assert.ok(events.some((event) => event.type === "streak:updated" && event.payload.value === 0));
});
