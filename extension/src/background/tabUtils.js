export async function getExistingTab(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }

  try {
    return await chrome.tabs.get(tabId);
  } catch (_error) {
    return null;
  }
}

export function getChannelFromTab(tab) {
  const rawUrl = tab?.pendingUrl || tab?.url;
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "www.twitch.tv" && url.hostname !== "twitch.tv") {
      return null;
    }

    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!path || path.includes("/")) {
      return null;
    }

    return path.toLowerCase();
  } catch (_error) {
    return null;
  }
}
