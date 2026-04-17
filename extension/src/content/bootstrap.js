chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "watch:request-playback-state") {
    window.clearTimeout(requestedPlaybackRefresh);
    requestedPlaybackRefresh = window.setTimeout(() => {
      requestedPlaybackRefresh = 0;
      void ensureManagedPlaybackState();
    }, 0);
    return;
  }

  if (message?.type === "watch:request-streak") {
    window.clearTimeout(requestedStreakRefresh);
    requestedStreakRefresh = window.setTimeout(() => {
      requestedStreakRefresh = 0;
      void reportWatchStreak();
    }, 0);
  }
});

void init();

async function init() {
  setupResumeRecoveryWatchers();
  touchLifecycleHeartbeat();
  await syncButton();
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void syncButton();
  }, 1000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void reportWatchUptime();
  }, 15000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void tryAutoClaimBonus();
  }, 5000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void ensureManagedPlaybackState();
  }, 5000);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void reportWatchStreak();
  }, WATCH_STREAK_POLL_INTERVAL_MS);
  window.setInterval(() => {
    touchLifecycleHeartbeat();
    void refreshInlineStats();
  }, INLINE_STATS_REFRESH_INTERVAL_MS);
  startPlaybackStatePolling();
}
