const WATCH_GROUP_TITLE = "Stream Guard";
const WATCH_GROUP_COLOR = "purple";
const ABOUT_BLANK_URL = "about:blank";

export async function openWatchTab(channel, options = {}) {
  const targetChannel = String(channel || "").toLowerCase();
  if (!targetChannel) {
    return null;
  }

  const groupContext = await getCanonicalGroupContext();
  const managedTabIds = normalizeTabIds(options.managedTabIds);
  const groupState = await getWatchGroupState();
  const reusableKeeper = managedTabIds.length === 0
    ? groupState.groupedTabs.find((tab) => tab.url === ABOUT_BLANK_URL)
    : null;
  const tab = reusableKeeper || await chrome.tabs.create({
    ...(Number.isInteger(groupContext.windowId) ? { windowId: groupContext.windowId } : {}),
    url: ABOUT_BLANK_URL,
    active: false
  });

  if (!Number.isInteger(tab?.id)) {
    return null;
  }

  try {
    await chrome.tabs.update(tab.id, { muted: true });
  } catch {
    // If muting fails transiently, keep tab management running.
  }

  if (!reusableKeeper) {
    await reconcileWatchGroup({
      managedTabIds: [...managedTabIds, tab.id]
    });
  }

  try {
    await chrome.tabs.update(tab.id, { active: true });
  } catch {
    // If activation fails transiently, the caller can still reconcile or retry later.
  }

  try {
    await chrome.tabs.update(tab.id, {
      url: `https://www.twitch.tv/${targetChannel}`
    });
  } catch {
    await closeManagedWatchTabs([tab.id]);
    return null;
  }

  return tab.id;
}

export async function closeManagedWatchTabs(tabIds) {
  const validTabIds = normalizeTabIds(tabIds);

  if (validTabIds.length === 0) {
    return 0;
  }

  const existingTabs = await chrome.tabs.query({});
  const existingIds = new Set(
    existingTabs.map((tab) => tab.id).filter((tabId) => Number.isInteger(tabId))
  );
  const removableIds = validTabIds.filter((tabId) => existingIds.has(tabId));

  if (removableIds.length > 0) {
    await chrome.tabs.remove(removableIds);
  }

  return removableIds.length;
}

export async function reconcileWatchGroup(options = {}) {
  const managedTabIds = normalizeTabIds(options.managedTabIds);
  const existingTabs = await chrome.tabs.query({});
  const tabById = new Map(
    existingTabs
      .filter((tab) => Number.isInteger(tab?.id))
      .map((tab) => [tab.id, tab])
  );
  const existingManagedTabs = managedTabIds
    .map((tabId) => tabById.get(tabId))
    .filter(Boolean);
  const existingManagedTabIds = existingManagedTabs
    .map((tab) => tab.id)
    .filter((tabId) => Number.isInteger(tabId));
  const groupState = await getWatchGroupState(existingTabs);
  const targetWindowId = await resolveCanonicalWindowId({
    groupState,
    existingManagedTabs
  });
  const keeperTabId = await ensureKeeperTab({
    groupState,
    targetWindowId
  });
  const keepTabIds = uniqueTabIds([...existingManagedTabIds, keeperTabId]);
  const tabsToMove = uniqueTabIds(
    keepTabIds.filter((tabId) => {
      const tab = tabById.get(tabId);
      return tab && Number.isInteger(targetWindowId) && tab.windowId !== targetWindowId;
    })
  );

  if (tabsToMove.length > 0 && Number.isInteger(targetWindowId)) {
    await chrome.tabs.move(tabsToMove, {
      windowId: targetWindowId,
      index: -1
    });
  }

  const refreshedTabs = await chrome.tabs.query({});
  const refreshedTabById = new Map(
    refreshedTabs
      .filter((tab) => Number.isInteger(tab?.id))
      .map((tab) => [tab.id, tab])
  );
  const refreshedGroupState = await getWatchGroupState(refreshedTabs);
  const finalKeepTabIds = uniqueTabIds(
    keepTabIds.filter((tabId) => refreshedTabById.has(tabId))
  );

  if (finalKeepTabIds.length === 0) {
    return null;
  }

  const canonicalGroupId = await ensureGroupAssigned({
    existingGroupId: resolveCanonicalGroupId({
      groupState: refreshedGroupState,
      targetWindowId,
      keepTabIds: finalKeepTabIds,
      tabById: refreshedTabById
    }),
    tabIds: finalKeepTabIds
  });

  const finalGroupState = await getWatchGroupState();
  const removableTabIds = finalGroupState.groupedTabs
    .map((tab) => tab.id)
    .filter((tabId) => Number.isInteger(tabId) && !finalKeepTabIds.includes(tabId));

  if (removableTabIds.length > 0) {
    await chrome.tabs.remove(removableTabIds);
  }

  await chrome.tabGroups.update(canonicalGroupId, {
    title: WATCH_GROUP_TITLE,
    color: WATCH_GROUP_COLOR,
    collapsed: false
  });

  return canonicalGroupId;
}
async function getWatchGroupState(existingTabs = null) {
  const tabs = Array.isArray(existingTabs) ? existingTabs : await chrome.tabs.query({});
  const groups = await chrome.tabGroups.query({ title: WATCH_GROUP_TITLE });
  const groupIds = groups
    .map((group) => group?.id)
    .filter((groupId) => Number.isInteger(groupId))
    .sort((left, right) => left - right);
  const groupIdSet = new Set(groupIds);
  const groupedTabs = tabs
    .filter((tab) => Number.isInteger(tab?.groupId) && groupIdSet.has(tab.groupId))
    .sort((left, right) => left.index - right.index);

  return {
    groupIds,
    groupedTabs
  };
}

async function getCanonicalGroupContext() {
  const tabs = await chrome.tabs.query({});
  const groupState = await getWatchGroupState(tabs);
  const existingKeeper = groupState.groupedTabs.find((tab) => tab.url === ABOUT_BLANK_URL);
  if (existingKeeper) {
    return {
      groupId: existingKeeper.groupId,
      windowId: existingKeeper.windowId
    };
  }

  const existingGroupedTab = groupState.groupedTabs.find((tab) => Number.isInteger(tab?.groupId));
  if (existingGroupedTab) {
    return {
      groupId: existingGroupedTab.groupId,
      windowId: existingGroupedTab.windowId
    };
  }

  const windowId = await getFallbackWindowId();
  return {
    groupId: null,
    windowId
  };
}

async function resolveCanonicalWindowId({ groupState, existingManagedTabs }) {
  const keeperTab = groupState.groupedTabs.find((tab) => tab.url === ABOUT_BLANK_URL);
  if (keeperTab && Number.isInteger(keeperTab.windowId)) {
    return keeperTab.windowId;
  }

  const groupedTab = groupState.groupedTabs.find((tab) => Number.isInteger(tab?.windowId));
  if (groupedTab) {
    return groupedTab.windowId;
  }

  const managedTab = existingManagedTabs.find((tab) => Number.isInteger(tab?.windowId));
  if (managedTab) {
    return managedTab.windowId;
  }

  return getFallbackWindowId();
}

async function ensureKeeperTab({ groupState, targetWindowId }) {
  const existingKeeper = groupState.groupedTabs.find((tab) => tab.url === ABOUT_BLANK_URL);
  if (Number.isInteger(existingKeeper?.id)) {
    return existingKeeper.id;
  }

  const createdTab = await chrome.tabs.create({
    ...(Number.isInteger(targetWindowId) ? { windowId: targetWindowId } : {}),
    url: ABOUT_BLANK_URL,
    active: false
  });

  return Number.isInteger(createdTab?.id) ? createdTab.id : null;
}

async function ensureGroupAssigned({ existingGroupId, tabIds }) {
  if (Number.isInteger(existingGroupId)) {
    return chrome.tabs.group({
      groupId: existingGroupId,
      tabIds
    });
  }

  return chrome.tabs.group({ tabIds });
}

function resolveCanonicalGroupId({ groupState, targetWindowId, keepTabIds, tabById }) {
  const keepTabSet = new Set(keepTabIds);
  const keeperTab = groupState.groupedTabs.find((tab) => keepTabSet.has(tab.id) && tab.url === ABOUT_BLANK_URL);
  if (Number.isInteger(keeperTab?.groupId)) {
    return keeperTab.groupId;
  }

  const groupedManagedTab = groupState.groupedTabs.find((tab) => keepTabSet.has(tab.id));
  if (Number.isInteger(groupedManagedTab?.groupId)) {
    return groupedManagedTab.groupId;
  }

  const groupedTabInWindow = groupState.groupedTabs.find((tab) => tab.windowId === targetWindowId);
  if (Number.isInteger(groupedTabInWindow?.groupId)) {
    return groupedTabInWindow.groupId;
  }

  const movedKeeperTab = keepTabIds
    .map((tabId) => tabById.get(tabId))
    .find((tab) => tab?.url === ABOUT_BLANK_URL && Number.isInteger(tab?.groupId));
  if (Number.isInteger(movedKeeperTab?.groupId)) {
    return movedKeeperTab.groupId;
  }

  return groupState.groupIds[0] ?? null;
}

async function getFallbackWindowId() {
  const windows = await chrome.windows.getAll({
    populate: false,
    windowTypes: ["normal"]
  });
  const windowId = windows.find((entry) => Number.isInteger(entry?.id))?.id;
  return Number.isInteger(windowId) ? windowId : null;
}

function normalizeTabIds(tabIds) {
  return uniqueTabIds(
    (Array.isArray(tabIds) ? tabIds : []).filter((tabId) => Number.isInteger(tabId))
  );
}

function uniqueTabIds(tabIds) {
  return [...new Set(tabIds)];
}
