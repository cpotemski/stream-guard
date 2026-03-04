const BUTTON_ID = "tw-watch-guard-star";
const TOAST_ID = "tw-watch-guard-toast";
const UPTIME_SELECTOR_CANDIDATES = [
  ".live-time p",
  ".live-time [aria-hidden='true']",
  "[data-a-target='stream-time']",
  "[data-test-selector='stream-time-value']",
  ".live-time"
];
const CLAIM_BUTTON_SELECTOR_CANDIDATES = [
  "[data-test-selector='community-points-summary'] [class*='claimable-bonus'] button",
  "[data-test-selector='community-points-summary'] button",
  "button[data-test-selector='community-points-summary']"
];
const AUTO_CLAIM_MARKER = "twWatchGuardClaimHandled";

let lastChannel = null;
let lastReportedUptimeKey = null;
let lastClaimAvailabilityKey = null;

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
}

async function syncButton() {
  const channel = getChannelFromLocation(window.location.pathname);
  if (channel === lastChannel) {
    placeButton();
    void reportWatchUptime();
    void tryAutoClaimBonus();
    return;
  }

  lastChannel = channel;
  lastReportedUptimeKey = null;
  lastClaimAvailabilityKey = null;

  if (!channel) {
    removeButton();
    return;
  }

  await injectButton(channel);
  void reportWatchUptime();
  void tryAutoClaimBonus();
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

function getChannelFromLocation(pathname) {
  const cleanPath = String(pathname || "").replace(/^\/+/, "");
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
  for (const selector of CLAIM_BUTTON_SELECTOR_CANDIDATES) {
    const button = document.querySelector(selector);
    if (button instanceof HTMLButtonElement) {
      return button;
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
