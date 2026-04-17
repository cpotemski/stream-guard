async function reportWatchStreak() {
  if (isStartupDelayActive()) {
    return;
  }

  if (streakProbeInFlight) {
    return;
  }

  const channel = getChannelFromLocation(window.location.pathname);
  if (!channel) {
    return;
  }

  let authorization;

  try {
    authorization = await chrome.runtime.sendMessage({
      type: "watch:authorize",
      channel
    });
  } catch (_error) {
    await sendStreakProbeLog(channel, "authorize-message-failed");
    return;
  }

  if (!authorization?.ok || !authorization.authorized) {
    return;
  }

  const summaryData = await waitForResult(
    () => {
      const summary = findCommunityPointsSummaryRoot();
      const button = findCommunityPointsSummaryToggleButton(summary);
      return button ? { summary, button } : null;
    },
    WATCH_STREAK_SUMMARY_WAIT_TIMEOUT_MS
  );
  if (!summaryData?.button) {
    const diagnostics = getSummaryToggleDiagnostics();
    await sendStreakProbeLog(channel, "summary-toggle-not-found");
    await sendStreakProbeLog(channel, "summary-toggle-context", {
      summaryExists: diagnostics.summaryCount > 0,
      summaryCount: diagnostics.summaryCount,
      copoCount: diagnostics.copoCount,
      bitsCount: diagnostics.bitsCount
    });
    return;
  }
  const summaryToggleButton = summaryData.button;

  streakProbeInFlight = true;

  let streakValue = null;
  const wasOpenBefore = Boolean(findRewardCenterDialog());
  let hadDialog = false;
  let hadPrimaryContainer = false;
  let parserSource = "none";
  let primaryValue = null;

  try {
    if (!wasOpenBefore) {
      summaryToggleButton.click();
      await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
    }

    let dialog = await waitForResult(
      () => findRewardCenterDialog(),
      WATCH_STREAK_DIALOG_WAIT_TIMEOUT_MS
    );
    hadDialog = Boolean(dialog);

    if (!dialog && !wasOpenBefore && summaryToggleButton.isConnected) {
      summaryToggleButton.click();
      await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
      dialog = await waitForResult(
        () => findRewardCenterDialog(),
        WATCH_STREAK_DIALOG_WAIT_TIMEOUT_MS
      );
      hadDialog = Boolean(dialog);
    }

    const parserResult = dialog
      ? await waitForResult(
        () => {
          const result = extractWatchStreakValueFromDialog(dialog);
          if (result.hadPrimaryContainer) {
            return result;
          }
          return null;
        },
        WATCH_STREAK_CARD_WAIT_TIMEOUT_MS
      )
      : null;
    streakValue = parserResult?.value ?? null;
    hadPrimaryContainer = Boolean(parserResult?.hadPrimaryContainer);
    parserSource = parserResult?.source || "none";
    primaryValue = parserResult?.primaryValue ?? null;
  } finally {
    const closed = await closeRewardCenterDialog();
    if (!closed) {
      await sendStreakProbeLog(channel, "summary-close-failed");
    }
    streakProbeInFlight = false;
  }

  if (!Number.isInteger(streakValue) || streakValue < 0) {
    console.warn(
      TAB_LOG_PREFIX,
      "streak could not be found",
      { channel, wasOpenBefore, hadDialog, hadPrimaryContainer }
    );
    await sendStreakProbeLog(channel, "streak-no-valid-candidate", {
      hadPrimaryContainer,
      primaryValue
    });
    await sendStreakProbeLog(channel, "streak-could-not-be-found", {
      wasOpenBefore,
      hadDialog,
      hadPrimaryContainer
    });
    return;
  }

  if (parserSource === "primary") {
    await sendStreakProbeLog(channel, "streak-primary-used", {
      value: streakValue
    });
  }

  const dedupeKey = `${channel}:${streakValue}`;
  if (dedupeKey === lastWatchStreakReportKey) {
    return;
  }
  lastWatchStreakReportKey = dedupeKey;

  try {
    await chrome.runtime.sendMessage({
      type: "streak:report",
      channel,
      value: streakValue
    });
  } catch (error) {
    await sendStreakProbeLog(channel, "streak-report-message-failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function findCommunityPointsSummaryRoot() {
  const summary = document.querySelector("[data-test-selector='community-points-summary']");
  return summary instanceof HTMLElement ? summary : null;
}

function findCommunityPointsSummaryToggleButton(summary) {
  if (!(summary instanceof HTMLElement)) {
    return null;
  }

  const byCopoBalance = summary.querySelector("[data-test-selector='copo-balance-string']");
  const copoButton = byCopoBalance?.closest("button");
  if (copoButton instanceof HTMLButtonElement) {
    return copoButton;
  }

  const byBitsBalance = summary.querySelector("[data-test-selector='bits-balance-string']");
  const bitsButton = byBitsBalance?.closest("button");
  if (bitsButton instanceof HTMLButtonElement) {
    return bitsButton;
  }

  return null;
}

function getSummaryToggleDiagnostics() {
  const summaries = document.querySelectorAll("[data-test-selector='community-points-summary']");
  const copo = document.querySelectorAll("[data-test-selector='copo-balance-string']");
  const bits = document.querySelectorAll("[data-test-selector='bits-balance-string']");

  return {
    summaryCount: summaries.length,
    copoCount: copo.length,
    bitsCount: bits.length
  };
}

function findRewardCenterDialog() {
  const primary = document.querySelector(
    "[role='dialog'][aria-labelledby='channel-points-reward-center-header']"
  );
  if (primary instanceof HTMLElement) {
    return primary;
  }

  const dialogs = document.querySelectorAll("[role='dialog']");
  for (const dialog of dialogs) {
    if (!(dialog instanceof HTMLElement)) {
      continue;
    }
    if (dialog.querySelector("#channel-points-reward-center-body")) {
      return dialog;
    }
  }

  return null;
}

async function closeRewardCenterDialog() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const dialog = findRewardCenterDialog();
    if (!dialog) {
      return true;
    }

    const closeButton = findRewardCenterCloseButton(dialog);
    if (closeButton) {
      closeButton.click();
      await wait(WATCH_STREAK_MENU_TOGGLE_DELAY_MS);
      if (!findRewardCenterDialog()) {
        return true;
      }
    }
  }

  return !findRewardCenterDialog();
}

function findRewardCenterCloseButton(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return null;
  }

  const candidates = [...dialog.querySelectorAll("button")]
    .filter((button) => button instanceof HTMLButtonElement);
  for (const button of candidates) {
    const ariaLabel = String(button.getAttribute("aria-label") || "").toLowerCase();
    const dataTarget = String(button.getAttribute("data-a-target") || "").toLowerCase();
    if (
      ariaLabel.includes("close")
      || ariaLabel.includes("schlie")
      || dataTarget.includes("close")
    ) {
      return button;
    }
  }

  return null;
}

function extractWatchStreakValueFromDialog(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return {
      value: null,
      source: "none",
      primaryValue: null,
      hadPrimaryContainer: false
    };
  }

  const primaryResult = tryPrimaryWatchStreakValue(dialog);

  if (Number.isInteger(primaryResult.value) && primaryResult.value >= 0) {
    return {
      value: primaryResult.value,
      source: "primary",
      primaryValue: primaryResult.value,
      hadPrimaryContainer: primaryResult.hadContainer
    };
  }

  return {
    value: null,
    source: "none",
    primaryValue: primaryResult.value,
    hadPrimaryContainer: primaryResult.hadContainer
  };
}

function tryPrimaryWatchStreakValue(dialog) {
  const badgeResult = extractWatchStreakValueFromFooterBadge(dialog);
  if (badgeResult.hadContainer && badgeResult.value !== null) {
    return badgeResult;
  }

  const container = findPrimaryWatchStreakContainer(dialog);
  if (!(container instanceof HTMLElement)) {
    return {
      value: null,
      hadContainer: badgeResult.hadContainer
    };
  }

  return {
    value: extractIntegerFromPreferredNodes(
      [...container.querySelectorAll("strong")]
        .filter((node) => node instanceof HTMLElement)
        .filter((node) => !isInsideExcludedStreakArea(node))
    ),
    hadContainer: true
  };
}

function extractWatchStreakValueFromFooterBadge(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return { value: null, hadContainer: false };
  }

  const controlledInputs = dialog.querySelectorAll("input[aria-controls='watch-streak-footer']");
  let hadContainer = false;

  for (const input of controlledInputs) {
    if (!(input instanceof HTMLInputElement) || !input.id) {
      continue;
    }

    const label = dialog.querySelector(`label[for='${CSS.escape(input.id)}']`);
    if (!(label instanceof HTMLElement)) {
      continue;
    }
    hadContainer = true;

    if (findWatchStreakIconAnchors(label).length === 0) {
      continue;
    }

    const strongNodes = [...label.querySelectorAll("strong")]
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => !isInsideExcludedStreakArea(node));
    const value = extractIntegerFromPreferredNodes(strongNodes);
    if (value !== null) {
      return { value, hadContainer: true };
    }
  }

  return { value: null, hadContainer };
}

function findPrimaryWatchStreakContainer(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return null;
  }

  const byId = dialog.querySelector("#watch-streak-footer");
  if (byId instanceof HTMLElement) {
    return byId;
  }

  const controller = dialog.querySelector("[aria-controls='watch-streak-footer']");
  if (controller instanceof HTMLElement) {
    const controlsId = controller.getAttribute("aria-controls");
    if (controlsId) {
      const target = dialog.querySelector(`#${CSS.escape(controlsId)}`);
      if (target instanceof HTMLElement) {
        return target;
      }
    }
  }

  return null;
}

function extractIntegerFromPreferredNodes(nodes) {
  for (const node of nodes) {
    const value = extractIntegerFromPreferredNode(node);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function extractIntegerFromPreferredNode(node) {
  if (!(node instanceof Element) || isInsideExcludedStreakArea(node)) {
    return null;
  }

  const text = String(node.textContent || "");
  const tokens = text.match(/\d[\d.,\s\u00a0\u202f]*/g);
  if (!tokens) {
    return null;
  }

  for (const token of tokens) {
    const parsed = parseStrictIntegerToken(token);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function parseStrictIntegerToken(token) {
  const raw = String(token || "").trim();
  if (!raw) {
    return null;
  }

  const normalizedSpaces = raw.replace(/[\u00a0\u202f]/g, " ").trim();
  const strictGroupedInteger = /^\d{1,3}([., ]\d{3})*$/;
  if (!strictGroupedInteger.test(normalizedSpaces) && !/^\d+$/.test(normalizedSpaces)) {
    return null;
  }

  const digitsOnly = normalizedSpaces.replace(/[., ]/g, "");
  if (!/^\d+$/.test(digitsOnly)) {
    return null;
  }

  const value = Number.parseInt(digitsOnly, 10);
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function isInsideExcludedStreakArea(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  return Boolean(
    node.closest(
      "[data-test-selector='cost'], .reward-icon__cost,"
      + " [data-test-selector='copo-balance-string'], [data-test-selector='bits-balance-string'],"
      + " [data-test-selector='community-points-summary'], em"
    )
  );
}

async function waitForResult(readValue, timeoutMs) {
  const timeout = Math.max(0, Math.floor(Number(timeoutMs) || 0));
  const readCurrentValue = () => {
    try {
      return readValue();
    } catch (_error) {
      return null;
    }
  };

  const immediate = readCurrentValue();
  if (immediate) {
    return immediate;
  }

  if (
    timeout <= 0 ||
    typeof MutationObserver === "undefined" ||
    !(document.documentElement instanceof Element)
  ) {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    let observer = null;

    const finalize = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (observer) {
        observer.disconnect();
      }
      window.clearTimeout(timeoutId);
      window.clearInterval(pollIntervalId);
      resolve(value);
    };

    const tryResolve = () => {
      const candidate = readCurrentValue();
      if (candidate) {
        finalize(candidate);
      }
    };

    const timeoutId = window.setTimeout(() => {
      finalize(null);
    }, timeout);

    const pollIntervalId = window.setInterval(() => {
      tryResolve();
    }, WATCH_STREAK_WAIT_POLL_MS);

    try {
      observer = new MutationObserver(() => {
        tryResolve();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (_error) {
      // Polling fallback stays active when observer setup fails.
    }
  });
}
