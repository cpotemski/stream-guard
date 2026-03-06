import { getChannelsLiveStatus } from "./lib/liveStatus.js";

const channelList = document.getElementById("channel-list");
const emptyState = document.getElementById("empty-state");
const watchToggle = document.getElementById("watch-toggle");
const diagnosticsPanel = document.getElementById("diagnostics-panel");
const diagnosticsToggle = document.getElementById("diagnostics-toggle");
const telemetryStatus = document.getElementById("telemetry-status");
const telemetryExportButton = document.getElementById("telemetry-export");
const telemetryClearButton = document.getElementById("telemetry-clear");
const QUICK_POLL_INTERVAL_MS = 5000;
const QUICK_POLL_WINDOW_MS = 30000;
const SLOW_POLL_INTERVAL_MS = 60000;
const RENDER_INTERVAL_MS = 1000;
const RUNTIME_STATE_KEYS = [
  "managedTabsByChannel",
  "detachedUntilByChannel",
  "watchSessionsByChannel",
  "broadcastSessionsByChannel",
  "lastBroadcastStatsByChannel",
  "claimStatsByChannel",
  "claimAvailabilityByChannel",
  "playbackStateByChannel",
  "watchStreakByChannel"
];
const SETTINGS_KEYS = [
  "autoManage",
  "maxStreams",
  "importantChannels"
];

let latestSnapshot = null;
let refreshIntervalId = 0;
let refreshWindowUntil = 0;
let isRefreshing = false;
let settingsUpdateInFlight = false;
let watchToggleUpdateInFlight = false;
let telemetryExportInFlight = false;
let telemetryClearInFlight = false;
let diagnosticsVisible = false;

void init();

async function init() {
  bindEvents();
  setDiagnosticsVisible(false);
  renderTelemetryStatus(null);
  window.setInterval(() => {
    renderCurrent();
  }, RENDER_INTERVAL_MS);
  startRefreshWindow();
}

function startRefreshWindow() {
  refreshWindowUntil = Date.now() + QUICK_POLL_WINDOW_MS;
  scheduleNextRefresh(0);
}

function bindEvents() {
  watchToggle.addEventListener("change", async () => {
    if (watchToggleUpdateInFlight) {
      watchToggle.checked = Boolean(latestSnapshot?.settings?.autoManage);
      return;
    }

    await updateAutoManage(watchToggle.checked);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    applyStorageChanges(changes, areaName);
  });

  telemetryExportButton?.addEventListener("click", () => {
    void exportTelemetry();
  });
  telemetryClearButton?.addEventListener("click", () => {
    void clearTelemetry();
  });
  diagnosticsToggle?.addEventListener("click", () => {
    setDiagnosticsVisible(!diagnosticsVisible);
  });
}

function setDiagnosticsVisible(visible) {
  diagnosticsVisible = Boolean(visible);
  if (diagnosticsPanel) {
    diagnosticsPanel.hidden = !diagnosticsVisible;
  }
  if (diagnosticsToggle) {
    diagnosticsToggle.setAttribute("aria-pressed", diagnosticsVisible ? "true" : "false");
  }
}

async function refresh() {
  if (isRefreshing) {
    return;
  }

  isRefreshing = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "status:get" });
    if (!response?.ok) {
      return;
    }

    const liveStatusByChannel = await getChannelsLiveStatus(
      response.settings.importantChannels.map((entry) => entry.name)
    );

    latestSnapshot = {
      settings: response.settings,
      runtimeState: response.runtimeState,
      liveStatusByChannel,
      telemetry: response.telemetry || null
    };

    renderCurrent();
  } finally {
    isRefreshing = false;
  }
}

function scheduleNextRefresh(delayMs = QUICK_POLL_INTERVAL_MS) {
  window.clearTimeout(refreshIntervalId);
  refreshIntervalId = window.setTimeout(() => {
    void refresh();

    const now = Date.now();
    const interval = now < refreshWindowUntil ? QUICK_POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
    scheduleNextRefresh(interval);
  }, delayMs);
}

function renderCurrent() {
  if (!latestSnapshot) {
    return;
  }

  render(
    latestSnapshot.settings,
    latestSnapshot.runtimeState,
    latestSnapshot.liveStatusByChannel
  );
}

function applyStorageChanges(changes, areaName) {
  if (!latestSnapshot || !changes || typeof changes !== "object") {
    return;
  }

  let snapshotChanged = false;

  if (areaName === "local") {
    const nextRuntimeState = { ...latestSnapshot.runtimeState };
    let runtimeChanged = false;

    for (const key of RUNTIME_STATE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) {
        continue;
      }

      nextRuntimeState[key] = changes[key]?.newValue;
      runtimeChanged = true;
    }

    if (runtimeChanged) {
      latestSnapshot = {
        ...latestSnapshot,
        runtimeState: nextRuntimeState
      };
      snapshotChanged = true;
    }
  }

  if (areaName === "sync") {
    const nextSettings = { ...latestSnapshot.settings };
    let settingsChanged = false;

    for (const key of SETTINGS_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) {
        continue;
      }

      nextSettings[key] = changes[key]?.newValue;
      settingsChanged = true;
    }

    if (settingsChanged) {
      latestSnapshot = {
        ...latestSnapshot,
        settings: nextSettings
      };
      snapshotChanged = true;
    }
  }

  if (snapshotChanged) {
    renderCurrent();
  }
}

function render(settings, runtimeState, liveStatusByChannel) {
  watchToggle.checked = settings.autoManage;
  watchToggle.disabled = watchToggleUpdateInFlight;

  channelList.textContent = "";
  const hasChannels = settings.importantChannels.length > 0;
  emptyState.hidden = hasChannels;

  settings.importantChannels.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "channel-item";

    const label = document.createElement("div");
    label.className = "channel-label";
    const details = document.createElement("div");
    details.className = "channel-details";
    const streamStatus = liveStatusByChannel[entry.name];
    const isLive = streamStatus === "live";
    const hasRuntimeActiveSession = hasActiveRuntimeSession(entry.name, runtimeState);
    const channelBroadcastStats = getChannelBroadcastStats(entry.name, runtimeState);
    const showStats = isLive || hasRuntimeActiveSession || Boolean(channelBroadcastStats);

    const status = document.createElement("span");
    status.className = "channel-status";
    status.textContent = getChannelIndicator(
      streamStatus,
      runtimeState.playbackStateByChannel?.[entry.name]
    );

    const name = document.createElement("span");
    name.className = "channel-name";
    name.textContent = `${index + 1}. ${entry.name}`;

    label.appendChild(status);
    details.appendChild(name);

    if (showStats) {
      const stats = document.createElement("div");
      stats.className = "channel-stats";
      const claimStats = getClaimStatsForDisplay(entry.name, runtimeState, channelBroadcastStats);
      const claimCount = getClaimCount(claimStats);
      if (claimCount !== null) {
        const claimCountLabel = document.createElement("span");
        claimCountLabel.className = "channel-claims";
        claimCountLabel.textContent = `🎁 ${claimCount}`;
        stats.appendChild(claimCountLabel);

        if (isLive) {
          const claimMinutesLabel = document.createElement("span");
          claimMinutesLabel.className = "channel-claim-minutes";
          claimMinutesLabel.textContent = `(${formatLastClaimDuration(claimStats)})`;
          stats.appendChild(claimMinutesLabel);
        }
      }

      const streakLabelText = getWatchStreakLabel(
        getWatchStreakForDisplay(entry.name, runtimeState, channelBroadcastStats),
        channelBroadcastStats
      );
      if (streakLabelText !== null) {
        const streakLabel = document.createElement("span");
        streakLabel.className = "channel-streak";
        streakLabel.textContent = streakLabelText;
        stats.appendChild(streakLabel);
      }

      if (isClaimAvailable(runtimeState.claimAvailabilityByChannel?.[entry.name])) {
        const claimReadyLabel = document.createElement("span");
        claimReadyLabel.className = "channel-claim-ready";
        claimReadyLabel.textContent = "🔔";
        stats.appendChild(claimReadyLabel);
      }

      details.appendChild(stats);
    }
    label.appendChild(details);

    const controls = document.createElement("div");
    controls.className = "channel-controls";

    const controlsEnabled = !settingsUpdateInFlight;
    const upButton = createMoveButton(
      "↑",
      controlsEnabled && index > 0,
      index,
      index - 1,
      settings
    );
    const downButton = createMoveButton(
      "↓",
      controlsEnabled && index < settings.importantChannels.length - 1,
      index,
      index + 1,
      settings
    );
    const deleteButton = createDeleteButton(index, settings, controlsEnabled);

    controls.appendChild(upButton);
    controls.appendChild(downButton);
    controls.appendChild(deleteButton);
    item.appendChild(label);
    item.appendChild(controls);
    channelList.appendChild(item);
  });

  renderTelemetryStatus(latestSnapshot?.telemetry || null);
}

function getChannelIndicator(status, playbackState) {
  const state = getPlaybackState(playbackState);

  if (status === "offline") {
    return "⚪";
  }

  if (status === "unknown") {
    if (state === "paused") {
      return "⏸︎";
    }

    if (state === "muted") {
      return "🔇";
    }

    return "🟠";
  }

  if (state === "paused") {
    return "⏸︎";
  }

  if (state === "muted") {
    return "🔇";
  }

  switch (status) {
    case "live":
      return "🔴";
    default:
      return "🔴";
  }
}

function getPlaybackState(playbackState) {
  if (typeof playbackState === "string") {
    return playbackState;
  }

  if (playbackState && typeof playbackState === "object") {
    return String(playbackState.state || "").toLowerCase();
  }

  return "";
}

function createMoveButton(text, enabled, fromIndex, toIndex, settings) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-button";
  button.textContent = text;
  button.disabled = !enabled;

  if (enabled) {
    button.addEventListener("click", async () => {
      const nextChannels = [...settings.importantChannels];
      const [moved] = nextChannels.splice(fromIndex, 1);
      nextChannels.splice(toIndex, 0, moved);
      await updateImportantChannels(nextChannels);
    });
  }

  return button;
}

function createDeleteButton(index, settings, enabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-button delete-button";
  button.textContent = "🗑";
  button.setAttribute("aria-label", "Channel löschen");
  button.title = "Channel löschen";
  button.disabled = !enabled;

  if (enabled) {
    button.addEventListener("click", async () => {
      const nextChannels = settings.importantChannels.filter((_, itemIndex) => itemIndex !== index);
      await updateImportantChannels(nextChannels);
    });
  }

  return button;
}

async function updateImportantChannels(channels) {
  if (settingsUpdateInFlight) {
    return;
  }

  const nextChannels = normalizeChannels(channels);
  const previousChannels = latestSnapshot?.settings?.importantChannels || [];
  settingsUpdateInFlight = true;

  if (latestSnapshot) {
    latestSnapshot = {
      ...latestSnapshot,
      settings: {
        ...latestSnapshot.settings,
        importantChannels: nextChannels
      }
    };
    renderCurrent();
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "settings:update",
      settings: {
        importantChannels: nextChannels
      }
    });

    if (!response?.ok) {
      throw new Error("settings:update failed");
    }

    if (latestSnapshot) {
      latestSnapshot = {
        ...latestSnapshot,
        settings: response.settings
      };
    }

    startRefreshWindow();
    void refresh();
  } catch (_error) {
    if (latestSnapshot) {
      latestSnapshot = {
        ...latestSnapshot,
        settings: {
          ...latestSnapshot.settings,
          importantChannels: previousChannels
        }
      };
    }
  } finally {
    settingsUpdateInFlight = false;
    renderCurrent();
  }
}

async function updateAutoManage(enabled) {
  const previousAutoManage = Boolean(latestSnapshot?.settings?.autoManage);
  watchToggleUpdateInFlight = true;

  if (latestSnapshot) {
    latestSnapshot = {
      ...latestSnapshot,
      settings: {
        ...latestSnapshot.settings,
        autoManage: enabled
      }
    };
  }
  renderCurrent();

  try {
    const response = await chrome.runtime.sendMessage({
      type: enabled ? "watch:start" : "watch:stop"
    });

    if (!response?.ok) {
      throw new Error("watch toggle failed");
    }

    if (latestSnapshot) {
      latestSnapshot = {
        ...latestSnapshot,
        settings: {
          ...latestSnapshot.settings,
          autoManage: Boolean(response.settings?.autoManage)
        }
      };
    }

    startRefreshWindow();
    void refresh();
  } catch (_error) {
    if (latestSnapshot) {
      latestSnapshot = {
        ...latestSnapshot,
        settings: {
          ...latestSnapshot.settings,
          autoManage: previousAutoManage
        }
      };
    }
  } finally {
    watchToggleUpdateInFlight = false;
    renderCurrent();
  }
}

function renderTelemetryStatus(telemetry) {
  if (!telemetryStatus) {
    return;
  }

  const eventCount = Math.max(0, Math.round(Number(telemetry?.eventCount) || 0));
  const droppedCount = Math.max(0, Math.round(Number(telemetry?.droppedCount) || 0));
  const updatedAt = telemetry?.updatedAt ? new Date(telemetry.updatedAt) : null;
  const updatedAtLabel = updatedAt && Number.isFinite(updatedAt.getTime())
    ? updatedAt.toLocaleTimeString()
    : "n/a";

  telemetryStatus.textContent = (
    `Events: ${eventCount} | Verworfen: ${droppedCount} | Update: ${updatedAtLabel}`
  );
  if (telemetryExportButton) {
    telemetryExportButton.disabled = telemetryExportInFlight;
  }
  if (telemetryClearButton) {
    telemetryClearButton.disabled = telemetryClearInFlight;
  }
}

async function exportTelemetry() {
  if (telemetryExportInFlight) {
    return;
  }

  telemetryExportInFlight = true;
  renderTelemetryStatus(latestSnapshot?.telemetry || null);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "telemetry:export"
    });
    if (!response?.ok || !response.snapshot) {
      throw new Error("telemetry export failed");
    }

    const blob = new Blob([JSON.stringify(response.snapshot, null, 2)], {
      type: "application/json"
    });
    const fileName = getTelemetryFileName();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 2000);
  } finally {
    telemetryExportInFlight = false;
    renderTelemetryStatus(latestSnapshot?.telemetry || null);
  }
}

async function clearTelemetry() {
  if (telemetryClearInFlight) {
    return;
  }

  telemetryClearInFlight = true;
  renderTelemetryStatus(latestSnapshot?.telemetry || null);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "telemetry:clear"
    });
    if (!response?.ok) {
      throw new Error("telemetry clear failed");
    }

    if (latestSnapshot) {
      latestSnapshot = {
        ...latestSnapshot,
        telemetry: {
          eventCount: 0,
          droppedCount: Math.max(
            0,
            Math.round(Number(latestSnapshot.telemetry?.droppedCount) || 0)
          ),
          updatedAt: new Date().toISOString()
        }
      };
      renderCurrent();
    }

    startRefreshWindow();
    void refresh();
  } finally {
    telemetryClearInFlight = false;
    renderTelemetryStatus(latestSnapshot?.telemetry || null);
  }
}

function getTelemetryFileName() {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("-");

  return `twitch-watch-guard-diagnostics-${datePart}_${timePart}.json`;
}

function normalizeChannels(channels) {
  return (Array.isArray(channels) ? channels : [])
    .map((entry) => ({
      name: String(entry?.name || "").toLowerCase()
    }))
    .filter((entry) => entry.name)
    .map((entry, index) => ({
      name: entry.name,
      priority: index + 1
    }));
}

function formatLastClaimDuration(claimStats) {
  const lastClaimAt = Number(claimStats?.lastClaimAt);
  if (!Number.isFinite(lastClaimAt) || lastClaimAt <= 0) {
    return "0min";
  }

  const elapsedMs = Math.max(0, Date.now() - lastClaimAt);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  return `${elapsedMinutes}min`;
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
      return "🔥 ⚠️";
    }
    return reachedForCurrentStream ? "🔥 ✅" : null;
  }

  if (hasUnexpectedJump) {
    return `🔥 ${value} ⚠️`;
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
