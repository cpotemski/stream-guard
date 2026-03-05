import { getChannelsLiveStatus } from "./lib/liveStatus.js";

const channelList = document.getElementById("channel-list");
const emptyState = document.getElementById("empty-state");
const watchToggle = document.getElementById("watch-toggle");
const QUICK_POLL_INTERVAL_MS = 5000;
const QUICK_POLL_WINDOW_MS = 30000;
const SLOW_POLL_INTERVAL_MS = 60000;
const RENDER_INTERVAL_MS = 1000;

let latestSnapshot = null;
let refreshIntervalId = 0;
let refreshWindowUntil = 0;
let isRefreshing = false;
let settingsUpdateInFlight = false;
let watchToggleUpdateInFlight = false;

void init();

async function init() {
  bindEvents();
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
      liveStatusByChannel
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

    if (isLive) {
      const stats = document.createElement("div");
      stats.className = "channel-stats";
      const claimElapsed = formatLastClaimDuration(runtimeState.claimStatsByChannel?.[entry.name]);
      const watchtimeLabel = document.createElement("span");
      watchtimeLabel.className = "channel-watchtime";
      watchtimeLabel.textContent = claimElapsed;
      stats.appendChild(watchtimeLabel);

      const claimCount = getClaimCount(runtimeState.claimStatsByChannel?.[entry.name]);
      if (claimCount !== null) {
        const claimLabel = document.createElement("span");
        claimLabel.className = "channel-claims";
        claimLabel.textContent = `🎁 ${claimCount}`;
        stats.appendChild(claimLabel);
      }

      const streakLabelText = getWatchStreakLabel(
        runtimeState.watchStreakByChannel?.[entry.name],
        runtimeState.broadcastSessionsByChannel?.[entry.name]
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
        claimReadyLabel.textContent = "🟡";
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
    return "0m";
  }

  const elapsedMs = Math.max(0, Date.now() - lastClaimAt);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}

function getClaimCount(stats) {
  const count = Number(stats?.count);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

function getWatchStreakLabel(streakState, broadcastState) {
  const value = Number(streakState?.value);
  const reachedForCurrentStream = Boolean(broadcastState?.streakIncreasedForStream);

  if (!Number.isInteger(value) || value < 0) {
    return reachedForCurrentStream ? "🔥 ✅" : null;
  }

  return reachedForCurrentStream ? `🔥 ${value} ✅` : `🔥 ${value}`;
}

function isClaimAvailable(state) {
  return Boolean(state?.available);
}
