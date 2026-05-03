import assert from "node:assert/strict";
import test from "node:test";

import { createStreamSessionService } from "../extension/src/background/streamSessionService.js";

test("handleWatchUptime keeps the same broadcast state when the stream id matches", async () => {
  const writes = [];
  const events = [];
  const runtimeState = {
    managedTabsByChannel: {
      wzdrichi: 41
    },
    liveStreamMetaByChannel: {
      wzdrichi: {
        streamId: "stream-123"
      }
    },
    watchSessionsByChannel: {
      wzdrichi: {
        startedAt: 1_700_000_000_000
      }
    },
    claimStatsByChannel: {
      wzdrichi: {
        count: 22,
        lastClaimAt: 1_700_000_100_000
      }
    },
    claimAvailabilityByChannel: {
      wzdrichi: {
        available: false,
        seenAt: 1_700_000_100_000
      }
    },
    watchStreakByChannel: {
      wzdrichi: {
        value: 15,
        increased: true,
        unexpectedJump: false,
        seenAt: 1_700_000_200_000,
        broadcastStartedAt: 1_700_000_300_000
      }
    },
    lastKnownWatchStreakByChannel: {
      wzdrichi: {
        value: 15,
        seenAt: 1_700_000_200_000
      }
    },
    broadcastSessionsByChannel: {
      wzdrichi: {
        streamId: "stream-123",
        estimatedStartedAt: 1_700_000_300_000,
        lastUptimeSeconds: 1_200,
        lastSeenAt: 1_700_001_500_000,
        claimCount: 22,
        lastClaimAt: 1_700_000_100_000,
        streakValue: 15,
        streakSeenAt: 1_700_000_200_000,
        baselineStreakValue: 14,
        baselineStreakSeenAt: 1_700_000_050_000,
        streakIncreasedForStream: true,
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

  const originalDateNow = Date.now;
  Date.now = () => 1_700_002_000_000;
  try {
    await service.handleWatchUptime(
      {
        channel: "wzdrichi",
        uptimeSeconds: 350
      },
      {
        tab: {
          id: 41
        }
      }
    );
  } finally {
    Date.now = originalDateNow;
  }

  assert.equal(writes.length, 1);
  assert.equal(writes[0].broadcastSessionsByChannel.wzdrichi.streamId, "stream-123");
  assert.equal(writes[0].broadcastSessionsByChannel.wzdrichi.claimCount, 22);
  assert.equal(writes[0].broadcastSessionsByChannel.wzdrichi.streakIncreasedForStream, true);
  assert.equal(writes[0].claimStatsByChannel.wzdrichi.count, 22);
  assert.ok(!events.some((event) => event.type === "watch:session-reset"));
});

test("handleWatchUptime resets the broadcast state when the stream id changes", async () => {
  const writes = [];
  const events = [];
  const runtimeState = {
    managedTabsByChannel: {
      wzdrichi: 41
    },
    liveStreamMetaByChannel: {
      wzdrichi: {
        streamId: "stream-456"
      }
    },
    watchSessionsByChannel: {
      wzdrichi: {
        startedAt: 1_700_000_000_000
      }
    },
    claimStatsByChannel: {
      wzdrichi: {
        count: 22,
        lastClaimAt: 1_700_000_100_000
      }
    },
    claimAvailabilityByChannel: {
      wzdrichi: {
        available: true,
        seenAt: 1_700_000_100_000
      }
    },
    watchStreakByChannel: {
      wzdrichi: {
        value: 15,
        increased: true,
        unexpectedJump: false,
        seenAt: 1_700_000_200_000,
        broadcastStartedAt: 1_700_000_300_000
      }
    },
    lastKnownWatchStreakByChannel: {
      wzdrichi: {
        value: 15,
        seenAt: 1_700_000_200_000
      }
    },
    broadcastSessionsByChannel: {
      wzdrichi: {
        streamId: "stream-123",
        estimatedStartedAt: 1_700_000_300_000,
        lastUptimeSeconds: 1_200,
        lastSeenAt: 1_700_001_500_000,
        claimCount: 22,
        lastClaimAt: 1_700_000_100_000,
        streakValue: 15,
        streakSeenAt: 1_700_000_200_000,
        baselineStreakValue: 14,
        baselineStreakSeenAt: 1_700_000_050_000,
        streakIncreasedForStream: true,
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

  const originalDateNow = Date.now;
  Date.now = () => 1_700_002_000_000;
  try {
    await service.handleWatchUptime(
      {
        channel: "wzdrichi",
        uptimeSeconds: 350
      },
      {
        tab: {
          id: 41
        }
      }
    );
  } finally {
    Date.now = originalDateNow;
  }

  assert.equal(writes.length, 1);
  assert.equal(writes[0].broadcastSessionsByChannel.wzdrichi.streamId, "stream-456");
  assert.equal(writes[0].claimStatsByChannel.wzdrichi.count, 0);
  assert.equal(writes[0].claimAvailabilityByChannel.wzdrichi.available, false);
  assert.equal(writes[0].watchStreakByChannel.wzdrichi, undefined);
  assert.ok(events.some((event) => event.type === "watch:session-reset"));
});

test("recordClaim blocks duplicate claim recordings for two minutes", async () => {
  const writes = [];
  const events = [];
  const runtimeState = {
    managedTabsByChannel: {
      wzdrichi: 41
    },
    claimStatsByChannel: {
      wzdrichi: {
        count: 0,
        lastClaimAt: 0
      }
    },
    claimAvailabilityByChannel: {
      wzdrichi: {
        available: true,
        seenAt: 0
      }
    },
    broadcastSessionsByChannel: {
      wzdrichi: {
        streamId: "stream-123",
        estimatedStartedAt: 1_700_000_300_000,
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

  const sender = {
    tab: {
      id: 41
    }
  };

  const originalDateNow = Date.now;
  Date.now = () => 1_700_002_000_000;
  try {
    await service.recordClaim({ channel: "wzdrichi" }, sender);
    await service.recordClaim({ channel: "wzdrichi" }, sender);
  } finally {
    Date.now = originalDateNow;
  }

  assert.equal(writes.length, 1);
  assert.equal(writes[0].claimStatsByChannel.wzdrichi.count, 1);
  assert.ok(events.some((event) => event.type === "claim:recorded"));
  assert.ok(events.some((event) => event.type === "claim:blocked-duplicate"));
});

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
