function attachPlaybackStateWatchers(video) {
  const player = video instanceof HTMLVideoElement ? video : null;
  if (player === playbackStateVideo) {
    return;
  }

  detachPlaybackStateWatchers();
  playbackStateVideo = player;

  if (!playbackStateVideo) {
    return;
  }

  for (const event of PLAYBACK_STATE_EVENTS) {
    playbackStateVideo.addEventListener(event, onPlaybackStateEvent, { passive: true });
  }
  window.addEventListener("visibilitychange", onPlaybackStateEvent);
}

function detachPlaybackStateWatchers() {
  if (!playbackStateVideo) {
    return;
  }

  for (const event of PLAYBACK_STATE_EVENTS) {
    playbackStateVideo.removeEventListener(event, onPlaybackStateEvent);
  }
  window.removeEventListener("visibilitychange", onPlaybackStateEvent);

  playbackStateVideo = null;
}

function onPlaybackStateEvent() {
  schedulePlaybackStateReport();
}

function schedulePlaybackStateReport() {
  window.clearTimeout(playbackStateDebounceTimeoutId);
  playbackStateDebounceTimeoutId = window.setTimeout(() => {
    playbackStateDebounceTimeoutId = 0;
    void ensureManagedPlaybackState();
  }, PLAYBACK_REPORT_DEBOUNCE_MS);
}

async function ensureManagedPlaybackState() {
  touchLifecycleHeartbeat();
  if (isStartupDelayActive()) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  let response;

  try {
    response = await chrome.runtime.sendMessage({
      type: "watch:authorize",
      channel
    });
  } catch (_error) {
    return;
  }

  if (!response?.ok || !response.authorized) {
    return;
  }

  if (shouldReloadForNetworkError2000()) {
    sendTabTelemetry("playback:reload-network-error-2000", {
      channel
    });
    window.location.reload();
    return;
  }

  const video = findPlayerVideo();
  if (!video) {
    return;
  }

  await recoverManagedPlayback(channel, video);

  if (video.muted) {
    const unmutedAfterResume = await ensureVideoUnmutedWithShortcut(video);
    if (unmutedAfterResume) {
      sendTabTelemetry("playback:unmuted-shortcut", {
        channel
      });
      await sendPlaybackCorrected(channel);
    }
  }

  await reportManagedPlaybackStateForVideo(channel, video);
}

async function reportManagedPlaybackState() {
  if (isStartupDelayActive()) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  const video = findPlayerVideo();
  if (!video) {
    return;
  }

  attachPlaybackStateWatchers(video);
  await reportManagedPlaybackStateForVideo(channel, video);
}

function startPlaybackStatePolling() {
  fastPlaybackPollsLeft = FAST_PLAYBACK_REPORT_TICKS;
  void scheduleNextPlaybackStatePoll(0);
}

function scheduleNextPlaybackStatePoll(delayMs) {
  window.clearTimeout(playbackStatePollTimeoutId);
  playbackStatePollTimeoutId = window.setTimeout(() => {
    touchLifecycleHeartbeat();
    void runPlaybackStatePollTick();
  }, delayMs);
}

async function runPlaybackStatePollTick() {
  await reportManagedPlaybackState();

  const inFastPhase = fastPlaybackPollsLeft > 0;
  if (inFastPhase) {
    fastPlaybackPollsLeft -= 1;
  }

  const delayMs = inFastPhase ? FAST_PLAYBACK_POLL_INTERVAL_MS : SLOW_PLAYBACK_POLL_INTERVAL_MS;
  scheduleNextPlaybackStatePoll(delayMs);
}

async function reportManagedPlaybackStateForVideo(channel, video) {
  const playbackState = getManagedPlaybackState(video);

  const dedupeKey = `${channel}:${playbackState}`;
  if (dedupeKey === lastPlaybackStateKey) {
    return;
  }

  lastPlaybackStateKey = dedupeKey;
  sendTabTelemetry("playback:state-change", {
    channel,
    state: playbackState,
    paused: video.paused,
    muted: video.muted,
    ended: video.ended,
    hidden: document.hidden
  });

  try {
    await chrome.runtime.sendMessage({
      type: "watch:playback-state",
      channel,
      state: playbackState
    });
  } catch (_error) {
    // Ignore transient extension reload gaps.
  }
}

async function recoverManagedPlayback(channel, video) {
  if (!needsPlaybackResume(video)) {
    resetPlaybackRecoveryState();
    return;
  }

  if (!shouldAttemptPlaybackResume(video)) {
    return;
  }

  try {
    playResumeAttemptedForCurrentPause = true;
    await video.play();
    resetPlaybackRecoveryState();
    await chrome.runtime.sendMessage({
      type: "watch:playback-resumed",
      channel
    });
    sendTabTelemetry("playback:resumed", {
      channel,
      hidden: document.hidden
    });
  } catch (error) {
    playResumeAttemptedForCurrentPause = false;
    if (isAutoplayInteractionError(error)) {
      playResumeBlockedByPolicy = true;
      sendTabTelemetry("playback:resume-blocked-policy", {
        channel,
        hidden: document.hidden
      });
      return;
    }

    logTabError("video.play() failed while resuming playback", error);
  }
}

function resetPlaybackRecoveryState() {
  playResumeAttemptedForCurrentPause = false;
  playResumeBlockedByPolicy = false;
}

function findPlayerVideo() {
  const video = document.querySelector("video");
  return video instanceof HTMLVideoElement ? video : null;
}

function needsPlaybackResume(video) {
  return video.paused && !video.ended;
}

function shouldAttemptPlaybackResume(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return false;
  }

  if (!needsPlaybackResume(video)) {
    return false;
  }

  if (playResumeAttemptedForCurrentPause) {
    return false;
  }

  if (playResumeBlockedByPolicy) {
    return false;
  }

  return true;
}

function getManagedPlaybackState(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return "ok";
  }

  if (needsPlaybackResume(video)) {
    return "paused";
  }

  if (video.muted) {
    return "muted";
  }

  return "ok";
}

function attemptUnmuteWithShortcut() {
  const target = findPlaybackShortcutTarget();
  if (!target) {
    return false;
  }

  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
  }

  const shortcutEventInit = {
    key: "m",
    code: "KeyM",
    keyCode: 77,
    which: 77,
    bubbles: true,
    cancelable: true
  };

  const keyDown = new KeyboardEvent("keydown", shortcutEventInit);
  const keyPress = new KeyboardEvent("keypress", shortcutEventInit);
  const keyUp = new KeyboardEvent("keyup", shortcutEventInit);

  target.dispatchEvent(keyDown);
  target.dispatchEvent(keyPress);
  target.dispatchEvent(keyUp);
  return true;
}

async function ensureVideoUnmutedWithShortcut(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return false;
  }

  if (!video.muted) {
    return true;
  }

  const firstAttemptTriggered = attemptUnmuteWithShortcut();
  if (!firstAttemptTriggered) {
    return false;
  }

  await wait(UNMUTE_SHORTCUT_SETTLE_MS);
  if (!video.muted) {
    return true;
  }

  const secondAttemptTriggered = attemptUnmuteWithShortcut();
  if (!secondAttemptTriggered) {
    return false;
  }

  await wait(UNMUTE_SHORTCUT_SETTLE_MS);
  return !video.muted;
}

function findPlaybackShortcutTarget() {
  const candidates = [
    document.querySelector("[data-a-target='player-overlay-click-handler']"),
    document.querySelector("[data-a-target='video-player']"),
    document.querySelector("main"),
    document.body
  ];

  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement || candidate instanceof Document) {
      return candidate;
    }
  }

  return null;
}

function setupResumeRecoveryWatchers() {
  window.addEventListener("visibilitychange", onResumeSignal, { passive: true });
  window.addEventListener("pageshow", onResumeSignal, { passive: true });
  window.addEventListener("focus", onResumeSignal, { passive: true });
  window.addEventListener("pointerdown", onUserInteractionSignal, { passive: true });
  window.addEventListener("keydown", onUserInteractionSignal);
}

function onResumeSignal() {
  const now = Date.now();
  const resumeGapMs = now - lastLifecycleHeartbeatAt;
  touchLifecycleHeartbeat();

  if (document.hidden || document.visibilityState !== "visible") {
    return;
  }

  if (resumeGapMs >= RESUME_GAP_THRESHOLD_MS && shouldReloadForNetworkError2000()) {
    sendTabTelemetry("resume:reload-network-error-2000", {
      resumeGapMs
    });
    window.location.reload();
    return;
  }

  void syncButton();
  void reportWatchUptime();
  void tryAutoClaimBonus();
  void ensureManagedPlaybackState();
}

function onUserInteractionSignal() {
  if (!playResumeBlockedByPolicy && !playResumeAttemptedForCurrentPause) {
    return;
  }

  playResumeBlockedByPolicy = false;
  playResumeAttemptedForCurrentPause = false;
  void ensureManagedPlaybackState();
}

function shouldReloadForNetworkError2000() {
  if (!hasPlayerNetworkError2000()) {
    return false;
  }

  const now = Date.now();
  const previousReloadAt = readLastNetworkErrorReloadAt();
  if (previousReloadAt > 0 && now - previousReloadAt < NETWORK_ERROR_RELOAD_COOLDOWN_MS) {
    return false;
  }

  writeLastNetworkErrorReloadAt(now);
  return true;
}

function hasPlayerNetworkError2000() {
  const textCandidates = [
    document.querySelector("[data-a-target='video-player']")?.textContent || "",
    document.querySelector("[data-a-target='player-overlay-click-handler']")?.textContent || "",
    document.querySelector("[role='alert']")?.textContent || "",
    document.body?.innerText || ""
  ];

  for (const textValue of textCandidates) {
    const text = String(textValue || "");
    if (!text) {
      continue;
    }

    if (/\(\s*[^\)]*#?\s*2000\s*\)/i.test(text) || /#\s*2000\b/i.test(text)) {
      return true;
    }
  }

  return false;
}

function readLastNetworkErrorReloadAt() {
  try {
    const value = Math.round(Number(window.sessionStorage.getItem(NETWORK_ERROR_RELOAD_AT_KEY)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (_error) {
    return 0;
  }
}

function writeLastNetworkErrorReloadAt(timestamp) {
  try {
    window.sessionStorage.setItem(
      NETWORK_ERROR_RELOAD_AT_KEY,
      String(Math.max(0, Math.round(Number(timestamp) || 0)))
    );
  } catch (_error) {
    // Ignore storage restrictions.
  }
}
