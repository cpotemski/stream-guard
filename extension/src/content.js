const BUTTON_ID = "tw-watch-guard-star";
const TOAST_ID = "tw-watch-guard-toast";
const UPTIME_SELECTOR_CANDIDATES = [
  ".live-time p",
  ".live-time [aria-hidden='true']",
  "[data-a-target='stream-time']",
  "[data-test-selector='stream-time-value']",
  ".live-time"
];
const AUTO_CLAIM_MARKER = "twWatchGuardClaimHandled";
const FAST_PLAYBACK_POLL_INTERVAL_MS = 5000;
const SLOW_PLAYBACK_POLL_INTERVAL_MS = 60000;
const FAST_PLAYBACK_REPORT_TICKS = 6;
const PLAYBACK_REPORT_DEBOUNCE_MS = 350;
const PLAYBACK_STATE_EVENTS = [
  "play",
  "pause",
  "volumechange",
  "loadedmetadata",
  "playing",
  "waiting"
];

let lastChannel = null;
let lastReportedUptimeKey = null;
let lastClaimAvailabilityKey = null;
let lastPlaybackStateKey = null;
let playbackStatePollTimeoutId = 0;
let fastPlaybackPollsLeft = 0;
let playbackStateVideo = null;
let playbackStateDebounceTimeoutId = 0;
let requestedPlaybackRefresh = 0;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "watch:request-playback-state") {
    window.clearTimeout(requestedPlaybackRefresh);
    requestedPlaybackRefresh = window.setTimeout(() => {
      requestedPlaybackRefresh = 0;
      void ensureManagedPlaybackState();
    }, 0);
  }
});

void init();

async function init() {
  await syncButton();
  window.setInterval(() => {
    void syncButton();
  }, 1000);
  window.setInterval(() => {
    void reportWatchUptime();
  }, 15000);
  window.setInterval(() => {
    void tryAutoClaimBonus();
  }, 5000);
  window.setInterval(() => {
    void ensureManagedPlaybackState();
  }, 5000);
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

  lastChannel = channel;
  lastReportedUptimeKey = null;
  lastClaimAvailabilityKey = null;
  lastPlaybackStateKey = null;

  if (!channel) {
    detachPlaybackStateWatchers();
    removeButton();
    return;
  }

  await injectButton(channel);
  startPlaybackStatePolling();
  attachPlaybackStateWatchers(findPlayerVideo());
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
      if (!activeChannel) {
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "channel:toggle",
        channel: activeChannel
      });

      if (!response?.ok) {
        showToast("Aktion fehlgeschlagen");
        return;
      }

      const isImportant = response.settings.importantChannels.some(
        (entry) => entry.name === activeChannel
      );
      renderButton(button, isImportant);
      showToast(
        isImportant
          ? "Zu wichtigen Channels hinzugefuegt"
          : "Aus wichtigen Channels entfernt"
      );
    });
  }

  placeButton(button);

  const response = await chrome.runtime.sendMessage({ type: "settings:get" });
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
    return;
  }

  if (button.parentElement !== host || button.previousElementSibling !== searchContainer) {
    searchContainer.insertAdjacentElement("afterend", button);
  }
}

function removeButton() {
  const button = document.getElementById(BUTTON_ID);
  if (button) {
    button.remove();
  }
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
    lastClaimAvailabilityKey = `${channel}:0`;
  } catch (_error) {
    delete claimButton.dataset[AUTO_CLAIM_MARKER];
  }
}

async function ensureManagedPlaybackState() {
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

  const video = findPlayerVideo();
  if (!video) {
    return;
  }

  if (needsPlaybackResume(video)) {
    try {
      await video.play();
      await chrome.runtime.sendMessage({
        type: "watch:playback-resumed",
        channel
      });
    } catch (_error) {
      // Playback resume can still be blocked by page/player state.
    }
  }

  if (!video.muted) {
    await reportManagedPlaybackStateForVideo(channel, video);
    return;
  }

  const shortcutTriggered = attemptUnmuteWithShortcut();
  if (!shortcutTriggered) {
    await reportManagedPlaybackStateForVideo(channel, video);
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: "watch:playback-corrected",
      channel
    });
  } catch (_error) {
    // Ignore transient extension reload gaps.
    await reportManagedPlaybackStateForVideo(channel, video);
    return;
  }

  await reportManagedPlaybackStateForVideo(channel, video);
}

async function reportManagedPlaybackState() {
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
  const summary = document.querySelector("[data-test-selector='community-points-summary']");
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

function findPlayerVideo() {
  const video = document.querySelector("video");
  return video instanceof HTMLVideoElement ? video : null;
}

function needsPlaybackResume(video) {
  return video.paused && !video.ended;
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
