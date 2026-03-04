import { getChannelsLiveStatus } from "./lib/liveStatus.js";

const channelList = document.getElementById("channel-list");
const emptyState = document.getElementById("empty-state");
const watchToggle = document.getElementById("watch-toggle");
const debugOutput = document.getElementById("debug-output");

let latestSnapshot = null;

void init();

async function init() {
  bindEvents();
  window.setInterval(() => {
    renderCurrent();
  }, 1000);
  await refresh();
}

function bindEvents() {
  watchToggle.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({
      type: watchToggle.checked ? "watch:start" : "watch:stop"
    });
    await refresh();
  });
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "debug:get" });
  if (!response?.ok) {
    return;
  }

  const liveStatusByChannel = await getChannelsLiveStatus(
    response.settings.importantChannels.map((entry) => entry.name)
  );

  latestSnapshot = {
    settings: response.settings,
    runtimeState: response.runtimeState,
    debugLog: response.debugLog,
    liveStatusByChannel
  };

  renderCurrent();
}

function renderCurrent() {
  if (!latestSnapshot) {
    return;
  }

  render(
    latestSnapshot.settings,
    latestSnapshot.runtimeState,
    latestSnapshot.debugLog,
    latestSnapshot.liveStatusByChannel
  );
}

function render(settings, runtimeState, debugLog, liveStatusByChannel) {
  watchToggle.checked = settings.autoManage;

  channelList.textContent = "";
  const hasChannels = settings.importantChannels.length > 0;
  emptyState.hidden = hasChannels;

  settings.importantChannels.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "channel-item";

    const label = document.createElement("div");
    label.className = "channel-label";

    const status = document.createElement("span");
    status.className = "channel-status";
    status.textContent = getChannelIndicator(liveStatusByChannel[entry.name]);

    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${entry.name}`;

    label.appendChild(status);
    label.appendChild(name);

    const watchtime = formatWatchtime(runtimeState.watchSessionsByChannel?.[entry.name]);
    if (watchtime) {
      const watchtimeLabel = document.createElement("span");
      watchtimeLabel.className = "channel-watchtime";
      watchtimeLabel.textContent = watchtime;
      label.appendChild(watchtimeLabel);
    }

    const controls = document.createElement("div");
    controls.className = "channel-controls";

    const upButton = createMoveButton("↑", index > 0, index, index - 1, settings);
    const downButton = createMoveButton(
      "↓",
      index < settings.importantChannels.length - 1,
      index,
      index + 1,
      settings
    );

    controls.appendChild(upButton);
    controls.appendChild(downButton);
    item.appendChild(label);
    item.appendChild(controls);
    channelList.appendChild(item);
  });

  renderDebug(runtimeState, debugLog);
}

function getChannelIndicator(status) {
  switch (status) {
    case "live":
      return "🔴";
    case "offline":
      return "⚪️";
    default:
      return "❔";
  }
}

function createMoveButton(text, enabled, fromIndex, toIndex, settings) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "move-button";
  button.textContent = text;
  button.disabled = !enabled;

  if (enabled) {
    button.addEventListener("click", async () => {
      const nextChannels = [...settings.importantChannels];
      const [moved] = nextChannels.splice(fromIndex, 1);
      nextChannels.splice(toIndex, 0, moved);

      await chrome.runtime.sendMessage({
        type: "settings:update",
        settings: {
          importantChannels: nextChannels
        }
      });
      await refresh();
    });
  }

  return button;
}

function formatWatchtime(session) {
  const startedAt = Number(session?.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return "";
  }

  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}

function renderDebug(runtimeState, debugLog) {
  const payload = {
    runtimeState,
    debugLog
  };
  debugOutput.textContent = JSON.stringify(payload, null, 2);
}
