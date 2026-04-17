import {
  getRuntimeState,
  getSettings,
  setRuntimeState,
  setSettings,
  toggleImportantChannel
} from "./lib/storage.js";
import { closeManagedWatchTabs, markTabContentReady } from "./lib/tabManager.js";
import { createTabLifecycleService } from "./background/tabLifecycleService.js";
import { createMessageRouter } from "./background/messageRouter.js";
import { createAuthorizationService } from "./background/authorizationService.js";
import { createStreamSessionService } from "./background/streamSessionService.js";
import { createOrchestratorService } from "./background/orchestratorService.js";
import { createRuntimeStore } from "./background/runtimeStore.js";
import { getExistingTab, getChannelFromTab } from "./background/tabUtils.js";
import { createWorkerLogger } from "./background/workerLogger.js";
import { createTelemetryStore } from "./background/telemetryStore.js";

const ORCHESTRATOR_ALARM = "orchestrator-tick";
const ORCHESTRATOR_LAST_TICK_AT_KEY = "orchestratorLastTickAt";
const WATCH_GROUP_TITLE = "Stream Guard";
const STATE_CACHE_TTL_MS = 1500;
const AUTH_CACHE_TTL_MS = 3000;
const WAKE_GAP_THRESHOLD_MS = 180000;
const BROADCAST_SESSION_RETENTION_MS = 900000;
const DETACHED_REOPEN_COOLDOWN_MS = 300000;
const STARTUP_RECOVERY_RELOAD_THRESHOLD_MS = 1080000;
const WORKER_LOG_PREFIX = "[Stream Guard]";
const TELEMETRY_MAX_EVENTS = 1000;

const telemetryStore = createTelemetryStore({
  maxEvents: TELEMETRY_MAX_EVENTS
});
void telemetryStore.compact().catch(() => {
  // Keep startup resilient if persisted telemetry cannot be compacted immediately.
});
const workerLogger = createWorkerLogger(WORKER_LOG_PREFIX, telemetryStore.append);
const runtimeStore = createRuntimeStore({
  getSettings,
  setSettings,
  getRuntimeState,
  setRuntimeState,
  stateCacheTtlMs: STATE_CACHE_TTL_MS,
  onStateMutated: null
});

const tabLifecycleService = createTabLifecycleService({
  readRuntimeStateCached: runtimeStore.readRuntimeStateCached,
  writeRuntimeState: runtimeStore.writeRuntimeState,
  getExistingTab,
  getChannelFromTab,
  logWorkerEvent: workerLogger.logWorkerEvent,
  detachedReopenCooldownMs: DETACHED_REOPEN_COOLDOWN_MS,
  broadcastSessionRetentionMs: BROADCAST_SESSION_RETENTION_MS,
  startupRecoveryReloadThresholdMs: STARTUP_RECOVERY_RELOAD_THRESHOLD_MS
});

const authorizationService = createAuthorizationService({
  readSettingsCached: runtimeStore.readSettingsCached,
  readRuntimeStateCached: runtimeStore.readRuntimeStateCached,
  getExistingTab,
  getChannelFromTab,
  watchGroupTitle: WATCH_GROUP_TITLE,
  authCacheTtlMs: AUTH_CACHE_TTL_MS
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
  rebindManagedTabsAfterUpdate: tabLifecycleService.rebindManagedTabsAfterUpdate,
  readSettingsCached: runtimeStore.readSettingsCached,
  reconcileManagedTabs: tabLifecycleService.reconcileManagedTabs,
  recoverManagedTabsAfterWake: tabLifecycleService.recoverManagedTabsAfterWake,
  logWorkerEvent: workerLogger.logWorkerEvent
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
  writeRuntimeState: runtimeStore.writeRuntimeState,
  handleWatchUptime: streamSessionService.handleWatchUptime,
  canManageWatchTab: authorizationService.canManageWatchTab,
  canManageChannelForTab: authorizationService.canManageChannelForTab,
  recordClaim: streamSessionService.recordClaim,
  updateClaimAvailability: streamSessionService.updateClaimAvailability,
  updateWatchStreak: streamSessionService.updateWatchStreak,
  markTabContentReady,
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
