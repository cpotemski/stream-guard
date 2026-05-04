import assert from "node:assert/strict";
import test from "node:test";

import {
  getPrioritizedManagedTabs,
  selectNextManagedTabForRotation
} from "../extension/src/background/tabLifecycleService.js";

test("getPrioritizedManagedTabs follows channel priority and keeps unmanaged remainder", () => {
  const result = getPrioritizedManagedTabs({
    managedTabsByChannel: {
      tumblurr: 11,
      eliasn97: 22,
      extra_stream: 33
    },
    prioritizedChannels: [
      "eliasn97",
      "tumblurr"
    ]
  });

  assert.deepEqual(result, [
    { channel: "eliasn97", tabId: 22 },
    { channel: "tumblurr", tabId: 11 },
    { channel: "extra_stream", tabId: 33 }
  ]);
});

test("selectNextManagedTabForRotation advances to the next prioritized managed tab", async () => {
  const next = await selectNextManagedTabForRotation({
    prioritizedManagedTabs: [
      { channel: "tumblurr", tabId: 11 },
      { channel: "eliasn97", tabId: 22 }
    ],
    getExistingTab: async (tabId) => ({
      id: tabId,
      active: tabId === 11
    })
  });

  assert.deepEqual(next, {
    channel: "eliasn97",
    tabId: 22,
    active: false
  });
});

test("selectNextManagedTabForRotation falls back to the first tab when none are active", async () => {
  const next = await selectNextManagedTabForRotation({
    prioritizedManagedTabs: [
      { channel: "tumblurr", tabId: 11 },
      { channel: "eliasn97", tabId: 22 }
    ],
    getExistingTab: async (tabId) => ({
      id: tabId,
      active: false
    })
  });

  assert.deepEqual(next, {
    channel: "tumblurr",
    tabId: 11,
    active: false
  });
});
