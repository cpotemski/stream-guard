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
      "watchStreakByChannel",
      "lastKnownWatchStreakByChannel"
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
  const streak = runtimeState?.watchStreakByChannel?.[channel]
    || runtimeState?.lastKnownWatchStreakByChannel?.[channel];
  const claimAvailability = runtimeState?.claimAvailabilityByChannel?.[channel];

  return JSON.stringify({
    channel,
    important: true,
    claimCount: Math.max(
      0,
      Math.floor(Number(claimStats?.count ?? broadcastStats?.claimCount) || 0)
    ),
    streakValue: globalThis.StreamGuardChannelState.normalizeDisplayableStreakValue(
      streak?.value ?? broadcastStats?.streakValue
    ),
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
