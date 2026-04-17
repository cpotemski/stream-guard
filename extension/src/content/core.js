const {
  getClaimCount,
  getWatchStreakLabel,
  isClaimAvailable,
  getClaimStatsForDisplay,
  getWatchStreakForDisplay,
  getChannelBroadcastStats,
  hasActiveRuntimeSession
} = globalThis.StreamGuardChannelState;

const BUTTON_ID = "tw-watch-guard-star";
const INLINE_HEADER_ID = "tw-watch-guard-inline-header";
const INLINE_STATS_ID = "tw-watch-guard-inline-stats";
const INLINE_STATS_ITEMS_CLASS = "tw-watch-guard-inline-items";
const TOAST_ID = "tw-watch-guard-toast";
const LIVE_CHANNEL_STREAM_INFORMATION_ID = "live-channel-stream-information";
const LIVE_CHANNEL_UPTIME_SELECTOR = ".live-time";
const AUTO_CLAIM_MARKER = "twWatchGuardClaimHandled";
const CHANNEL_STARTUP_GRACE_MS = 10000;
const WATCH_STREAK_POLL_INTERVAL_MS = 300000;
const WATCH_STREAK_MENU_TOGGLE_DELAY_MS = 320;
const WATCH_STREAK_SUMMARY_WAIT_TIMEOUT_MS = 8000;
const WATCH_STREAK_DIALOG_WAIT_TIMEOUT_MS = 2500;
const WATCH_STREAK_CARD_WAIT_TIMEOUT_MS = 2500;
const WATCH_STREAK_WAIT_POLL_MS = 120;
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

function touchLifecycleHeartbeat() {
  lastLifecycleHeartbeatAt = Date.now();
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
