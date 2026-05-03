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

async function ensureManagedPlaybackState(options = {}) {
  touchLifecycleHeartbeat();
  const ignoreStartupDelay = Boolean(options?.ignoreStartupDelay);
  if (!ignoreStartupDelay && isStartupDelayActive()) {
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

  const acceptedAudienceGate = await acceptAudienceGateIfPresent(channel);
  if (acceptedAudienceGate) {
    await wait(400);
  }

  const playerContext = resolvePlaybackPlayerContext();

  if (shouldReloadForNetworkError2000(playerContext)) {
    sendTabTelemetry("playback:reload-network-error-2000", {
      channel
    });
    window.location.reload();
    return;
  }

  const video = playerContext.video;
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

  if (!video.muted) {
    await sendPrimeSignal("prime:playback-ready", {
      channel
    });
  }

  await ensureLowestPlaybackQuality(channel, playerContext, video);
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

  const video = resolvePlaybackPlayerContext().video;
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
  return resolvePlaybackPlayerContext().video;
}

function resolvePlaybackPlayerContext() {
  const playerRoot = findPlaybackPlayerRoot();
  const video = findPlaybackVideo(playerRoot);
  const overlay = findPlaybackOverlay(playerRoot);
  const alert = findPlaybackAlert(playerRoot);

  return {
    playerRoot,
    video,
    overlay,
    alert
  };
}

function findPlaybackPlayerRoot() {
  const playerRoot = document.querySelector("[data-a-target='video-player']");
  return playerRoot instanceof HTMLElement ? playerRoot : null;
}

function findPlaybackVideo(playerRoot) {
  const scopedVideo = playerRoot?.querySelector("video");
  if (scopedVideo instanceof HTMLVideoElement) {
    return scopedVideo;
  }

  const video = document.querySelector("video");
  return video instanceof HTMLVideoElement ? video : null;
}

function findPlaybackOverlay(playerRoot) {
  const scopedOverlay = playerRoot?.querySelector("[data-a-target='player-overlay-click-handler']");
  if (scopedOverlay instanceof HTMLElement) {
    return scopedOverlay;
  }

  const overlay = document.querySelector("[data-a-target='player-overlay-click-handler']");
  return overlay instanceof HTMLElement ? overlay : null;
}

function findPlaybackAlert(playerRoot) {
  const scopedAlert = playerRoot?.querySelector("[role='alert']");
  if (scopedAlert instanceof HTMLElement) {
    return scopedAlert;
  }

  const alert = document.querySelector("[role='alert']");
  return alert instanceof HTMLElement ? alert : null;
}

async function acceptAudienceGateIfPresent(channel) {
  const acceptButton = findAudienceGateAcceptButton();
  if (!(acceptButton instanceof HTMLButtonElement)) {
    return false;
  }

  acceptButton.click();
  sendTabTelemetry("consent:accepted", {
    channel
  });
  return true;
}

function findAudienceGateAcceptButton() {
  const settingsLink = findAudienceGateSettingsLink();
  if (!(settingsLink instanceof HTMLAnchorElement)) {
    return null;
  }

  const container = findAudienceGateContainer(settingsLink);
  if (!(container instanceof HTMLElement)) {
    return null;
  }

  const buttons = [...container.querySelectorAll("button")]
    .filter((button) => button instanceof HTMLButtonElement)
    .filter((button) => isVisibleInteractiveElement(button))
    .filter((button) => button.getBoundingClientRect().width >= 100)
    .filter((button) => button.getBoundingClientRect().height >= 36)
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      if (Math.abs(leftRect.y - rightRect.y) > 8) {
        return leftRect.y - rightRect.y;
      }
      return leftRect.x - rightRect.x;
    });

  if (buttons.length < 2) {
    return null;
  }

  return buttons[0];
}

function findAudienceGateSettingsLink() {
  const links = [...document.querySelectorAll("a[href]")];
  return links.find((link) => {
    if (!(link instanceof HTMLAnchorElement) || !isVisibleInteractiveElement(link)) {
      return false;
    }

    return /\/settings\/content-preferences(?:[/?#]|$)/i.test(link.href);
  }) || null;
}

function findAudienceGateContainer(anchor) {
  if (!(anchor instanceof HTMLElement)) {
    return null;
  }

  let current = anchor;
  while (current instanceof HTMLElement && current !== document.body) {
    const visibleButtons = [...current.querySelectorAll("button")]
      .filter((button) => button instanceof HTMLButtonElement)
      .filter((button) => isVisibleInteractiveElement(button))
      .filter((button) => button.getBoundingClientRect().width >= 100)
      .filter((button) => button.getBoundingClientRect().height >= 36);
    const textLength = String(current.textContent || "").trim().length;

    if (
      visibleButtons.length >= 2
      && textLength >= 80
      && textLength <= 1200
      && !current.querySelector("[data-a-target='video-player']")
      && !current.closest("nav")
      && !current.closest("aside")
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function isVisibleInteractiveElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
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

async function ensureLowestPlaybackQuality(channel, playerContext, video) {
  if (!(video instanceof HTMLVideoElement)) {
    return;
  }

  const before = readPlaybackQualitySnapshot(playerContext, video);
  if (before.videoHeight > 0 && before.videoHeight <= PLAYBACK_QUALITY_TARGET_HEIGHT) {
    return;
  }

  if (playbackQualitySyncInFlight) {
    return;
  }

  const now = Date.now();
  if (lastPlaybackQualitySyncAt > 0 && now - lastPlaybackQualitySyncAt < PLAYBACK_QUALITY_SYNC_COOLDOWN_MS) {
    return;
  }

  playbackQualitySyncInFlight = true;
  lastPlaybackQualitySyncAt = now;

  try {
    const result = await selectLowestPlaybackQualityOption(playerContext, video);
    if (!result.attempted) {
      return;
    }

    const after = readPlaybackQualitySnapshot(playerContext, video);
    sendTabTelemetry("playback:quality-sync", {
      channel,
      beforeHeight: before.videoHeight,
      afterHeight: after.videoHeight,
      optionCount: after.optionCount,
      checkedIndex: after.checkedIndex,
      selectedLowest: after.checkedIndex >= 0 && after.checkedIndex === after.optionCount - 1,
      status: result.status
    });
  } finally {
    playbackQualitySyncInFlight = false;
  }
}

async function selectLowestPlaybackQualityOption(playerContext, video) {
  if (!(video instanceof HTMLVideoElement)) {
    return { attempted: false, status: "missing-video" };
  }

  const qualityInputsBefore = findPlaybackQualityOptionInputs(playerContext.playerRoot);
  if (qualityInputsBefore.length > 1) {
    const selectedBefore = qualityInputsBefore.findIndex((input) => input.checked);
    if (selectedBefore === qualityInputsBefore.length - 1) {
      return { attempted: true, status: "already-selected" };
    }
  }

  revealPlaybackControls(playerContext);
  await wait(PLAYER_MENU_TOGGLE_DELAY_MS);

  const settingsButton = findVisiblePlaybackSettingsButton(playerContext.playerRoot);
  if (!(settingsButton instanceof HTMLButtonElement)) {
    return { attempted: false, status: "missing-settings-button" };
  }

  if (qualityInputsBefore.length === 0) {
    settingsButton.click();
    await wait(PLAYER_MENU_TOGGLE_DELAY_MS);
  }

  let qualityInputs = findPlaybackQualityOptionInputs(playerContext.playerRoot);
  if (qualityInputs.length === 0) {
    const qualityMenuItem = findVisiblePlaybackQualityMenuItem(playerContext.playerRoot);
    if (!(qualityMenuItem instanceof HTMLElement)) {
      return { attempted: true, status: "missing-quality-menu-item" };
    }

    qualityMenuItem.click();
    await wait(PLAYER_MENU_TOGGLE_DELAY_MS);
    qualityInputs = findPlaybackQualityOptionInputs(playerContext.playerRoot);
  }

  if (qualityInputs.length < 2) {
    return { attempted: true, status: "missing-quality-options" };
  }

  const lowestInput = qualityInputs[qualityInputs.length - 1];
  if (!(lowestInput instanceof HTMLInputElement)) {
    return { attempted: true, status: "missing-lowest-option" };
  }

  if (lowestInput.checked) {
    return { attempted: true, status: "already-selected" };
  }

  const optionLayout = lowestInput.closest("[data-a-target='player-settings-submenu-quality-option']");
  const optionRow = lowestInput.closest("[role='menuitemradio']");
  const clickTarget = optionLayout instanceof HTMLElement
    ? optionLayout
    : optionRow instanceof HTMLElement ? optionRow : null;
  if (!(clickTarget instanceof HTMLElement)) {
    return { attempted: true, status: "missing-click-target" };
  }

  clickTarget.click();
  await waitForPlaybackQualityTarget(video, lowestInput);
  return { attempted: true, status: "selected" };
}

function readPlaybackQualitySnapshot(playerContext, video) {
  const normalizedVideo = video instanceof HTMLVideoElement ? video : null;
  const qualityInputs = findPlaybackQualityOptionInputs(playerContext?.playerRoot);
  const checkedIndex = qualityInputs.findIndex((input) => input.checked);

  return {
    optionCount: qualityInputs.length,
    checkedIndex,
    videoHeight: normalizedVideo ? normalizePlaybackQualityDimension(normalizedVideo.videoHeight) : 0,
    videoWidth: normalizedVideo ? normalizePlaybackQualityDimension(normalizedVideo.videoWidth) : 0
  };
}

async function waitForPlaybackQualityTarget(video, selectedInput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < PLAYBACK_QUALITY_SETTLE_TIMEOUT_MS) {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    if (selectedInput instanceof HTMLInputElement && selectedInput.checked) {
      const height = normalizePlaybackQualityDimension(video.videoHeight);
      if (height > 0 && height <= PLAYBACK_QUALITY_TARGET_HEIGHT) {
        return;
      }
    }

    await wait(PLAYBACK_QUALITY_SETTLE_POLL_MS);
  }
}

function normalizePlaybackQualityDimension(value) {
  const dimension = Math.floor(Number(value));
  return Number.isInteger(dimension) && dimension > 0 ? dimension : 0;
}

function revealPlaybackControls(playerContext) {
  const candidates = [
    playerContext?.overlay,
    playerContext?.playerRoot
  ];

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }

    candidate.dispatchEvent(new MouseEvent("mouseenter", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    candidate.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }
}

function findVisiblePlaybackSettingsButton(playerRoot) {
  const scopedButton = playerRoot?.querySelector("[data-a-target='player-settings-button']");
  if (scopedButton instanceof HTMLButtonElement && isVisibleInteractiveElement(scopedButton)) {
    return scopedButton;
  }

  const buttons = [...document.querySelectorAll("[data-a-target='player-settings-button']")]
    .filter((button) => button instanceof HTMLButtonElement)
    .filter((button) => isVisibleInteractiveElement(button));
  return buttons[0] || null;
}

function findVisiblePlaybackQualityMenuItem(playerRoot) {
  const scopedItem = playerRoot?.querySelector("[data-a-target='player-settings-menu-item-quality']");
  if (scopedItem instanceof HTMLElement && isVisibleInteractiveElement(scopedItem)) {
    return scopedItem;
  }

  const items = [...document.querySelectorAll("[data-a-target='player-settings-menu-item-quality']")]
    .filter((item) => item instanceof HTMLElement)
    .filter((item) => isVisibleInteractiveElement(item));
  return items[0] || null;
}

function findPlaybackQualityOptionInputs(playerRoot) {
  const selectors = "[data-a-target='player-settings-submenu-quality-option'] input";
  const scopedInputs = playerRoot instanceof HTMLElement
    ? [...playerRoot.querySelectorAll(selectors)].filter((input) => input instanceof HTMLInputElement)
    : [];
  if (scopedInputs.length > 0) {
    return scopedInputs;
  }

  return [...document.querySelectorAll(selectors)]
    .filter((input) => input instanceof HTMLInputElement);
}

function attemptUnmuteWithShortcut(video) {
  const target = findPlaybackShortcutTarget(video);
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

  const firstAttemptTriggered = attemptUnmuteWithShortcut(video);
  if (!firstAttemptTriggered) {
    return false;
  }

  await wait(UNMUTE_SHORTCUT_SETTLE_MS);
  if (!video.muted) {
    return true;
  }

  const secondAttemptTriggered = attemptUnmuteWithShortcut(video);
  if (!secondAttemptTriggered) {
    return false;
  }

  await wait(UNMUTE_SHORTCUT_SETTLE_MS);
  return !video.muted;
}

function findPlaybackShortcutTarget(video) {
  const playerContext = resolvePlaybackPlayerContext();
  const candidates = [
    playerContext.overlay,
    playerContext.playerRoot,
    video
  ];

  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement) {
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

function shouldReloadForNetworkError2000(playerContext = resolvePlaybackPlayerContext()) {
  if (!hasPlayerNetworkError2000(playerContext)) {
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

function hasPlayerNetworkError2000(playerContext = resolvePlaybackPlayerContext()) {
  const textCandidates = [
    playerContext.playerRoot?.textContent || "",
    playerContext.overlay?.textContent || "",
    playerContext.alert?.textContent || ""
  ];

  for (const textValue of textCandidates) {
    if (containsNetworkError2000(textValue)) {
      return true;
    }
  }

  const bodyText = document.body?.innerText || "";
  if (containsNetworkError2000(bodyText)) {
    return true;
  }

  return false;
}

function containsNetworkError2000(textValue) {
  const text = String(textValue || "");
  if (!text) {
    return false;
  }

  return /\(\s*[^\)]*#?\s*2000\s*\)/i.test(text) || /#\s*2000\b/i.test(text);
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
