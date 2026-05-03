import {
  getRuntimeState,
  getSettings,
  setRuntimeState,
  setSettings,
  toggleImportantChannel
} from "./lib/storage.js";
import {
  closeManagedWatchTabs,
  reconcileWatchGroup
} from "./lib/tabManager.js";
import { createTabLifecycleService } from "./background/tabLifecycleService.js";
import { createMessageRouter } from "./background/messageRouter.js";
import { createAuthorizationService } from "./background/authorizationService.js";
import { createStreamSessionService } from "./background/streamSessionService.js";
import { createOrchestratorService } from "./background/orchestratorService.js";
import { createRuntimeStore } from "./background/runtimeStore.js";
import { createTabPrimeStateStore } from "./background/tabPrimeState.js";
import { getExistingTab, getChannelFromTab } from "./background/tabUtils.js";
import { createWorkerLogger } from "./background/workerLogger.js";
import { createTelemetryStore } from "./background/telemetryStore.js";

const ORCHESTRATOR_ALARM = "orchestrator-tick";
const ORCHESTRATOR_LAST_TICK_AT_KEY = "orchestratorLastTickAt";
const WATCH_GROUP_TITLE = "Stream Guard";
const STATE_CACHE_TTL_MS = 1500;
const AUTH_CACHE_TTL_MS = 3000;
const WAKE_GAP_THRESHOLD_MS = 180000;
const DETACHED_REOPEN_COOLDOWN_MS = 300000;
const STARTUP_RECOVERY_RELOAD_THRESHOLD_MS = 1080000;
const WORKER_LOG_PREFIX = "[Stream Guard]";
const TELEMETRY_MAX_EVENTS = 1000;
const QUIET_WORKER_EVENTS = new Set([
  "claim:available",
  "claim:cleared",
  "playback-state:updated",
  "reconcile:done",
  "reconcile:keep-loading-tab",
  "reconcile:skip-open",
  "reconcile:start",
  "watch:init-content-ready",
  "watch:init-start",
  "watch:init-streak-attempted",
  "watch:init-wait-start"
]);

const telemetryStore = createTelemetryStore({
  maxEvents: TELEMETRY_MAX_EVENTS
});
void telemetryStore.compact().catch(() => {
  // Keep startup resilient if persisted telemetry cannot be compacted immediately.
});
const workerLogger = createWorkerLogger(
  WORKER_LOG_PREFIX,
  telemetryStore.append,
  {
    shouldMirrorToConsole: shouldMirrorWorkerEventToConsole,
    shouldPersistEvent: shouldPersistWorkerEvent
  }
);
const runtimeStore = createRuntimeStore({
  getSettings,
  setSettings,
  getRuntimeState,
  setRuntimeState,
  stateCacheTtlMs: STATE_CACHE_TTL_MS,
  onStateMutated: null
});
const pendingManagedTabsByChannel = new Map();
const tabPrimeStateStore = createTabPrimeStateStore();

const tabLifecycleService = createTabLifecycleService({
  readRuntimeStateCached: runtimeStore.readRuntimeStateCached,
  readRuntimeStateFresh: runtimeStore.readRuntimeStateFresh,
  writeRuntimeState: runtimeStore.writeRuntimeState,
  getExistingTab,
  getChannelFromTab,
  logWorkerEvent: workerLogger.logWorkerEvent,
  readTabPrimeState: tabPrimeStateStore.read,
  resetTabPrimeState: tabPrimeStateStore.reset,
  clearTabPrimeState: tabPrimeStateStore.clear,
  markPendingManagedTab: (channel, tabId) => {
    if (channel && Number.isInteger(tabId)) {
      pendingManagedTabsByChannel.set(channel, tabId);
    }
  },
  clearPendingManagedTab: (channel, tabId) => {
    if (!channel) {
      return;
    }

    if (!Number.isInteger(tabId) || pendingManagedTabsByChannel.get(channel) === tabId) {
      pendingManagedTabsByChannel.delete(channel);
    }
  },
  detachedReopenCooldownMs: DETACHED_REOPEN_COOLDOWN_MS,
  startupRecoveryReloadThresholdMs: STARTUP_RECOVERY_RELOAD_THRESHOLD_MS
});

const authorizationService = createAuthorizationService({
  readSettingsCached: runtimeStore.readSettingsCached,
  readRuntimeStateCached: runtimeStore.readRuntimeStateCached,
  getExistingTab,
  getChannelFromTab,
  watchGroupTitle: WATCH_GROUP_TITLE,
  authCacheTtlMs: AUTH_CACHE_TTL_MS,
  isPendingManagedTab: (channel, tabId) => pendingManagedTabsByChannel.get(channel) === tabId
});

runtimeStore.setOnStateMutated(() => {
  authorizationService.clearAuthorizationCache();
});

const streamSessionService = createStreamSessionService({
  readRuntimeStateCached: runtimeStore.readRuntimeStateCached,
  writeRuntimeState: runtimeStore.writeRuntimeState,
  canManageChannelForTab: authorizationService.canManageChannelForTab,
  requestWatchStreakForManagedTab: tabLifecycleService.requestWatchStreakForManagedTab,
  logWorkerEvent: workerLogger.logWorkerEvent
});

const orchestratorService = createOrchestratorService({
  alarmName: ORCHESTRATOR_ALARM,
  orchestratorLastTickAtKey: ORCHESTRATOR_LAST_TICK_AT_KEY,
  wakeGapThresholdMs: WAKE_GAP_THRESHOLD_MS,
  readSettingsFresh: runtimeStore.readSettingsFresh,
  writeSettings: runtimeStore.writeSettings,
  readRuntimeStateFresh: runtimeStore.readRuntimeStateFresh,
  writeRuntimeState: runtimeStore.writeRuntimeState,
  readRuntimeStateCached: runtimeStore.readRuntimeStateCached,
  rebindManagedTabsAfterUpdate: tabLifecycleService.rebindManagedTabsAfterUpdate,
  readSettingsCached: runtimeStore.readSettingsCached,
  reconcileManagedTabs: tabLifecycleService.reconcileManagedTabs,
  recoverManagedTabsAfterWake: tabLifecycleService.recoverManagedTabsAfterWake,
  logWorkerEvent: workerLogger.logWorkerEvent,
  reconcileWatchGroup
});

const handleMessage = createMessageRouter({
  readSettingsCached: runtimeStore.readSettingsCached,
  readRuntimeStateCached: runtimeStore.readRuntimeStateCached,
  writeSettings: runtimeStore.writeSettings,
  syncAlarm: orchestratorService.syncAlarm,
  reconcileManagedTabs: tabLifecycleService.reconcileManagedTabs,
  updateBadge: orchestratorService.updateBadge,
  toggleImportantChannel,
  logWorkerEvent: workerLogger.logWorkerEvent,
  closeManagedWatchTabs,
  reconcileWatchGroup,
  writeRuntimeState: runtimeStore.writeRuntimeState,
  handleWatchUptime: streamSessionService.handleWatchUptime,
  canManageWatchTab: authorizationService.canManageWatchTab,
  canManageChannelForTab: authorizationService.canManageChannelForTab,
  recordClaim: streamSessionService.recordClaim,
  updateClaimAvailability: streamSessionService.updateClaimAvailability,
  updateWatchStreak: streamSessionService.updateWatchStreak,
  markTabContentReady: tabPrimeStateStore.markContentReady,
  markTabPlaybackPrimeReady: tabPrimeStateStore.markPlaybackReady,
  markTabStreakPrimeAttempted: tabPrimeStateStore.markStreakAttempted,
  logTabTelemetryEvent: async ({ event, details, sender }) => {
    await telemetryStore.append({
      source: "tab",
      event,
      details,
      context: {
        tabId: sender?.tab?.id ?? null,
        frameId: sender?.frameId ?? null,
        url: sender?.tab?.url || null
      }
    });
  },
  exportTelemetrySnapshot: telemetryStore.exportSnapshot,
  clearTelemetry: telemetryStore.clear,
  getTelemetryStats: telemetryStore.getStats
});

chrome.runtime.onInstalled.addListener((details) => {
  void orchestratorService.onInstalled(details);
});

chrome.runtime.onStartup.addListener(() => {
  void orchestratorService.onStartup();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void orchestratorService.onAlarm(alarm);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const messageType = String(message?.type || "");
  void handleMessage(message, sender)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => {
      void telemetryStore.append({
        source: "worker",
        event: "message:error",
        details: {
          messageType,
          message: error instanceof Error ? error.message : String(error)
        },
        context: {
          tabId: sender?.tab?.id ?? null
        }
      });

      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

function shouldMirrorWorkerEventToConsole(event) {
  const normalizedEvent = String(event || "").toLowerCase();
  if (!normalizedEvent || QUIET_WORKER_EVENTS.has(normalizedEvent)) {
    return false;
  }

  return normalizedEvent !== "streak:probe-log";
}

function shouldPersistWorkerEvent(event, details) {
  const normalizedEvent = String(event || "").toLowerCase();
  if (!normalizedEvent || QUIET_WORKER_EVENTS.has(normalizedEvent)) {
    return false;
  }

  if (normalizedEvent !== "streak:probe-log") {
    return true;
  }

  return isActionableStreakProbeReason(details?.reason);
}

function isActionableStreakProbeReason(reason) {
  const normalizedReason = String(reason || "").toLowerCase();
  if (!normalizedReason) {
    return false;
  }

  return normalizedReason !== "streak-primary-used";
}
