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
      bitsCount: diagnostics.bitsCount,
      pointsButtonsCount: diagnostics.pointsButtonsCount
    });
    return;
  }
  const summaryToggleButton = summaryData.button;

  streakProbeInFlight = true;

  let streakValue = null;
  const wasOpenBefore = Boolean(findRewardCenterDialog());
  let hadDialog = false;
  let hadLegacyCard = false;
  let hadPrimaryContainer = false;
  let parserSource = "none";
  let primaryValue = null;
  let fallbackValue = null;

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
          if (result.hadPrimaryContainer || result.hadLegacyCard) {
            return result;
          }
          return null;
        },
        WATCH_STREAK_CARD_WAIT_TIMEOUT_MS
      )
      : null;
    streakValue = parserResult?.value ?? null;
    hadLegacyCard = Boolean(parserResult?.hadLegacyCard);
    hadPrimaryContainer = Boolean(parserResult?.hadPrimaryContainer);
    parserSource = parserResult?.source || "none";
    primaryValue = parserResult?.primaryValue ?? null;
    fallbackValue = parserResult?.fallbackValue ?? null;
  } finally {
    const closed = await closeRewardCenterDialog();
    if (!closed) {
      await sendStreakProbeLog(channel, "summary-close-failed");
    }
    streakProbeInFlight = false;
  }

  if (
    Number.isInteger(primaryValue)
    && primaryValue >= 0
    && Number.isInteger(fallbackValue)
    && fallbackValue >= 0
    && primaryValue !== fallbackValue
  ) {
    await sendStreakProbeLog(channel, "streak-parser-conflict", {
      primaryValue,
      fallbackValue
    });
  }

  if (!Number.isInteger(streakValue) || streakValue < 0) {
    console.warn(
      TAB_LOG_PREFIX,
      "streak could not be found",
      { channel, wasOpenBefore, hadDialog, hadLegacyCard, hadPrimaryContainer }
    );
    await sendStreakProbeLog(channel, "streak-no-valid-candidate", {
      hadPrimaryContainer,
      hadLegacyCard,
      primaryValue,
      fallbackValue
    });
    await sendStreakProbeLog(channel, "streak-could-not-be-found", {
      wasOpenBefore,
      hadDialog,
      hadLegacyCard,
      hadPrimaryContainer
    });
    return;
  }

  if (parserSource === "primary") {
    await sendStreakProbeLog(channel, "streak-primary-used", {
      value: streakValue,
      fallbackValue
    });
  } else if (parserSource === "fallback") {
    await sendStreakProbeLog(channel, "streak-fallback-used", {
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
  const roots = [];
  if (summary instanceof HTMLElement) {
    roots.push(summary);
  }
  roots.push(document);

  for (const root of roots) {
    const byCopoBalance = root.querySelector("[data-test-selector='copo-balance-string']");
    const copoButton = byCopoBalance?.closest("button");
    if (copoButton instanceof HTMLButtonElement) {
      return copoButton;
    }

    const byBitsBalance = root.querySelector("[data-test-selector='bits-balance-string']");
    const bitsButton = byBitsBalance?.closest("button");
    if (bitsButton instanceof HTMLButtonElement) {
      return bitsButton;
    }

    const pointsAriaButtons = [...root.querySelectorAll("button")]
      .filter((button) => button instanceof HTMLButtonElement)
      .filter((button) => /points/i.test(String(button.getAttribute("aria-label") || "")));

    const enabledPointsButton = pointsAriaButtons.find((button) => !button.disabled);
    if (enabledPointsButton) {
      return enabledPointsButton;
    }

    if (pointsAriaButtons.length > 0) {
      return pointsAriaButtons[0];
    }
  }

  return null;
}

function getSummaryToggleDiagnostics() {
  const summaries = document.querySelectorAll("[data-test-selector='community-points-summary']");
  const copo = document.querySelectorAll("[data-test-selector='copo-balance-string']");
  const bits = document.querySelectorAll("[data-test-selector='bits-balance-string']");
  const pointsButtons = [...document.querySelectorAll("button")]
    .filter((button) => button instanceof HTMLButtonElement)
    .filter((button) => /points/i.test(String(button.getAttribute("aria-label") || "")));

  return {
    summaryCount: summaries.length,
    copoCount: copo.length,
    bitsCount: bits.length,
    pointsButtonsCount: pointsButtons.length
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

function findWatchStreakCard(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return null;
  }

  const iconAnchors = findWatchStreakIconAnchors(dialog);
  for (const iconAnchor of iconAnchors) {
    const card = findClosestWatchStreakCard(iconAnchor, true);
    if (card) {
      return card;
    }
  }

  const progressBars = dialog.querySelectorAll("[role='progressbar'][aria-valuemin][aria-valuemax]");
  for (const progressBar of progressBars) {
    const card = findClosestWatchStreakCard(progressBar, false);
    if (card) {
      return card;
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
      fallbackValue: null,
      hadPrimaryContainer: false,
      hadLegacyCard: false
    };
  }

  const primaryResult = tryPrimaryWatchStreakValue(dialog);
  const fallbackResult = tryLegacyWatchStreakValue(dialog);

  if (Number.isInteger(primaryResult.value) && primaryResult.value >= 0) {
    return {
      value: primaryResult.value,
      source: "primary",
      primaryValue: primaryResult.value,
      fallbackValue: fallbackResult.value,
      hadPrimaryContainer: primaryResult.hadContainer,
      hadLegacyCard: fallbackResult.hadCard
    };
  }

  if (Number.isInteger(fallbackResult.value) && fallbackResult.value >= 0) {
    return {
      value: fallbackResult.value,
      source: "fallback",
      primaryValue: primaryResult.value,
      fallbackValue: fallbackResult.value,
      hadPrimaryContainer: primaryResult.hadContainer,
      hadLegacyCard: fallbackResult.hadCard
    };
  }

  return {
    value: null,
    source: "none",
    primaryValue: primaryResult.value,
    fallbackValue: fallbackResult.value,
    hadPrimaryContainer: primaryResult.hadContainer,
    hadLegacyCard: fallbackResult.hadCard
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

  const iconAnchors = findWatchStreakIconAnchors(container)
    .filter((anchor) => !isInsideExcludedStreakArea(anchor));
  for (const iconAnchor of iconAnchors) {
    const strongNodes = findPreferredStreakNodesNearIcon(iconAnchor, container, "strong");
    const strongValue = extractIntegerFromPreferredNodes(strongNodes);
    if (strongValue !== null) {
      return { value: strongValue, hadContainer: true };
    }
  }

  return { value: null, hadContainer: true };
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

  const controlledInputs = dialog.querySelectorAll("input[aria-controls]");
  for (const input of controlledInputs) {
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }
    if (!input.id) {
      continue;
    }
    const label = dialog.querySelector(`label[for='${CSS.escape(input.id)}']`);
    if (!(label instanceof HTMLElement)) {
      continue;
    }
    if (findWatchStreakIconAnchors(label).length === 0) {
      continue;
    }
    if (extractIntegerFromPreferredRegion(label) !== null) {
      return label;
    }
  }

  const labels = dialog.querySelectorAll("label");
  for (const label of labels) {
    if (!(label instanceof HTMLElement)) {
      continue;
    }
    if (findWatchStreakIconAnchors(label).length === 0) {
      continue;
    }
    if (extractIntegerFromPreferredRegion(label) !== null) {
      return label;
    }
  }

  const iconFallbackContainer = findPrimaryWatchStreakContainerByIcon(dialog);
  if (iconFallbackContainer) {
    return iconFallbackContainer;
  }

  return null;
}

function findPrimaryWatchStreakContainerByIcon(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return null;
  }

  const iconAnchors = findWatchStreakIconAnchors(dialog)
    .filter((anchor) => !isInsideExcludedStreakArea(anchor));
  for (const iconAnchor of iconAnchors) {
    let cursor = iconAnchor.parentElement;
    let depth = 0;

    while (cursor && cursor !== dialog && depth < 6) {
      if (
        cursor instanceof HTMLElement
        && !isInsideExcludedStreakArea(cursor)
        && extractIntegerFromPreferredRegion(cursor) !== null
      ) {
        return cursor;
      }
      cursor = cursor.parentElement;
      depth += 1;
    }
  }

  return null;
}

function findWatchStreakIconAnchors(root) {
  const normalizedFragment = normalizePathData(WATCH_STREAK_ICON_PATH_FRAGMENT);
  const anchors = [];
  const paths = root.querySelectorAll("svg path[d]");

  for (const path of paths) {
    if (!(path instanceof SVGPathElement)) {
      continue;
    }

    const pathData = normalizePathData(path.getAttribute("d"));
    if (pathData && pathData.includes(normalizedFragment)) {
      anchors.push(path);
    }
  }

  return anchors;
}

function findClosestWatchStreakCard(anchor, requireIconAnchor) {
  let current = anchor instanceof Element ? anchor.parentElement : null;

  while (current && current !== document.body) {
    const hasProgressBar = Boolean(
      current.querySelector("[role='progressbar'][aria-valuemin][aria-valuemax]")
    );
    const hasChevronButton = hasWatchStreakChevronButton(current);
    const hasIconAnchor = !requireIconAnchor || findWatchStreakIconAnchors(current).length > 0;

    if (hasProgressBar && hasChevronButton && hasIconAnchor) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function hasWatchStreakChevronButton(root) {
  const normalizedFragment = normalizePathData(WATCH_STREAK_CHEVRON_PATH_FRAGMENT);
  const buttons = root.querySelectorAll("button");

  for (const button of buttons) {
    if (!(button instanceof HTMLButtonElement)) {
      continue;
    }

    const paths = button.querySelectorAll("svg path[d]");
    for (const path of paths) {
      if (!(path instanceof SVGPathElement)) {
        continue;
      }

      const pathData = normalizePathData(path.getAttribute("d"));
      if (pathData && pathData.includes(normalizedFragment)) {
        return true;
      }
    }
  }

  return false;
}

function tryLegacyWatchStreakValue(dialog) {
  const card = findWatchStreakCard(dialog);
  if (!(card instanceof HTMLElement)) {
    return { value: null, hadCard: false };
  }

  return {
    value: extractWatchStreakValueFromLegacyCard(card),
    hadCard: true
  };
}

function extractWatchStreakValueFromLegacyCard(card) {
  if (!(card instanceof HTMLElement)) {
    return null;
  }

  const directCardValue = extractIntegerFromPreferredRegion(card);
  if (directCardValue !== null) {
    return directCardValue;
  }

  const progressBar = card.querySelector("[role='progressbar'][aria-valuemin][aria-valuemax]");
  const headerRegion = progressBar instanceof Element
    ? progressBar.closest("div")?.previousElementSibling
    : null;
  if (headerRegion instanceof HTMLElement) {
    const headerValue = extractIntegerFromPreferredRegion(headerRegion);
    if (headerValue !== null) {
      return headerValue;
    }
  }

  return null;
}

function extractIntegerFromPreferredRegion(region) {
  if (!(region instanceof HTMLElement) || isInsideExcludedStreakArea(region)) {
    return null;
  }

  const strongNodes = [...region.querySelectorAll("strong")]
    .filter((node) => node instanceof HTMLElement)
    .filter((node) => !isInsideExcludedStreakArea(node));
  const strongValue = extractIntegerFromPreferredNodes(strongNodes);
  if (strongValue !== null) {
    return strongValue;
  }

  const textNodes = [...region.querySelectorAll("p, span")]
    .filter((node) => node instanceof HTMLElement)
    .filter((node) => !isInsideExcludedStreakArea(node))
    .filter((node) => !node.closest("em"));
  return extractIntegerFromPreferredNodes(textNodes);
}

function findPreferredStreakNodesNearIcon(iconAnchor, boundary, type) {
  const nodes = [];
  let cursor = iconAnchor instanceof Element ? iconAnchor.parentElement : null;
  let depth = 0;

  while (cursor && cursor !== boundary.parentElement && depth < 8) {
    if (cursor instanceof HTMLElement && !isInsideExcludedStreakArea(cursor)) {
      if (type === "strong") {
        const strongs = [...cursor.querySelectorAll("strong")]
          .filter((node) => node instanceof HTMLElement)
          .filter((node) => !isInsideExcludedStreakArea(node));
        nodes.push(...strongs);
      } else {
        const textNodes = [...cursor.querySelectorAll("p, span")]
          .filter((node) => node instanceof HTMLElement)
          .filter((node) => !isInsideExcludedStreakArea(node))
          .filter((node) => !node.closest("em"));
        nodes.push(...textNodes);
      }
    }

    if (cursor === boundary) {
      break;
    }

    cursor = cursor.parentElement;
    depth += 1;
  }

  return dedupeElementNodes(nodes);
}

function dedupeElementNodes(nodes) {
  const unique = [];
  const seen = new Set();
  for (const node of nodes) {
    if (!(node instanceof Element)) {
      continue;
    }
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    unique.push(node);
  }
  return unique;
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

function normalizePathData(pathData) {
  return String(pathData || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
