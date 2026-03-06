const BUTTON_ID = "tw-watch-guard-star";
const INLINE_HEADER_ID = "tw-watch-guard-inline-header";
const INLINE_STATS_ID = "tw-watch-guard-inline-stats";
const INLINE_STATS_ITEMS_CLASS = "tw-watch-guard-inline-items";
const TOAST_ID = "tw-watch-guard-toast";
const UPTIME_SELECTOR_CANDIDATES = [
  ".live-time p",
  ".live-time [aria-hidden='true']",
  "[data-a-target='stream-time']",
  "[data-test-selector='stream-time-value']",
  ".live-time"
];
const AUTO_CLAIM_MARKER = "twWatchGuardClaimHandled";
const CHANNEL_STARTUP_GRACE_MS = 10000;
const WATCH_STREAK_POLL_INTERVAL_MS = 300000;
const WATCH_STREAK_MENU_TOGGLE_DELAY_MS = 320;
const WATCH_STREAK_SUMMARY_WAIT_TIMEOUT_MS = 8000;
const WATCH_STREAK_DIALOG_WAIT_TIMEOUT_MS = 2500;
const WATCH_STREAK_CARD_WAIT_TIMEOUT_MS = 2500;
const WATCH_STREAK_WAIT_POLL_MS = 120;
const WATCH_STREAK_ICON_PATH_FRAGMENT = "M5.295 8.05 10 2l3 4 2-3 3.8 5.067";
const WATCH_STREAK_CHEVRON_PATH_FRAGMENT = "M13.793 12.207 8 6.414";
const FAST_PLAYBACK_POLL_INTERVAL_MS = 5000;
const SLOW_PLAYBACK_POLL_INTERVAL_MS = 60000;
const FAST_PLAYBACK_REPORT_TICKS = 6;
const PLAYBACK_REPORT_DEBOUNCE_MS = 350;
const RESUME_GAP_THRESHOLD_MS = 180000;
const UNMUTE_SHORTCUT_SETTLE_MS = 120;
const NETWORK_ERROR_RELOAD_COOLDOWN_MS = 120000;
const NETWORK_ERROR_RELOAD_AT_KEY = "twWatchGuardLastNetworkErrorReloadAt";
const INLINE_STATS_REFRESH_INTERVAL_MS = 5000;
const PLAYBACK_STATE_EVENTS = [
  "play",
  "pause",
  "volumechange",
  "loadedmetadata",
  "playing",
  "waiting"
];
const TAB_LOG_PREFIX = "[Stream Guard]";

let lastChannel = null;
let lastReportedUptimeKey = null;
let lastClaimAvailabilityKey = null;
let lastPlaybackStateKey = null;
let playbackStatePollTimeoutId = 0;
let fastPlaybackPollsLeft = 0;
let playbackStateVideo = null;
let playbackStateDebounceTimeoutId = 0;
let requestedPlaybackRefresh = 0;
let requestedStreakRefresh = 0;
let lastWatchStreakReportKey = null;
let streakProbeInFlight = false;
let lastLifecycleHeartbeatAt = Date.now();
let playResumeAttemptedForCurrentPause = false;
let playResumeBlockedByPolicy = false;
let channelAutomationReadyAt = 0;
let startupSequenceTimeoutId = 0;
let inlineStatsRefreshInFlight = false;
let lastInlineStatsKey = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "watch:request-playback-state") {
    window.clearTimeout(requestedPlaybackRefresh);
    requestedPlaybackRefresh = window.setTimeout(() => {
      requestedPlaybackRefresh = 0;
      void ensureManagedPlaybackState();
    }, 0);
    return;
  }

  if (message?.type === "watch:request-streak") {
    window.clearTimeout(requestedStreakRefresh);
    requestedStreakRefresh = window.setTimeout(() => {
      requestedStreakRefresh = 0;
      void reportWatchStreak();
    }, 0);
  }
});

void init();

async function init() {
  setupResumeRecoveryWatchers();
  touchLifecycleHeartbeat();
  await syncButton();
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void syncButton();
  }, 1000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void reportWatchUptime();
  }, 15000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void tryAutoClaimBonus();
  }, 5000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void ensureManagedPlaybackState();
  }, 5000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void reportWatchStreak();
  }, WATCH_STREAK_POLL_INTERVAL_MS);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void refreshInlineStats();
  }, INLINE_STATS_REFRESH_INTERVAL_MS);
  startPlaybackStatePolling();
}

async function syncButton() {
  const channel = getChannelFromLocation(window.location.pathname);
  if (channel === lastChannel) {
    placeButton();
    attachPlaybackStateWatchers(findPlayerVideo());
    void reportWatchUptime();
    void tryAutoClaimBonus();
    void ensureManagedPlaybackState();
    return;
  }

  const previousChannel = lastChannel;
  lastChannel = channel;
  lastReportedUptimeKey = null;
  lastClaimAvailabilityKey = null;
  lastPlaybackStateKey = null;
  lastWatchStreakReportKey = null;
  playResumeAttemptedForCurrentPause = false;
  playResumeBlockedByPolicy = false;

  if (!channel) {
    sendTabTelemetry("channel:left", {
      previousChannel
    });
    channelAutomationReadyAt = 0;
    window.clearTimeout(startupSequenceTimeoutId);
    startupSequenceTimeoutId = 0;
    detachPlaybackStateWatchers();
    removeButton();
    removeInlineStats();
    return;
  }

  sendTabTelemetry("channel:entered", {
    channel,
    previousChannel,
    startupGraceMs: CHANNEL_STARTUP_GRACE_MS
  });

  channelAutomationReadyAt = Date.now() + CHANNEL_STARTUP_GRACE_MS;
  window.clearTimeout(startupSequenceTimeoutId);
  startupSequenceTimeoutId = 0;

  await injectButton(channel);
  void refreshInlineStats(true);
  startPlaybackStatePolling();
  attachPlaybackStateWatchers(findPlayerVideo());
  scheduleInitialChannelAutomation(channel);
  void reportWatchUptime();
  void tryAutoClaimBonus();
  void ensureManagedPlaybackState();
}

async function injectButton(channel) {
  let button = document.getElementById(BUTTON_ID);
  if (!button) {
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "tw-watch-guard-button";
    button.addEventListener("click", async () => {
      const activeChannel = getChannelFromLocation(window.location.pathname);
      if (!activeChannel || button.dataset.pending === "1") {
        return;
      }

      const wasImportant = button.getAttribute("aria-pressed") === "true";
      const optimisticState = !wasImportant;
      button.dataset.pending = "1";
      renderButton(button, optimisticState);
      void refreshInlineStats(true);

      try {
        const response = await chrome.runtime.sendMessage({
          type: "channel:toggle",
          channel: activeChannel
        });

        if (!response?.ok) {
          renderButton(button, wasImportant);
          showToast("Aktion fehlgeschlagen");
          return;
        }

        const isImportant = response.settings.importantChannels.some(
          (entry) => entry.name === activeChannel
        );
        renderButton(button, isImportant);
        void refreshInlineStats(true);
        showToast(
          isImportant
            ? "Zu wichtigen Channels hinzugefuegt"
            : "Aus wichtigen Channels entfernt"
        );
      } catch (error) {
        logTabError("channel:toggle failed", error);
        renderButton(button, wasImportant);
        void refreshInlineStats(true);
        showToast("Aktion fehlgeschlagen");
      } finally {
        delete button.dataset.pending;
      }
    });
  }

  placeButton(button);

  let response = null;
  try {
    response = await chrome.runtime.sendMessage({ type: "settings:get" });
  } catch (error) {
    logTabError("settings:get failed in injectButton", error);
  }

  const isImportant = response?.ok
    ? response.settings.importantChannels.some((entry) => entry.name === channel)
    : false;
  renderButton(button, isImportant);
}

function placeButton(existingButton) {
  const button = existingButton || document.getElementById(BUTTON_ID);
  if (!button) {
    return;
  }

  const searchContainer = document.querySelector(".top-nav__search-container");
  const host = searchContainer?.parentElement;
  if (!searchContainer || !host) {
    button.remove();
    removeInlineStats();
    return;
  }

  let inlineHeader = document.getElementById(INLINE_HEADER_ID);
  if (!inlineHeader) {
    inlineHeader = document.createElement("div");
    inlineHeader.id = INLINE_HEADER_ID;
    inlineHeader.className = "tw-watch-guard-inline-header";
  }

  if (button.parentElement !== inlineHeader) {
    inlineHeader.appendChild(button);
  }

  if (!inlineHeader.querySelector(`#${INLINE_STATS_ID}`)) {
    const stats = document.createElement("div");
    stats.id = INLINE_STATS_ID;
    stats.className = "tw-watch-guard-inline-stats";
    stats.hidden = true;

    const items = document.createElement("div");
    items.className = INLINE_STATS_ITEMS_CLASS;

    stats.appendChild(items);
    inlineHeader.appendChild(stats);
  }

  if (inlineHeader.parentElement !== host || inlineHeader.previousElementSibling !== searchContainer) {
    searchContainer.insertAdjacentElement("afterend", inlineHeader);
  }
}

function removeButton() {
  const button = document.getElementById(BUTTON_ID);
  if (button) {
    button.remove();
  }
}

function removeInlineStats() {
  const inlineHeader = document.getElementById(INLINE_HEADER_ID);
  if (inlineHeader) {
    inlineHeader.remove();
  }
  lastInlineStatsKey = null;
}

function attachPlaybackStateWatchers(video) {
  const player = video instanceof HTMLVideoElement ? video : null;
  if (player === playbackStateVideo) {
    return;
  }

  detachPlaybackStateWatchers();
  playbackStateVideo = player;

  if (!playbackStateVideo) {
    return;
  }

  for (const event of PLAYBACK_STATE_EVENTS) {
    playbackStateVideo.addEventListener(event, onPlaybackStateEvent, { passive: true });
  }
  window.addEventListener("visibilitychange", onPlaybackStateEvent);
}

function detachPlaybackStateWatchers() {
  if (!playbackStateVideo) {
    return;
  }

  for (const event of PLAYBACK_STATE_EVENTS) {
    playbackStateVideo.removeEventListener(event, onPlaybackStateEvent);
  }
  window.removeEventListener("visibilitychange", onPlaybackStateEvent);

  playbackStateVideo = null;
}

function onPlaybackStateEvent() {
  schedulePlaybackStateReport();
}

function schedulePlaybackStateReport() {
  window.clearTimeout(playbackStateDebounceTimeoutId);
  playbackStateDebounceTimeoutId = window.setTimeout(() => {
    playbackStateDebounceTimeoutId = 0;
    void ensureManagedPlaybackState();
  }, PLAYBACK_REPORT_DEBOUNCE_MS);
}

function renderButton(button, isImportant) {
  button.textContent = isImportant ? "★" : "☆";
  button.setAttribute("aria-pressed", isImportant ? "true" : "false");
  button.classList.toggle("is-active", isImportant);
  button.setAttribute(
    "aria-label",
    isImportant ? "Aus wichtigen Channels entfernen" : "Als wichtigen Channel markieren"
  );
  button.title = isImportant ? "Nicht mehr wichtig" : "Als wichtig markieren";
}

async function refreshInlineStats(force = false) {
  const channel = getChannelFromLocation(window.location.pathname);
  const stats = document.getElementById(INLINE_STATS_ID);
  if (!channel || !stats) {
    return;
  }

  const button = document.getElementById(BUTTON_ID);
  const isImportant = button?.getAttribute("aria-pressed") === "true";
  if (inlineStatsRefreshInFlight) {
    return;
  }

  inlineStatsRefreshInFlight = true;
  try {
    const runtimeState = await readRuntimeStateSnapshot();
    const nextKey = getInlineStatsRenderKey(channel, isImportant, runtimeState);
    if (!force && nextKey === lastInlineStatsKey) {
      return;
    }
    renderInlineStats(stats, {
      channel,
      isImportant,
      runtimeState
    });
    lastInlineStatsKey = nextKey;
  } finally {
    inlineStatsRefreshInFlight = false;
  }
}

async function readRuntimeStateSnapshot() {
  try {
    const stored = await chrome.storage.local.get([
      "managedTabsByChannel",
      "broadcastSessionsByChannel",
      "lastBroadcastStatsByChannel",
      "claimStatsByChannel",
      "claimAvailabilityByChannel",
      "watchStreakByChannel"
    ]);
    return stored && typeof stored === "object" ? stored : {};
  } catch (_error) {
    return {};
  }
}

function renderInlineStats(container, context) {
  const isImportant = Boolean(context?.isImportant);
  const channel = String(context?.channel || "").toLowerCase();
  const runtimeState = context?.runtimeState || {};
  const items = container.querySelector(`.${INLINE_STATS_ITEMS_CLASS}`);

  if (!items) {
    container.hidden = true;
    return;
  }

  items.textContent = "";
  if (!isImportant || !channel) {
    container.hidden = true;
    return;
  }

  const broadcastStats = getChannelBroadcastStats(channel, runtimeState);
  const hasSession = hasActiveRuntimeSession(channel, runtimeState);
  const claimStats = getClaimStatsForDisplay(channel, runtimeState, broadcastStats);
  const claimCount = getClaimCount(claimStats);
  const streakLabel = getWatchStreakLabel(
    getWatchStreakForDisplay(channel, runtimeState, broadcastStats),
    broadcastStats
  );
  const claimReady = isClaimAvailable(runtimeState.claimAvailabilityByChannel?.[channel]);

  const hasAnyStat = claimCount !== null || streakLabel !== null || claimReady;
  if (!hasAnyStat) {
    const waiting = document.createElement("span");
    waiting.className = "tw-watch-guard-inline-token is-waiting";
    waiting.textContent = hasSession ? "..." : "-";
    items.appendChild(waiting);
    container.hidden = false;
    return;
  }

  if (claimCount !== null) {
    appendInlineToken(items, `🎁 ${claimCount}`);
  }
  if (streakLabel !== null) {
    appendInlineToken(items, streakLabel);
  }
  if (claimReady) {
    appendInlineToken(items, "🔔");
  }

  container.hidden = false;
}

function appendInlineToken(container, value) {
  const token = document.createElement("span");
  token.className = "tw-watch-guard-inline-token";
  token.textContent = value;
  container.appendChild(token);
}

function getInlineStatsRenderKey(channel, isImportant, runtimeState) {
  if (!isImportant) {
    return `${channel}:hidden`;
  }

  const claimStats = runtimeState?.claimStatsByChannel?.[channel];
  const broadcastStats = runtimeState?.broadcastSessionsByChannel?.[channel]
    || runtimeState?.lastBroadcastStatsByChannel?.[channel];
  const streak = runtimeState?.watchStreakByChannel?.[channel];
  const claimAvailability = runtimeState?.claimAvailabilityByChannel?.[channel];

  return JSON.stringify({
    channel,
    important: true,
    claimCount: Math.max(
      0,
      Math.floor(Number(claimStats?.count ?? broadcastStats?.claimCount) || 0)
    ),
    streakValue: Math.floor(Number(streak?.value ?? broadcastStats?.streakValue)),
    streakIncreased: Boolean(
      broadcastStats?.streakIncreasedForStream || streak?.increased
    ),
    streakUnexpected: Boolean(
      broadcastStats?.streakUnexpectedJumpForStream || streak?.unexpectedJump
    ),
    claimReady: Boolean(claimAvailability?.available),
    startedAt: Math.round(Number(broadcastStats?.estimatedStartedAt) || 0)
  });
}

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
      return "🔥 ⚠";
    }
    return reachedForCurrentStream ? "🔥 ✅" : null;
  }

  if (hasUnexpectedJump) {
    return `🔥 ${value} ⚠`;
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
    return runtimeStreak || null;
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

function showToast(message) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "tw-watch-guard-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("is-visible");

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

showToast.timeoutId = 0;

async function reportWatchUptime() {
  if (isStartupDelayActive()) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  const uptimeSeconds = getVisibleStreamUptimeSeconds();
  if (uptimeSeconds === null) {
    return;
  }

  const dedupeKey = `${channel}:${uptimeSeconds}`;
  if (dedupeKey === lastReportedUptimeKey) {
    return;
  }

  lastReportedUptimeKey = dedupeKey;

  try {
    await chrome.runtime.sendMessage({
      type: "watch:uptime",
      channel,
      uptimeSeconds
    });
  } catch (_error) {
    // Ignore transient extension reload gaps.
  }
}

async function tryAutoClaimBonus() {
  if (isStartupDelayActive()) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  const claimButton = findClaimButton();
  await reportClaimAvailability(channel, Boolean(claimButton && !claimButton.disabled));

  if (!claimButton || claimButton.disabled || claimButton.dataset[AUTO_CLAIM_MARKER] === "1") {
    return;
  }

  let response;

  try {
    response = await chrome.runtime.sendMessage({
      type: "claim:authorize",
      channel
    });
  } catch (_error) {
    return;
  }

  if (!response?.ok || !response.authorized) {
    return;
  }

  claimButton.dataset[AUTO_CLAIM_MARKER] = "1";

  try {
    claimButton.click();
    await chrome.runtime.sendMessage({
      type: "claim:record",
      channel
    });
    sendTabTelemetry("claim:clicked", {
      channel
    });
    lastClaimAvailabilityKey = `${channel}:0`;
  } catch (error) {
    logTabError("claim:record failed after claim click", error);
    sendTabTelemetry("claim:record-failed", {
      channel,
      message: error instanceof Error ? error.message : String(error)
    });
    delete claimButton.dataset[AUTO_CLAIM_MARKER];
  }
}

async function reportWatchStreak() {
  if (isStartupDelayActive()) {
    return;
  }

  if (streakProbeInFlight) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  let authorization;

  try {
    authorization = await chrome.runtime.sendMessage({
      type: "watch:authorize",
      channel
    });
  } catch (_error) {
    await sendStreakProbeLog(channel, "authorize-message-failed");
    return;
  }

  if (!authorization?.ok || !authorization.authorized) {
    await sendStreakProbeLog(channel, "unauthorized");
    return;
  }

  const summaryData = await waitForResult(
    () => {
      const summary = findCommunityPointsSummaryRoot();
      const button = findCommunityPointsSummaryToggleButton(summary);
      return button ? { summary, button } : null;
    },
    WATCH_STREAK_SUMMARY_WAIT_TIMEOUT_MS
  );
  if (!summaryData?.button) {
    const diagnostics = getSummaryToggleDiagnostics();
    await sendStreakProbeLog(channel, "summary-toggle-not-found");
    await sendStreakProbeLog(channel, "summary-toggle-context", {
      summaryExists: diagnostics.summaryCount > 0,
      summaryCount: diagnostics.summaryCount,
      copoCount: diagnostics.copoCount,
      bitsCount: diagnostics.bitsCount,
      pointsButtonsCount: diagnostics.pointsButtonsCount
    });
    return;
  }
  const summaryToggleButton = summaryData.button;

  streakProbeInFlight = true;

  let streakValue = null;
  const wasOpenBefore = Boolean(findRewardCenterDialog());
  let hadDialog = false;
  let hadCard = false;

  try {
    if (!wasOpenBefore) {
      summaryToggleButton.click();
      await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
    }

    let dialog = await waitForResult(
      () => findRewardCenterDialog(),
      WATCH_STREAK_DIALOG_WAIT_TIMEOUT_MS
    );
    hadDialog = Boolean(dialog);

    if (!dialog && !wasOpenBefore && summaryToggleButton.isConnected) {
      summaryToggleButton.click();
      await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
      dialog = await waitForResult(
        () => findRewardCenterDialog(),
        WATCH_STREAK_DIALOG_WAIT_TIMEOUT_MS
      );
      hadDialog = Boolean(dialog);
    }

    const card = dialog
      ? await waitForResult(
        () => findWatchStreakCard(dialog),
        WATCH_STREAK_CARD_WAIT_TIMEOUT_MS
      )
      : null;
    hadCard = Boolean(card);
    streakValue = extractWatchStreakValueFromCard(card);
  } finally {
    const closed = await closeRewardCenterDialog(summaryToggleButton);
    if (!closed) {
      await sendStreakProbeLog(channel, "summary-close-failed");
    }
    streakProbeInFlight = false;
  }

  if (!Number.isInteger(streakValue) || streakValue < 0) {
    console.warn(
      TAB_LOG_PREFIX,
      "streak could not be found",
      { channel, wasOpenBefore, hadDialog, hadCard }
    );
    await sendStreakProbeLog(channel, "streak-could-not-be-found", {
      wasOpenBefore,
      hadDialog,
      hadCard
    });
    return;
  }

  const dedupeKey = `${channel}:${streakValue}`;
  if (dedupeKey === lastWatchStreakReportKey) {
    return;
  }
  lastWatchStreakReportKey = dedupeKey;

  try {
    await chrome.runtime.sendMessage({
      type: "streak:report",
      channel,
      value: streakValue
    });
  } catch (error) {
    await sendStreakProbeLog(channel, "streak-report-message-failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function ensureManagedPlaybackState() {
  touchLifecycleHeartbeat();
  if (isStartupDelayActive()) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  let response;

  try {
    response = await chrome.runtime.sendMessage({
      type: "watch:authorize",
      channel
    });
  } catch (_error) {
    return;
  }

  if (!response?.ok || !response.authorized) {
    return;
  }

  if (shouldReloadForNetworkError2000()) {
    sendTabTelemetry("playback:reload-network-error-2000", {
      channel
    });
    window.location.reload();
    return;
  }

  const video = findPlayerVideo();
  if (!video) {
    return;
  }

  if (!needsPlaybackResume(video)) {
    playResumeAttemptedForCurrentPause = false;
    playResumeBlockedByPolicy = false;
  }

  if (shouldAttemptPlaybackResume(video)) {
    try {
      playResumeAttemptedForCurrentPause = true;
      await video.play();
      playResumeAttemptedForCurrentPause = false;
      playResumeBlockedByPolicy = false;
      await chrome.runtime.sendMessage({
        type: "watch:playback-resumed",
        channel
      });
      sendTabTelemetry("playback:resumed", {
        channel
      });
    } catch (error) {
      if (isAutoplayInteractionError(error)) {
        playResumeBlockedByPolicy = true;
        sendTabTelemetry("playback:resume-blocked-policy", {
          channel
        });
      } else {
        logTabError("video.play() failed while resuming playback", error);
      }
      // Playback resume can still be blocked by browser policy or page/player state.
    }
  }

  if (video.muted) {
    const unmutedAfterResume = await ensureVideoUnmutedWithShortcut(video);
    if (unmutedAfterResume) {
      sendTabTelemetry("playback:unmuted-shortcut", {
        channel
      });
      await sendPlaybackCorrected(channel);
    }
  }

  await reportManagedPlaybackStateForVideo(channel, video);
}

async function reportManagedPlaybackState() {
  if (isStartupDelayActive()) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  const video = findPlayerVideo();
  if (!video) {
    return;
  }

  attachPlaybackStateWatchers(video);
  await reportManagedPlaybackStateForVideo(channel, video);
}

function startPlaybackStatePolling() {
  fastPlaybackPollsLeft = FAST_PLAYBACK_REPORT_TICKS;
  void scheduleNextPlaybackStatePoll(0);
}

function scheduleNextPlaybackStatePoll(delayMs) {
  window.clearTimeout(playbackStatePollTimeoutId);
  playbackStatePollTimeoutId = window.setTimeout(() => {
    touchLifecycleHeartbeat();
    void runPlaybackStatePollTick();
  }, delayMs);
}

async function runPlaybackStatePollTick() {
  await reportManagedPlaybackState();

  const inFastPhase = fastPlaybackPollsLeft > 0;
  if (inFastPhase) {
    fastPlaybackPollsLeft -= 1;
  }

  const delayMs = inFastPhase ? FAST_PLAYBACK_POLL_INTERVAL_MS : SLOW_PLAYBACK_POLL_INTERVAL_MS;
  scheduleNextPlaybackStatePoll(delayMs);
}

async function reportManagedPlaybackStateForVideo(channel, video) {
  const playbackState = getPlaybackState(video);

  const dedupeKey = `${channel}:${playbackState}`;
  if (dedupeKey === lastPlaybackStateKey) {
    return;
  }

  lastPlaybackStateKey = dedupeKey;
  sendTabTelemetry("playback:state-change", {
    channel,
    state: playbackState,
    paused: video.paused,
    muted: video.muted,
    ended: video.ended,
    hidden: document.hidden
  });

  try {
    await chrome.runtime.sendMessage({
      type: "watch:playback-state",
      channel,
      state: playbackState
    });
  } catch (_error) {
    // Ignore transient extension reload gaps.
  }
}

function getChannelFromLocation(pathname) {
  const cleanPath = String(pathname || "").replace(/^\/+|\/+$/g, "");
  if (!cleanPath || cleanPath.includes("/")) {
    return null;
  }

  const reserved = new Set([
    "directory",
    "downloads",
    "jobs",
    "login",
    "messages",
    "settings",
    "subscriptions"
  ]);

  const normalized = cleanPath.toLowerCase();
  return reserved.has(normalized) ? null : normalized;
}

function getVisibleStreamUptimeSeconds() {
  let bestMatch = null;

  for (const selector of UPTIME_SELECTOR_CANDIDATES) {
    const uptimeTexts = readCandidateTexts(selector);

    for (const uptimeText of uptimeTexts) {
      const uptimeSeconds = parseUptimeText(uptimeText);
      if (uptimeSeconds !== null && (bestMatch === null || uptimeSeconds > bestMatch)) {
        bestMatch = uptimeSeconds;
      }
    }
  }

  const pageText = String(document.body?.innerText || "").trim();
  const labeledMatch = parseLabeledUptimeText(pageText);
  if (labeledMatch !== null) {
    return labeledMatch;
  }

  const pageWideMatch = parseLargestUptimeText(pageText);
  if (pageWideMatch !== null && (bestMatch === null || pageWideMatch > bestMatch)) {
    bestMatch = pageWideMatch;
  }

  return bestMatch;
}

function findClaimButton() {
  const summary = findCommunityPointsSummaryRoot();
  if (!summary) {
    return null;
  }

  const buttons = summary.querySelectorAll("button");

  for (const button of buttons) {
    if (!(button instanceof HTMLButtonElement)) {
      continue;
    }

    if (button.querySelector("[class*='claimable-bonus']")) {
      return button;
    }
  }

  return null;
}

function findCommunityPointsSummaryRoot() {
  const summary = document.querySelector("[data-test-selector='community-points-summary']");
  return summary instanceof HTMLElement ? summary : null;
}

function findCommunityPointsSummaryToggleButton(summary) {
  const roots = [];
  if (summary instanceof HTMLElement) {
    roots.push(summary);
  }
  roots.push(document);

  for (const root of roots) {
    const byCopoBalance = root.querySelector("[data-test-selector='copo-balance-string']");
    const copoButton = byCopoBalance?.closest("button");
    if (copoButton instanceof HTMLButtonElement) {
      return copoButton;
    }

    const byBitsBalance = root.querySelector("[data-test-selector='bits-balance-string']");
    const bitsButton = byBitsBalance?.closest("button");
    if (bitsButton instanceof HTMLButtonElement) {
      return bitsButton;
    }

    const pointsAriaButtons = [...root.querySelectorAll("button")]
      .filter((button) => button instanceof HTMLButtonElement)
      .filter((button) => /points/i.test(String(button.getAttribute("aria-label") || "")));

    const enabledPointsButton = pointsAriaButtons.find((button) => !button.disabled);
    if (enabledPointsButton) {
      return enabledPointsButton;
    }

    if (pointsAriaButtons.length > 0) {
      return pointsAriaButtons[0];
    }
  }

  return null;
}

function getSummaryToggleDiagnostics() {
  const summaries = document.querySelectorAll("[data-test-selector='community-points-summary']");
  const copo = document.querySelectorAll("[data-test-selector='copo-balance-string']");
  const bits = document.querySelectorAll("[data-test-selector='bits-balance-string']");
  const pointsButtons = [...document.querySelectorAll("button")]
    .filter((button) => button instanceof HTMLButtonElement)
    .filter((button) => /points/i.test(String(button.getAttribute("aria-label") || "")));

  return {
    summaryCount: summaries.length,
    copoCount: copo.length,
    bitsCount: bits.length,
    pointsButtonsCount: pointsButtons.length
  };
}

function findRewardCenterDialog() {
  const primary = document.querySelector(
    "[role='dialog'][aria-labelledby='channel-points-reward-center-header']"
  );
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

async function closeRewardCenterDialog(summaryToggleButton) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const dialog = findRewardCenterDialog();
    if (!dialog) {
      return true;
    }

    if (
      summaryToggleButton instanceof HTMLButtonElement
      && summaryToggleButton.isConnected
      && !summaryToggleButton.disabled
    ) {
      summaryToggleButton.click();
      await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
      if (!findRewardCenterDialog()) {
        return true;
      }
    }

    const closeButton = findRewardCenterCloseButton(dialog);
    if (closeButton) {
      closeButton.click();
      await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
      if (!findRewardCenterDialog()) {
        return true;
      }
    }

    dispatchEscapeKey();
    await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
    if (!findRewardCenterDialog()) {
      return true;
    }
  }

  return !findRewardCenterDialog();
}

function findRewardCenterCloseButton(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return null;
  }

  const candidates = [...dialog.querySelectorAll("button")]
    .filter((button) => button instanceof HTMLButtonElement);
  for (const button of candidates) {
    const ariaLabel = String(button.getAttribute("aria-label") || "").toLowerCase();
    const dataTarget = String(button.getAttribute("data-a-target") || "").toLowerCase();
    if (
      ariaLabel.includes("close")
      || ariaLabel.includes("schlie")
      || dataTarget.includes("close")
    ) {
      return button;
    }
  }

  return null;
}

function dispatchEscapeKey() {
  const target = findPlaybackShortcutTarget() || document.body;
  if (!target) {
    return;
  }

  const keyboardEventInit = {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true
  };
  target.dispatchEvent(new KeyboardEvent("keydown", keyboardEventInit));
  target.dispatchEvent(new KeyboardEvent("keyup", keyboardEventInit));
}

function findWatchStreakCard(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return null;
  }

  const iconAnchors = findWatchStreakIconAnchors(dialog);
  for (const iconAnchor of iconAnchors) {
    const card = findClosestWatchStreakCard(iconAnchor, true);
    if (card) {
      return card;
    }
  }

  const progressBars = dialog.querySelectorAll("[role='progressbar'][aria-valuemin][aria-valuemax]");
  for (const progressBar of progressBars) {
    const card = findClosestWatchStreakCard(progressBar, false);
    if (card) {
      return card;
    }
  }

  return null;
}

function findWatchStreakIconAnchors(root) {
  const normalizedFragment = normalizePathData(WATCH_STREAK_ICON_PATH_FRAGMENT);
  const anchors = [];
  const paths = root.querySelectorAll("svg path[d]");

  for (const path of paths) {
    if (!(path instanceof SVGPathElement)) {
      continue;
    }

    const pathData = normalizePathData(path.getAttribute("d"));
    if (pathData && pathData.includes(normalizedFragment)) {
      anchors.push(path);
    }
  }

  return anchors;
}

function findClosestWatchStreakCard(anchor, requireIconAnchor) {
  let current = anchor instanceof Element ? anchor.parentElement : null;

  while (current && current !== document.body) {
    const hasProgressBar = Boolean(
      current.querySelector("[role='progressbar'][aria-valuemin][aria-valuemax]")
    );
    const hasChevronButton = hasWatchStreakChevronButton(current);
    const hasIconAnchor = !requireIconAnchor || findWatchStreakIconAnchors(current).length > 0;

    if (hasProgressBar && hasChevronButton && hasIconAnchor) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function hasWatchStreakChevronButton(root) {
  const normalizedFragment = normalizePathData(WATCH_STREAK_CHEVRON_PATH_FRAGMENT);
  const buttons = root.querySelectorAll("button");

  for (const button of buttons) {
    if (!(button instanceof HTMLButtonElement)) {
      continue;
    }

    const paths = button.querySelectorAll("svg path[d]");
    for (const path of paths) {
      if (!(path instanceof SVGPathElement)) {
        continue;
      }

      const pathData = normalizePathData(path.getAttribute("d"));
      if (pathData && pathData.includes(normalizedFragment)) {
        return true;
      }
    }
  }

  return false;
}

function extractWatchStreakValueFromCard(card) {
  if (!(card instanceof HTMLElement)) {
    return null;
  }

  const progressBar = card.querySelector("[role='progressbar'][aria-valuemin][aria-valuemax]");
  const iconAnchors = findWatchStreakIconAnchors(card);
  for (const iconAnchor of iconAnchors) {
    const nearbyValue = extractWatchStreakValueNearIcon(iconAnchor, card);
    if (nearbyValue !== null) {
      return nearbyValue;
    }
  }

  const headerRegion = progressBar instanceof Element
    ? progressBar.closest("div")?.previousElementSibling
    : null;
  if (headerRegion instanceof HTMLElement) {
    const headerValue = extractBestStreakInteger(headerRegion.textContent);
    if (headerValue !== null) {
      return headerValue;
    }
  }

  return null;
}

function extractWatchStreakValueNearIcon(iconAnchor, card) {
  let cursor = iconAnchor instanceof Element ? iconAnchor.parentElement : null;
  let depth = 0;

  while (cursor && cursor !== card && depth < 6) {
    const candidateValue = extractBestStreakInteger(cursor.textContent);
    if (candidateValue !== null) {
      return candidateValue;
    }

    cursor = cursor.parentElement;
    depth += 1;
  }

  return null;
}

function extractBestStreakInteger(text) {
  const source = String(text || "");
  const matches = source.match(/\d{1,4}/g);
  if (!matches) {
    return null;
  }

  const values = matches
    .map((token) => Number.parseInt(token, 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 366);
  if (values.length === 0) {
    return null;
  }

  for (const value of values) {
    if (value > 0) {
      return value;
    }
  }

  return 0;
}

function normalizePathData(pathData) {
  return String(pathData || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findPlayerVideo() {
  const video = document.querySelector("video");
  return video instanceof HTMLVideoElement ? video : null;
}

function needsPlaybackResume(video) {
  return video.paused && !video.ended;
}

function shouldAttemptPlaybackResume(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return false;
  }

  if (!needsPlaybackResume(video)) {
    return false;
  }

  if (document.hidden || document.visibilityState !== "visible") {
    return false;
  }

  if (playResumeAttemptedForCurrentPause) {
    return false;
  }

  if (playResumeBlockedByPolicy) {
    return false;
  }

  return true;
}

function getPlaybackState(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return "ok";
  }

  if (needsPlaybackResume(video)) {
    if (document.hidden || document.visibilityState !== "visible") {
      return "ok";
    }
    return "paused";
  }

  if (video.muted) {
    return "muted";
  }

  return "ok";
}

function attemptUnmuteWithShortcut() {
  const target = findPlaybackShortcutTarget();
  if (!target) {
    return false;
  }

  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
  }

  const shortcutEventInit = {
    key: "m",
    code: "KeyM",
    keyCode: 77,
    which: 77,
    bubbles: true,
    cancelable: true
  };

  const keyDown = new KeyboardEvent("keydown", shortcutEventInit);
  const keyPress = new KeyboardEvent("keypress", shortcutEventInit);
  const keyUp = new KeyboardEvent("keyup", shortcutEventInit);

  target.dispatchEvent(keyDown);
  target.dispatchEvent(keyPress);
  target.dispatchEvent(keyUp);
  return true;
}

async function ensureVideoUnmutedWithShortcut(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return false;
  }

  if (!video.muted) {
    return true;
  }

  const firstAttemptTriggered = attemptUnmuteWithShortcut();
  if (!firstAttemptTriggered) {
    return false;
  }

  await wait(UNMUTE_SHORTCUT_SETTLE_MS);
  if (!video.muted) {
    return true;
  }

  const secondAttemptTriggered = attemptUnmuteWithShortcut();
  if (!secondAttemptTriggered) {
    return false;
  }

  await wait(UNMUTE_SHORTCUT_SETTLE_MS);
  return !video.muted;
}

function findPlaybackShortcutTarget() {
  const candidates = [
    document.querySelector("[data-a-target='player-overlay-click-handler']"),
    document.querySelector("[data-a-target='video-player']"),
    document.querySelector("main"),
    document.body
  ];

  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement || candidate instanceof Document) {
      return candidate;
    }
  }

  return null;
}

async function reportClaimAvailability(channel, available) {
  const dedupeKey = `${channel}:${available ? 1 : 0}`;
  if (dedupeKey === lastClaimAvailabilityKey) {
    return;
  }

  lastClaimAvailabilityKey = dedupeKey;

  try {
    await chrome.runtime.sendMessage({
      type: "claim:status",
      channel,
      available
    });
  } catch (_error) {
    // Ignore transient extension reload gaps.
  }
}

function wait(ms) {
  const timeout = Math.max(0, Math.floor(Number(ms) || 0));
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeout);
  });
}

function isStartupDelayActive() {
  return channelAutomationReadyAt > 0 && Date.now() < channelAutomationReadyAt;
}

function scheduleInitialChannelAutomation(channel) {
  const delayMs = Math.max(0, channelAutomationReadyAt - Date.now());
  window.clearTimeout(startupSequenceTimeoutId);
  startupSequenceTimeoutId = window.setTimeout(() => {
    startupSequenceTimeoutId = 0;
    if (channel !== getChannelFromLocation(window.location.pathname)) {
      return;
    }
    void runInitialChannelAutomation();
  }, delayMs);
}

async function runInitialChannelAutomation() {
  sendTabTelemetry("startup:automation-triggered", {});
  try {
    await reportWatchStreak();
  } catch (error) {
    logTabError("initial streak probe failed", error);
    const channel = getChannelFromLocation(window.location.pathname);
    if (channel) {
      await sendStreakProbeLog(channel, "initial-streak-probe-failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  void ensureManagedPlaybackState();
  void tryAutoClaimBonus();
  void reportWatchUptime();
}

async function waitForResult(readValue, timeoutMs) {
  const timeout = Math.max(0, Math.floor(Number(timeoutMs) || 0));
  const readCurrentValue = () => {
    try {
      return readValue();
    } catch (_error) {
      return null;
    }
  };

  const immediate = readCurrentValue();
  if (immediate) {
    return immediate;
  }

  if (
    timeout <= 0 ||
    typeof MutationObserver === "undefined" ||
    !(document.documentElement instanceof Element)
  ) {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    let observer = null;

    const finalize = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (observer) {
        observer.disconnect();
      }
      window.clearTimeout(timeoutId);
      window.clearInterval(pollIntervalId);
      resolve(value);
    };

    const tryResolve = () => {
      const candidate = readCurrentValue();
      if (candidate) {
        finalize(candidate);
      }
    };

    const timeoutId = window.setTimeout(() => {
      finalize(null);
    }, timeout);

    const pollIntervalId = window.setInterval(() => {
      tryResolve();
    }, WATCH_STREAK_WAIT_POLL_MS);

    try {
      observer = new MutationObserver(() => {
        tryResolve();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (_error) {
      // Polling fallback stays active when observer setup fails.
    }
  });
}

function setupResumeRecoveryWatchers() {
  window.addEventListener("visibilitychange", onResumeSignal, { passive: true });
  window.addEventListener("pageshow", onResumeSignal, { passive: true });
  window.addEventListener("focus", onResumeSignal, { passive: true });
  window.addEventListener("pointerdown", onUserInteractionSignal, { passive: true });
  window.addEventListener("keydown", onUserInteractionSignal);
}

function onResumeSignal() {
  const now = Date.now();
  const resumeGapMs = now - lastLifecycleHeartbeatAt;
  touchLifecycleHeartbeat();

  if (document.hidden || document.visibilityState !== "visible") {
    return;
  }

  if (resumeGapMs >= RESUME_GAP_THRESHOLD_MS && shouldReloadForNetworkError2000()) {
    sendTabTelemetry("resume:reload-network-error-2000", {
      resumeGapMs
    });
    window.location.reload();
    return;
  }

  void syncButton();
  void reportWatchUptime();
  void tryAutoClaimBonus();
  void ensureManagedPlaybackState();
}

function onUserInteractionSignal() {
  if (!playResumeBlockedByPolicy && !playResumeAttemptedForCurrentPause) {
    return;
  }

  playResumeBlockedByPolicy = false;
  playResumeAttemptedForCurrentPause = false;
  void ensureManagedPlaybackState();
}

function touchLifecycleHeartbeat() {
  lastLifecycleHeartbeatAt = Date.now();
}

function shouldReloadForNetworkError2000() {
  if (!hasPlayerNetworkError2000()) {
    return false;
  }

  const now = Date.now();
  const previousReloadAt = readLastNetworkErrorReloadAt();
  if (previousReloadAt > 0 && now - previousReloadAt < NETWORK_ERROR_RELOAD_COOLDOWN_MS) {
    return false;
  }

  writeLastNetworkErrorReloadAt(now);
  return true;
}

function hasPlayerNetworkError2000() {
  const textCandidates = [
    document.querySelector("[data-a-target='video-player']")?.textContent || "",
    document.querySelector("[data-a-target='player-overlay-click-handler']")?.textContent || "",
    document.querySelector("[role='alert']")?.textContent || "",
    document.body?.innerText || ""
  ];

  for (const textValue of textCandidates) {
    const text = String(textValue || "");
    if (!text) {
      continue;
    }

    if (/\(\s*[^\)]*#?\s*2000\s*\)/i.test(text) || /#\s*2000\b/i.test(text)) {
      return true;
    }
  }

  return false;
}

function readLastNetworkErrorReloadAt() {
  try {
    const value = Math.round(Number(window.sessionStorage.getItem(NETWORK_ERROR_RELOAD_AT_KEY)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (_error) {
    return 0;
  }
}

function writeLastNetworkErrorReloadAt(timestamp) {
  try {
    window.sessionStorage.setItem(
      NETWORK_ERROR_RELOAD_AT_KEY,
      String(Math.max(0, Math.round(Number(timestamp) || 0)))
    );
  } catch (_error) {
    // Ignore storage restrictions.
  }
}

function readCandidateTexts(selector) {
  const nodes = document.querySelectorAll(selector);
  const values = [];

  for (const node of nodes) {
    const text = String(node?.textContent || "").trim();
    if (text) {
      values.push(text);
    }
  }

  return values;
}

function parseUptimeText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (!match) {
    return null;
  }

  return parseDurationToken(match[1]);
}

function parseLabeledUptimeText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(
    /\b(\d{1,2}:\d{2}(?::\d{2})?)\b(?=[^\n]{0,80}\bsince\s+live\b)/i
  );
  if (!match) {
    return null;
  }

  return parseDurationToken(match[1]);
}

function parseLargestUptimeText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const matches = [...text.matchAll(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g)];
  let bestMatch = null;

  for (const match of matches) {
    const uptimeSeconds = parseDurationToken(match[1]);
    if (uptimeSeconds !== null && (bestMatch === null || uptimeSeconds > bestMatch)) {
      bestMatch = uptimeSeconds;
    }
  }

  return bestMatch;
}

function parseDurationToken(value) {
  const parts = String(value || "").split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part))) {
    return null;
  }

  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  return null;
}

function logTabError(context, error) {
  sendTabTelemetry("tab:error", {
    context,
    name: String(error?.name || ""),
    message: error instanceof Error ? error.message : String(error)
  });

  console.error(
    TAB_LOG_PREFIX,
    context,
    error instanceof Error ? error.message : String(error),
    error
  );
}

function isAutoplayInteractionError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  if (name === "NotAllowedError") {
    return true;
  }

  return /user (didn'?t|did not) interact/i.test(message);
}

async function sendPlaybackCorrected(channel) {
  sendTabTelemetry("playback:corrected", {
    channel
  });

  try {
    await chrome.runtime.sendMessage({
      type: "watch:playback-corrected",
      channel
    });
  } catch (error) {
    logTabError("watch:playback-corrected message failed", error);
  }
}

function sendTabTelemetry(event, details = {}) {
  const normalizedEvent = String(event || "").toLowerCase();
  if (!normalizedEvent) {
    return;
  }

  const baseDetails = details && typeof details === "object" ? details : {};
  void chrome.runtime.sendMessage({
    type: "telemetry:tab-event",
    event: normalizedEvent,
    details: {
      ...baseDetails,
      path: window.location.pathname,
      visibilityState: document.visibilityState
    }
  }).catch(() => {
    // Ignore transient extension reload gaps.
  });
}

async function sendStreakProbeLog(channel, reason, details = {}) {
  const normalizedChannel = String(channel || "").toLowerCase();
  const normalizedReason = String(reason || "").toLowerCase();
  if (!normalizedChannel || !normalizedReason) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: "streak:probe-log",
      channel: normalizedChannel,
      reason: normalizedReason,
      details
    });
  } catch (_error) {
    // Ignore transient extension reload gaps.
  }
}
