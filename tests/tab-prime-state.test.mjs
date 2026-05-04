import assert from "node:assert/strict";
import test from "node:test";

import {
  createTabPrimeStateStore,
  evaluateManagedTabPrimeBarrier
} from "../extension/src/background/tabPrimeState.js";

test("tab prime state store resets, marks and clears per tab", () => {
  const store = createTabPrimeStateStore();

  assert.deepEqual(store.read(11), {
    contentReady: false,
    playbackReady: false,
    streakAttempted: false
  });

  store.markContentReady(11);
  store.markPlaybackReady(11);
  store.markStreakAttempted(11);

  assert.deepEqual(store.read(11), {
    contentReady: true,
    playbackReady: true,
    streakAttempted: true
  });

  store.reset(11);
  assert.deepEqual(store.read(11), {
    contentReady: false,
    playbackReady: false,
    streakAttempted: false
  });

  store.clear(11);
  assert.deepEqual(store.read(11), {
    contentReady: false,
    playbackReady: false,
    streakAttempted: false
  });
});

test("prime barrier releases early only when playback is ready and a streak value exists", () => {
  const result = evaluateManagedTabPrimeBarrier({
    elapsedMs: 12_000,
    primeState: {
      contentReady: true,
      playbackReady: true,
      streakAttempted: true
    },
    playbackState: "ok",
    playbackStableForMs: 2_500,
    playbackStableWindowMs: 2_000,
    streakValue: 17,
    streakTimeoutMs: 30_000
  });

  assert.deepEqual(result, {
    done: true,
    reason: "ready",
    hasContentReady: true,
    hasPlaybackReady: true,
    hasStreakValue: true,
    timedOut: false
  });
});

test("prime barrier keeps waiting when playback is stable but streak is still missing before timeout", () => {
  const result = evaluateManagedTabPrimeBarrier({
    elapsedMs: 19_000,
    primeState: {
      contentReady: true,
      playbackReady: true,
      streakAttempted: true
    },
    playbackState: "ok",
    playbackStableForMs: 2_500,
    playbackStableWindowMs: 2_000,
    streakValue: null,
    streakTimeoutMs: 30_000
  });

  assert.deepEqual(result, {
    done: false,
    reason: "waiting",
    hasContentReady: true,
    hasPlaybackReady: true,
    hasStreakValue: false,
    timedOut: false
  });
});

test("prime barrier keeps waiting while current playback state is not yet stable", () => {
  const result = evaluateManagedTabPrimeBarrier({
    elapsedMs: 19_000,
    primeState: {
      contentReady: true,
      playbackReady: true,
      streakAttempted: true
    },
    playbackState: "ok",
    playbackStableForMs: 500,
    playbackStableWindowMs: 2_000,
    streakValue: 7,
    streakTimeoutMs: 30_000
  });

  assert.deepEqual(result, {
    done: false,
    reason: "waiting",
    hasContentReady: true,
    hasPlaybackReady: false,
    hasStreakValue: true,
    timedOut: false
  });
});

test("prime barrier releases on timeout even when playback or streak are still missing", () => {
  const result = evaluateManagedTabPrimeBarrier({
    elapsedMs: 30_000,
    primeState: {
      contentReady: false,
      playbackReady: false,
      streakAttempted: false
    },
    playbackState: "muted",
    playbackStableForMs: 0,
    playbackStableWindowMs: 2_000,
    streakValue: null,
    streakTimeoutMs: 30_000
  });

  assert.deepEqual(result, {
    done: true,
    reason: "timeout",
    hasContentReady: false,
    hasPlaybackReady: false,
    hasStreakValue: false,
    timedOut: true
  });
});
