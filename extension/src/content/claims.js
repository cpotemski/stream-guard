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

function getVisibleStreamUptimeSeconds() {
  const liveInfoRoot = document.getElementById(LIVE_CHANNEL_STREAM_INFORMATION_ID);
  if (!liveInfoRoot) {
    return null;
  }

  const uptimeNode = liveInfoRoot.querySelector(LIVE_CHANNEL_UPTIME_SELECTOR);
  if (!(uptimeNode instanceof HTMLElement)) {
    return null;
  }

  return parseUptimeText(uptimeNode.textContent || "");
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
