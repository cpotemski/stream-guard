export function createAuthorizationService({
  readSettingsCached,
  readRuntimeStateCached,
  getExistingTab,
  getChannelFromTab,
  watchGroupTitle,
  authCacheTtlMs
}) {
  const authorizationCache = new Map();

  async function canManageWatchTab(message, sender) {
    const channel = String(message?.channel || "").toLowerCase();
    const tabId = sender?.tab?.id;
    return canManageChannelForTab(channel, tabId);
  }

  async function canManageChannelForTab(channel, tabId) {
    if (!channel || !Number.isInteger(tabId)) {
      return false;
    }

    const authorizationKey = `${channel}:${tabId}`;
    const cachedAuthorization = authorizationCache.get(authorizationKey);
    if (cachedAuthorization && cachedAuthorization.expiresAt > Date.now()) {
      return cachedAuthorization.allowed;
    }

    const settings = await readSettingsCached();
    if (!settings.autoManage) {
      cacheAuthorizationResult(authorizationKey, false);
      return false;
    }
    const isImportant = settings.importantChannels.some((entry) => entry.name === channel);
    if (!isImportant) {
      cacheAuthorizationResult(authorizationKey, false);
      return false;
    }

    const runtimeState = await readRuntimeStateCached();
    if (runtimeState.managedTabsByChannel[channel] !== tabId) {
      cacheAuthorizationResult(authorizationKey, false);
      return false;
    }

    const tab = await getExistingTab(tabId);
    if (!tab) {
      cacheAuthorizationResult(authorizationKey, false);
      return false;
    }

    const tabChannel = getChannelFromTab(tab);
    if (tabChannel !== channel) {
      cacheAuthorizationResult(authorizationKey, false);
      return false;
    }

    if (!Number.isInteger(tab.groupId) || tab.groupId < 0) {
      cacheAuthorizationResult(authorizationKey, false);
      return false;
    }

    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      const allowed = group?.title === watchGroupTitle;
      cacheAuthorizationResult(authorizationKey, allowed);
      return allowed;
    } catch (_error) {
      cacheAuthorizationResult(authorizationKey, false);
      return false;
    }
  }

  function cacheAuthorizationResult(key, allowed) {
    authorizationCache.set(key, {
      allowed,
      expiresAt: Date.now() + authCacheTtlMs
    });
  }

  function clearAuthorizationCache() {
    authorizationCache.clear();
  }

  return {
    canManageWatchTab,
    canManageChannelForTab,
    clearAuthorizationCache
  };
}
