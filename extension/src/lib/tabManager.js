const WATCH_GROUP_TITLE = "Stream Guard";
const WATCH_GROUP_COLOR = "purple";
const TAB_PRIME_DURATION_MS = 20000;
let tabPrimeInFlight = null;
const pendingPrimeTabIds = [];
const pendingPrimeSet = new Set();

export async function openWatchTab(channel) {
  const targetChannel = String(channel || "").toLowerCase();
  if (!targetChannel) {
    return null;
  }

  const tab = await chrome.tabs.create({
    url: `https://www.twitch.tv/${targetChannel}`,
    active: false
  });

  if (!Number.isInteger(tab?.id)) {
    return null;
  }

  await ensureWatchGroup([tab.id]);
  void requestTabPrime(tab.id);
  return tab.id;
}

export async function ensureWatchGroup(tabIds) {
  if (!Array.isArray(tabIds) || tabIds.length === 0) {
    return null;
  }

  const existingGroupId = await findWatchGroupId();
  const groupId = Number.isInteger(existingGroupId)
    ? await chrome.tabs.group({ groupId: existingGroupId, tabIds })
    : await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, {
    title: WATCH_GROUP_TITLE,
    color: WATCH_GROUP_COLOR,
    collapsed: true
  });

  return groupId;
}

export async function closeManagedWatchTabs(tabIds) {
  const validTabIds = (Array.isArray(tabIds) ? tabIds : []).filter((tabId) =>
    Number.isInteger(tabId)
  );

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

async function findWatchGroupId() {
  const groups = await chrome.tabGroups.query({ title: WATCH_GROUP_TITLE });
  const group = groups.find((entry) => Number.isInteger(entry?.id));
  return group?.id ?? null;
}

function requestTabPrime(createdTabId) {
  if (!Number.isInteger(createdTabId) || pendingPrimeSet.has(createdTabId)) {
    return;
  }

  pendingPrimeTabIds.push(createdTabId);
  pendingPrimeSet.add(createdTabId);

  if (tabPrimeInFlight) {
    return;
  }

  tabPrimeInFlight = runPrimeQueue().finally(() => {
    tabPrimeInFlight = null;
  });
}

async function runPrimeQueue() {
  while (pendingPrimeTabIds.length > 0) {
    const nextTabId = pendingPrimeTabIds.shift();
    pendingPrimeSet.delete(nextTabId);
    await primeTab(nextTabId);
  }
}

async function primeTab(createdTabId) {
  if (!Number.isInteger(createdTabId)) {
    return;
  }

  try {
    await chrome.tabs.update(createdTabId, { active: true });
  } catch {
    return;
  }

  await delay(TAB_PRIME_DURATION_MS);
}

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
