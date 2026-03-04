const autoManageInput = document.getElementById("auto-manage");
const maxStreamsInput = document.getElementById("max-streams");
const channelList = document.getElementById("channel-list");
const emptyState = document.getElementById("empty-state");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const debugOutput = document.getElementById("debug-output");

void init();

async function init() {
  bindEvents();
  await refresh();
}

function bindEvents() {
  autoManageInput.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({
      type: "settings:update",
      settings: {
        autoManage: autoManageInput.checked
      }
    });
    await refresh();
  });

  maxStreamsInput.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({
      type: "settings:update",
      settings: {
        maxStreams: Number(maxStreamsInput.value)
      }
    });
    await refresh();
  });

  startButton.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "watch:start" });
    await refresh();
  });

  stopButton.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "watch:stop" });
    await refresh();
  });
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "debug:get" });
  if (!response?.ok) {
    return;
  }

  render(response.settings, response.runtimeState, response.debugLog);
}

function render(settings, runtimeState, debugLog) {
  autoManageInput.checked = settings.autoManage;
  maxStreamsInput.value = String(settings.maxStreams);

  channelList.textContent = "";
  const hasChannels = settings.importantChannels.length > 0;
  emptyState.hidden = hasChannels;

  settings.importantChannels.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "channel-item";

    const label = document.createElement("span");
    label.textContent = `${index + 1}. ${entry.name}`;

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

function createMoveButton(text, enabled, fromIndex, toIndex, settings) {
  const button = document.createElement("button");
  button.type = "button";
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

function renderDebug(runtimeState, debugLog) {
  const payload = {
    runtimeState,
    debugLog
  };
  debugOutput.textContent = JSON.stringify(payload, null, 2);
}
