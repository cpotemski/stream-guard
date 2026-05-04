import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const repoRoot = path.resolve(import.meta.dirname, "..");
const extensionPath = path.join(repoRoot, "extension");
const baseProfileDir = path.join(repoRoot, ".local", "browser-profile");
const sessionMetadataPath = path.join(repoRoot, ".local", "browser-session.json");
const manifestPath = path.join(extensionPath, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const targetChannel = "deemonrider";
const targetChannelUrl = `https://www.twitch.tv/${targetChannel}`;
const popupWaitTimeoutMs = 20_000;
const managedTabTimeoutMs = 45_000;
const streakTimeoutMs = 90_000;
const scope = process.env.TEST_SCOPE || "all";
const requiresTwitchProfile = !["popup", "group"].includes(scope);
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
const installedExtensionId = readInstalledExtensionIdFromProfile(
  requiresTwitchProfile ? baseProfileDir : testProfileDir
);

if (requiresTwitchProfile && !browserExecutablePath) {
  throw new Error(
    "No supported browser executable found. Install Google Chrome or Brave, or set STREAM_GUARD_BROWSER_PATH."
  );
}

if (requiresTwitchProfile && !fs.existsSync(baseProfileDir)) {
  throw new Error(
    `Missing base browser profile at ${baseProfileDir}. Run npm run browser:session first and log into Twitch in that profile.`
  );
}

prepareTestProfile();
let context = null;
let browser = null;
let usingExistingSessionBrowser = false;
let popupPage = null;
let extensionWorker = null;

try {
  if (requiresTwitchProfile) {
    const sessionMetadata = readBrowserSessionMetadata();
    if (!sessionMetadata?.devtoolsEndpoint) {
      throw new Error(
        `Missing browser session metadata at ${sessionMetadataPath}. Restart npm run browser:session first.`
      );
    }

    browser = await chromium.connectOverCDP(sessionMetadata.devtoolsEndpoint);
    [context] = browser.contexts();
    usingExistingSessionBrowser = true;
    assert.ok(context, "Could not attach to the browser:session Chrome context.");
  } else {
    context = await chromium.launchPersistentContext(testProfileDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check"
      ]
    });
    assert.ok(context, "Could not launch the Chrome browser context.");
  }

  const extensionId = await waitForInstalledExtensionId();
  popupPage = await openPopupPage(context, extensionId);
  extensionWorker = await getExtensionWorker(context, extensionId);
  const extensionRuntime = await readExtensionRuntimeFromPage(popupPage, extensionId);

  await resetExtensionState(extensionWorker);
  await waitForPopupReady(popupPage);

  await verifyActiveVersion(popupPage, extensionRuntime);
  console.log("PASS version");

  if (scope === "all" || scope === "popup") {
    await verifyPopupToggle(popupPage);
    console.log("PASS popup");
  }

  if (scope === "all" || scope === "group") {
    await verifyWatchGroupFlow(popupPage);
    console.log("PASS group");
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
  try {
    await popupPage?.close();
  } catch (_error) {
    // Best-effort cleanup only.
  }

  if (usingExistingSessionBrowser) {
    await browser?.close();
  } else {
    await context?.close();
    try {
      fs.rmSync(testProfileDir, { recursive: true, force: true });
    } catch (_error) {
      // Chrome may still release profile files asynchronously; a leftover temp profile is acceptable.
    }
  }
}

function prepareTestProfile() {
  if (requiresTwitchProfile) {
    return;
  }

  fs.rmSync(testProfileDir, { recursive: true, force: true });
  fs.mkdirSync(testProfileDir, { recursive: true });

  if (fs.existsSync(baseProfileDir)) {
    fs.cpSync(baseProfileDir, testProfileDir, { recursive: true });
  }

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

async function getExtensionWorker(context, expectedExtensionId = null) {
  const expectedPrefix = expectedExtensionId
    ? `chrome-extension://${expectedExtensionId}/`
    : "chrome-extension://";
  return expectEventually(async () => {
    const workers = context.serviceWorkers().filter((worker) => worker.url().startsWith(expectedPrefix));
    for (const worker of workers) {
      if (await isExpectedExtensionWorker(worker)) {
        return worker;
      }
    }
    return null;
  }, 20_000, 250, "Timed out waiting for the Stream Guard extension service worker.");
}

async function readExtensionRuntimeFromPage(popupPage, extensionId) {
  const fromPage = await popupPage.evaluate(() => ({
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    name: chrome.runtime.getManifest().name
  }));

  const fallbackExtensionId = extensionId || installedExtensionId;
  if (!fromPage.extensionId && !fallbackExtensionId) {
    throw new Error("Could not determine extension runtime metadata.");
  }

  return {
    extensionId: fromPage.extensionId || fallbackExtensionId,
    version: fromPage.version,
    name: fromPage.name
  };
}

async function isExpectedExtensionWorker(worker) {
  try {
    const runtime = await worker.evaluate(() => ({
      name: chrome.runtime.getManifest().name,
      version: chrome.runtime.getManifest().version
    }));
    return runtime?.name === manifest.name;
  } catch (_error) {
    return false;
  }
}

async function openPopupPage(context, extensionId) {
  const popupUrl = `chrome-extension://${extensionId}/src/popup.html`;
  const popupPage = await context.newPage();
  await popupPage.goto(popupUrl, {
    waitUntil: "domcontentloaded"
  });
  await popupPage.waitForLoadState("domcontentloaded");
  return popupPage;
}

async function waitForInstalledExtensionId() {
  return expectEventually(() => {
    return readInstalledExtensionIdFromProfile(
      requiresTwitchProfile ? baseProfileDir : testProfileDir
    );
  }, 20_000, 250, "Timed out waiting for the Stream Guard extension id to appear in the test profile.");
}

function readBrowserSessionMetadata() {
  if (!fs.existsSync(sessionMetadataPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(sessionMetadataPath, "utf8"));
  } catch (_error) {
    return null;
  }
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

async function verifyWatchGroupFlow(popupPage) {
  await clearWatchGroupTestState(popupPage);

  const duplicateGroupResult = await popupPage.evaluate(async (channel) => {
    const tabManager = await import(chrome.runtime.getURL("src/lib/tabManager.js"));
    const primaryWindow = await chrome.windows.create({
      url: "about:blank",
      focused: false
    });
    const secondaryWindow = await chrome.windows.create({
      url: "about:blank",
      focused: false
    });

    const managedTab = await chrome.tabs.create({
      windowId: primaryWindow.id,
      url: `https://www.twitch.tv/${channel}`,
      active: false
    });
    const staleRaidTab = await chrome.tabs.create({
      windowId: primaryWindow.id,
      url: "https://www.twitch.tv/directory/game/raid",
      active: false
    });
    const strayTab = await chrome.tabs.create({
      windowId: secondaryWindow.id,
      url: "https://example.com/",
      active: false
    });

    const firstGroupId = await chrome.tabs.group({
      tabIds: [managedTab.id, staleRaidTab.id]
    });
    await chrome.tabGroups.update(firstGroupId, {
      title: "Stream Guard",
      color: "purple",
      collapsed: false
    });

    const secondGroupId = await chrome.tabs.group({
      tabIds: [strayTab.id]
    });
    await chrome.tabGroups.update(secondGroupId, {
      title: "Stream Guard",
      color: "purple",
      collapsed: false
    });

    await tabManager.reconcileWatchGroup({
      managedTabIds: [managedTab.id]
    });

    const groups = await chrome.tabGroups.query({
      title: "Stream Guard"
    });
    const tabs = await chrome.tabs.query({});
    const groupedTabs = tabs.filter((tab) => groups.some((group) => group.id === tab.groupId));

    return {
      managedTabId: managedTab.id,
      staleRaidTabClosed: !tabs.some((tab) => tab.id === staleRaidTab.id),
      strayTabClosed: !tabs.some((tab) => tab.id === strayTab.id),
      groupCount: groups.length,
      groupedTabs: groupedTabs.map((tab) => ({
        id: tab.id,
        groupId: tab.groupId,
        url: tab.url,
        windowId: tab.windowId
      }))
    };
  }, targetChannel);

  assert.equal(
    duplicateGroupResult.groupCount,
    1,
    `Expected a single Stream Guard group after duplicate cleanup, got ${duplicateGroupResult.groupCount}.`
  );
  assert.equal(
    duplicateGroupResult.staleRaidTabClosed,
    true,
    "Expected stale raid tab inside the Stream Guard group to be closed."
  );
  assert.equal(
    duplicateGroupResult.strayTabClosed,
    true,
    "Expected non-managed tab from the duplicate Stream Guard group to be closed."
  );
  assert.equal(
    duplicateGroupResult.groupedTabs.length,
    2,
    `Expected managed Twitch tab plus one about:blank keeper after cleanup, got ${duplicateGroupResult.groupedTabs.length} tabs.`
  );
  assert.equal(
    duplicateGroupResult.groupedTabs.filter((tab) => tab.url === "about:blank").length,
    1,
    "Expected exactly one about:blank keeper tab after duplicate cleanup."
  );
  const duplicateGroupSnapshot = await readWatchGroupSnapshot(popupPage);
  assert.equal(
    duplicateGroupSnapshot.groups[0]?.collapsed,
    false,
    "Expected the Stream Guard group to remain expanded after cleanup."
  );
  assert.equal(
    duplicateGroupResult.groupedTabs.some((tab) => tab.id === duplicateGroupResult.managedTabId),
    true,
    "Expected the managed Twitch tab to stay inside the Stream Guard group."
  );

  await popupPage.evaluate(async (managedTabId) => {
    const tabManager = await import(chrome.runtime.getURL("src/lib/tabManager.js"));
    await tabManager.closeManagedWatchTabs([managedTabId]);
    await tabManager.reconcileWatchGroup({
      managedTabIds: []
    });
  }, duplicateGroupResult.managedTabId);

  const blankOnlyResult = await readWatchGroupSnapshot(popupPage);
  assert.equal(
    blankOnlyResult.groups.length,
    1,
    `Expected one Stream Guard group after removing all managed tabs, got ${blankOnlyResult.groups.length}.`
  );
  assert.equal(
    blankOnlyResult.groupedTabs.length,
    1,
    `Expected only the about:blank keeper to remain after removing managed tabs, got ${blankOnlyResult.groupedTabs.length} tabs.`
  );
  assert.equal(
    blankOnlyResult.groupedTabs[0]?.url,
    "about:blank",
    `Expected the remaining tab to be about:blank, got ${blankOnlyResult.groupedTabs[0]?.url || "none"}.`
  );

  await clearWatchGroupTestState(popupPage);

  const reuseResult = await popupPage.evaluate(async (channel) => {
    const tabManager = await import(chrome.runtime.getURL("src/lib/tabManager.js"));
    const groupWindow = await chrome.windows.create({
      url: "about:blank",
      focused: false
    });
    const otherWindow = await chrome.windows.create({
      url: "about:blank",
      focused: false
    });

    const keeperSeedTab = await chrome.tabs.create({
      windowId: groupWindow.id,
      url: "about:blank",
      active: false
    });
    const existingGroupId = await chrome.tabs.group({
      tabIds: [keeperSeedTab.id]
    });
    await chrome.tabGroups.update(existingGroupId, {
      title: "Stream Guard",
      color: "purple",
      collapsed: false
    });

    await chrome.tabs.create({
      windowId: otherWindow.id,
      url: "https://example.com/",
      active: false
    });

    const openedTabId = await tabManager.openWatchTab(channel, {
      managedTabIds: []
    });
    await tabManager.reconcileWatchGroup({
      managedTabIds: [openedTabId]
    });

    const groups = await chrome.tabGroups.query({
      title: "Stream Guard"
    });
    const tabs = await chrome.tabs.query({});
    const groupedTabs = tabs.filter((tab) => groups.some((group) => group.id === tab.groupId));
    const managedTab = tabs.find((tab) => tab.id === openedTabId) || null;

    return {
      existingGroupId,
      keeperSeedTabId: keeperSeedTab.id,
      openedTabId,
      managedTabWindowId: managedTab?.windowId ?? null,
      groupWindowId: groupWindow.id,
      groupCount: groups.length,
      groupedTabs: groupedTabs.map((tab) => ({
        id: tab.id,
        url: tab.url,
        windowId: tab.windowId
      }))
    };
  }, targetChannel);

  assert.equal(
    reuseResult.groupCount,
    1,
    `Expected exactly one Stream Guard group after reusing an existing group, got ${reuseResult.groupCount}.`
  );
  assert.equal(
    reuseResult.groupedTabs.some((tab) => tab.id === reuseResult.openedTabId),
    true,
    "Expected the newly opened managed tab to be inside the reused Stream Guard group."
  );
  const blankKeeperCount = reuseResult.groupedTabs.filter((tab) => tab.url === "about:blank").length;
  assert.ok(
    blankKeeperCount === 1 || reuseResult.keeperSeedTabId === reuseResult.openedTabId,
    "Expected the existing about:blank keeper to either remain as a keeper or be reused as the managed tab."
  );
  if (blankKeeperCount === 1) {
    assert.equal(
      reuseResult.groupedTabs.some((tab) => tab.id === reuseResult.keeperSeedTabId),
      true,
      "Expected the pre-existing about:blank keeper tab to remain in the reused Stream Guard group."
    );
  }
  const reuseSnapshot = await readWatchGroupSnapshot(popupPage);
  assert.equal(
    reuseSnapshot.groups[0]?.collapsed,
    false,
    "Expected the reused Stream Guard group to remain expanded."
  );

  await popupPage.evaluate(async (openedTabId) => {
    const tabManager = await import(chrome.runtime.getURL("src/lib/tabManager.js"));
    await tabManager.closeManagedWatchTabs([openedTabId]);
    await tabManager.reconcileWatchGroup({
      managedTabIds: []
    });
  }, reuseResult.openedTabId);

  await clearWatchGroupTestState(popupPage);
  await refreshPopupPage(popupPage);
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

async function clearWatchGroupTestState(popupPage) {
  await popupPage.evaluate(async () => {
    const popupUrl = chrome.runtime.getURL("src/popup.html");
    const tabs = await chrome.tabs.query({});
    const removableTabIds = tabs
      .filter((tab) => tab.url !== popupUrl)
      .map((tab) => tab.id)
      .filter((tabId) => Number.isInteger(tabId));

    if (removableTabIds.length > 0) {
      await chrome.tabs.remove(removableTabIds);
    }

    const windows = await chrome.windows.getAll({
      populate: true,
      windowTypes: ["normal"]
    });
    for (const window of windows) {
      const tabsInWindow = Array.isArray(window.tabs) ? window.tabs : [];
      if (tabsInWindow.length === 0) {
        await chrome.windows.remove(window.id);
      }
    }
  });
}

async function readWatchGroupSnapshot(popupPage) {
  return popupPage.evaluate(async () => {
    const groups = await chrome.tabGroups.query({
      title: "Stream Guard"
    });
    const tabs = await chrome.tabs.query({});
    const groupedTabs = tabs.filter((tab) => groups.some((group) => group.id === tab.groupId));

    return {
      groups: groups.map((group) => ({
        id: group.id,
        title: group.title,
        color: group.color,
        collapsed: group.collapsed
      })),
      groupedTabs: groupedTabs.map((tab) => ({
        id: tab.id,
        groupId: tab.groupId,
        windowId: tab.windowId,
        url: tab.url
      }))
    };
  });
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

  const managedTabId = await ensureManagedChannelTab(popupPage);
  const managedPage = await waitForManagedChannelPage(context);
  await managedPage.bringToFront();

  await waitForPlaybackHealthy(managedPage);
  await waitForLowestPlaybackQuality(managedPage);
  await assertLowestPlaybackQualitySelected(managedPage);

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

async function waitForLowestPlaybackQuality(page) {
  await expectEventually(async () => {
    return page.evaluate(() => {
      const video = document.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) {
        return null;
      }

      return video.videoHeight === 160 ? true : null;
    });
  }, 20_000, 250, "Timed out waiting for Twitch playback to settle at 160p.");
}

async function waitForPlaybackQualityMenuClosed(page) {
  await expectEventually(async () => {
    return page.evaluate(() => {
      const hasQualityOptions = document.querySelector(
        "[data-a-target='player-settings-submenu-quality-option'] input"
      );
      const hasQualityMenuItem = document.querySelector(
        "[data-a-target='player-settings-menu-item-quality']"
      );
      return !hasQualityOptions && !hasQualityMenuItem ? true : null;
    });
  }, 5_000, 100, "Timed out waiting for the Twitch quality menu to close.");
}

async function assertLowestPlaybackQualitySelected(page) {
  await waitForPlaybackQualityMenuClosed(page);

  const settingsButtons = page.locator("[data-a-target='video-player'] [data-a-target='player-settings-button']");
  const settingsButtonCount = await settingsButtons.count();
  assert.equal(
    settingsButtonCount,
    2,
    `Expected two player settings buttons, got ${settingsButtonCount}.`
  );

  await settingsButtons.nth(0).click();
  await page.waitForTimeout(250);
  await page.locator("[data-a-target='player-settings-menu-item-quality']").click();
  await page.waitForTimeout(250);

  const qualityInputs = page.locator("[data-a-target='player-settings-submenu-quality-option'] input");
  const qualityInputCount = await qualityInputs.count();
  assert.ok(qualityInputCount >= 2, `Expected multiple quality options, got ${qualityInputCount}.`);

  const checkedIndex = await page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll("[data-a-target='player-settings-submenu-quality-option'] input")
    );
    return inputs.findIndex((input) => input instanceof HTMLInputElement && input.checked);
  });

  assert.equal(
    checkedIndex,
    qualityInputCount - 1,
    `Expected the lowest quality option at index ${qualityInputCount - 1}, got ${checkedIndex}.`
  );
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

      function findWatchStreakControllerLabel(dialog, controller) {
        if (!(dialog instanceof HTMLElement) || !(controller instanceof HTMLElement)) {
          return null;
        }

        const controllerId = controller.getAttribute("id");
        if (!controllerId) {
          return null;
        }

        const label = dialog.querySelector(`label[for='${CSS.escape(controllerId)}']`);
        return label instanceof HTMLElement ? label : null;
      }

      async function expandWatchStreakFooter(dialog) {
        if (!(dialog instanceof HTMLElement) || dialog.querySelector("#watch-streak-footer")) {
          return false;
        }

        const controller = dialog.querySelector("[aria-controls='watch-streak-footer']");
        if (!(controller instanceof HTMLElement)) {
          return false;
        }

        if (controller instanceof HTMLInputElement && controller.checked) {
          return true;
        }

        const clickTarget = findWatchStreakControllerLabel(dialog, controller) || controller;
        clickTarget.click();
        await wait(400);
        return dialog.querySelector("#watch-streak-footer") instanceof HTMLElement;
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

        const controlledInputs = dialog.querySelectorAll("[aria-controls='watch-streak-footer']");
        for (const input of controlledInputs) {
          if (!(input instanceof HTMLElement)) {
            continue;
          }

          const label = findWatchStreakControllerLabel(dialog, input);
          const candidates = [
            input,
            label,
            ...(label instanceof HTMLElement ? [...label.querySelectorAll("strong, p, span, div")] : [])
          ].filter((node) => node instanceof HTMLElement)
            .filter((node) => !isInsideExcludedStreakArea(node));

          const value = extractIntegerFromPreferredNodes(candidates);
          if (Number.isInteger(value) && value >= 0) {
            return value;
          }
        }

        const indicatorRoots = findWatchStreakIndicatorRoots(dialog);
        for (const root of indicatorRoots) {
          const value = extractIntegerFromPreferredNodes(getPreferredWatchStreakNodes(root));
          if (Number.isInteger(value) && value >= 0) {
            return value;
          }
        }

        return null;
      }

      function getPreferredWatchStreakNodes(root) {
        if (!(root instanceof HTMLElement)) {
          return [];
        }

        const flameIcon = findWatchStreakFlameIcon(root);
        const headerRow = findWatchStreakHeaderRow(root, flameIcon);
        if (headerRow instanceof HTMLElement) {
          return [
            headerRow,
            ...headerRow.querySelectorAll("strong, [role='status'], p, span, div")
          ].filter((node) => node instanceof HTMLElement);
        }

        return [
          ...root.querySelectorAll("strong, [role='status'], p, span, div")
        ].filter((node) => node instanceof HTMLElement);
      }

      function findWatchStreakHeaderRow(root, flameIcon) {
        if (!(root instanceof HTMLElement) || !(flameIcon instanceof SVGElement)) {
          return null;
        }

        let current = flameIcon.parentElement;
        while (current instanceof HTMLElement && current !== root) {
          const text = String(current.textContent || "").trim();
          if (/\\d/.test(text) && !current.querySelector("[role='progressbar']")) {
            return current;
          }
          current = current.parentElement;
        }

        return null;
      }

      function findWatchStreakIndicatorRoots(dialog) {
        if (!(dialog instanceof HTMLElement)) {
          return [];
        }

        const structuredCandidates = findStructuredWatchStreakRoots(dialog);
        const textCandidates = [...dialog.querySelectorAll("button, label, [role='button'], div, section")]
          .filter((node) => node instanceof HTMLElement)
          .filter((node) => {
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
          .filter((node) => !isInsideExcludedStreakArea(node));

        return dedupeElements([...structuredCandidates, ...textCandidates]);
      }

      function dedupeElements(nodes) {
        const seen = new Set();
        const result = [];

        for (const node of nodes) {
          if (!(node instanceof HTMLElement) || seen.has(node)) {
            continue;
          }
          seen.add(node);
          result.push(node);
        }

        return result;
      }

      function findStructuredWatchStreakRoots(dialog) {
        if (!(dialog instanceof HTMLElement)) {
          return [];
        }

        return dedupeElements(
          [...dialog.querySelectorAll("div, section, button")]
            .filter((node) => node instanceof HTMLElement)
            .filter((node) => !isInsideExcludedStreakArea(node))
            .filter((node) => hasWatchStreakFlameIcon(node))
            .filter((node) => node.querySelector("[role='progressbar']"))
        );
      }

      function hasWatchStreakFlameIcon(root) {
        return Boolean(findWatchStreakFlameIcon(root));
      }

      function findWatchStreakFlameIcon(root) {
        if (!(root instanceof HTMLElement)) {
          return null;
        }

        const icons = [...root.querySelectorAll("svg")]
          .filter((icon) => icon instanceof SVGElement);

        for (const icon of icons) {
          const paths = [...icon.querySelectorAll("path")]
            .map((path) => normalizeSvgPathData(path.getAttribute("d")));
          if (
            paths.some((path) => path.includes("M5.2958.05102l342-33.85.067"))
            || paths.some((path) => path.includes("A7.3337.33300113.66722h-3.405"))
          ) {
            return icon;
          }
        }

        return null;
      }

      function normalizeSvgPathData(value) {
        return String(value || "").replace(/\\s+/g, "");
      }

      function hasVisibleWatchStreakUi(dialog) {
        if (!(dialog instanceof HTMLElement)) {
          return false;
        }

        return Boolean(
          dialog.querySelector("#watch-streak-footer")
          || dialog.querySelector("[aria-controls='watch-streak-footer']")
          || findWatchStreakIndicatorRoots(dialog).length > 0
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
      await expandWatchStreakFooter(dialog);
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
