const BUTTON_ID = "tw-watch-guard-star";
const TOAST_ID = "tw-watch-guard-toast";

let lastChannel = null;

void init();

async function init() {
  await syncButton();
  window.setInterval(() => {
    void syncButton();
  }, 1000);
}

async function syncButton() {
  const channel = getChannelFromLocation(window.location.pathname);
  if (channel === lastChannel) {
    placeButton();
    return;
  }

  lastChannel = channel;

  if (!channel) {
    removeButton();
    return;
  }

  await injectButton(channel);
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
