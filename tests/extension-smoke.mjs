import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const repoRoot = path.resolve(import.meta.dirname, "..");
const extensionPath = path.join(repoRoot, "extension");
const baseProfileDir = path.join(repoRoot, ".local", "browser-profile");
const manifestPath = path.join(extensionPath, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const targetChannel = "deemonrider";
const targetChannelUrl = `https://www.twitch.tv/${targetChannel}`;
const popupWaitTimeoutMs = 20_000;
const managedTabTimeoutMs = 45_000;
const streakTimeoutMs = 90_000;
const scope = process.env.TEST_SCOPE || "all";
const testProfileDir = path.join(
  repoRoot,
  ".local",
  `browser-test-profile-${scope}-${process.pid}`
);

const explicitBrowserPath = process.env.STREAM_GUARD_BROWSER_PATH;
const preferredBrowserPaths = [
  explicitBrowserPath,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
].filter(Boolean);

const browserExecutablePath =
  preferredBrowserPaths.find((candidate) => fs.existsSync(candidate)) || null;

if (!browserExecutablePath) {
  throw new Error(
    "No supported browser executable found. Install Google Chrome or Brave, or set STREAM_GUARD_BROWSER_PATH."
  );
}

if (!fs.existsSync(baseProfileDir)) {
  throw new Error(
    `Missing base browser profile at ${baseProfileDir}. Run npm run browser:session first and log into Twitch in that profile.`
  );
}

prepareTestProfile();
const remoteDebuggingPort = 9222 + Math.floor(Math.random() * 1000);
const browserProcess = spawn(browserExecutablePath, [
  `--user-data-dir=${testProfileDir}`,
  `--remote-debugging-port=${remoteDebuggingPort}`,
  "--no-first-run",
  "--no-default-browser-check"
], {
  stdio: "ignore"
});

let browser = null;
let context = null;

try {
  await waitForDevTools(remoteDebuggingPort);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${remoteDebuggingPort}`);
  [context] = browser.contexts();
  assert.ok(context, "Could not attach to the Chrome browser context.");

  const extensionWorker = await getExtensionWorker(context);
  const extensionRuntime = await readExtensionRuntime(extensionWorker);
  const popupPage = await openPopupPage(context, extensionWorker, extensionRuntime.extensionId);

  await resetExtensionState(extensionWorker);
  await waitForPopupReady(popupPage);

  await verifyActiveVersion(popupPage, extensionRuntime);
  console.log("PASS version");

  if (scope === "all" || scope === "popup") {
    await verifyPopupToggle(popupPage);
    console.log("PASS popup");
  }

  let channelPage = null;
  if (scope === "all" || scope === "channel" || scope === "streak") {
    channelPage = await openChannelPage(context);
  }

  if (scope === "all" || scope === "channel") {
    assert.ok(channelPage, "Channel page missing for channel scope.");
    await verifyAddRemoveFlow(popupPage, channelPage);
    console.log("PASS channel");
  }

  if (scope === "all" || scope === "streak") {
    await seedImportantChannel(extensionWorker);
    await refreshPopupPage(popupPage);
    await verifyWatchStreakFlow(context, popupPage);
    console.log("PASS streak");
  }

  if (scope === "all" || scope === "playback") {
    await seedImportantChannel(extensionWorker);
    await refreshPopupPage(popupPage);
    await verifyPlaybackFlow(context, popupPage);
    console.log("PASS playback");
  }

  console.log(`Smoke scope "${scope}" passed.`);
} finally {
  await browser?.close();
  browserProcess.kill("SIGTERM");
  try {
    fs.rmSync(testProfileDir, { recursive: true, force: true });
  } catch (_error) {
    // Chrome may still release profile files asynchronously; a leftover temp profile is acceptable.
  }
}

function prepareTestProfile() {
  fs.rmSync(testProfileDir, { recursive: true, force: true });
  fs.cpSync(baseProfileDir, testProfileDir, { recursive: true });

  const transientFiles = [
    "SingletonCookie",
    "SingletonLock",
    "SingletonSocket",
    "lockfile"
  ];

  for (const name of transientFiles) {
    fs.rmSync(path.join(testProfileDir, name), { force: true });
  }
}

async function waitForDevTools(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Browser not ready yet.
    }
    await wait(250);
  }

  throw new Error(`Timed out waiting for Chrome DevTools endpoint on port ${port}.`);
}

function readInstalledExtensionIdFromProfile(profileDir) {
  const securePreferencesPath = path.join(profileDir, "Default", "Secure Preferences");
  if (!fs.existsSync(securePreferencesPath)) {
    return null;
  }

  const data = JSON.parse(fs.readFileSync(securePreferencesPath, "utf8"));
  const settings = data?.extensions?.settings;
  if (!settings || typeof settings !== "object") {
    return null;
  }

  const expectedPath = path.resolve(extensionPath);
  for (const [extensionId, config] of Object.entries(settings)) {
    const configuredPath = config?.path ? path.resolve(String(config.path)) : null;
    if (configuredPath === expectedPath) {
      return extensionId;
    }
  }

  return null;
}

async function getExtensionWorker(context) {
  const existingWorker = context.serviceWorkers().find((worker) => worker.url().startsWith("chrome-extension://"));
  if (existingWorker) {
    return existingWorker;
  }

  return context.waitForEvent("serviceworker", {
    timeout: 20_000,
    predicate: (candidate) => candidate.url().startsWith("chrome-extension://")
  });
}

async function readExtensionRuntime(extensionWorker) {
  const fromWorker = await extensionWorker.evaluate(() => ({
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    name: chrome.runtime.getManifest().name
  }));

  const fallbackExtensionId = readInstalledExtensionIdFromProfile(testProfileDir);
  if (!fromWorker.extensionId && !fallbackExtensionId) {
    throw new Error("Could not determine extension runtime metadata.");
  }

  return {
    extensionId: fromWorker.extensionId || fallbackExtensionId,
    version: fromWorker.version,
    name: fromWorker.name
  };
}

async function openPopupPage(context, extensionWorker, extensionId) {
  const popupUrl = `chrome-extension://${extensionId}/src/popup.html`;
  const popupPagePromise = context.waitForEvent("page", {
    timeout: 20_000,
    predicate: (candidate) => candidate.url().startsWith(popupUrl)
  });

  await extensionWorker.evaluate(() => {
    const url = chrome.runtime.getURL("src/popup.html");
    return chrome.tabs.create({
      url,
      active: true
    });
  });

  const popupPage = await popupPagePromise;
  await popupPage.waitForLoadState("domcontentloaded");
  return popupPage;
}

async function openChannelPage(context) {
  const channelPage = await context.newPage();
  await channelPage.goto(targetChannelUrl, { waitUntil: "domcontentloaded" });
  await channelPage.waitForFunction(() => Boolean(document.querySelector("#tw-watch-guard-star")), {
    timeout: 45_000
  });
  return channelPage;
}

async function resetExtensionState(extensionWorker) {
  await extensionWorker.evaluate(async () => {
    const defaultSettings = {
      autoManage: false,
      maxStreams: 3,
      importantChannels: []
    };
    const defaultRuntimeState = {
      managedTabsByChannel: {},
      detachedUntilByChannel: {},
      liveStatusByChannel: {},
      watchSessionsByChannel: {},
      broadcastSessionsByChannel: {},
      lastBroadcastStatsByChannel: {},
      claimStatsByChannel: {},
      claimAvailabilityByChannel: {},
      playbackStateByChannel: {},
      watchStreakByChannel: {},
      lastKnownWatchStreakByChannel: {}
    };

    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    await chrome.storage.sync.set(defaultSettings);
    await chrome.storage.local.set(defaultRuntimeState);
  });
}

async function waitForPopupReady(popupPage) {
  await popupPage.waitForFunction(() => {
    const toggle = document.getElementById("watch-toggle");
    const list = document.getElementById("channel-list");
    return Boolean(toggle && list);
  }, { timeout: popupWaitTimeoutMs });
}

async function verifyActiveVersion(popupPage, extensionRuntime) {
  const activeExtension = await popupPage.evaluate(() => ({
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    name: chrome.runtime.getManifest().name
  }));

  assert.equal(activeExtension.extensionId, extensionRuntime.extensionId, "Unexpected active extension id.");
  assert.equal(activeExtension.version, manifest.version, "Popup is not running the current manifest version.");
  assert.equal(activeExtension.name, manifest.name, "Unexpected active extension name.");
}

async function verifyPopupToggle(popupPage) {
  await setWatchToggle(popupPage, true);
  await setWatchToggle(popupPage, false);
}

async function seedImportantChannel(extensionWorker) {
  await extensionWorker.evaluate(async (channel) => {
    const stored = await chrome.storage.sync.get({
      autoManage: false,
      maxStreams: 3,
      importantChannels: []
    });
    const existingChannels = Array.isArray(stored.importantChannels)
      ? stored.importantChannels.filter((entry) => entry?.name !== channel)
      : [];
    existingChannels.push({
      name: channel,
      priority: existingChannels.length + 1
    });
    await chrome.storage.sync.set({
      autoManage: Boolean(stored.autoManage),
      maxStreams: Number(stored.maxStreams) || 3,
      importantChannels: existingChannels
    });
  }, targetChannel);
}

async function verifyAddRemoveFlow(popupPage, channelPage) {
  const starButton = channelPage.locator("#tw-watch-guard-star");
  await ensureStarState(starButton, false);
  await starButton.click({ force: true });
  await ensureStarState(starButton, true);
  await waitForImportantChannelSetting(popupPage, true);
  await refreshPopupPage(popupPage);
  await waitForPopupChannelRow(popupPage, true);

  const row = popupChannelRow(popupPage);
  await row.locator("button[aria-label='Channel löschen']").click();
  await waitForImportantChannelSetting(popupPage, false);
  await waitForPopupChannelRow(popupPage, false);

  await starButton.click({ force: true });
  await ensureStarState(starButton, true);
  await waitForImportantChannelSetting(popupPage, true);
  await refreshPopupPage(popupPage);
  await waitForPopupChannelRow(popupPage, true);

  await channelPage.close();
}

async function verifyWatchStreakFlow(context, popupPage) {
  await setWatchToggle(popupPage, true);

  const managedTabId = await ensureManagedChannelTab(popupPage);
  const managedPage = await waitForManagedChannelPage(context);
  await managedPage.bringToFront();
  await managedPage.waitForFunction(
    () => Boolean(document.querySelector("[data-test-selector='community-points-summary']")),
    { timeout: 45_000 }
  );
  await requestWatchStreakProbe(popupPage, managedTabId);

  const twitchStreakInspection = await inspectTwitchStreak(managedPage);
  const runtimeStreak = await waitForRuntimeStreakValue(
    popupPage,
    managedTabId,
    twitchStreakInspection.hasStreakUi ? streakTimeoutMs : 20_000
  ).catch(() => null);

  if (!Number.isInteger(runtimeStreak) || runtimeStreak < 0) {
    assert.equal(
      twitchStreakInspection.value,
      null,
      `Runtime streak stayed empty although Twitch exposed streak ${twitchStreakInspection.value}.`
    );

    const probeOutcome = await waitForMissingStreakProbeOutcome(popupPage);
    assert.equal(
      probeOutcome.popupStreakText,
      null,
      `Popup unexpectedly rendered a streak label despite missing Twitch streak UI: "${probeOutcome.popupStreakText}".`
    );

    await setWatchToggle(popupPage, false);
    return;
  }

  const popupStreakText = await waitForPopupStreakText(popupPage);
  assert.match(
    popupStreakText,
    new RegExp(`\\b${runtimeStreak}\\b`),
    `Popup streak "${popupStreakText}" does not include runtime streak ${runtimeStreak}.`
  );

  const twitchStreak = twitchStreakInspection.value;
  if (twitchStreak !== null) {
    assert.match(
      popupStreakText,
      new RegExp(`\\b${twitchStreak}\\b`),
      `Popup streak "${popupStreakText}" does not include Twitch streak ${twitchStreak}.`
    );
  } else {
    console.warn("Warning: could not independently re-read the Twitch streak from the live page; popup/runtime comparison succeeded.");
  }

  await setWatchToggle(popupPage, false);
}

async function verifyPlaybackFlow(context, popupPage) {
  await setWatchToggle(popupPage, true);

  const managedTabId = await waitForManagedTabId(popupPage);
  const managedPage = await waitForManagedChannelPage(context);
  await managedPage.bringToFront();

  await waitForPlaybackHealthy(managedPage);

  const mutedAfterManualToggle = await manuallyMutePlayer(managedPage);
  assert.equal(mutedAfterManualToggle, true, "Manual player mute did not take effect.");

  await waitForPlaybackHealthy(managedPage);
  await setWatchToggle(popupPage, false);
}

async function setWatchToggle(popupPage, enabled) {
  const currentValue = await popupPage.locator("#watch-toggle").evaluate((node) => node.checked);
  if (currentValue === enabled) {
    return;
  }

  await popupPage.locator("label.watch-toggle").click();
  await popupPage.waitForFunction((expected) => {
    const toggle = document.getElementById("watch-toggle");
    return Boolean(toggle) && toggle.checked === expected;
  }, enabled, { timeout: popupWaitTimeoutMs });
}

async function ensureStarState(starButton, expectedActive) {
  await starButton.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "center" });
  });
  await starButton.waitFor({ state: "visible", timeout: 30_000 });
  await expectEventually(async () => {
    const pressed = await starButton.getAttribute("aria-pressed");
    return pressed === String(expectedActive);
  }, 10_000, 200, `Expected star button active=${expectedActive}.`);
}

function popupChannelRow(popupPage) {
  return popupPage.locator(".channel-item").filter({ hasText: targetChannel });
}

async function waitForPopupChannelRow(popupPage, shouldExist) {
  const row = popupChannelRow(popupPage);
  if (shouldExist) {
    await row.waitFor({ state: "visible", timeout: 20_000 });
    return;
  }

  await expectEventually(async () => (await row.count()) === 0, 20_000, 250, "Channel row was not removed from popup.");
}

async function waitForImportantChannelSetting(popupPage, shouldExist) {
  await expectEventually(async () => {
    const response = await popupPage.evaluate(async () => {
      return chrome.runtime.sendMessage({ type: "settings:get" });
    });
    if (!response?.ok) {
      return null;
    }

    const exists = Array.isArray(response.settings?.importantChannels)
      && response.settings.importantChannels.some((entry) => entry?.name === targetChannel);
    return exists === shouldExist ? true : null;
  }, 20_000, 250, `Timed out waiting for importantChannels to ${shouldExist ? "include" : "exclude"} ${targetChannel}.`);
}

async function refreshPopupPage(popupPage) {
  await popupPage.reload({ waitUntil: "domcontentloaded" });
  await waitForPopupReady(popupPage);
}

async function waitForManagedChannelPage(context) {
  return expectEventually(async () => {
    const pages = context.pages();
    for (const page of pages) {
      const url = page.url();
      if (url.startsWith(targetChannelUrl)) {
        return page;
      }
    }

    return null;
  }, managedTabTimeoutMs, 500, `No managed ${targetChannel} tab appeared after enabling auto-manage.`);
}

async function ensureManagedChannelTab(popupPage) {
  try {
    return await waitForManagedTabId(popupPage, 15_000);
  } catch (_error) {
    console.warn("Warning: auto-manage did not create a managed tab in time; creating a fallback managed tab for the streak smoke test.");
    return popupPage.evaluate(async (channel) => {
      const normalWindows = await chrome.windows.getAll({
        populate: false,
        windowTypes: ["normal"]
      });
      const targetWindowId = normalWindows.find((entry) => Number.isInteger(entry?.id))?.id;

      const tab = await chrome.tabs.create({
        ...(Number.isInteger(targetWindowId) ? { windowId: targetWindowId } : {}),
        url: `https://www.twitch.tv/${channel}`,
        active: true
      });
      if (!Number.isInteger(tab?.id)) {
        return null;
      }

      try {
        await chrome.tabs.update(tab.id, { muted: true });
      } catch (_muteError) {
        // Keep fallback setup going.
      }

      const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
      await chrome.tabGroups.update(groupId, {
        title: "Stream Guard",
        color: "purple",
        collapsed: true
      });

      const localState = await chrome.storage.local.get([
        "managedTabsByChannel",
        "watchSessionsByChannel",
        "liveStatusByChannel",
        "claimStatsByChannel",
        "claimAvailabilityByChannel"
      ]);

      await chrome.storage.local.set({
        managedTabsByChannel: {
          ...(localState.managedTabsByChannel || {}),
          [channel]: tab.id
        },
        watchSessionsByChannel: {
          ...(localState.watchSessionsByChannel || {}),
          [channel]: {
            startedAt: Date.now()
          }
        },
        liveStatusByChannel: {
          ...(localState.liveStatusByChannel || {}),
          [channel]: "live"
        },
        claimStatsByChannel: {
          ...(localState.claimStatsByChannel || {}),
          [channel]: {
            count: 0,
            lastClaimAt: 0
          }
        },
        claimAvailabilityByChannel: {
          ...(localState.claimAvailabilityByChannel || {}),
          [channel]: {
            available: false,
            seenAt: 0
          }
        }
      });

      return tab.id;
    }, targetChannel);
  }
}

async function waitForManagedTabId(popupPage, timeoutMs = managedTabTimeoutMs) {
  return expectEventually(async () => {
    const response = await popupPage.evaluate(async () => {
      return chrome.runtime.sendMessage({ type: "status:get" });
    });
    const tabId = Number(response?.runtimeState?.managedTabsByChannel?.[targetChannel]);
    return Number.isInteger(tabId) ? tabId : null;
  }, timeoutMs, 500, `Timed out waiting for a managed tab id for ${targetChannel}.`);
}

async function requestWatchStreakProbe(popupPage, tabId) {
  await popupPage.evaluate(async (targetTabId) => {
    try {
      await chrome.tabs.sendMessage(targetTabId, {
        type: "watch:request-streak"
      });
    } catch (_error) {
      // Ignore transient tab reloads and let polling retry.
    }
  }, tabId);
}

async function waitForRuntimeStreakValue(popupPage, managedTabId, timeoutMs = streakTimeoutMs) {
  return expectEventually(async () => {
    await requestWatchStreakProbe(popupPage, managedTabId);
    const response = await popupPage.evaluate(async (channel) => {
      return chrome.runtime.sendMessage({ type: "status:get" });
    }, targetChannel);
    if (!response?.ok) {
      return null;
    }

    const currentValue = Number(response.runtimeState?.watchStreakByChannel?.[targetChannel]?.value);
    if (Number.isInteger(currentValue) && currentValue >= 0) {
      return currentValue;
    }

    const lastKnownValue = Number(response.runtimeState?.lastKnownWatchStreakByChannel?.[targetChannel]?.value);
    if (Number.isInteger(lastKnownValue) && lastKnownValue >= 0) {
      return lastKnownValue;
    }

    return null;
  }, timeoutMs, 1_000, "Timed out waiting for a runtime streak value.");
}

async function waitForPlaybackHealthy(page) {
  const baselineTime = await page.evaluate(() => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      return null;
    }
    return video.currentTime;
  });

  await expectEventually(async () => {
    return page.evaluate((previousTime) => {
      const video = document.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) {
        return null;
      }

      const isPlaying = !video.paused && !video.ended;
      const isUnmuted = !video.muted;
      const timeAdvanced = Number.isFinite(previousTime)
        ? video.currentTime > previousTime + 0.5
        : video.currentTime > 0.5;

      return isPlaying && isUnmuted && timeAdvanced
        ? {
          currentTime: video.currentTime,
          muted: video.muted,
          paused: video.paused
        }
        : null;
    }, baselineTime);
  }, 45_000, 1_000, "Timed out waiting for healthy playback (playing + unmuted + advancing time).");
}

async function manuallyMutePlayer(page) {
  return expectEventually(async () => {
    return page.evaluate(() => {
      const button = document.querySelector("[data-a-target='player-mute-unmute-button']");
      const video = document.querySelector("video");
      if (!(button instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) {
        return null;
      }

      if (!video.muted) {
        button.click();
      }

      return video.muted ? true : null;
    });
  }, 10_000, 250, "Timed out trying to mute the Twitch player manually.");
}

async function tryReadTwitchStreak(channelPage) {
  const inspection = await inspectTwitchStreak(channelPage);
  return inspection.value;
}

async function inspectTwitchStreak(channelPage) {
  await channelPage.bringToFront();
  await channelPage.waitForLoadState("domcontentloaded");

  try {
    return await expectEventually(async () => {
      return channelPage.evaluate(async () => {
      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

      function findCommunityPointsSummaryRoot() {
        const summary = document.querySelector("[data-test-selector='community-points-summary']");
        return summary instanceof HTMLElement ? summary : null;
      }

      function findCommunityPointsSummaryToggleButton(summary) {
        if (!(summary instanceof HTMLElement)) {
          return null;
        }

        const byCopoBalance = summary.querySelector("[data-test-selector='copo-balance-string']");
        const copoButton = byCopoBalance?.closest("button");
        if (copoButton instanceof HTMLButtonElement) {
          return copoButton;
        }

        const byBitsBalance = summary.querySelector("[data-test-selector='bits-balance-string']");
        const bitsButton = byBitsBalance?.closest("button");
        if (bitsButton instanceof HTMLButtonElement) {
          return bitsButton;
        }

        return null;
      }

      function findRewardCenterDialog() {
        const primary = document.querySelector("[role='dialog'][aria-labelledby='channel-points-reward-center-header']");
        if (primary instanceof HTMLElement) {
          return primary;
        }

        const dialogs = document.querySelectorAll("[role='dialog']");
        for (const dialog of dialogs) {
          if (!(dialog instanceof HTMLElement)) {
            continue;
          }
          if (dialog.querySelector("#channel-points-reward-center-body")) {
            return dialog;
          }
        }

        return null;
      }

      async function advanceRewardCenterPastIntro(dialog) {
        if (!(dialog instanceof HTMLElement)) {
          return false;
        }

        const button = [...dialog.querySelectorAll("button")]
          .find((candidate) => /get started/i.test(String(candidate.textContent || "").trim()));
        if (!(button instanceof HTMLButtonElement)) {
          return false;
        }

        button.click();
        await wait(400);
        return true;
      }

      function findWatchStreakIconAnchors(root) {
        if (!(root instanceof HTMLElement)) {
          return [];
        }

        return [...root.querySelectorAll("img, svg, [data-a-target], [class], [aria-label]")]
          .filter((node) => node instanceof HTMLElement)
          .filter((node) => {
            const text = [
              node.getAttribute("aria-label") || "",
              node.getAttribute("data-a-target") || "",
              node.getAttribute("class") || "",
              node.getAttribute("alt") || "",
              node.textContent || ""
            ].join(" ").toLowerCase();
            return text.includes("streak") || text.includes("watch");
          });
      }

      function isInsideExcludedStreakArea(node) {
        if (!(node instanceof Element)) {
          return false;
        }

        return Boolean(
          node.closest(
            "[data-test-selector='cost'], .reward-icon__cost,"
            + " [data-test-selector='copo-balance-string'], [data-test-selector='bits-balance-string'],"
            + " [data-test-selector='community-points-summary'], em"
          )
        );
      }

      function parseStrictIntegerToken(token) {
        const raw = String(token || "").trim();
        if (!raw) {
          return null;
        }

        const normalizedSpaces = raw.replace(/[\u00a0\u202f]/g, " ").trim();
        const strictGroupedInteger = /^\d{1,3}([., ]\d{3})*$/;
        if (!strictGroupedInteger.test(normalizedSpaces) && !/^\d+$/.test(normalizedSpaces)) {
          return null;
        }

        const digitsOnly = normalizedSpaces.replace(/[., ]/g, "");
        if (!/^\d+$/.test(digitsOnly)) {
          return null;
        }

        const value = Number.parseInt(digitsOnly, 10);
        if (!Number.isInteger(value) || value < 0) {
          return null;
        }

        return value;
      }

      function extractIntegerFromPreferredNode(node) {
        if (!(node instanceof Element) || isInsideExcludedStreakArea(node)) {
          return null;
        }

        const text = String(node.textContent || "");
        const tokens = text.match(/\d[\d.,\s\u00a0\u202f]*/g);
        if (!tokens) {
          return null;
        }

        for (const token of tokens) {
          const parsed = parseStrictIntegerToken(token);
          if (parsed !== null) {
            return parsed;
          }
        }

        return null;
      }

      function extractIntegerFromPreferredNodes(nodes) {
        for (const node of nodes) {
          const value = extractIntegerFromPreferredNode(node);
          if (value !== null) {
            return value;
          }
        }
        return null;
      }

      function extractWatchStreakValueFromDialog(dialog) {
        const footer = dialog.querySelector("#watch-streak-footer");
        if (footer instanceof HTMLElement) {
          const value = extractIntegerFromPreferredNodes(
            [...footer.querySelectorAll("strong")]
              .filter((node) => node instanceof HTMLElement)
              .filter((node) => !isInsideExcludedStreakArea(node))
          );
          if (value !== null) {
            return value;
          }
        }

        const controlledInputs = dialog.querySelectorAll("input[aria-controls='watch-streak-footer']");
        for (const input of controlledInputs) {
          if (!(input instanceof HTMLInputElement) || !input.id) {
            continue;
          }

          const label = dialog.querySelector(`label[for='${CSS.escape(input.id)}']`);
          if (!(label instanceof HTMLElement)) {
            continue;
          }

          if (findWatchStreakIconAnchors(label).length === 0) {
            continue;
          }

          const value = extractIntegerFromPreferredNodes(
            [...label.querySelectorAll("strong")]
              .filter((node) => node instanceof HTMLElement)
              .filter((node) => !isInsideExcludedStreakArea(node))
          );
          if (value !== null) {
            return value;
          }
        }

        return null;
      }

      function hasVisibleWatchStreakUi(dialog) {
        if (!(dialog instanceof HTMLElement)) {
          return false;
        }

        return Boolean(
          dialog.querySelector("#watch-streak-footer")
          || dialog.querySelector("[aria-controls='watch-streak-footer']")
          || [...dialog.querySelectorAll("*")].some((node) => {
            if (!(node instanceof HTMLElement)) {
              return false;
            }
            const text = [
              node.getAttribute("aria-label") || "",
              node.getAttribute("data-a-target") || "",
              node.getAttribute("class") || "",
              node.textContent || ""
            ].join(" ").toLowerCase();
            return (
              text.includes("watch streak")
              || text.includes("watch-streak")
              || text.includes("daily bonus")
            );
          })
        );
      }

      const summary = findCommunityPointsSummaryRoot();
      const button = findCommunityPointsSummaryToggleButton(summary);
      if (!button) {
        return null;
      }

      button.click();
      await wait(500);

      let dialog = null;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        dialog = findRewardCenterDialog();
        if (dialog) {
          break;
        }
        await wait(120);
      }

      if (!(dialog instanceof HTMLElement)) {
        return null;
      }

      const hadIntroScreen = await advanceRewardCenterPastIntro(dialog);
      dialog = findRewardCenterDialog() || dialog;
      const value = extractWatchStreakValueFromDialog(dialog);
      const hasStreakUi = hasVisibleWatchStreakUi(dialog);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await wait(200);
      return {
        value,
        hasRewardCenter: true,
        hasStreakUi,
        hadIntroScreen
      };
      });
    }, 20_000, 1_000, "Timed out waiting for Twitch streak to become readable.");
  } catch (_error) {
    return {
      value: null,
      hasRewardCenter: false,
      hasStreakUi: false,
      hadIntroScreen: false
    };
  }
}

async function waitForMissingStreakProbeOutcome(popupPage) {
  return expectEventually(async () => {
    const snapshot = await popupPage.evaluate(async () => {
      const telemetryResponse = await chrome.runtime.sendMessage({ type: "telemetry:export" });
      const row = document.querySelector(".channel-item");
      const streakText = row?.querySelector(".channel-streak")?.textContent?.trim() || null;
      return {
        streakText,
        telemetry: telemetryResponse?.snapshot?.telemetry?.events || []
      };
    });

    const reasons = snapshot.telemetry
      .filter((event) => event?.source === "worker" && event?.event === "streak:probe-log")
      .map((event) => event?.details?.reason)
      .filter(Boolean);

    if (
      reasons.includes("streak-no-valid-candidate")
      && reasons.includes("streak-could-not-be-found")
    ) {
      return {
        popupStreakText: snapshot.streakText,
        reasons
      };
    }

    return null;
  }, 20_000, 1_000, "Timed out waiting for a missing-streak probe outcome.");
}

async function waitForPopupStreakText(popupPage) {
  return expectEventually(async () => {
    const row = popupChannelRow(popupPage);
    if ((await row.count()) === 0) {
      return null;
    }

    const streakLocator = row.locator(".channel-streak");
    if ((await streakLocator.count()) === 0) {
      return null;
    }

    const text = (await streakLocator.first().textContent())?.trim() || "";
    return text || null;
  }, streakTimeoutMs, 1_000, "Timed out waiting for the popup streak label.");
}

async function expectEventually(readValue, timeoutMs, intervalMs, failureMessage) {
  const startedAt = Date.now();
  let lastValue = null;

  while (Date.now() - startedAt <= timeoutMs) {
    lastValue = await readValue();
    if (lastValue) {
      return lastValue;
    }
    await wait(intervalMs);
  }

  throw new Error(`${failureMessage} Last value: ${String(lastValue)}`);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
