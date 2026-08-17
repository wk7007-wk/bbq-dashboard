(function (global) {
  const core = global.ChickenTimerCore;
  const bridgeFactory = global.ChickenTimerBridge;
  const splitFactory = global.ChickenTimerSplitAssist;
  const syncFactory = global.ChickenTimerSync;
  const boardEl = document.getElementById("board");
  const boardInfoRecentEl = document.getElementById("boardInfoRecent");
  const boardInfoStatusEl = document.getElementById("boardInfoStatus");
  const boardInfoNextEl = document.getElementById("boardInfoNext");

  if (!core || !bridgeFactory || !boardEl) return;

  const params = new URLSearchParams(global.location.search || "");
  const profile = params.get("profile") || "";
  const source = params.get("source") || "";
  const syncChannel = syncFactory
    ? syncFactory.createChannel({
      location: global.location,
      profile,
      search: global.location.search || "",
      storage: global.localStorage,
    })
    : null;
  const store = core.createStore({
    storage: global.localStorage,
    now: getNow,
  });
  const splitStore = splitFactory
    ? splitFactory.createStore({ storage: global.localStorage, now: getNow })
    : null;
  const bridge = bridgeFactory.createBridge(global);
  const slotViews = new Map();
  const PRESS_GUARD_MS = 700;
  const RESTART_AFTER_CLEAR_GUARD_MS = 1200;
  const READOUT_AFTER_START_GUARD_MS = 900;
  const TIMER_FAMILY_BY_PRESET = {
    "7": "seven",
    "10": "ten",
    "13": "thirteen",
  };
  const TIMER_FAMILY_BY_DURATION = {
    420: "seven",
    600: "ten",
    780: "thirteen",
  };
  const ZONE_DEFS = [
    { id: "fryer-3", label: "튀김3", shortLabel: "F3", accent: "fryer-a", slotIds: ["slot-1", "slot-2", "slot-3"] },
    { id: "fryer-2", label: "튀김2", shortLabel: "F2", accent: "fryer-b", slotIds: ["slot-4", "slot-5"] },
    { id: "oven", label: "오븐", shortLabel: "OV", accent: "oven", slotIds: ["slot-6"] },
  ];
  const DISPLAY_PROFILE_SPECS = [
    { name: "primary-phone", targetLabel: "Samsung Galaxy Note9", shortSide: 393, longSide: 852, shortTolerance: 24, longTolerance: 40 },
    { name: "primary-tablet", targetLabel: "Samsung Galaxy Tab A 8.0 (2019)", shortSide: 800, longSide: 1280, shortTolerance: 48, longTolerance: 64 },
    { name: "primary-subnotebook", targetLabel: "서브 노트북 1085x1885", shortSide: 1085, longSide: 1885, shortTolerance: 48, longTolerance: 80 },
  ];
  const READOUT_MIN_FONT_PX = 30;
  const READOUT_MAX_FONT_PX = 132;
  // The counter is a component with three stable geometry contracts.  CSS
  // consumes these tokens; JS selects one only when the visible state or
  // viewport changes.  Do not derive them from a ticking value.
  const READOUT_PROFILES = {
    "wide-primary": { fontPx: 56, lanePx: 80, mode: "one-line" },
    "compact-primary": { fontPx: 30, lanePx: 48, mode: "one-line" },
    "compact-add": { fontPx: 30, lanePx: 40, mode: "one-line" },
    "wide-add": { fontPx: 56, lanePx: 72, mode: "one-line" },
    "wide-split": { fontPx: 56, lanePx: 72, mode: "two-line" },
    split: { fontPx: 30, lanePx: 40, mode: "one-line" },
  };
  // The operating gauge is deliberately normalized to the user's explicit
  // five-minute maximum.  This is independent of the preset list: a 7/10/13
  // minute timer may overflow the gauge, while five minutes is always 100%.
  const HOURGLASS_ABSOLUTE_MAX_SECONDS = 5 * 60;
  const NATIVE_MOTION_REPORT_INTERVAL_MS = 60 * 1000;
  const RECOVERY_STATE_KEY = "chicken-timer-board-recovery-v1";
  const RECOVERY_HISTORY_KEY = "chicken-timer-board-recovery-history-v1";
  const RECOVERY_EVENTS_KEY = "chicken-timer-board-recovery-events-v1";
  const RECOVERY_EMPTY_MARKER_KEY = "chicken-timer-board-intentional-empty-v1";
  const RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const RECOVERY_TARGET_AGE_MS = 60 * 1000;
  const RECOVERY_HISTORY_INTERVAL_MS = 10 * 1000;
  const RECOVERY_HISTORY_LIMIT = 90;
  const SLOT_DRAG_THRESHOLD_PX = 10;
  const SWAP_CONFIRM_MS = 950;
  const SWAP_UNDO_MS = 3000;
  const CLOCK_READY_START_TIMEOUT_MS = 1200;
  const SPLIT_COMPLETED_VISIBLE_MS = 8000;
  const COMPLETION_IMPACT_MAX_AGE_MS = 2500;
  const COMPLETION_IMPACT_DURATION_MS = 760;
  const WATCHDOG_INTERVAL_MS = 250;
  const VISUAL_REFRESH_INTERVAL_MS = 1000;
  let suppressClickUntil = 0;
  let suppressDragPressUntil = 0;
  let applyingRemoteSync = false;
  let wakeLock = null;
  let latestFinishRanks = new Map();
  let latestSyncStatus = { state: "syncing", label: "보정중" };
  let readoutFitFrame = 0;
  let lastUsefulBoardState = null;
  let lastAuditBoardState = null;
  let lastNativeActiveState = null;
  let lastNativeMotionState = null;
  let lastNativeMotionReportAt = 0;
  let lastRecoveryHistoryAt = 0;
  let lastVisualRefreshMonoMs = 0;
  const runtimeStats = {
    watchdogTicks: 0,
    visualRefreshes: 0,
    readoutFitPasses: 0,
    readoutFitCacheHits: 0,
    readoutFitBinaryIterations: 0,
    readoutFitClipChecks: 0,
  };
  let lastRecoveryHistorySignature = "";
  let recoveryButton = null;
  let syncStatusEl = null;
  let boardUtilityRail = null;
  let swapStatusEl = null;
  let swapConfirmTimerId = 0;
  let swapConfirmClearTimerId = 0;
  let swapConfirmToken = 0;
  let swapUndoTimerId = 0;
  let pendingSwapUndo = null;
  let pendingSwapUndoSlotIds = [];
  let pendingClockActions = [];
  let clockReadyPromise = null;
  let usingOfflineClockFallback = false;
  let restartBlockedUntilBySlot = new Map();
  let readoutToggleBlockedUntilBySlot = new Map();
  let activeSlotDrag = null;
  let slotDragFrameId = 0;
  let latestDisplayProfile = {
    name: "fallback-responsive",
    width: 0,
    height: 0,
    dpr: 1,
    orientation: "unknown",
  };

  if (profile) {
    document.body.dataset.profile = profile;
  }
  if (source) {
    document.body.dataset.source = source;
  }
  syncViewportSize();

  restoreBoardFromRecoveryIfNeeded("startup");
  buildBoard();
  buildRecoveryButton();
  buildSyncStatus();
  refreshAll();
  refreshWakeLock();
  reportNativeBoardMotion(true);
  lastAuditBoardState = cloneBoardState(buildBoardState());

  store.subscribe((snapshot, meta) => {
    const reason = meta ? meta.reason : "local";
    const previousBoardState = cloneBoardState(lastAuditBoardState);
    refreshAll();
    const nextBoardState = buildBoardState();
    if (!applyingRemoteSync && autoRecoverUnsafeBlank(reason, nextBoardState)) {
      return;
    }
    persistBoardRecovery(reason, nextBoardState);
    if (!applyingRemoteSync) {
      publishBoardState(reason, {
        previous: summarizeBoardForAudit(previousBoardState),
        slotIds: meta && Array.isArray(meta.slotIds) ? meta.slotIds.slice() : [],
      });
    }
    lastAuditBoardState = cloneBoardState(nextBoardState);
  });

  if (syncChannel) {
    syncChannel.connect({
      getLocalState: getStateForSyncBootstrap,
      applyRemoteState: applyRemoteBoardState,
      onStatus: updateSyncStatus,
      onUiRefresh: handleGrokRemoteRefresh,
    });
  } else {
    updateSyncStatus({ state: "offline", label: "오프라인" });
  }

  global.addEventListener("focus", () => {
    invalidateReadoutFitCache();
    refreshAll();
    requestReadoutFit();
    refreshWakeLock();
  });
  global.addEventListener("orientationchange", () => {
    syncViewportSize();
    refreshAll();
    requestReadoutFit();
    [80, 240, 600].forEach((delayMs) => {
      global.setTimeout(() => {
        syncViewportSize();
        requestReadoutFit();
      }, delayMs);
    });
  });
  global.addEventListener("resize", () => {
    syncViewportSize();
    requestReadoutFit();
  });
  if (global.visualViewport && typeof global.visualViewport.addEventListener === "function") {
    global.visualViewport.addEventListener("resize", () => {
      syncViewportSize();
      requestReadoutFit();
    });
  }
  if (document && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      refreshWakeLock();
      if (document.visibilityState === "visible") {
        invalidateReadoutFitCache();
        requestReadoutFit();
      }
    });
  }
  if (document && document.fonts) {
    const refreshAfterFonts = () => {
      invalidateReadoutFitCache();
      requestReadoutFit();
    };
    if (typeof document.fonts.addEventListener === "function") {
      document.fonts.addEventListener("loadingdone", refreshAfterFonts);
    }
    if (document.fonts.ready && typeof document.fonts.ready.then === "function") {
      document.fonts.ready.then(refreshAfterFonts, () => {});
    }
  }
  if (syncChannel && typeof global.addEventListener === "function") {
    global.addEventListener("beforeunload", () => {
      syncChannel.close();
    });
  }

  global.setInterval(() => {
    runtimeStats.watchdogTicks += 1;
    const previousTickBoardState = lastAuditBoardState || buildBoardState();
    const splitProtectedMainExpirations = findSplitProtectedMainExpirations();
    const timerResult = store.tick();
    restoreSplitProtectedMainExpirations(splitProtectedMainExpirations);
    const splitResult = splitStore ? splitStore.tick() : { changed: false, alertCount: 0 };
    const splitCleanupResult = cleanupCompletedSplitTimers();
    const stateChanged = timerResult.changed || splitResult.changed || splitCleanupResult.changed;
    const visualNow = global.performance && typeof global.performance.now === "function"
      ? global.performance.now()
      : Date.now();
    const visualRefreshDue = lastVisualRefreshMonoMs <= 0
      || visualNow - lastVisualRefreshMonoMs >= VISUAL_REFRESH_INTERVAL_MS;
    let currentBoardState = null;
    if (stateChanged || visualRefreshDue) {
      lastVisualRefreshMonoMs = visualNow;
      runtimeStats.visualRefreshes += 1;
      if (splitCleanupResult.changed) {
        refreshAll();
      } else {
        refreshRunningReadouts();
        refreshSplitReadouts();
        refreshIdleCompletedNotes();
      }
      refreshBoardInfo();
      reportNativeBoardMotion(false);
      currentBoardState = buildBoardState();
      persistRecoveryHistory("watchdog", currentBoardState);
      if (autoRecoverUnsafeBlank("watchdog", currentBoardState)) {
        return;
      }
    }
    if (stateChanged) {
      currentBoardState = currentBoardState || buildBoardState();
      persistBoardRecovery("tick", currentBoardState);
      const tickSlotIds = []
        .concat(Array.isArray(timerResult.slotIds) ? timerResult.slotIds : [])
        .concat(Array.isArray(splitResult.slotIds) ? splitResult.slotIds : [])
        .concat(Array.isArray(splitCleanupResult.slotIds) ? splitCleanupResult.slotIds : []);
      publishBoardState("tick", {
        previous: summarizeBoardForAudit(previousTickBoardState),
        slotIds: Array.from(new Set(tickSlotIds)),
      });
      lastAuditBoardState = cloneBoardState(currentBoardState);
    }
    const realMainAlert = Array.isArray(timerResult.slotIds)
      && timerResult.slotIds.some((slotId) => !isTestSlot(getMainSlot(slotId)));
    const totalAlerts = (realMainAlert ? timerResult.alertCount : 0) + splitResult.alertCount;
    if (totalAlerts > 0) {
      bridge.playAlert();
    }
  }, WATCHDOG_INTERVAL_MS);

  global.ChickenTimerBoardApp = {
    getSnapshot: () => store.getSnapshot(),
    getSlotView: (slotId) => slotViews.get(slotId) || null,
    getSplitEntries: (slotId) => (splitStore ? splitStore.getEntries(slotId) : []),
    getBoardState: buildBoardState,
    getRecoveryInfo: readRecoveryEnvelope,
    getSyncStatus: () => Object.assign({}, latestSyncStatus),
    getClockState,
    getRuntimeStats: () => Object.assign({}, runtimeStats),
    getDisplayProfile: () => Object.assign({}, latestDisplayProfile),
    getSplitCleanupDelayMs: () => SPLIT_COMPLETED_VISIBLE_MS,
    restoreLastUsefulBoard,
    restoreOneMinuteBoard,
    getSyncKey: () => (syncChannel ? syncChannel.getSyncKey() : ""),
    applyRemoteBoardState,
    startSlot: startMainTimer,
    pauseSlot: (slotId) => triggerChange(() => store.pause(slotId)),
    resumeSlot: (slotId) => triggerClockedChange(() => store.resume(slotId), `resume:${slotId}`),
    adjustSlot: (slotId, deltaSeconds) => triggerClockedChange(() => store.adjust(slotId, deltaSeconds), `adjust:${slotId}`),
    addTimeSlot: (slotId, deltaMs) => triggerClockedChange(() => store.addTime(slotId, deltaMs), `add-time:${slotId}`),
    clearSlot: clearMainTimer,
    forceTestSlot,
    swapSlots: performSlotSwap,
    getActiveSlotDrag: () => getActiveSlotDragSummary(),
    refreshAll,
    refreshRunningReadouts,
  };

  function syncViewportSize() {
    syncDisplayProfile();
    const viewport = global.visualViewport || null;
    const height = Math.max(0, Math.round(Number((viewport && viewport.height) || global.innerHeight || 0)));
    if (!height || !document || !document.documentElement) return;
    document.documentElement.style.setProperty("--app-vh", height + "px");
  }

  function syncDisplayProfile() {
    latestDisplayProfile = detectDisplayProfile();
    if (document && document.body && document.body.dataset) {
      document.body.dataset.displayProfile = latestDisplayProfile.name;
    }
  }

  function detectDisplayProfile() {
    const candidates = [];
    const appendCandidate = (widthValue, heightValue) => {
      const width = Number(widthValue) || 0;
      const height = Number(heightValue) || 0;
      if (width <= 0 || height <= 0) return;
      if (candidates.some((candidate) => candidate.width === width && candidate.height === height)) return;
      candidates.push({ width, height });
    };
    const visualViewport = global.visualViewport || null;
    appendCandidate(visualViewport && visualViewport.width, visualViewport && visualViewport.height);
    appendCandidate(global.innerWidth, global.innerHeight);

    let bestMatch = null;
    candidates.forEach((candidate) => {
      const shortSide = Math.min(candidate.width, candidate.height);
      const longSide = Math.max(candidate.width, candidate.height);
      DISPLAY_PROFILE_SPECS.forEach((spec) => {
        const shortDelta = Math.abs(shortSide - spec.shortSide);
        const longDelta = Math.abs(longSide - spec.longSide);
        if (shortDelta > spec.shortTolerance || longDelta > spec.longTolerance) return;
        const score = shortDelta / spec.shortTolerance + longDelta / spec.longTolerance;
        if (!bestMatch || score < bestMatch.score) {
          bestMatch = { name: spec.name, candidate, score };
        }
      });
    });

    const selected = bestMatch ? bestMatch.candidate : (candidates[0] || { width: 0, height: 0 });
    const width = Math.max(0, Math.round(selected.width));
    const height = Math.max(0, Math.round(selected.height));
    const rawDpr = Number(global.devicePixelRatio) || 1;
    const dpr = rawDpr > 0 && Number.isFinite(rawDpr) ? Math.round(rawDpr * 100) / 100 : 1;
    return {
      name: bestMatch ? bestMatch.name : "fallback-responsive",
      width,
      height,
      dpr,
      orientation: width === height ? "square" : (width > height ? "landscape" : (height > width ? "portrait" : "unknown")),
    };
  }

  global.__chickenTimerSyncViewport = syncViewportSize;

  function getNow() {
    return syncChannel ? syncChannel.getNow() : Date.now();
  }

  function getClockState() {
    if (syncChannel && typeof syncChannel.getClockState === "function") {
      return syncChannel.getClockState();
    }
    return { state: "offline", label: "오프라인", source: "none", fresh: false, hasOffset: false };
  }

  function shouldWaitForServerClock() {
    const clockState = getClockState();
    return Boolean(
      syncChannel &&
      typeof syncChannel.ensureClockReady === "function" &&
      clockState &&
      clockState.source === "firebase" &&
      (clockState.hasOffset !== true || (clockState.state === "correcting" && clockState.fresh !== true))
    );
  }

  function runWithServerClock(action, key) {
    if (!shouldWaitForServerClock()) {
      return action();
    }
    const actionKey = key ? String(key) : "";
    if (actionKey) {
      pendingClockActions = pendingClockActions.filter((entry) => entry.key !== actionKey);
    }
    pendingClockActions.push({ key: actionKey, action });
    updateSyncStatus(Object.assign({}, latestSyncStatus, {
      state: "syncing",
      label: "보정중",
      detail: "서버시간 확인",
    }));
    if (!clockReadyPromise) {
      clockReadyPromise = syncChannel.ensureClockReady({ timeoutMs: CLOCK_READY_START_TIMEOUT_MS })
        .then((ready) => flushClockActions(ready === true), () => flushClockActions(false));
    }
    return false;
  }

  function flushClockActions(ready) {
    const actions = pendingClockActions.slice();
    pendingClockActions = [];
    clockReadyPromise = null;
    if (ready !== true && actions.length > 0) {
      usingOfflineClockFallback = true;
      updateSyncStatus({
        state: "offline",
        label: "오프라인",
        detail: "동기화 대기",
        pendingCount: actions.length,
      });
    }
    actions.forEach((entry) => {
      if (!entry || typeof entry.action !== "function") return;
      entry.action();
    });
    return actions.length > 0;
  }

  function getRecoveryCandidate() {
    const memoryBoard = cloneBoardState(lastUsefulBoardState);
    if (memoryBoard && isRecoverableBoardState(memoryBoard)) {
      return { board: memoryBoard, savedAt: 0, source: "memory" };
    }
    const envelope = readRecoveryEnvelope();
    if (envelope && envelope.board && isRecoverableBoardState(envelope.board)) {
      return { board: envelope.board, savedAt: envelope.savedAt, source: "storage" };
    }
    return null;
  }

  function getOneMinuteRecoveryCandidate() {
    const now = getNow();
    const targetAt = now - RECOVERY_TARGET_AGE_MS;
    const history = readRecoveryHistory()
      .filter((item) => item && item.board && isRecoverableBoardState(item.board))
      .filter((item) => now - item.savedAt <= RECOVERY_MAX_AGE_MS)
      .sort((left, right) => Math.abs(left.savedAt - targetAt) - Math.abs(right.savedAt - targetAt));
    if (history.length > 0) {
      return Object.assign({ source: "history" }, history[0]);
    }
    const fallback = getRecoveryCandidate();
    if (!fallback) return null;
    return Object.assign({ source: fallback.source || "latest" }, fallback);
  }

  function autoRecoverUnsafeBlank(reason, nextBoardState) {
    if (applyingRemoteSync || !isBoardBlank(nextBoardState)) return false;
    const candidate = getRecoveryCandidate();
    if (!candidate || !candidate.board) return false;
    const previousActive = countActiveBoardItems(candidate.board);
    if (previousActive <= 0) return false;
    const changeReason = reason ? String(reason) : "";
    if (changeReason === "clear" && previousActive <= 1) return false;
    const emptyMarker = readIntentionalEmptyMarker();
    if (emptyMarker && previousActive <= 1) return false;
    if (emptyMarker && candidate.savedAt > 0 && emptyMarker.markedAt >= candidate.savedAt && previousActive <= 1) return false;
    writeRecoveryEvent("auto-recover-blank", {
      reason: changeReason,
      source: candidate.source,
      previousActive,
      nextActive: countActiveBoardItems(nextBoardState),
    });
    return restoreBoardFromSnapshot(candidate.board, "auto-blank-recovery", { publish: true, savedAt: candidate.savedAt });
  }

  function restoreBoardFromRecoveryIfNeeded(reason) {
    const currentBoard = buildBoardState();
    if (!isBoardBlank(currentBoard)) {
      persistBoardRecovery("startup-current", currentBoard);
      return false;
    }
    const envelope = readRecoveryEnvelope();
    if (!envelope || !envelope.board || !isRecoverableBoardState(envelope.board)) return false;
    const currentAt = getNow();
    if (currentAt - envelope.savedAt > RECOVERY_MAX_AGE_MS) return false;
    const emptyMarker = readIntentionalEmptyMarker();
    if (emptyMarker && emptyMarker.markedAt >= envelope.savedAt) return false;
    return restoreBoardFromSnapshot(envelope.board, reason || "startup-recovery", { publish: !syncChannel, savedAt: envelope.savedAt });
  }

  function restoreLastUsefulBoard(reason) {
    const candidate = getRecoveryCandidate();
    if (!candidate || !candidate.board) return false;
    return restoreBoardFromSnapshot(candidate.board, reason || "manual-recovery", { publish: true, savedAt: candidate.savedAt });
  }

  function restoreOneMinuteBoard(reason) {
    const candidate = getOneMinuteRecoveryCandidate();
    if (!candidate || !candidate.board) return false;
    const savedAt = Math.max(0, Number(candidate.savedAt) || getNow() - RECOVERY_TARGET_AGE_MS);
    const rebased = rebaseBoardEndTimes(candidate.board, savedAt, getNow());
    if (!isRecoverableBoardState(rebased)) return false;
    const merged = mergeRecoveredBoard(buildBoardState(), rebased);
    return restoreBoardFromSnapshot(merged, reason || "manual-one-minute-recovery", {
      publish: true,
      savedAt,
      source: candidate.source || "",
    });
  }

  function buildRecoveryButton() {
    if (recoveryButton || !document || !document.body) return;
    recoveryButton = document.createElement("button");
    recoveryButton.type = "button";
    recoveryButton.className = "recovery-button";
    recoveryButton.textContent = "복구";
    if (typeof recoveryButton.setAttribute === "function") {
      recoveryButton.setAttribute("aria-label", "1분 전 타이머 보드 복구");
    } else {
      recoveryButton.ariaLabel = "1분 전 타이머 보드 복구";
    }
    bindPress(recoveryButton, () => {
      const restored = restoreOneMinuteBoard("manual-recovery-button");
      if (restored) {
        bridge.vibrateConfirm();
        flashRecoveryButton("완료");
        return;
      }
      writeRecoveryEvent("restore-unavailable", { reason: "button" });
      flashRecoveryButton("없음");
    });
    (boardUtilityRail || document.body).appendChild(recoveryButton);
  }

  function buildSyncStatus() {
    if (syncStatusEl || !document || !document.body) return;
    syncStatusEl = document.createElement("div");
    syncStatusEl.className = "sync-status";
    syncStatusEl.dataset.state = "syncing";
    syncStatusEl.textContent = "보정중";
    (boardUtilityRail || document.body).appendChild(syncStatusEl);
  }

  function updateSyncStatus(status) {
    const nextStatus = Object.assign({ state: "syncing", label: "보정중" }, status || {});
    if (nextStatus.state === "synced") {
      usingOfflineClockFallback = false;
    } else if (usingOfflineClockFallback && nextStatus.state !== "conflict") {
      nextStatus.state = "offline";
      nextStatus.label = "오프라인";
      nextStatus.detail = "동기화 대기";
    }
    latestSyncStatus = nextStatus;
    if (!syncStatusEl) buildSyncStatus();
    if (!syncStatusEl) return;
    const state = String(latestSyncStatus.state || "syncing");
    syncStatusEl.dataset.state = state;
    const pending = Math.max(0, Number(latestSyncStatus.pendingCount) || 0);
    const detail = latestSyncStatus.detail ? String(latestSyncStatus.detail) : "";
    let label = latestSyncStatus.label ? String(latestSyncStatus.label) : "보정중";
    if (pending > 0 && state !== "offline" && label.indexOf("보정중") < 0) label = "보정중";
    syncStatusEl.textContent = detail ? `${label} · ${detail}` : label;
    refreshBoardInfo();
  }

  function refreshBoardInfo(boardState) {
    if (!boardInfoRecentEl && !boardInfoStatusEl && !boardInfoNextEl) return;
    const mainSlots = boardState && boardState.main && Array.isArray(boardState.main.slots)
      ? boardState.main.slots
      : store.getSnapshot().slots;
    const splitSlots = boardState && boardState.split && boardState.split.slots && typeof boardState.split.slots === "object"
      ? boardState.split.slots
      : null;
    const activeEntries = [];
    const completionEntries = [];

    mainSlots.forEach((slot) => {
      if (!slot || !slot.id) return;
      if (slot.status === "running" || slot.status === "paused" || slot.status === "expired") {
        activeEntries.push({
          slotId: slot.id,
          label: getPhysicalSlotLabel(slot),
          kind: "main",
          status: slot.status,
          remainingSeconds: slot.status === "expired" ? 0 : store.getDisplaySeconds(slot),
        });
      }
      const completed = getCompletedRecordForSlot(slot);
      if (completed && getCompletedAt(completed) > 0) {
        completionEntries.push({ slotId: slot.id, label: getPhysicalSlotLabel(slot), record: completed });
      }

      const entries = splitSlots
        ? (Array.isArray(splitSlots[slot.id]) ? splitSlots[slot.id] : [])
        : (splitStore ? splitStore.getEntries(slot.id) : []);
      entries.forEach((entry) => {
        if (!entry) return;
        if (entry.status === "running" || entry.status === "paused" || entry.status === "expired") {
          activeEntries.push({
            slotId: slot.id,
            label: getPhysicalSlotLabel(slot) + " 보조",
            kind: "split",
            status: entry.status,
            remainingSeconds: entry.status === "expired" ? 0 : (splitStore ? splitStore.getDisplaySeconds(entry) : Math.max(0, Number(entry.remainingSeconds) || 0)),
          });
        }
        if (getCompletedAt(entry) > 0) {
          completionEntries.push({ slotId: slot.id, label: getPhysicalSlotLabel(slot) + " 보조", record: entry });
        }
      });
    });

    const running = activeEntries.filter((entry) => entry.status === "running");
    const runningMainCount = running.filter((entry) => entry.kind === "main").length;
    const runningSplitCount = running.filter((entry) => entry.kind === "split").length;
    const pausedCount = activeEntries.filter((entry) => entry.status === "paused").length;
    const expiredCount = activeEntries.filter((entry) => entry.status === "expired").length;
    const activeMainCount = mainSlots.filter((slot) => slot && slot.status !== "idle").length;
    const idleCount = Math.max(0, mainSlots.length - activeMainCount);
    if (boardInfoStatusEl) {
      const parts = [];
      if (runningMainCount > 0) parts.push(`진행${runningMainCount}`);
      if (runningSplitCount > 0) parts.push(`보조${runningSplitCount}`);
      if (pausedCount > 0) parts.push(`정지${pausedCount}`);
      if (expiredCount > 0) parts.push(`완료${expiredCount}`);
      if (idleCount > 0) parts.push(`대기${idleCount}`);
      boardInfoStatusEl.textContent = parts.join(" · ") || "대기 6";
      boardInfoStatusEl.dataset.syncState = String(latestSyncStatus.state || "syncing");
      boardInfoStatusEl.title = latestSyncStatus.label ? String(latestSyncStatus.label) : "";
    }

    completionEntries.sort((left, right) => getCompletedAt(right.record) - getCompletedAt(left.record));
    if (boardInfoRecentEl) {
      const latest = completionEntries[0] || null;
      boardInfoRecentEl.textContent = latest
        ? `${latest.label} · ${formatCompletedBaseLabel(latest.record)} · ${formatCompletedElapsedText(latest.record)}`
        : "완료 기록 없음";
    }

    running.sort((left, right) => {
      const diff = left.remainingSeconds - right.remainingSeconds;
      if (diff !== 0) return diff;
      return String(left.slotId).localeCompare(String(right.slotId));
    });
    if (boardInfoNextEl) {
      if (expiredCount > 0) {
        const completed = activeEntries.find((entry) => entry.status === "expired");
        boardInfoNextEl.textContent = `${completed ? completed.label : "완료"} 확인`;
      } else if (running.length > 0) {
        boardInfoNextEl.textContent = `${running[0].label} · ${core.formatDuration(running[0].remainingSeconds)}`;
      } else if (pausedCount > 0) {
        boardInfoNextEl.textContent = `정지 ${pausedCount}개 확인`;
      } else {
        boardInfoNextEl.textContent = "시간을 선택하세요";
      }
    }
  }

  function flashRecoveryButton(label) {
    if (!recoveryButton) return;
    recoveryButton.textContent = label;
    recoveryButton.dataset.flash = label === "완료" ? "ok" : "empty";
    global.setTimeout(() => {
      if (!recoveryButton) return;
      recoveryButton.textContent = "복구";
      delete recoveryButton.dataset.flash;
    }, 900);
  }

  function restoreBoardFromSnapshot(boardState, reason, options) {
    let board = cloneBoardState(boardState);
    if (!board || !isRecoverableBoardState(board)) return false;
    board = mergeBoardHistoryMetadata(buildBoardState(), board);
    applyingRemoteSync = true;
    try {
      store.replaceState(board.main, { notify: false, reason: "recovery" });
      if (splitStore) {
        splitStore.replaceState(board.split, { persist: true });
      }
    } finally {
      applyingRemoteSync = false;
    }
    refreshAll();
    persistBoardRecovery(reason || "recovery", board);
    writeRecoveryEvent("restore", {
      reason: String(reason || "recovery"),
      savedAt: options && options.savedAt ? options.savedAt : 0,
      source: options && options.source ? String(options.source) : "",
    });
    lastAuditBoardState = cloneBoardState(board);
    if (options && options.publish) publishBoardState(reason || "recover", {
      savedAt: options && options.savedAt ? options.savedAt : 0,
    });
    return true;
  }

  const UI_REFRESH_SEEN_KEY = "chicken-timer-ui-refresh-nonce";

  function handleGrokRemoteRefresh(signal) {
    const nonce = signal && signal.nonce ? String(signal.nonce) : "";
    if (!nonce) return;
    try {
      if (global.sessionStorage && global.sessionStorage.getItem(UI_REFRESH_SEEN_KEY) === nonce) return;
      if (global.sessionStorage) global.sessionStorage.setItem(UI_REFRESH_SEEN_KEY, nonce);
    } catch (_err) {}
    persistBoardRecovery("grok-remote-refresh", buildBoardState());
    const finish = () => {
      persistBoardRecovery("grok-remote-refresh", buildBoardState());
      if (global.location && typeof global.location.reload === "function") {
        global.location.reload();
      } else {
        refreshAll();
      }
    };
    if (syncChannel && typeof syncChannel.refreshFromRemote === "function") {
      Promise.resolve(syncChannel.refreshFromRemote()).then(finish, finish);
      return;
    }
    finish();
  }

  function persistBoardRecovery(reason, boardState) {
    const board = cloneBoardState(boardState || buildBoardState());
    if (!board) return false;
    if (isBoardBlank(board)) {
      if (reason === "clear" || reason === "remote-clear") {
        markIntentionalEmpty(reason);
      }
      return false;
    }
    if (!isUsefulBoardState(board)) return false;
    const envelope = {
      version: 1,
      savedAt: getNow(),
      reason: String(reason || "local"),
      board,
    };
    writeJsonStorage(RECOVERY_STATE_KEY, envelope);
    lastUsefulBoardState = cloneBoardState(board);
    persistRecoveryHistory(reason, board, envelope.savedAt);
    return true;
  }

  function persistRecoveryHistory(reason, boardState, savedAt) {
    const board = cloneBoardState(boardState || buildBoardState());
    if (!board || !isRecoverableBoardState(board)) return false;
    const now = Math.max(0, Number(savedAt) || getNow());
    const signature = recoveryHistorySignature(board);
    if (lastRecoveryHistoryAt > 0 && now - lastRecoveryHistoryAt < RECOVERY_HISTORY_INTERVAL_MS && signature === lastRecoveryHistorySignature) return false;
    const history = readRecoveryHistory();
    history.unshift({
      version: 1,
      savedAt: now,
      reason: String(reason || "history"),
      board,
    });
    lastRecoveryHistoryAt = now;
    lastRecoveryHistorySignature = signature;
    writeJsonStorage(RECOVERY_HISTORY_KEY, history
      .filter((item) => item && item.board && isRecoverableBoardState(item.board))
      .slice(0, RECOVERY_HISTORY_LIMIT));
    return true;
  }

  function readRecoveryHistory() {
    const raw = readJsonStorage(RECOVERY_HISTORY_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      if (!item || typeof item !== "object") return null;
      const savedAt = Math.max(0, Number(item.savedAt) || 0);
      if (savedAt <= 0) return null;
      return {
        version: Math.max(1, Number(item.version) || 1),
        savedAt,
        reason: item.reason ? String(item.reason) : "",
        board: cloneBoardState(item.board),
      };
    }).filter(Boolean);
  }

  function isRemoteFullResetUnsafe(previousBoardState, nextBoardState, meta) {
    const previousActive = countActiveBoardItems(previousBoardState);
    const nextActive = countActiveBoardItems(nextBoardState);
    if (previousActive <= 0) return false;
    const reason = meta && meta.reason ? String(meta.reason) : "";
    if (isBoardBlank(nextBoardState) && reason !== "clear") return true;
    if (isBoardBlank(nextBoardState) && previousActive > 1) return true;
    if (reason === "clear" && previousActive - nextActive > 1) return true;
    return false;
  }

  function isLocalFullResetUnsafe(previousBoardState, nextBoardState, reason) {
    if (!previousBoardState || !isUsefulBoardState(previousBoardState)) return false;
    if (!isBoardBlank(nextBoardState)) return false;
    const previousActive = countActiveBoardItems(previousBoardState);
    if (previousActive <= 0) return false;
    const changeReason = reason ? String(reason) : "";
    if (changeReason === "clear" && previousActive <= 1) return false;
    return true;
  }

  function isUsefulBoardState(boardState) {
    return countUsefulBoardItems(boardState) > 0;
  }

  function isRecoverableBoardState(boardState) {
    return countActiveBoardItems(boardState) > 0;
  }

  function isBoardBlank(boardState) {
    return countUsefulBoardItems(boardState) === 0;
  }

  function countUsefulBoardItems(boardState) {
    let count = countActiveBoardItems(boardState);
    const slots = boardState && boardState.main && Array.isArray(boardState.main.slots) ? boardState.main.slots : [];
    slots.forEach((slot) => {
      if (slot && slot.status === "idle" && slot.lastCompleted && slot.lastCompleted.completedAt) count += 1;
    });
    return count;
  }

  function countActiveBoardItems(boardState) {
    let count = 0;
    const slots = boardState && boardState.main && Array.isArray(boardState.main.slots) ? boardState.main.slots : [];
    slots.forEach((slot) => {
      if (slot && slot.status && slot.status !== "idle") count += 1;
    });
    const splitSlots = boardState && boardState.split && boardState.split.slots && typeof boardState.split.slots === "object"
      ? boardState.split.slots
      : {};
    Object.keys(splitSlots).forEach((slotId) => {
      const entries = Array.isArray(splitSlots[slotId]) ? splitSlots[slotId] : [];
      count += entries.length;
    });
    return count;
  }

  function rebaseBoardEndTimes(boardState, sourceAt, targetAt) {
    const board = cloneBoardState(boardState);
    const savedAt = Math.max(0, Number(sourceAt) || 0);
    const now = Math.max(0, Number(targetAt) || getNow());
    if (!board || savedAt <= 0) return board;
    const mainSlots = board.main && Array.isArray(board.main.slots) ? board.main.slots : [];
    mainSlots.forEach((slot) => {
      rebaseTimerEntry(slot, savedAt, now);
    });
    const splitSlots = board.split && board.split.slots && typeof board.split.slots === "object"
      ? board.split.slots
      : {};
    Object.keys(splitSlots).forEach((slotId) => {
      const entries = Array.isArray(splitSlots[slotId]) ? splitSlots[slotId] : [];
      entries.forEach((entry) => rebaseTimerEntry(entry, savedAt, now));
    });
    return board;
  }

  function rebaseTimerEntry(entry, sourceAt, targetAt) {
    if (!entry || entry.status !== "running") return;
    const oldEndAt = Math.max(0, Number(entry.endAt) || 0);
    const remainingMs = Math.max(1000, oldEndAt - sourceAt);
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    entry.remainingSeconds = remainingSeconds;
    entry.endAt = targetAt + remainingSeconds * 1000;
  }

  function mergeRecoveredBoard(currentBoard, recoveredBoard) {
    const current = cloneBoardState(currentBoard);
    const recovered = cloneBoardState(recoveredBoard);
    if (!current || !recovered) return recovered || current;
    const currentSlots = current.main && Array.isArray(current.main.slots) ? current.main.slots : [];
    const recoveredSlots = recovered.main && Array.isArray(recovered.main.slots) ? recovered.main.slots : [];
    const recoveredById = new Map();
    recoveredSlots.forEach((slot) => {
      if (slot && slot.id) recoveredById.set(slot.id, slot);
    });
    recovered.main = recovered.main || {};
    recovered.main.slots = currentSlots.map((currentSlot) => {
      const recoveredSlot = currentSlot && currentSlot.id ? recoveredById.get(currentSlot.id) : null;
      let chosen = recoveredSlot || currentSlot;
      if (isActiveSlot(recoveredSlot)) chosen = recoveredSlot;
      else if (isActiveSlot(currentSlot)) chosen = currentSlot;
      return mergeSlotHistoryMetadata(chosen, currentSlot, recoveredSlot);
    });
    recoveredSlots.forEach((slot) => {
      if (!slot || !slot.id) return;
      if (!recovered.main.slots.some((item) => item && item.id === slot.id)) {
        recovered.main.slots.push(slot);
      }
    });
    const currentSplitSlots = current.split && current.split.slots && typeof current.split.slots === "object" ? current.split.slots : {};
    const recoveredSplitSlots = recovered.split && recovered.split.slots && typeof recovered.split.slots === "object" ? recovered.split.slots : {};
    const splitSlotIds = new Set(Object.keys(currentSplitSlots).concat(Object.keys(recoveredSplitSlots)));
    const mergedSplitSlots = {};
    splitSlotIds.forEach((slotId) => {
      const recoveredEntries = Array.isArray(recoveredSplitSlots[slotId]) ? recoveredSplitSlots[slotId] : [];
      const currentEntries = Array.isArray(currentSplitSlots[slotId]) ? currentSplitSlots[slotId] : [];
      mergedSplitSlots[slotId] = recoveredEntries.length > 0 ? recoveredEntries : currentEntries;
    });
    recovered.split = Object.assign({}, recovered.split || {}, { slots: mergedSplitSlots });
    return recovered;
  }

  function mergeSlotHistoryMetadata(chosenSlot, leftSlot, rightSlot) {
    if (!chosenSlot) return chosenSlot;
    const merged = Object.assign({}, chosenSlot);
    const candidates = [leftSlot, rightSlot].filter(Boolean);
    merged.completionCount = candidates.reduce((count, slot) => Math.max(count, Math.max(0, Math.trunc(Number(slot.completionCount) || 0))), 0);
    const completedRecords = candidates.map((slot) => getCompletedRecordForSlot(slot)).filter(Boolean);
    if (completedRecords.length > 0) {
      merged.lastCompleted = completedRecords.sort((left, right) => getCompletedAt(right) - getCompletedAt(left))[0];
    }
    const logByKey = new Map();
    candidates.forEach((slot) => {
      const entries = Array.isArray(slot.activityLog) ? slot.activityLog : [];
      entries.forEach((entry) => {
        if (!entry || !entry.at || !entry.action) return;
        const key = [entry.at, entry.action, entry.presetKey || "", entry.durationSeconds || 0, entry.deltaSeconds || 0, entry.peerSlotId || ""].join("|");
        logByKey.set(key, Object.assign({}, entry));
      });
    });
    merged.activityLog = Array.from(logByKey.values())
      .sort((left, right) => Number(left.at || 0) - Number(right.at || 0))
      .slice(-40);
    return merged;
  }

  function mergeBoardHistoryMetadata(currentBoard, incomingBoard) {
    const current = cloneBoardState(currentBoard);
    const incoming = cloneBoardState(incomingBoard);
    if (!incoming || !incoming.main || !Array.isArray(incoming.main.slots)) return incoming;
    const currentById = new Map();
    const currentSlots = current && current.main && Array.isArray(current.main.slots) ? current.main.slots : [];
    currentSlots.forEach((slot) => {
      if (slot && slot.id) currentById.set(slot.id, slot);
    });
    incoming.main.slots = incoming.main.slots.map((slot) => mergeSlotHistoryMetadata(slot, currentById.get(slot && slot.id), slot));
    return incoming;
  }

  function isActiveSlot(slot) {
    return Boolean(slot && slot.status && slot.status !== "idle");
  }

  function recoveryHistorySignature(boardState) {
    const mainSlots = boardState && boardState.main && Array.isArray(boardState.main.slots) ? boardState.main.slots : [];
    const main = mainSlots
      .filter(isActiveSlot)
      .map((slot) => [
        slot.id || "",
        slot.status || "",
        Math.max(0, Number(slot.durationSeconds) || 0),
        Math.max(0, Number(slot.endAt) || 0),
      ].join(":"))
      .sort();
    const splitSlots = boardState && boardState.split && boardState.split.slots && typeof boardState.split.slots === "object"
      ? boardState.split.slots
      : {};
    const split = [];
    Object.keys(splitSlots).forEach((slotId) => {
      const entries = Array.isArray(splitSlots[slotId]) ? splitSlots[slotId] : [];
      entries.forEach((entry) => {
        split.push([
          slotId,
          entry && entry.id ? entry.id : "",
          entry && entry.status ? entry.status : "",
          Math.max(0, Number(entry && entry.durationSeconds) || 0),
          Math.max(0, Number(entry && entry.endAt) || 0),
        ].join(":"));
      });
    });
    return main.concat(split.sort()).join("|");
  }

  function markIntentionalEmpty(reason) {
    const marker = { version: 1, markedAt: getNow(), reason: String(reason || "clear") };
    writeJsonStorage(RECOVERY_EMPTY_MARKER_KEY, marker);
    writeRecoveryEvent("intentional-empty", { reason: marker.reason });
  }

  function readIntentionalEmptyMarker() {
    const marker = readJsonStorage(RECOVERY_EMPTY_MARKER_KEY);
    if (!marker || typeof marker !== "object") return null;
    const markedAt = Math.max(0, Number(marker.markedAt) || 0);
    if (markedAt <= 0) return null;
    return { markedAt, reason: marker.reason ? String(marker.reason) : "" };
  }

  function readRecoveryEnvelope() {
    const envelope = readJsonStorage(RECOVERY_STATE_KEY);
    if (!envelope || typeof envelope !== "object" || !envelope.board) return null;
    const savedAt = Math.max(0, Number(envelope.savedAt) || 0);
    if (savedAt <= 0) return null;
    return {
      version: Math.max(1, Number(envelope.version) || 1),
      savedAt,
      reason: envelope.reason ? String(envelope.reason) : "",
      board: cloneBoardState(envelope.board),
    };
  }

  function writeRecoveryEvent(type, details) {
    const current = readJsonStorage(RECOVERY_EVENTS_KEY);
    const events = Array.isArray(current) ? current : [];
    const eventType = String(type || "event");
    const eventDetails = details && typeof details === "object" ? JSON.parse(JSON.stringify(details)) : {};
    events.unshift({
      type: eventType,
      at: getNow(),
      details: eventDetails,
    });
    writeJsonStorage(RECOVERY_EVENTS_KEY, events.slice(0, 20));
    writeAuditEvent(eventType, eventDetails);
  }

  function writeAuditEvent(type, details, boardState) {
    if (!syncChannel || typeof syncChannel.audit !== "function") return;
    const board = boardState || buildBoardState();
    syncChannel.audit(type, Object.assign({}, details || {}, {
      board: summarizeBoardForAudit(board),
    }));
  }

  function summarizeBoardForAudit(boardState) {
    const slots = boardState && boardState.main && Array.isArray(boardState.main.slots) ? boardState.main.slots : [];
    const main = slots.map((slot) => {
      const completed = slot && slot.lastCompleted && typeof slot.lastCompleted === "object" ? slot.lastCompleted : null;
      return {
        id: slot && slot.id ? String(slot.id) : "",
        status: slot && slot.status ? String(slot.status) : "idle",
        presetKey: slot && slot.presetKey ? String(slot.presetKey) : "",
        baseDurationSeconds: safeAuditNumber(slot && slot.baseDurationSeconds),
        durationSeconds: safeAuditNumber(slot && slot.durationSeconds),
        adjustedDeltaSeconds: Number(slot && slot.adjustedDeltaSeconds) || 0,
        remainingSeconds: safeAuditNumber(slot && slot.remainingSeconds),
        endAt: safeAuditNumber(slot && slot.endAt),
        lastCompletedAt: completed ? safeAuditNumber(completed.completedAt) : 0,
        lastCompletedDurationSeconds: completed ? safeAuditNumber(completed.durationSeconds) : 0,
        lastCompletedBaseDurationSeconds: completed ? safeAuditNumber(completed.baseDurationSeconds) : 0,
        lastCompletedFinalDurationSeconds: completed ? safeAuditNumber(completed.finalDurationSeconds || completed.durationSeconds) : 0,
        lastCompletedAdjustedDeltaSeconds: completed ? Number(completed.adjustedDeltaSeconds) || 0 : 0,
        completionCount: Math.max(0, Math.trunc(Number((slot && slot.completionCount) || 0))),
        activityLogCount: slot && Array.isArray(slot.activityLog) ? slot.activityLog.length : 0,
      };
    });
    return {
      activeMain: countActiveBoardItems(boardState),
      usefulMain: countUsefulBoardItems(boardState),
      blank: isBoardBlank(boardState),
      slots: main,
    };
  }

  function safeAuditNumber(value) {
    return Math.max(0, Number(value) || 0);
  }

  function readJsonStorage(key) {
    const storage = global.localStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeJsonStorage(key, value) {
    const storage = global.localStorage;
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function cloneBoardState(boardState) {
    if (!boardState) return null;
    try {
      return JSON.parse(JSON.stringify(boardState));
    } catch (_) {
      return null;
    }
  }

  function findSplitProtectedMainExpirations() {
    const due = new Map();
    if (!splitStore) return due;
    const currentAt = getNow();
    store.getSnapshot().slots.forEach((slot) => {
      if (!slot || slot.status !== "running" || slot.endAt > currentAt) return;
      if (splitStore.getEntries(slot.id).length === 0) return;
      due.set(slot.id, {
        durationSeconds: Math.max(0, Number(slot.durationSeconds) || 0),
        baseDurationSeconds: Math.max(0, Number(slot.baseDurationSeconds || slot.durationSeconds) || 0),
        presetKey: slot.presetKey || "",
        finalDurationSeconds: Math.max(0, Number(slot.durationSeconds) || 0),
        adjustedDeltaSeconds: Number(slot.adjustedDeltaSeconds) || 0,
        completedAt: Math.max(0, Number(slot.endAt) || currentAt),
        completedAtServerMs: Math.max(0, Number(slot.endAt) || currentAt),
      });
    });
    return due;
  }

  function restoreSplitProtectedMainExpirations(due) {
    if (!due || due.size === 0) return false;
    const nextState = store.getState();
    let changed = false;
    nextState.slots = nextState.slots.map((slot) => {
      const record = due.get(slot.id);
      if (!record || slot.status !== "idle") return slot;
      changed = true;
      return Object.assign({}, slot, {
        status: "expired",
        durationSeconds: record.durationSeconds,
        baseDurationSeconds: record.baseDurationSeconds || record.durationSeconds,
        presetKey: record.presetKey || "",
        adjustedDeltaSeconds: record.adjustedDeltaSeconds || 0,
        remainingSeconds: 0,
        endAt: 0,
        lastCompleted: record,
      });
    });
    if (!changed) return false;
    return store.replaceState(nextState, { reason: "split-main-expired" });
  }

  function buildBoardState() {
    return {
      main: store.getState(),
      split: splitStore ? splitStore.getState() : { slots: {} },
    };
  }

  function getStateForSyncBootstrap() {
    const board = buildBoardState();
    if (isBoardBlank(board)) return null;
    return board;
  }

  function publishBoardState(reason, auditDetails) {
    if (!syncChannel || applyingRemoteSync) return;
    const board = buildBoardState();
    const publishReason = reason || "local";
    if (isBoardBlank(board) && publishReason !== "clear") {
      writeRecoveryEvent("skip-publish-blank", { reason: String(publishReason) });
      return;
    }
    syncChannel.publish(board, {
      reason: publishReason,
      audit: auditDetails && typeof auditDetails === "object" ? auditDetails : {},
    });
  }

  function applyRemoteBoardState(nextState, meta) {
    if (!nextState) return;
    const previousBoardState = buildBoardState();
    const remoteReason = meta && meta.reason ? String(meta.reason) : "";
    if (isBoardBlank(nextState) && remoteReason !== "clear") {
      const candidate = getRecoveryCandidate();
      if (candidate && candidate.board && isUsefulBoardState(candidate.board)) {
        writeRecoveryEvent("reject-remote-blank-with-recovery", {
          reason: meta && meta.reason ? String(meta.reason) : "",
          source: candidate.source,
          previousActive: countActiveBoardItems(previousBoardState),
        });
        restoreBoardFromSnapshot(candidate.board, "recover-remote-blank", { publish: true, savedAt: candidate.savedAt });
        return;
      }
    }

    if (isRemoteFullResetUnsafe(previousBoardState, nextState, meta)) {
      persistBoardRecovery("reject-remote-reset", previousBoardState);
      writeRecoveryEvent("reject-remote-reset", {
        reason: meta && meta.reason ? String(meta.reason) : "",
        previousActive: countActiveBoardItems(previousBoardState),
        nextActive: countActiveBoardItems(nextState),
      });
      publishBoardState("recover");
      return;
    }

    const mergedNextState = mergeBoardHistoryMetadata(previousBoardState, nextState);
    const shouldAlert = hasNewlyExpired(previousBoardState, mergedNextState);
    applyingRemoteSync = true;
    try {
      store.replaceState(mergedNextState.main, { notify: false, reason: "sync" });
      if (splitStore) {
        splitStore.replaceState(mergedNextState.split, { persist: true });
      }
      refreshAll();
      reportNativeBoardMotion(true);
    } finally {
      applyingRemoteSync = false;
    }
    const currentBoardState = buildBoardState();
    if (isBoardBlank(currentBoardState)) {
      persistBoardRecovery("remote-clear", currentBoardState);
      writeAuditEvent("remote-blank-applied", {
        reason: remoteReason,
        previousActive: countActiveBoardItems(previousBoardState),
        nextActive: countActiveBoardItems(nextState),
      }, currentBoardState);
    } else {
      persistBoardRecovery("sync", currentBoardState);
    }
    lastAuditBoardState = cloneBoardState(currentBoardState);
    if (shouldAlert) {
      bridge.playAlert();
    }
  }

  function triggerChange(action) {
    const changed = action();
    if (changed) bridge.vibrateConfirm();
    return changed;
  }

  function triggerClockedChange(action, key, afterChange) {
    return runWithServerClock(() => {
      const changed = triggerChange(action);
      if (changed && typeof afterChange === "function") afterChange();
      return changed;
    }, key);
  }

  function reportNativeBoardMotion(force) {
    if (!bridge || (typeof bridge.reportBoardState !== "function" && typeof bridge.reportBoardMotion !== "function")) return;
    const hasActive = hasActiveTimers();
    const hasMotion = hasMovingTimers();
    const nowAt = Date.now();
    if (!force
      && lastNativeActiveState === hasActive
      && lastNativeMotionState === hasMotion
      && nowAt - lastNativeMotionReportAt < NATIVE_MOTION_REPORT_INTERVAL_MS) {
      return;
    }
    lastNativeActiveState = hasActive;
    lastNativeMotionState = hasMotion;
    lastNativeMotionReportAt = nowAt;
    if (typeof bridge.reportBoardState === "function") {
      bridge.reportBoardState(hasActive, hasMotion);
    } else {
      bridge.reportBoardMotion(hasMotion);
    }
  }

  function hasActiveTimers() {
    const snapshot = store.getSnapshot();
    if (snapshot.slots.some((slot) => slot && !isTestSlot(slot) && slot.status !== "idle")) return true;
    if (!splitStore || typeof splitStore.getState !== "function") return false;
    const splitState = splitStore.getState();
    const splitSlots = splitState && splitState.slots && typeof splitState.slots === "object" ? splitState.slots : {};
    return Object.keys(splitSlots).some((slotId) => {
      const entries = Array.isArray(splitSlots[slotId]) ? splitSlots[slotId] : [];
      return entries.length > 0;
    });
  }

  function hasMovingTimers() {
    const snapshot = store.getSnapshot();
    if (snapshot.slots.some((slot) => slot && !isTestSlot(slot) && slot.status === "running")) return true;
    if (!splitStore || typeof splitStore.getState !== "function") return false;
    const splitState = splitStore.getState();
    const splitSlots = splitState && splitState.slots && typeof splitState.slots === "object" ? splitState.slots : {};
    return Object.keys(splitSlots).some((slotId) => {
      const entries = Array.isArray(splitSlots[slotId]) ? splitSlots[slotId] : [];
      return entries.some((entry) => entry && entry.status === "running");
    });
  }

  async function refreshWakeLock() {
    const wakeLockApi = global.navigator && global.navigator.wakeLock;
    if (!wakeLockApi || typeof wakeLockApi.request !== "function") return;
    if (document && document.visibilityState === "hidden") {
      if (wakeLock && typeof wakeLock.release === "function") {
        try {
          await wakeLock.release();
        } catch (_) {}
      }
      wakeLock = null;
      return;
    }
    if (wakeLock) return;
    try {
      wakeLock = await wakeLockApi.request("screen");
      if (wakeLock && typeof wakeLock.addEventListener === "function") {
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      }
    } catch (_) {
      wakeLock = null;
    }
  }

  function buildBoard() {
    slotViews.forEach((view) => {
      if (view && view.readoutFitObserver && typeof view.readoutFitObserver.disconnect === "function") {
        view.readoutFitObserver.disconnect();
      }
    });
    boardEl.replaceChildren();
    slotViews.clear();
    const defsById = new Map(core.SLOT_DEFS.map((def) => [def.id, def]));
    ZONE_DEFS.forEach((zone) => {
      const zoneView = buildZoneGroup(zone);
      zone.slotIds.forEach((slotId) => {
        const def = defsById.get(slotId);
        if (!def) return;
        const view = buildSlot(def);
        view.card.dataset.zone = zone.id;
        slotViews.set(def.id, view);
        zoneView.slots.appendChild(view.card);
        observeReadoutFit(view);
      });
      boardEl.appendChild(zoneView.group);
    });
    boardUtilityRail = document.createElement("aside");
    boardUtilityRail.className = "board-utility-rail";
    boardUtilityRail.setAttribute("aria-label", "보드 도구");
    boardEl.appendChild(boardUtilityRail);
  }

  function buildZoneGroup(zone) {
    const group = document.createElement("section");
    group.className = "zone-group";
    group.dataset.zone = zone.id;
    group.dataset.accent = zone.accent;
    group.dataset.slotCount = String(zone.slotIds.length);
    if (typeof group.setAttribute === "function") {
      group.setAttribute("aria-label", zone.label + " 구역");
    }

    const header = document.createElement("div");
    header.className = "zone-header";

    const mark = document.createElement("div");
    mark.className = "zone-group-mark";
    mark.textContent = zone.shortLabel;

    const title = document.createElement("div");
    title.className = "zone-group-title";
    title.textContent = zone.label;

    header.appendChild(mark);
    header.appendChild(title);
    group.appendChild(header);

    const slots = document.createElement("div");
    slots.className = "zone-slot-grid";
    group.appendChild(slots);

    return { group, slots };
  }

  function getZoneLabel(def) {
    const accent = def && def.accent ? String(def.accent) : "";
    if (accent === "fryer-a") return "F3";
    if (accent === "fryer-b") return "F2";
    if (accent === "oven") return "OV";
    return "";
  }

  function getPhysicalSlotLabel(def) {
    const id = def && def.id ? String(def.id) : "";
    const match = id.match(/^slot-([1-5])$/);
    if (match) return match[1];
    return "OV";
  }

  function getPhysicalSlotGroup(label) {
    if (label === "1" || label === "2" || label === "3") return "yellow";
    if (label === "4" || label === "5") return "blue";
    return "neutral";
  }

  function buildSlot(def) {
    const physicalSlotLabel = getPhysicalSlotLabel(def);
    const physicalSlotGroup = getPhysicalSlotGroup(physicalSlotLabel);
    const card = document.createElement("article");
    card.className = "slot-card";
    card.dataset.slotId = def.id;
    card.dataset.accent = def.accent;
    card.dataset.state = "idle";
    card.dataset.hasActivity = "false";
    card.dataset.zoneLabel = getZoneLabel(def);
    card.dataset.physicalSlot = physicalSlotLabel;
    bindSlotImmediateDrag(card, def.id);

    // The whole physical card is a water tank on one shared five-minute scale.
    // Water starts at the absolute remaining level and drains downward to zero.
    const hourglass = createHourglass("timer-hourglass card-water-gauge", "남은 시간 절대 물높이");
    card.appendChild(hourglass);

    // Keep the surface line in the same low background layer as the fill so
    // it never covers operational controls.
    const waterSurface = document.createElement("div");
    waterSurface.className = "card-water-surface";
    waterSurface.hidden = true;
    if (typeof waterSurface.setAttribute === "function") waterSurface.setAttribute("aria-hidden", "true");
    card.appendChild(waterSurface);

    // The low water surface can sit behind bottom controls. Keep imminence on
    // a separate transparent perimeter so it stays visible without covering
    // the countdown or buttons.
    const waterUrgencyFrame = document.createElement("div");
    waterUrgencyFrame.className = "water-urgency-frame";
    waterUrgencyFrame.hidden = true;
    if (typeof waterUrgencyFrame.setAttribute === "function") waterUrgencyFrame.setAttribute("aria-hidden", "true");
    card.appendChild(waterUrgencyFrame);

    const completionImpact = document.createElement("div");
    completionImpact.className = "completion-impact";
    completionImpact.hidden = true;
    card.dataset.completionImpact = "false";
    card.appendChild(completionImpact);

    const zoneRail = document.createElement("div");
    zoneRail.className = "zone-rail";
    zoneRail.textContent = getZoneLabel(def);
    card.appendChild(zoneRail);

    const physicalSlotBadge = document.createElement("button");
    physicalSlotBadge.type = "button";
    physicalSlotBadge.className = "physical-slot-badge";
    physicalSlotBadge.dataset.physicalGroup = physicalSlotGroup;
    physicalSlotBadge.textContent = physicalSlotLabel;
    if (typeof physicalSlotBadge.setAttribute === "function") {
      physicalSlotBadge.setAttribute("aria-label", `${physicalSlotLabel} 물리 위치`);
    } else {
      physicalSlotBadge.ariaLabel = `${physicalSlotLabel} 물리 위치`;
    }
    card.appendChild(physicalSlotBadge);

    const completedBadge = document.createElement("div");
    completedBadge.className = "completed-timer-badge";
    completedBadge.hidden = true;
    card.appendChild(completedBadge);

    const slotInfo = document.createElement("div");
    slotInfo.className = "slot-info";
    slotInfo.dataset.layoutOwner = "v3";
    setAccessibleName(slotInfo, `${physicalSlotLabel}번 타이머 상태 요약`);

    const slotInfoState = document.createElement("strong");
    slotInfoState.className = "slot-info-state";
    slotInfoState.textContent = "기록";
    const slotInfoCurrent = document.createElement("span");
    slotInfoCurrent.className = "slot-info-current";
    slotInfoCurrent.textContent = "종료 0회";
    const slotInfoLog = document.createElement("div");
    slotInfoLog.className = "slot-info-log";
    slotInfoLog.dataset.layoutOwner = "v3";
    slotInfoLog.dataset.visibleRows = "2";
    if (typeof slotInfoLog.setAttribute === "function") slotInfoLog.setAttribute("role", "list");

    slotInfo.appendChild(slotInfoState);
    slotInfo.appendChild(slotInfoCurrent);
    slotInfo.appendChild(slotInfoLog);
    card.appendChild(slotInfo);

    const head = document.createElement("div");
    head.className = "slot-head";

    const titleGroup = document.createElement("div");
    titleGroup.className = "slot-title-group";

    const title = document.createElement("div");
    title.className = "slot-title";
    title.textContent = def.title;
    titleGroup.appendChild(title);
    const lastCompletedNote = document.createElement("div");
    lastCompletedNote.className = "last-completed-note";
    lastCompletedNote.hidden = true;
    titleGroup.appendChild(lastCompletedNote);

    if (def.kind) {
      const kind = document.createElement("div");
      kind.className = "slot-kind";
      kind.textContent = def.kind;
      titleGroup.appendChild(kind);
    }

    const badge = document.createElement("div");
    badge.className = "slot-badge";
    badge.textContent = getZoneLabel(def);

    const statusChip = document.createElement("div");
    statusChip.className = "slot-chip";
    statusChip.dataset.state = "idle";
    statusChip.textContent = getChipLabel("idle");

    head.appendChild(badge);
    head.appendChild(titleGroup);
    head.appendChild(statusChip);
    card.appendChild(head);

    const body = document.createElement("div");
    body.className = "slot-body";
    card.appendChild(body);

    const presetGrid = document.createElement("div");
    presetGrid.className = "preset-grid";
    presetGrid.dataset.mode = "start";
    body.appendChild(presetGrid);

    const presetButtons = new Map();
    let view;
    const slotPresetKeys = def.id === "slot-6" && Array.isArray(core.OV_ALL_MINUTE_PRESETS)
      ? core.OV_ALL_MINUTE_PRESETS
      : core.MINUTE_PRESETS;
    slotPresetKeys.forEach((presetKey) => {
      const button = createMinuteButton(presetKey);
      bindPress(button, () => startMainTimer(def.id, presetKey));
      presetGrid.appendChild(button);
      presetButtons.set(String(presetKey), button);
    });

    const timerPanel = document.createElement("div");
    timerPanel.className = "timer-panel";
    timerPanel.dataset.layoutOwner = "v3";
    timerPanel.dataset.controlLayout = "perimeter-v1";
    body.appendChild(timerPanel);

    const stateLabel = document.createElement("div");
    stateLabel.className = "timer-state";
    timerPanel.appendChild(stateLabel);

    const splitSection = document.createElement("div");
    splitSection.className = "split-section";
    splitSection.hidden = true;
    timerPanel.appendChild(splitSection);

    const splitList = document.createElement("div");
    splitList.className = "split-list";
    splitList.hidden = true;
    splitSection.appendChild(splitList);

    const addPresetGrid = document.createElement("div");
    addPresetGrid.className = "preset-grid split-add-grid";
    addPresetGrid.hidden = true;
    splitSection.appendChild(addPresetGrid);

    const addPresetButtons = new Map();
    if (splitStore) {
      slotPresetKeys.forEach((presetKey) => {
        const button = createMinuteButton(presetKey);
        bindPress(button, () => handleAddTimer(view, def.id, presetKey));
        addPresetGrid.appendChild(button);
        addPresetButtons.set(String(presetKey), button);
      });
    }

    const positiveRail = document.createElement("div");
    positiveRail.className = "timer-positive-rail";
    timerPanel.appendChild(positiveRail);

    const adjustControls = document.createElement("div");
    adjustControls.className = "adjust-controls";
    adjustControls.hidden = true;
    timerPanel.appendChild(adjustControls);

    const adjustTopRow = document.createElement("div");
    adjustTopRow.className = "adjust-row";
    adjustTopRow.dataset.tone = "up";
    positiveRail.appendChild(adjustTopRow);

    const readoutCluster = document.createElement("div");
    readoutCluster.className = "readout-cluster";
    readoutCluster.dataset.slotInteractive = "true";
    bindPress(readoutCluster, () => handleReadoutToggle(def.id));
    adjustControls.appendChild(readoutCluster);

    const readout = document.createElement("div");
    readout.className = "timer-readout";
    readout.dataset.counterLayout = "one-line";
    readout.tabIndex = 0;
    bindPress(readout, () => handleReadoutToggle(def.id));
    readoutCluster.appendChild(readout);

    const total = document.createElement("div");
    total.className = "timer-total";
    readoutCluster.appendChild(total);

    const adjustFlash = document.createElement("div");
    adjustFlash.className = "adjust-flash";
    adjustFlash.hidden = true;
    readoutCluster.appendChild(adjustFlash);

    const adjustBottomRow = document.createElement("div");
    adjustBottomRow.className = "adjust-row";
    adjustBottomRow.dataset.tone = "down";
    adjustBottomRow.dataset.layoutGroup = "adjust-actions";

    const adjustButtons = new Map();
    [
      { key: "plus-second", label: "+10", deltaSeconds: 10 },
      { key: "plus-minute", label: "+60", deltaSeconds: 60 },
      { key: "minus-second", label: "-10", deltaSeconds: -10 },
      { key: "minus-minute", label: "-60", deltaSeconds: -60 },
    ].forEach((control) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "adjust-button";
      button.dataset.adjustKey = control.key;
      button.dataset.deltaSeconds = String(control.deltaSeconds);
      button.textContent = control.label;
      bindPress(button, () => handleAdjustTimer(view, def.id, control.deltaSeconds, control.label));
      if (control.deltaSeconds > 0) {
        adjustTopRow.appendChild(button);
      } else {
        adjustBottomRow.appendChild(button);
      }
      adjustButtons.set(control.key, button);
    });

    const actions = document.createElement("div");
    actions.className = "timer-actions";
    actions.dataset.layoutOwner = "v3";
    timerPanel.appendChild(actions);

    const primaryActionGroup = document.createElement("div");
    primaryActionGroup.className = "timer-primary-actions";
    primaryActionGroup.dataset.layoutGroup = "primary-actions";

    const primaryAction = document.createElement("button");
    primaryAction.type = "button";
    primaryAction.dataset.role = "primary";
    bindPress(primaryAction, () => {
      if (typeof primaryAction.__ctAction === "function") {
        primaryAction.__ctAction();
      }
    });

    const secondaryAction = document.createElement("button");
    secondaryAction.type = "button";
    secondaryAction.dataset.role = "secondary";
    bindPress(secondaryAction, () => {
      if (typeof secondaryAction.__ctAction === "function") {
        secondaryAction.__ctAction();
      }
    });

    const splitAction = document.createElement("button");
    splitAction.type = "button";
    splitAction.dataset.role = "split";
    splitAction.className = "action-button is-split";
    splitAction.textContent = "추가";
    bindPress(splitAction, () => {
      if (typeof splitAction.__ctAction === "function") {
        splitAction.__ctAction();
      }
    });

    primaryActionGroup.appendChild(primaryAction);
    primaryActionGroup.appendChild(secondaryAction);
    primaryActionGroup.appendChild(splitAction);
    actions.appendChild(primaryActionGroup);
    actions.appendChild(adjustBottomRow);

    view = {
      card,
      physicalSlotBadge,
      completedBadge,
      slotInfo,
      slotInfoState,
      slotInfoCurrent,
      slotInfoLog,
      statusChip,
      lastCompletedNote,
      presetGrid,
      presetButtons,
      timerPanel,
      stateLabel,
      splitSection,
      splitList,
      addPresetGrid,
      addPresetButtons,
      readout,
      total,
      hourglass,
      waterSurface,
      waterUrgencyFrame,
      completionImpact,
      completionImpactTimerId: 0,
      lastCompletionImpactAt: 0,
      adjustFlash,
      adjustFlashTimerId: 0,
      readoutMotionTimerId: 0,
      readoutFitCacheKey: "",
      readoutFitCacheFontPx: 0,
      adjustControls,
      positiveRail,
      adjustTopRow,
      readoutCluster,
      adjustBottomRow,
      adjustButtons,
      actions,
      primaryActionGroup,
      primaryAction,
      secondaryAction,
      splitAction,
    };

    return view;
  }

  function createMinuteButton(presetKey) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "minute-button";
    button.dataset.minute = String(presetKey);
    const timerFamily = getTimerFamilyForPreset(presetKey);
    if (timerFamily) button.dataset.timerFamily = timerFamily;

    const value = document.createElement("span");
    value.className = "minute-value";
    value.textContent = core.getPresetDisplay(presetKey);

    const unit = document.createElement("span");
    unit.className = "minute-unit";
    unit.textContent = core.getPresetUnit(presetKey);
    unit.hidden = true;

    button.appendChild(value);
    button.appendChild(unit);
    return button;
  }

  function bindPress(button, handler) {
    let lastPointerUpAt = 0;
    let lastTouchEndAt = 0;

    const invoke = () => {
      // The Android wrapper may need to replay a touch when an older WebView
      // swallows pointerup/touchend.  Publish the press before the handler so
      // the native delayed fallback can see that the web path already ran.
      global.__chickenTimerLastPressAt = Date.now();
      const result = handler();
      const cue = getTouchCue(button);
      if (result !== false && cue && bridge && typeof bridge.playTouchCue === "function") {
        bridge.playTouchCue(cue);
      }
      return result;
    };

    if ("PointerEvent" in global) {
      button.addEventListener("pointerup", (event) => {
        if (typeof event.button === "number" && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        lastPointerUpAt = Date.now();
        if (lastPointerUpAt < suppressDragPressUntil) return;
        suppressClickUntil = lastPointerUpAt + PRESS_GUARD_MS;
        invoke();
      });
    }

    // Some older Android WebViews expose PointerEvent but do not reliably
    // deliver pointerup (or the synthesized click) for a direct touch. Keep
    // a legacy touchend path, while the timestamp guard prevents a modern
    // WebView from invoking the same action twice.
    button.addEventListener("touchend", (event) => {
      const currentAt = Date.now();
      if (currentAt - lastPointerUpAt < PRESS_GUARD_MS) return;
      if (currentAt - lastTouchEndAt < PRESS_GUARD_MS) return;
      if (currentAt < suppressDragPressUntil) return;
      event.preventDefault();
      event.stopPropagation();
      lastTouchEndAt = currentAt;
      suppressClickUntil = currentAt + PRESS_GUARD_MS;
      invoke();
    }, false);

    button.addEventListener("click", (event) => {
      const currentAt = Date.now();
      event.preventDefault();
      event.stopPropagation();
      if (currentAt - lastPointerUpAt < PRESS_GUARD_MS) return;
      if (currentAt < suppressClickUntil) return;
      invoke();
    });

    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      invoke();
    });
  }

  function getTouchCue(button) {
    if (!button) return "";
    const dataset = button.dataset || {};
    if (dataset.minute) return `minute:${String(dataset.minute).slice(0, 8)}`;
    const action = String(dataset.action || "");
    if (action === "clear") return "clear";
    if (action === "add") return "add";
    const className = String(button.className || "");
    if (className.indexOf("split-clear-button") >= 0) return "clear";
    if (className.indexOf("recovery-button") >= 0) return "recover";
    const label = String((button.getAttribute && button.getAttribute("aria-label")) || button.textContent || "");
    if (label.indexOf("+10") >= 0) return "plus10";
    if (label.indexOf("+60") >= 0) return "plus60";
    if (label.indexOf("-10") >= 0) return "minus10";
    if (label.indexOf("-60") >= 0) return "minus60";
    if (label.indexOf("재개") >= 0) return "resume";
    if (label.indexOf("일시정지") >= 0) return "pause";
    return "";
  }

  function bindSlotImmediateDrag(card, slotId) {
    if (!card || typeof card.addEventListener !== "function") return;
    card.addEventListener("pointerdown", (event) => {
      if (typeof event.button === "number" && event.button !== 0) return;
      if (shouldSkipSlotDragStart(event, card)) return;
      beginSlotDrag(event, card, slotId);
    }, true);
  }

  function shouldSkipSlotDragStart(event, boundary) {
    const root = boundary || null;
    let node = event && event.target ? event.target : null;
    while (node && node !== root && node !== document.body) {
      if (node.dataset && node.dataset.slotInteractive === "true") return true;
      const tagName = node.tagName ? String(node.tagName).toUpperCase() : "";
      if (tagName === "BUTTON" || tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA" || tagName === "A" || tagName === "LABEL") {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function beginSlotDrag(event, card, slotId) {
    if (!event || typeof event.clientX !== "number" || typeof event.clientY !== "number") return;
    if (activeSlotDrag) finishSlotDrag("cancel", event);
    const pointerId = typeof event.pointerId === "number" ? event.pointerId : 1;
    activeSlotDrag = {
      pointerId,
      sourceSlotId: slotId,
      targetSlotId: "",
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      hasDragged: false,
      sourceCard: card,
      sourceRect: null,
      ghost: null,
      previewBoardState: null,
    };
    bindSlotDragWindowEvents();
  }

  function bindSlotDragWindowEvents() {
    if (!global || typeof global.addEventListener !== "function") return;
    global.addEventListener("pointermove", handleSlotDragMove, true);
    global.addEventListener("pointerup", handleSlotDragUp, true);
    global.addEventListener("pointercancel", handleSlotDragCancel, true);
  }

  function unbindSlotDragWindowEvents() {
    if (!global || typeof global.removeEventListener !== "function") return;
    global.removeEventListener("pointermove", handleSlotDragMove, true);
    global.removeEventListener("pointerup", handleSlotDragUp, true);
    global.removeEventListener("pointercancel", handleSlotDragCancel, true);
  }

  function isActiveDragPointer(event) {
    if (!activeSlotDrag || !event) return false;
    if (typeof event.pointerId !== "number") return true;
    return event.pointerId === activeSlotDrag.pointerId;
  }

  function handleSlotDragMove(event) {
    if (!isActiveDragPointer(event)) return;
    activeSlotDrag.currentX = event.clientX;
    activeSlotDrag.currentY = event.clientY;
    const moveDistance = Math.hypot(
      activeSlotDrag.currentX - activeSlotDrag.startX,
      activeSlotDrag.currentY - activeSlotDrag.startY,
    );
    if (!activeSlotDrag.hasDragged && moveDistance < SLOT_DRAG_THRESHOLD_PX) return;
    if (!activeSlotDrag.hasDragged) {
      startSlotDragMotion(event);
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    suppressDragPressUntil = Date.now() + PRESS_GUARD_MS;
    suppressClickUntil = suppressDragPressUntil;
    scheduleSlotDragFrame();
  }

  function handleSlotDragUp(event) {
    if (!isActiveDragPointer(event)) return;
    if (activeSlotDrag.hasDragged) {
      cancelSlotDragFrame();
      runSlotDragFrame();
    }
    const shouldCommit = activeSlotDrag.hasDragged
      && activeSlotDrag.targetSlotId
      && activeSlotDrag.targetSlotId !== activeSlotDrag.sourceSlotId;
    const sourceSlotId = activeSlotDrag.sourceSlotId;
    const targetSlotId = activeSlotDrag.targetSlotId;
    const wasDrag = activeSlotDrag.hasDragged;
    if (wasDrag) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      suppressDragPressUntil = Date.now() + PRESS_GUARD_MS;
      suppressClickUntil = suppressDragPressUntil;
    }
    finishSlotDrag(shouldCommit ? "commit" : "cancel", event);
    if (shouldCommit) {
      performSlotSwap(sourceSlotId, targetSlotId);
    }
  }

  function handleSlotDragCancel(event) {
    if (!isActiveDragPointer(event)) return;
    if (activeSlotDrag && activeSlotDrag.hasDragged && event) {
      event.preventDefault();
      event.stopPropagation();
    }
    finishSlotDrag("cancel", event);
  }

  function scheduleSlotDragFrame() {
    if (slotDragFrameId) return;
    const run = () => {
      slotDragFrameId = 0;
      runSlotDragFrame();
    };
    if (typeof global.requestAnimationFrame === "function") {
      slotDragFrameId = global.requestAnimationFrame(run);
    } else {
      slotDragFrameId = global.setTimeout(run, 16);
    }
  }

  function cancelSlotDragFrame() {
    if (!slotDragFrameId) return;
    if (typeof global.cancelAnimationFrame === "function") {
      global.cancelAnimationFrame(slotDragFrameId);
    } else {
      global.clearTimeout(slotDragFrameId);
    }
    slotDragFrameId = 0;
  }

  function runSlotDragFrame() {
    if (!activeSlotDrag || !activeSlotDrag.hasDragged) return;
    updateSlotDragGhost(activeSlotDrag.currentX, activeSlotDrag.currentY);
    const targetSlotId = getSlotIdFromPoint(activeSlotDrag.currentX, activeSlotDrag.currentY);
    updateSlotDragPreview(targetSlotId && targetSlotId !== activeSlotDrag.sourceSlotId ? targetSlotId : "");
  }

  function startSlotDragMotion(event) {
    if (!activeSlotDrag || activeSlotDrag.hasDragged) return;
    activeSlotDrag.hasDragged = true;
    activeSlotDrag.sourceRect = getElementRect(activeSlotDrag.sourceCard);
    if (activeSlotDrag.sourceCard && typeof activeSlotDrag.sourceCard.setPointerCapture === "function") {
      try {
        activeSlotDrag.sourceCard.setPointerCapture(activeSlotDrag.pointerId);
      } catch (_) {}
    }
    activeSlotDrag.ghost = createSlotDragGhost(activeSlotDrag.sourceCard, activeSlotDrag.sourceRect);
    if (document && document.body && document.body.dataset) {
      document.body.dataset.slotDragging = "true";
    }
    if (activeSlotDrag.sourceCard && activeSlotDrag.sourceCard.dataset) {
      activeSlotDrag.sourceCard.dataset.dragOrigin = "true";
    }
    bridge.vibrateTap();
    updateSlotDragGhost(event.clientX, event.clientY);
  }

  function createSlotDragGhost(sourceCard, rect) {
    if (!sourceCard || typeof sourceCard.cloneNode !== "function" || !document || !document.body) return null;
    const ghost = sourceCard.cloneNode(true);
    ghost.className = `${sourceCard.className || "slot-card"} slot-drag-ghost`;
    ghost.dataset.dragGhost = "true";
    ghost.dataset.dragSourceSlotId = sourceCard.dataset ? String(sourceCard.dataset.slotId || "") : "";
    if (typeof ghost.removeAttribute === "function") {
      ghost.removeAttribute("data-slot-id");
    } else if (ghost.dataset) {
      delete ghost.dataset.slotId;
    }
    ghost.style.width = Math.max(1, Math.round(rect.width || 0)) + "px";
    ghost.style.height = Math.max(1, Math.round(rect.height || 0)) + "px";
    ghost.style.left = Math.round(rect.left || 0) + "px";
    ghost.style.top = Math.round(rect.top || 0) + "px";
    document.body.appendChild(ghost);
    return ghost;
  }

  function getElementRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return { left: 0, top: 0, width: 1, height: 1 };
    }
    const rect = element.getBoundingClientRect();
    return {
      left: Number(rect.left) || 0,
      top: Number(rect.top) || 0,
      width: Number(rect.width) || 1,
      height: Number(rect.height) || 1,
    };
  }

  function updateSlotDragGhost(clientX, clientY) {
    if (!activeSlotDrag || !activeSlotDrag.ghost || !activeSlotDrag.sourceRect) return;
    const dx = clientX - activeSlotDrag.startX;
    const dy = clientY - activeSlotDrag.startY;
    activeSlotDrag.ghost.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0) scale(1.045)`;
  }

  function getSlotIdFromPoint(clientX, clientY) {
    if (!document || typeof document.elementFromPoint !== "function") return "";
    const element = document.elementFromPoint(clientX, clientY);
    const card = findSlotCardElement(element);
    return card && card.dataset ? String(card.dataset.slotId || "") : "";
  }

  function findSlotCardElement(element) {
    let node = element;
    while (node && node !== document.body) {
      if (node.dataset && node.dataset.slotId && hasClassName(node, "slot-card")) return node;
      node = node.parentNode;
    }
    return null;
  }

  function hasClassName(element, className) {
    const value = element && element.className ? String(element.className) : "";
    return value.split(/\s+/).includes(className);
  }

  function updateSlotDragPreview(targetSlotId) {
    if (!activeSlotDrag || !activeSlotDrag.hasDragged) return;
    const previousTargetSlotId = activeSlotDrag.targetSlotId || "";
    const safeTarget = targetSlotId ? String(targetSlotId) : "";
    if (activeSlotDrag.targetSlotId === safeTarget) return;
    activeSlotDrag.targetSlotId = safeTarget;
    if (!safeTarget) {
      activeSlotDrag.previewBoardState = null;
      refreshSlotViews(getSlotDragAffectedIds(previousTargetSlotId, ""));
      markSlotDragPreview();
      return;
    }
    const previewBoardState = cloneBoardState(buildBoardState());
    if (!swapBoardSlots(previewBoardState, activeSlotDrag.sourceSlotId, safeTarget)) {
      activeSlotDrag.previewBoardState = null;
      refreshSlotViews(getSlotDragAffectedIds(previousTargetSlotId, ""));
      markSlotDragPreview();
      return;
    }
    activeSlotDrag.previewBoardState = previewBoardState;
    refreshSlotViews(getSlotDragAffectedIds(previousTargetSlotId, safeTarget), previewBoardState);
    markSlotDragPreview();
  }

  function getSlotDragAffectedIds(previousTargetSlotId, nextTargetSlotId) {
    const ids = [];
    if (activeSlotDrag && activeSlotDrag.sourceSlotId) ids.push(activeSlotDrag.sourceSlotId);
    if (previousTargetSlotId) ids.push(previousTargetSlotId);
    if (nextTargetSlotId) ids.push(nextTargetSlotId);
    return Array.from(new Set(ids));
  }

  function markSlotDragPreview() {
    const sourceSlotId = activeSlotDrag ? activeSlotDrag.sourceSlotId : "";
    const targetSlotId = activeSlotDrag ? activeSlotDrag.targetSlotId : "";
    slotViews.forEach((view, slotId) => {
      if (!view || !view.card || !view.card.dataset) return;
      delete view.card.dataset.dragPreviewRole;
      delete view.card.dataset.dragPreview;
      if (sourceSlotId && slotId === sourceSlotId) {
        view.card.dataset.dragOrigin = activeSlotDrag && activeSlotDrag.hasDragged ? "true" : "false";
      } else {
        delete view.card.dataset.dragOrigin;
      }
      if (targetSlotId && (slotId === sourceSlotId || slotId === targetSlotId)) {
        view.card.dataset.dragPreview = "true";
        view.card.dataset.dragPreviewRole = slotId === targetSlotId ? "target" : "source";
      }
    });
  }

  function finishSlotDrag(reason, event) {
    if (!activeSlotDrag) return;
    const drag = activeSlotDrag;
    cancelSlotDragFrame();
    activeSlotDrag = null;
    unbindSlotDragWindowEvents();
    if (drag.sourceCard && typeof drag.sourceCard.releasePointerCapture === "function") {
      try {
        drag.sourceCard.releasePointerCapture(drag.pointerId);
      } catch (_) {}
    }
    if (drag.ghost && drag.ghost.parentNode) {
      drag.ghost.parentNode.removeChild(drag.ghost);
    }
    if (document && document.body && document.body.dataset) {
      delete document.body.dataset.slotDragging;
    }
    clearSlotDragMarkers();
    if (drag.hasDragged && reason !== "commit") {
      refreshAll();
    }
    if (drag.hasDragged && event) {
      suppressDragPressUntil = Date.now() + PRESS_GUARD_MS;
      suppressClickUntil = suppressDragPressUntil;
    }
  }

  function clearSlotDragMarkers() {
    slotViews.forEach((view) => {
      if (!view || !view.card || !view.card.dataset) return;
      delete view.card.dataset.dragOrigin;
      delete view.card.dataset.dragPreview;
      delete view.card.dataset.dragPreviewRole;
    });
  }

  function getActiveSlotDragSummary() {
    if (!activeSlotDrag) return null;
    return {
      sourceSlotId: activeSlotDrag.sourceSlotId,
      targetSlotId: activeSlotDrag.targetSlotId,
      hasDragged: activeSlotDrag.hasDragged,
      hasPreview: Boolean(activeSlotDrag.previewBoardState),
    };
  }

  function performSlotSwap(leftSlotId, rightSlotId) {
    if (!leftSlotId || !rightSlotId || leftSlotId === rightSlotId) return false;
    const previousBoardState = cloneBoardState(buildBoardState());
    const nextBoardState = cloneBoardState(previousBoardState);
    if (!swapBoardSlots(nextBoardState, leftSlotId, rightSlotId, true)) {
      return false;
    }
    applyBoardStateDirect(nextBoardState, "swap", [leftSlotId, rightSlotId]);
    publishBoardState("swap", {
      previous: summarizeBoardForAudit(previousBoardState),
      slotIds: [leftSlotId, rightSlotId],
    });
    lastAuditBoardState = cloneBoardState(buildBoardState());
    if (bridge && typeof bridge.playMoveCue === "function") {
      bridge.playMoveCue();
    } else {
      bridge.vibrateConfirm();
    }
    showSwapUndo(previousBoardState, [leftSlotId, rightSlotId]);
    return true;
  }

  function swapBoardSlots(boardState, leftSlotId, rightSlotId, recordMove) {
    if (!boardState || !boardState.main || !Array.isArray(boardState.main.slots)) return false;
    const slots = boardState.main.slots;
    const leftIndex = slots.findIndex((slot) => slot && slot.id === leftSlotId);
    const rightIndex = slots.findIndex((slot) => slot && slot.id === rightSlotId);
    if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) return false;
    const before = JSON.stringify(boardState);
    const leftSlot = Object.assign({}, slots[leftIndex]);
    const rightSlot = Object.assign({}, slots[rightIndex]);
    slots[leftIndex] = Object.assign({}, rightSlot, {
      id: leftSlotId,
      lastCompleted: leftSlot.lastCompleted || null,
      completionCount: Math.max(0, Math.trunc(Number(leftSlot.completionCount) || 0)),
      activityLog: Array.isArray(leftSlot.activityLog) ? leftSlot.activityLog.slice(-40) : [],
    });
    slots[rightIndex] = Object.assign({}, leftSlot, {
      id: rightSlotId,
      lastCompleted: rightSlot.lastCompleted || null,
      completionCount: Math.max(0, Math.trunc(Number(rightSlot.completionCount) || 0)),
      activityLog: Array.isArray(rightSlot.activityLog) ? rightSlot.activityLog.slice(-40) : [],
    });
    if (recordMove) {
      appendBoardActivity(slots[leftIndex], { at: getNow(), action: "move", peerSlotId: rightSlotId });
      appendBoardActivity(slots[rightIndex], { at: getNow(), action: "move", peerSlotId: leftSlotId });
    }

    const splitSlots = boardState.split && boardState.split.slots && typeof boardState.split.slots === "object"
      ? boardState.split.slots
      : {};
    const leftSplit = Array.isArray(splitSlots[leftSlotId]) ? splitSlots[leftSlotId].map((entry) => Object.assign({}, entry)) : [];
    const rightSplit = Array.isArray(splitSlots[rightSlotId]) ? splitSlots[rightSlotId].map((entry) => Object.assign({}, entry)) : [];
    if (rightSplit.length > 0) {
      splitSlots[leftSlotId] = rightSplit;
    } else {
      delete splitSlots[leftSlotId];
    }
    if (leftSplit.length > 0) {
      splitSlots[rightSlotId] = leftSplit;
    } else {
      delete splitSlots[rightSlotId];
    }
    boardState.split = Object.assign({}, boardState.split || {}, { slots: splitSlots });
    return before !== JSON.stringify(boardState);
  }

  function appendBoardActivity(slot, entry) {
    if (!slot || !entry || !entry.action || !entry.at) return false;
    const logs = Array.isArray(slot.activityLog) ? slot.activityLog.slice() : [];
    logs.push({
      at: Math.max(0, Math.trunc(Number(entry.at) || 0)),
      action: String(entry.action || ""),
      presetKey: String(entry.presetKey || ""),
      durationSeconds: Math.max(0, Math.round(Number(entry.durationSeconds) || 0)),
      deltaSeconds: Math.trunc(Number(entry.deltaSeconds) || 0),
      peerSlotId: String(entry.peerSlotId || "").slice(0, 24),
    });
    slot.activityLog = logs
      .filter((item) => item && item.at && item.action)
      .sort((left, right) => Number(left.at || 0) - Number(right.at || 0))
      .slice(-40);
    return true;
  }

  function applyBoardStateDirect(boardState, reason, slotIds) {
    const board = cloneBoardState(boardState);
    if (!board) return false;
    applyingRemoteSync = true;
    try {
      store.replaceState(board.main, { notify: false, reason: reason || "replace" });
      if (splitStore) {
        splitStore.replaceState(board.split, { persist: true });
      }
    } finally {
      applyingRemoteSync = false;
    }
    if (Array.isArray(slotIds) && slotIds.length > 0) {
      refreshSlotViews(slotIds, board);
    } else {
      refreshAll();
    }
    persistBoardRecovery(reason || "replace", board);
    return true;
  }

  function showSwapUndo(previousBoardState, confirmedSlotIds) {
    pendingSwapUndo = cloneBoardState(previousBoardState);
    pendingSwapUndoSlotIds = Array.from(new Set((Array.isArray(confirmedSlotIds) ? confirmedSlotIds : [])
      .map((slotId) => String(slotId || ""))
      .filter(Boolean)));
    showSlotSwapConfirmation(confirmedSlotIds);
    showSwapStatus("완료", "confirmed");
    if (swapConfirmTimerId) global.clearTimeout(swapConfirmTimerId);
    if (swapUndoTimerId) global.clearTimeout(swapUndoTimerId);
    swapConfirmTimerId = global.setTimeout(() => {
      swapConfirmTimerId = 0;
      if (pendingSwapUndo) showSwapStatus("취소", "undo");
    }, SWAP_CONFIRM_MS);
    swapUndoTimerId = global.setTimeout(() => {
      pendingSwapUndo = null;
      pendingSwapUndoSlotIds = [];
      if (swapStatusEl) swapStatusEl.hidden = true;
      if (swapConfirmTimerId) {
        global.clearTimeout(swapConfirmTimerId);
        swapConfirmTimerId = 0;
      }
      swapUndoTimerId = 0;
    }, SWAP_CONFIRM_MS + SWAP_UNDO_MS);
  }

  function showSlotSwapConfirmation(slotIds) {
    clearSlotSwapConfirmation();
    const token = String(++swapConfirmToken);
    const ids = Array.from(new Set((Array.isArray(slotIds) ? slotIds : [])
      .map((slotId) => String(slotId || ""))
      .filter(Boolean)));
    ids.forEach((slotId) => {
      const view = slotViews.get(slotId);
      if (!view || !view.card || !view.card.dataset) return;
      view.card.dataset.swapConfirmed = "true";
      view.card.dataset.swapConfirmToken = token;
    });
    swapConfirmClearTimerId = global.setTimeout(() => {
      clearSlotSwapConfirmation(token);
    }, SWAP_CONFIRM_MS);
  }

  function clearSlotSwapConfirmation(token) {
    const expectedToken = token ? String(token) : "";
    if (!expectedToken && swapConfirmClearTimerId) {
      global.clearTimeout(swapConfirmClearTimerId);
      swapConfirmClearTimerId = 0;
    }
    slotViews.forEach((view) => {
      if (!view || !view.card || !view.card.dataset) return;
      if (expectedToken && view.card.dataset.swapConfirmToken !== expectedToken) return;
      delete view.card.dataset.swapConfirmed;
      delete view.card.dataset.swapConfirmToken;
    });
    if (expectedToken && swapConfirmClearTimerId) {
      swapConfirmClearTimerId = 0;
    }
  }

  function undoLastSwap() {
    if (!pendingSwapUndo) return false;
    const restoreBoard = mergeBoardHistoryMetadata(buildBoardState(), cloneBoardState(pendingSwapUndo));
    const restoreSlotIds = pendingSwapUndoSlotIds.slice();
    pendingSwapUndo = null;
    pendingSwapUndoSlotIds = [];
    if (swapUndoTimerId) {
      global.clearTimeout(swapUndoTimerId);
      swapUndoTimerId = 0;
    }
    if (swapConfirmTimerId) {
      global.clearTimeout(swapConfirmTimerId);
      swapConfirmTimerId = 0;
    }
    clearSlotSwapConfirmation();
    const previousBoardState = cloneBoardState(buildBoardState());
    applyBoardStateDirect(restoreBoard, "swap-undo", restoreSlotIds);
    publishBoardState("swap-undo", {
      previous: summarizeBoardForAudit(previousBoardState),
      slotIds: restoreSlotIds,
    });
    lastAuditBoardState = cloneBoardState(buildBoardState());
    if (bridge && typeof bridge.playMoveCue === "function") {
      bridge.playMoveCue();
    } else {
      bridge.vibrateConfirm();
    }
    if (swapStatusEl) swapStatusEl.hidden = true;
    return true;
  }

  function showSwapStatus(label, mode) {
    if (!swapStatusEl && document && document.body) {
      swapStatusEl = document.createElement("button");
      swapStatusEl.type = "button";
      swapStatusEl.className = "swap-status";
      swapStatusEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pendingSwapUndo && swapStatusEl.dataset && swapStatusEl.dataset.mode === "undo") {
          undoLastSwap();
        } else if (!pendingSwapUndo) {
          swapStatusEl.hidden = true;
        }
      });
      document.body.appendChild(swapStatusEl);
    }
    if (!swapStatusEl) return;
    swapStatusEl.hidden = false;
    swapStatusEl.dataset.mode = mode || "select";
    swapStatusEl.textContent = label;
  }

  function handleAddTimer(view, slotId, presetKey) {
    if (!splitStore || !view || !isAddMode(view) || isTestSlot(getMainSlot(slotId))) return false;
    return runWithServerClock(() => {
      if (splitStore.getEntries(slotId).length > 0) {
        setAddMode(view, false);
        updateSlotView(view, getMainSlot(slotId));
        return false;
      }
      const previousBoardState = cloneBoardState(buildBoardState());
      const changed = splitStore.add(slotId, presetKey);
      if (!changed) return false;
      const addedEntry = splitStore.getEntries(slotId)[0] || null;
      recordSplitActivity(slotId, addedEntry, "start", 0);
      bridge.vibrateConfirm();
      setAddMode(view, false);
      const slot = getMainSlot(slotId);
      if (slot) {
        updateSlotView(view, slot);
      }
      persistBoardRecovery("add");
      publishBoardState("add", {
        previous: summarizeBoardForAudit(previousBoardState),
        slotIds: [slotId],
      });
      lastAuditBoardState = cloneBoardState(buildBoardState());
      return true;
    }, `add:${slotId}`);
  }

  // Explicit diagnostic-only insertion. A test slot is paused with no endAt,
  // so watchdog expiry and the real alarm path can never be reached. Clearing
  // the slot removes the marker and returns it to the normal preset surface.
  function forceTestSlot(slotId, presetKey) {
    const safeSlotId = String(slotId || "");
    const current = getMainSlot(safeSlotId);
    if (!current) return false;
    const safePresetKey = String(presetKey || "5.0");
    const durationSeconds = Math.max(1, Number(core.resolvePresetDurationSeconds(safePresetKey)) || 300);
    if (splitStore) splitStore.clearSlot(safeSlotId);
    const nextState = store.getState();
    const target = nextState.slots.find((slot) => slot && slot.id === safeSlotId);
    if (!target) return false;
    target.status = "paused";
    target.presetKey = safePresetKey;
    target.baseDurationSeconds = durationSeconds;
    target.durationSeconds = durationSeconds;
    target.adjustedDeltaSeconds = 0;
    target.remainingSeconds = durationSeconds;
    target.endAt = 0;
    const replaced = store.replaceState(nextState, { notify: false, reason: "test" });
    const logged = store.recordActivity(safeSlotId, {
      at: getNow(),
      action: "test",
      presetKey: safePresetKey,
      baseDurationSeconds: durationSeconds,
      durationSeconds,
      adjustedDeltaSeconds: 0,
    }, { reason: "test" });
    if (!replaced && !logged) return false;
    refreshAll();
    persistBoardRecovery("test");
    publishBoardState("test", { slotIds: [safeSlotId] });
    lastAuditBoardState = cloneBoardState(buildBoardState());
    return true;
  }

  function startMainTimer(slotId, presetKey) {
    if (isTestSlot(getMainSlot(slotId))) return false;
    if (isRestartBlockedAfterClear(slotId)) return false;
    return triggerClockedChange(() => {
      if (splitStore) {
        splitStore.clearSlot(slotId);
      }
      return store.start(slotId, presetKey);
    }, `start:${slotId}`, () => {
      readoutToggleBlockedUntilBySlot.set(String(slotId), Date.now() + READOUT_AFTER_START_GUARD_MS);
    });
  }

  function clearMainTimer(slotId) {
    const changed = triggerChange(() => store.clear(slotId));
    if (changed) {
      restartBlockedUntilBySlot.set(String(slotId), Date.now() + RESTART_AFTER_CLEAR_GUARD_MS);
      suppressClickUntil = Math.max(suppressClickUntil, Date.now() + RESTART_AFTER_CLEAR_GUARD_MS);
    }
    return changed;
  }

  function isRestartBlockedAfterClear(slotId) {
    const key = String(slotId || "");
    const blockedUntil = Math.max(0, Number(restartBlockedUntilBySlot.get(key)) || 0);
    if (blockedUntil <= 0) return false;
    if (Date.now() < blockedUntil) return true;
    restartBlockedUntilBySlot.delete(key);
    return false;
  }

  function handleAdjustTimer(view, slotId, deltaSeconds, label) {
    if (!view || isTestSlot(getMainSlot(slotId))) return false;
    return triggerClockedChange(
      () => store.adjust(slotId, deltaSeconds),
      `adjust:${slotId}`,
      () => showAdjustFlash(view, label, deltaSeconds)
    );
  }

  function handleAdjustSplitTimer(view, slotId, entryId, deltaSeconds) {
    if (!splitStore || !view || isTestSlot(getMainSlot(slotId))) return false;
    return runWithServerClock(() => {
      const previousBoardState = cloneBoardState(buildBoardState());
      const changed = splitStore.adjust(slotId, entryId, deltaSeconds);
      if (!changed) return false;
      const adjustedEntry = splitStore.getEntries(slotId).find((entry) => entry && entry.id === entryId) || null;
      recordSplitActivity(slotId, adjustedEntry, "adjust", deltaSeconds);
      bridge.vibrateConfirm();
      const slot = getMainSlot(slotId);
      if (slot) updateSlotView(view, slot);
      const splitCard = Array.from(view.splitList.children || [])
        .find((candidate) => candidate && candidate.dataset && candidate.dataset.entryId === entryId);
      if (splitCard && splitCard.__ctFields) {
        playReadoutMotion(splitCard.__ctFields.readoutCluster, deltaSeconds >= 0 ? "up" : "down", splitCard.__ctFields);
      }
      persistBoardRecovery("split-adjust");
      publishBoardState("split-adjust", {
        previous: summarizeBoardForAudit(previousBoardState),
        slotIds: [slotId],
      });
      lastAuditBoardState = cloneBoardState(buildBoardState());
      return true;
    }, `split-adjust:${slotId}`);
  }

  function handleClearSplitTimer(view, slotId, entryId) {
    if (!splitStore || !view) return false;
    const previousBoardState = cloneBoardState(buildBoardState());
    const clearedEntry = splitStore.getEntries(slotId).find((entry) => entry && entry.id === entryId) || null;
    const changed = splitStore.clearEntry(slotId, entryId);
    if (!changed) return false;
    recordSplitActivity(slotId, clearedEntry, "clear", 0);
    bridge.vibrateConfirm();
    setAddMode(view, false);
    const slot = getMainSlot(slotId);
    if (slot) updateSlotView(view, slot);
    persistBoardRecovery("split-clear");
    publishBoardState("split-clear", {
      previous: summarizeBoardForAudit(previousBoardState),
      slotIds: [slotId],
    });
    lastAuditBoardState = cloneBoardState(buildBoardState());
    return true;
  }

  function recordSplitActivity(slotId, entry, action, deltaSeconds) {
    if (!entry || !store || typeof store.recordActivity !== "function") return false;
    return store.recordActivity(slotId, {
      at: getNow(),
      action,
      presetKey: entry.presetKey || "",
      baseDurationSeconds: Math.max(0, Number(entry.baseDurationSeconds) || 0),
      durationSeconds: Math.max(0, Number(entry.durationSeconds) || 0),
      adjustedDeltaSeconds: Math.trunc(Number(entry.adjustedDeltaSeconds) || 0),
      deltaSeconds: Math.trunc(Number(deltaSeconds) || 0),
      peerSlotId: `split:${String(entry.id || "timer")}`,
    }, { notify: false });
  }

  function handleReadoutToggle(slotId) {
    const guardKey = String(slotId || "");
    const blockedUntil = Math.max(0, Number(readoutToggleBlockedUntilBySlot.get(guardKey)) || 0);
    if (blockedUntil > Date.now()) return false;
    if (blockedUntil > 0) readoutToggleBlockedUntilBySlot.delete(guardKey);
    const slot = getMainSlot(slotId);
    if (!slot) return false;
    if (isTestSlot(slot)) return false;
    if (slot.status === "running") {
      return triggerChange(() => store.pause(slotId));
    }
    if (slot.status === "paused") {
      const view = slotViews.get(slotId);
      return triggerClockedChange(
        () => store.resume(slotId),
        `resume:${slotId}`,
        () => playReadoutMotion(view && view.readoutCluster, "resume", view)
      );
    }
    return false;
  }

  function showAdjustFlash(view, label, deltaSeconds) {
    if (!view || !view.adjustFlash) return;
    if (view.adjustFlashTimerId) {
      global.clearTimeout(view.adjustFlashTimerId);
    }
    view.adjustFlash.hidden = false;
    view.adjustFlash.textContent = label;
    view.adjustFlash.dataset.tone = deltaSeconds >= 0 ? "up" : "down";
    view.adjustFlash.className = "adjust-flash is-visible";
    playReadoutMotion(view.readoutCluster, deltaSeconds >= 0 ? "up" : "down", view);
    fitTimerReadout(view, true);
    view.adjustFlashTimerId = global.setTimeout(() => {
      view.adjustFlash.hidden = true;
      view.adjustFlash.className = "adjust-flash";
      view.adjustFlashTimerId = 0;
      fitTimerReadout(view, true);
    }, 900);
  }

  function playReadoutMotion(cluster, tone, owner) {
    if (!cluster || !cluster.dataset) return;
    if (owner && owner.readoutMotionTimerId) {
      global.clearTimeout(owner.readoutMotionTimerId);
    }
    cluster.dataset.motion = String(tone || "resume");
    const timerId = global.setTimeout(() => {
      delete cluster.dataset.motion;
      if (owner) owner.readoutMotionTimerId = 0;
    }, 360);
    if (owner) owner.readoutMotionTimerId = timerId;
  }

  function refreshAll(renderBoardState) {
    if (renderBoardState) {
      renderBoardStateView(renderBoardState);
      return;
    }
    const snapshot = store.getSnapshot();
    latestFinishRanks = buildFinishRankMap(snapshot.slots);
    snapshot.slots.forEach((slot) => {
      syncSplitState(slot);
      const view = slotViews.get(slot.id);
      if (!view) return;
      updateSlotView(view, slot);
    });
    refreshBoardInfo();
  }

  function renderBoardStateView(boardState) {
    const mainSlots = boardState && boardState.main && Array.isArray(boardState.main.slots)
      ? boardState.main.slots
      : [];
    refreshSlotViews(mainSlots.map((slot) => (slot && slot.id ? slot.id : "")).filter(Boolean), boardState);
    refreshBoardInfo(boardState);
  }

  function refreshSlotViews(slotIds, renderBoardState) {
    const ids = Array.from(new Set((Array.isArray(slotIds) ? slotIds : [])
      .map((slotId) => String(slotId || ""))
      .filter(Boolean)));
    if (ids.length === 0) return;
    const mainSlots = renderBoardState && renderBoardState.main && Array.isArray(renderBoardState.main.slots)
      ? renderBoardState.main.slots
      : store.getSnapshot().slots;
    latestFinishRanks = buildFinishRankMap(mainSlots);
    ids.forEach((slotId) => {
      const slot = mainSlots.find((item) => item && item.id === slotId);
      if (!slot) return;
      const view = slotViews.get(slot.id);
      if (!view) return;
      if (renderBoardState) {
        updateSlotView(view, slot, getSplitEntriesFromBoard(renderBoardState, slot.id));
        return;
      }
      syncSplitState(slot);
      updateSlotView(view, slot);
    });
  }

  function getSplitEntriesFromBoard(boardState, slotId) {
    const splitSlots = boardState && boardState.split && boardState.split.slots && typeof boardState.split.slots === "object"
      ? boardState.split.slots
      : {};
    const entries = Array.isArray(splitSlots[slotId]) ? splitSlots[slotId] : [];
    return entries.map((entry) => Object.assign({}, entry));
  }

  function refreshRunningReadouts() {
    if (activeSlotDrag && activeSlotDrag.previewBoardState) {
      refreshSlotViews(getSlotDragAffectedIds(activeSlotDrag.targetSlotId, activeSlotDrag.targetSlotId), activeSlotDrag.previewBoardState);
      markSlotDragPreview();
      return;
    }
    const snapshot = store.getSnapshot();
    latestFinishRanks = buildFinishRankMap(snapshot.slots);
    snapshot.slots.forEach((slot) => {
      if (slot.status !== "running") return;
      const view = slotViews.get(slot.id);
      if (!view) return;
      const rankInfo = latestFinishRanks.get(slot.id) || null;
      const urgencyInfo = getUrgencyInfo(slot);
      view.statusChip.dataset.state = slot.status;
      view.statusChip.dataset.rank = rankInfo ? rankInfo.tone : "";
      view.statusChip.textContent = getChipLabel(slot.status, rankInfo);
      view.stateLabel.dataset.state = slot.status;
      view.stateLabel.dataset.rank = rankInfo ? rankInfo.tone : "";
      view.stateLabel.dataset.urgency = urgencyInfo ? urgencyInfo.tone : "";
      view.stateLabel.textContent = getPanelLabel(slot.status, isAddMode(view), urgencyInfo);
      const totalText = `/ ${core.formatDuration(slot.durationSeconds)}`;
      if (view.total.textContent !== totalText) view.total.textContent = totalText;
      view.total.hidden = false;
      // The fill and the separate surface line are distinct layers. Keep both
      // on the same per-second absolute level so the visible waterline cannot
      // remain frozen at the timer's starting height.
      updateHourglass(view.hourglass, store.getDisplaySeconds(slot), slot.status, view.waterSurface, view.waterUrgencyFrame);
      setCardState(view.card, slot, rankInfo, urgencyInfo);
      setMainReadoutPresentation(view, slot.status, core.formatDuration(store.getDisplaySeconds(slot)), false);
      updateSlotInfo(view, slot, rankInfo);
    });
  }

  function requestReadoutFit() {
    if (readoutFitFrame) return;
    const run = () => {
      readoutFitFrame = 0;
      refreshReadoutFits();
    };
    if (typeof global.requestAnimationFrame === "function") {
      readoutFitFrame = global.requestAnimationFrame(run);
    } else {
      readoutFitFrame = global.setTimeout(run, 0);
    }
  }

  function observeReadoutFit(view) {
    if (!view || !view.readoutCluster || typeof global.ResizeObserver !== "function") return;
    const observer = new global.ResizeObserver((entries) => {
      const entry = entries.find((item) => item && item.target === view.readoutCluster);
      const box = entry && entry.contentRect;
      if (!box) return;
      const nextWidth = Math.round((Number(box.width) || 0) * 10) / 10;
      const nextHeight = Math.round((Number(box.height) || 0) * 10) / 10;
      if (view.readoutFitObservedWidth === nextWidth
        && view.readoutFitObservedHeight === nextHeight) return;
      view.readoutFitObservedWidth = nextWidth;
      view.readoutFitObservedHeight = nextHeight;
      view.readoutFitCacheKey = "";
      view.readoutFitCacheFontPx = 0;
      requestReadoutFit();
    });
    observer.observe(view.readoutCluster);
    view.readoutFitObserver = observer;
  }

  function invalidateReadoutFitCache() {
    slotViews.forEach((view) => {
      if (!view) return;
      view.readoutFitCacheKey = "";
      view.readoutFitCacheFontPx = 0;
    });
  }

  function normalizeReadoutShape(value) {
    return String(value || "").replace(/\d/g, "0");
  }

  function isFixedHeightTwoLineReadout(readout) {
    if (!readout || typeof readout.querySelector !== "function") return false;
    const minutes = readout.querySelector(".countdown-minutes");
    const seconds = readout.querySelector(".countdown-seconds");
    const separator = readout.querySelector(".countdown-separator");
    if (!minutes || !seconds || !separator || typeof global.getComputedStyle !== "function") return false;
    const readoutStyle = global.getComputedStyle(readout);
    const separatorStyle = global.getComputedStyle(separator);
    return readoutStyle.display === "grid"
      && separatorStyle.display === "none"
      && (readoutStyle.overflow === "hidden"
        || readout.dataset.counterLayout === "two-line");
  }

  function getRenderedTwoLineReadoutBounds(readout) {
    if (!readout || typeof readout.querySelector !== "function") return null;
    const boxes = [".countdown-minutes", ".countdown-seconds"]
      .map((selector) => readout.querySelector(selector))
      .filter(Boolean)
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    if (boxes.length !== 2) return null;
    return boxes.reduce((bounds, box) => ({
      left: Math.min(bounds.left, box.left),
      top: Math.min(bounds.top, box.top),
      right: Math.max(bounds.right, box.right),
      bottom: Math.max(bounds.bottom, box.bottom),
    }), {
      left: boxes[0].left,
      top: boxes[0].top,
      right: boxes[0].right,
      bottom: boxes[0].bottom,
    });
  }

  function renderedTwoLineReadoutFits(readout, availableHeight) {
    const bounds = getRenderedTwoLineReadoutBounds(readout);
    if (!bounds) return false;
    const readoutBox = readout.getBoundingClientRect();
    const safeInset = 2;
    return bounds.left >= readoutBox.left + safeInset - 1
      && bounds.right <= readoutBox.right - safeInset + 1
      && bounds.top >= readoutBox.top + safeInset - 1
      && bounds.bottom <= readoutBox.bottom - safeInset + 1
      && bounds.bottom - bounds.top <= availableHeight + 1;
  }

  function renderedReadoutChildrenFit(readout) {
    if (!readout || typeof readout.querySelectorAll !== "function") return false;
    if (readout.scrollWidth > readout.clientWidth + 1
      || readout.scrollHeight > readout.clientHeight + 1) return false;
    const readoutBox = readout.getBoundingClientRect();
    const children = Array.from(readout.querySelectorAll(
      "[data-counter-line], .countdown-minutes, .countdown-seconds, .countdown-inline",
    ));
    if (children.length === 0) return true;
    return children.every((child) => {
      const box = child.getBoundingClientRect();
      return box.left >= readoutBox.left - 1
        && box.right <= readoutBox.right + 1
        && box.top >= readoutBox.top - 1
        && box.bottom <= readoutBox.bottom + 1;
    });
  }

  function refreshReadoutFits() {
    slotViews.forEach((view) => fitTimerReadout(view));
  }

  function setReadoutLayoutMode(view) {
    if (!view || !view.readout || !view.timerPanel) return "one-line";
    const viewportWidth = Number(global.innerWidth) || 0;
    const viewportHeight = Number(global.innerHeight) || 0;
    const landscape = viewportWidth >= viewportHeight;
    const hasSplit = view.timerPanel.dataset.hasSplit === "true";
    const addMode = view.timerPanel.dataset.addMode === "true";
    // At wide, status-bar-short landscape heights there is not enough vertical
    // room for two real 30px line boxes. Keep the semantic layout mode aligned
    // with the geometry: a compact horizontal readout is a one-line readout.
    // The narrower 640x320 profile remains two-line and gets its own 29px
    // child line boxes in the final V3 CSS contract.
    const compactWideLandscape = landscape && viewportWidth >= 700 && viewportHeight <= 360;
    // OV is the physical counter that users read from across the work area.
    // Reserve one centered horizontal lane for it in normal landscape widths;
    // the compact 640x320 profile keeps its existing dedicated contract.
    const ovenLandscape = landscape
      && view.card
      && view.card.dataset
      && view.card.dataset.zone === "oven";
    const wideOvenLandscape = ovenLandscape && viewportWidth >= 800;
    const mode = wideOvenLandscape
      ? "one-line"
      : landscape
        && !addMode
        && !compactWideLandscape
        ? "two-line"
        : "one-line";
    const wideOvenWorkArea = wideOvenLandscape && viewportWidth >= 1200 && viewportHeight >= 600;
    const wideOvenPrimaryWorkArea = wideOvenLandscape && viewportWidth >= 1200 && viewportHeight >= 740;
    const adaptivePrimary = !landscape || (latestDisplayProfile && latestDisplayProfile.name === "primary-subnotebook");
    const profileName = hasSplit
      ? wideOvenWorkArea ? "wide-split" : "split"
      : addMode
        ? wideOvenWorkArea ? "wide-add" : "compact-add"
        : wideOvenPrimaryWorkArea
          ? "wide-primary"
          : adaptivePrimary
            ? "adaptive-primary"
            : "compact-primary";
    const profile = READOUT_PROFILES[profileName];
    const currentReadoutCluster = view.timerPanel.querySelector(":scope > .adjust-controls > .readout-cluster")
      || view.readoutCluster;
    const readoutOwner = addMode && view.adjustControls
      ? view.adjustControls
      : currentReadoutCluster;
    const clusterBox = readoutOwner && typeof readoutOwner.getBoundingClientRect === "function"
      ? readoutOwner.getBoundingClientRect()
      : null;
    // Add mode keeps its actions on a real side rail. A narrow non-OV card
    // therefore owns a narrow main lane even when the viewport itself is
    // wide (Note9 landscape and the six-column sub-notebook are examples).
    // Select from the measured component, not from viewport orientation.
    const narrowAddMain = addMode
      && !ovenLandscape
      && clusterBox
      && clusterBox.width > 0
      && clusterBox.width < 120;
    const tallNarrowMain = !addMode
      && !landscape
      && !wideOvenLandscape
      && clusterBox
      && clusterBox.height / Math.max(1, clusterBox.width) >= 1.5;
    const readoutMode = narrowAddMain || tallNarrowMain
      ? "two-line"
      : profileName === "compact-primary" || profileName === "split"
        ? mode
        : profile ? profile.mode : mode;
    view.timerPanel.dataset.readoutProfile = profileName;
    view.readout.dataset.readoutProfile = profileName;
    if (view.readout.dataset.counterLayout !== readoutMode) {
      view.readout.dataset.counterLayout = readoutMode;
    }
    // Layout selection owns only the semantic mode/profile. The measured fit
    // below is the sole inline font-size owner; otherwise a later split render
    // can restore the preferred profile size after it has already been fitted.
    return readoutMode;
  }

  function fitTimerReadout(view, options) {
    const forceFit = options === true || Boolean(options && options.forceFit);
    if (!view || !view.readout || !view.readoutCluster) return;
    setReadoutLayoutMode(view);
    if (view.timerPanel.hidden || view.readout.hidden) {
      view.readoutFitCacheKey = "";
      view.readoutFitCacheFontPx = 0;
      return;
    }

    const readout = view.readout;
    const cluster = view.readoutCluster;
    const clusterWidth = Number(cluster.clientWidth) || 0;
    const clusterHeight = Number(cluster.clientHeight) || 0;
    if (clusterWidth <= 0 || clusterHeight <= 0) {
      view.readoutFitCacheKey = "";
      view.readoutFitCacheFontPx = 0;
      return;
    }

    const readoutProfileName = view.timerPanel.dataset.readoutProfile || "";
    const profile = READOUT_PROFILES[readoutProfileName] || null;
    const totalVisible = Boolean(view.total && !view.total.hidden);
    const totalHeight = totalVisible ? Number(view.total.offsetHeight) || 0 : 0;
    const flashVisible = Boolean(view.adjustFlash && !view.adjustFlash.hidden);
    const flashHeight = flashVisible ? Number(view.adjustFlash.offsetHeight) || 0 : 0;
    const sourceName = document.body && document.body.dataset ? String(document.body.dataset.source || "") : "";
    const profileName = document.body && document.body.dataset ? String(document.body.dataset.profile || "") : "";
    const displayProfileName = document.body && document.body.dataset
      ? String(document.body.dataset.displayProfile || "")
      : "";
    const viewport = global.visualViewport || {};
    const viewportWidth = Number(global.innerWidth) || 0;
    const viewportHeight = Number(global.innerHeight) || 0;
    const visualWidth = Number(viewport.width) || 0;
    const visualHeight = Number(viewport.height) || 0;
    const deviceScale = Number(global.devicePixelRatio) || 1;
    const viewportScale = Number(viewport.scale) || 1;
    const orientationName = String(
      (latestDisplayProfile && latestDisplayProfile.orientation)
        || (viewportWidth >= viewportHeight ? "landscape" : "portrait"),
    );
    const screenOrientation = global.screen && global.screen.orientation
      ? String(global.screen.orientation.type || "")
      : "";
    const layoutMode = [
      view.card && view.card.dataset ? String(view.card.dataset.state || "") : "",
      view.timerPanel && view.timerPanel.dataset ? String(view.timerPanel.dataset.hasSplit || "") : "",
      view.timerPanel && view.timerPanel.dataset ? String(view.timerPanel.dataset.addMode || "") : "",
      view.addPresetGrid && view.addPresetGrid.dataset ? String(view.addPresetGrid.dataset.open || "") : "",
      view.actions && view.actions.dataset ? String(view.actions.dataset.mode || "") : "",
    ].join(":");
    const readoutValue = readout.dataset && readout.dataset.displayValue
      ? readout.dataset.displayValue
      : readout.textContent;
    const readoutShape = normalizeReadoutShape(readoutValue);
    // Preserve only a small WebView safety margin. The binary fit already
    // measures the real box, so a large fixed trim needlessly shrinks the
    // operationally most important element: the countdown.
    const sourceTrimPx = sourceName.indexOf("android") === 0 || profileName === "subnote" ? 2 : 0;
    const fixedHeightTwoLine = isFixedHeightTwoLineReadout(readout);
    const signature = [
      clusterWidth,
      clusterHeight,
      totalVisible ? 1 : 0,
      totalHeight,
      flashVisible ? 1 : 0,
      flashHeight,
      sourceName,
      profileName,
      displayProfileName,
      latestDisplayProfile ? latestDisplayProfile.name : "",
      latestDisplayProfile ? latestDisplayProfile.orientation : "",
      orientationName,
      screenOrientation,
      viewportWidth,
      viewportHeight,
      visualWidth,
      visualHeight,
      deviceScale,
      viewportScale,
      layoutMode,
      sourceTrimPx,
      readoutShape,
    ].join("|");

    if (!forceFit
      && view.readoutFitCacheKey === signature
      && Number.isFinite(view.readoutFitCacheFontPx)
      && view.readoutFitCacheFontPx > 0) {
      const cachedFontSize = view.readoutFitCacheFontPx + "px";
      if (readout.style.fontSize !== cachedFontSize) {
        readout.style.fontSize = cachedFontSize;
      }
      const cachedClipped = !renderedReadoutChildrenFit(readout);
      if (!cachedClipped) {
        runtimeStats.readoutFitCacheHits += 1;
        return;
      }
      view.readoutFitCacheKey = "";
      view.readoutFitCacheFontPx = 0;
    }

    runtimeStats.readoutFitPasses += 1;
    // The hourglass is the full-cell background gauge, so it must not reserve
    // a narrow side column or reduce the countdown font size.
    const availableWidth = Math.max(24, clusterWidth - 8);
    // Profile lanes own their full block.  The total/flash are sibling overlays
    // in that component and must not repeatedly eat the running counter's
    // height budget as ticks repaint them.
    const availableHeight = profile
      ? Math.max(profile.lanePx, clusterHeight)
      : Math.max(18, clusterHeight - totalHeight - flashHeight - 8);
    if (profile) {
      const lockedFont = profile.fontPx;
      readout.style.fontSize = `${lockedFont}px`;
      const clipped = !renderedReadoutChildrenFit(readout);
      runtimeStats.readoutFitClipChecks += 1;
      view.readoutFitCacheKey = signature;
      view.readoutFitCacheFontPx = lockedFont;
      if (!clipped) return;
      // A profile font is the preferred readable maximum, not a fixed size.
      // Keep the 30px contract, but fit downward when the measured lane is
      // narrower than the preferred profile instead of preserving clipping.
    }
    let low = READOUT_MIN_FONT_PX;
    let high = profile
      ? Math.max(low, profile.fontPx)
      : Math.min(READOUT_MAX_FONT_PX, Math.max(low, availableHeight * 1.25));

    readout.style.fontSize = low + "px";
    for (let i = 0; i < 9; i += 1) {
      runtimeStats.readoutFitBinaryIterations += 1;
      const mid = (low + high) / 2;
      readout.style.fontSize = mid + "px";
      const fitsWidth = readout.scrollWidth <= availableWidth + 1;
      const fitsScrollBox = renderedReadoutChildrenFit(readout);
      const fitsHeight = fixedHeightTwoLine
        ? fitsScrollBox && renderedTwoLineReadoutFits(readout, availableHeight)
        : readout.scrollHeight <= availableHeight + 1;
      if (fitsWidth && fitsScrollBox && fitsHeight) {
        low = mid;
      } else {
        high = mid;
      }
    }
    let finalFontPx = Math.max(READOUT_MIN_FONT_PX, Math.floor(low) - sourceTrimPx);
    readout.style.fontSize = finalFontPx + "px";
    // Two-line landscape digits can overhang their own grid box by 1-2px
    // because the seconds row has a separator and margin. Keep the largest
    // readable counter that is actually unclipped on the rendered WebView.
    for (let retry = 0; retry < 8 && finalFontPx > READOUT_MIN_FONT_PX; retry += 1) {
      runtimeStats.readoutFitClipChecks += 1;
      const clipped = !renderedReadoutChildrenFit(readout)
        || (fixedHeightTwoLine && !renderedTwoLineReadoutFits(readout, availableHeight));
      if (!clipped) break;
      finalFontPx -= 1;
      readout.style.fontSize = finalFontPx + "px";
    }
    view.readoutFitCacheKey = signature;
    view.readoutFitCacheFontPx = finalFontPx;
  }

  function refreshSplitReadouts() {
    if (!splitStore) return;
    if (activeSlotDrag && activeSlotDrag.previewBoardState) {
      refreshSlotViews(getSlotDragAffectedIds(activeSlotDrag.targetSlotId, activeSlotDrag.targetSlotId), activeSlotDrag.previewBoardState);
      markSlotDragPreview();
      return;
    }
    const snapshot = store.getSnapshot();
    snapshot.slots.forEach((slot) => {
      const view = slotViews.get(slot.id);
      if (!view) return;
      renderSplitView(view, slot);
    });
  }

  function syncSplitState(slot) {
    if (!splitStore) return;
    if (slot.status === "idle") {
      if (slot.lastCompleted && splitStore.getEntries(slot.id).length > 0) return;
      splitStore.clearSlot(slot.id);
      return;
    }
    if (slot.status === "expired") return;
    if (slot.status === "paused") {
      splitStore.pauseAll(slot.id);
      return;
    }
    splitStore.resumeAll(slot.id);
  }

  function cleanupCompletedSplitTimers() {
    if (!splitStore) return { changed: false, slotIds: [] };
    const currentAt = getNow();
    const snapshot = store.getSnapshot();
    let nextMainState = null;
    const changedSlotIds = new Set();

    snapshot.slots.forEach((slot) => {
      if (!slot || !slot.id) return;
      const entries = splitStore.getEntries(slot.id);
      if (entries.length === 0) return;

      if (slot.status === "expired") {
        if (!isMainCompletedReadyForSplitCleanup(slot, currentAt)) return;
        const remainingEntry = entries.find((entry) => entry.status === "running" || entry.status === "paused") || null;
        const waitingExpiredEntry = entries.find((entry) => entry.status === "expired" && !isSplitEntryReadyForCleanup(entry, currentAt)) || null;
        if (!remainingEntry && waitingExpiredEntry) return;
        if (!nextMainState) nextMainState = store.getState();
        const index = nextMainState.slots.findIndex((item) => item && item.id === slot.id);
        if (index < 0) return;
        if (remainingEntry) {
          nextMainState.slots[index] = createMainSlotFromSplitEntry(slot.id, remainingEntry, slot);
        } else {
          nextMainState.slots[index] = createIdleSlotWithCompleted(slot.id, getLatestCompletedRecord(slot, entries), slot);
          entries.filter((entry) => entry && entry.status === "expired").forEach((entry) => {
            appendSplitCompletionMetadata(nextMainState.slots[index], entry, currentAt);
          });
        }
        splitStore.clearSlot(slot.id);
        changedSlotIds.add(slot.id);
        return;
      }

      entries.forEach((entry) => {
        if (!isSplitEntryReadyForCleanup(entry, currentAt)) return;
        if (!nextMainState) nextMainState = store.getState();
        const index = nextMainState.slots.findIndex((item) => item && item.id === slot.id);
        if (index >= 0) appendSplitCompletionMetadata(nextMainState.slots[index], entry, currentAt);
        if (splitStore.clearEntry(slot.id, entry.id)) {
          changedSlotIds.add(slot.id);
        }
      });
    });

    if (nextMainState) {
      store.replaceState(nextMainState, { notify: false, reason: "split-cleanup" });
    }
    return { changed: changedSlotIds.size > 0, slotIds: Array.from(changedSlotIds) };
  }

  function isMainCompletedReadyForSplitCleanup(slot, currentAt) {
    const record = getCompletedRecordForSlot(slot);
    const completedAt = getCompletedAt(record);
    return completedAt > 0 && currentAt - completedAt >= SPLIT_COMPLETED_VISIBLE_MS;
  }

  function isSplitEntryReadyForCleanup(entry, currentAt) {
    if (!entry || entry.status !== "expired") return false;
    const completedAt = getCompletedAt(entry);
    return completedAt <= 0 || currentAt - completedAt >= SPLIT_COMPLETED_VISIBLE_MS;
  }

  function createMainSlotFromSplitEntry(slotId, entry, previousSlot) {
    const status = entry.status === "paused" ? "paused" : "running";
    const remainingSeconds = status === "running" ? splitStore.getDisplaySeconds(entry) : Math.max(1, Number(entry.remainingSeconds || entry.durationSeconds) || 1);
    return {
      id: slotId,
      status,
      presetKey: entry.presetKey || "",
      baseDurationSeconds: Math.max(1, Number(entry.baseDurationSeconds || entry.durationSeconds) || 1),
      durationSeconds: Math.max(1, Number(entry.durationSeconds) || 1),
      adjustedDeltaSeconds: Number(entry.adjustedDeltaSeconds) || 0,
      remainingSeconds,
      endAt: status === "running" ? Math.max(0, Number(entry.endAt) || 0) : 0,
      lastCompleted: previousSlot && previousSlot.lastCompleted ? previousSlot.lastCompleted : null,
      completionCount: Math.max(0, Math.trunc(Number(previousSlot && previousSlot.completionCount) || 0)),
      activityLog: previousSlot && Array.isArray(previousSlot.activityLog) ? previousSlot.activityLog.slice(-40) : [],
    };
  }

  function createIdleSlotWithCompleted(slotId, record, previousSlot) {
    return {
      id: slotId,
      status: "idle",
      presetKey: "",
      baseDurationSeconds: 0,
      durationSeconds: 0,
      adjustedDeltaSeconds: 0,
      remainingSeconds: 0,
      endAt: 0,
      lastCompleted: record || null,
      completionCount: Math.max(0, Math.trunc(Number(previousSlot && previousSlot.completionCount) || 0)),
      activityLog: previousSlot && Array.isArray(previousSlot.activityLog) ? previousSlot.activityLog.slice(-40) : [],
    };
  }

  function appendSplitCompletionMetadata(slot, entry, fallbackAt) {
    if (!slot || !entry) return;
    const completedAt = getCompletedAt(entry) || Math.max(0, Number(fallbackAt) || getNow());
    const logEntry = {
      at: completedAt,
      action: "completed",
      presetKey: entry.presetKey || "",
      durationSeconds: Math.max(0, Number(entry.durationSeconds) || 0),
      deltaSeconds: 0,
      peerSlotId: `split:${String(entry.id || "timer")}`,
    };
    const logs = Array.isArray(slot.activityLog) ? slot.activityLog.slice() : [];
    const exists = logs.some((item) => item
      && Number(item.at) === completedAt
      && item.action === "completed"
      && String(item.presetKey || "") === String(logEntry.presetKey || "")
      && String(item.peerSlotId || "") === logEntry.peerSlotId);
    if (!exists) {
      logs.push(logEntry);
      slot.completionCount = Math.max(0, Math.trunc(Number(slot.completionCount) || 0)) + 1;
    }
    slot.activityLog = logs.sort((left, right) => Number(left.at || 0) - Number(right.at || 0)).slice(-40);
    const record = createCompletedRecordFromSplitEntry(entry);
    if (record && (!slot.lastCompleted || getCompletedAt(record) >= getCompletedAt(slot.lastCompleted))) {
      slot.lastCompleted = record;
    }
  }

  function getLatestCompletedRecord(slot, splitEntries) {
    const records = [getCompletedRecordForSlot(slot)]
      .concat((Array.isArray(splitEntries) ? splitEntries : []).map(createCompletedRecordFromSplitEntry))
      .filter(Boolean);
    if (records.length === 0) return null;
    return records.sort((left, right) => getCompletedAt(right) - getCompletedAt(left))[0];
  }

  function createCompletedRecordFromSplitEntry(entry) {
    const completedAt = getCompletedAt(entry);
    if (!entry || completedAt <= 0) return null;
    const baseDurationSeconds = Math.max(0, Number(entry.baseDurationSeconds || entry.durationSeconds) || 0);
    const finalDurationSeconds = Math.max(0, Number(entry.durationSeconds || baseDurationSeconds) || 0);
    return {
      durationSeconds: finalDurationSeconds || baseDurationSeconds,
      baseDurationSeconds: baseDurationSeconds || finalDurationSeconds,
      presetKey: entry.presetKey || "",
      finalDurationSeconds: finalDurationSeconds || baseDurationSeconds,
      adjustedDeltaSeconds: Number(entry.adjustedDeltaSeconds) || 0,
      completedAt,
      completedAtServerMs: completedAt,
    };
  }

  function refreshIdleCompletedNotes() {
    if (activeSlotDrag && activeSlotDrag.previewBoardState) {
      const boardState = activeSlotDrag.previewBoardState;
      const slots = boardState && boardState.main && Array.isArray(boardState.main.slots) ? boardState.main.slots : [];
      const visibleSlotIds = new Set(getSlotDragAffectedIds(activeSlotDrag.targetSlotId, activeSlotDrag.targetSlotId));
      slots.forEach((slot) => {
        if (!visibleSlotIds.has(slot && slot.id ? slot.id : "")) return;
        if (!slot || (slot.status !== "idle" && slot.status !== "expired")) return;
        const view = slotViews.get(slot.id);
        updateIdleLastCompleted(view, slot);
        updateSlotInfo(view, slot, null);
      });
      markSlotDragPreview();
      return;
    }
    const snapshot = store.getSnapshot();
    snapshot.slots.forEach((slot) => {
      if (!slot || (slot.status !== "idle" && slot.status !== "expired")) return;
      const view = slotViews.get(slot.id);
      updateIdleLastCompleted(view, slot);
      updateSlotInfo(view, slot, null);
    });
  }
  function updateIdleLastCompleted(view, slot) {
    if (!view || !view.lastCompletedNote || !view.completedBadge) return;
    const record = getCompletedRecordForSlot(slot);
    const text = formatLastCompletedText(record);
    view.lastCompletedNote.hidden = !text;
    view.lastCompletedNote.textContent = text;
    const showRecentAlert = Boolean(slot && (slot.status === "idle" || slot.status === "expired"));
    view.completedBadge.hidden = true;
    view.completedBadge.textContent = "";
    const timerFamily = record ? getTimerFamilyForCompletedRecord(record) : "";
    if (timerFamily) {
      view.completedBadge.dataset.timerFamily = timerFamily;
    } else {
      delete view.completedBadge.dataset.timerFamily;
    }
    const recent = Boolean(showRecentAlert && record && getNow() - getCompletedAt(record) < 90000);
    view.lastCompletedNote.dataset.recent = recent ? "true" : "false";
    view.completedBadge.dataset.recent = recent ? "true" : "false";
    view.card.dataset.recentAlert = recent ? "true" : "false";
    if (view.presetGrid) {
      view.presetGrid.dataset.completed = "false";
    }
    if (recent) maybePlayCompletionImpact(view, record);
  }

  function maybePlayCompletionImpact(view, record) {
    if (!view || !view.card || !view.completionImpact || !record) return;
    const completedAt = getCompletedAt(record);
    if (completedAt <= 0 || view.lastCompletionImpactAt === completedAt) return;
    view.lastCompletionImpactAt = completedAt;
    const ageMs = Math.max(0, getNow() - completedAt);
    if (ageMs > COMPLETION_IMPACT_MAX_AGE_MS) return;
    if (view.completionImpactTimerId) {
      global.clearTimeout(view.completionImpactTimerId);
    }
    view.completionImpact.hidden = false;
    view.card.dataset.completionImpact = "true";
    view.completionImpactTimerId = global.setTimeout(() => {
      view.card.dataset.completionImpact = "false";
      view.completionImpact.hidden = true;
      view.completionImpactTimerId = 0;
    }, COMPLETION_IMPACT_DURATION_MS);
  }
  function getCompletedRecordForSlot(slot) {
    if (!slot) return null;
    if (slot.lastCompleted) return slot.lastCompleted;
    if (slot.status !== "expired") return null;
    const completedAt = slot.endAt || getNow();
    const baseDurationSeconds = Math.max(0, Number(slot.baseDurationSeconds || slot.durationSeconds) || 0);
    const finalDurationSeconds = Math.max(0, Number(slot.durationSeconds) || 0);
    if (finalDurationSeconds <= 0 && baseDurationSeconds <= 0) return null;
    return {
      durationSeconds: finalDurationSeconds || baseDurationSeconds,
      baseDurationSeconds: baseDurationSeconds || finalDurationSeconds,
      presetKey: slot.presetKey || "",
      finalDurationSeconds: finalDurationSeconds || baseDurationSeconds,
      adjustedDeltaSeconds: Number.isFinite(Number(slot.adjustedDeltaSeconds))
        ? Math.trunc(Number(slot.adjustedDeltaSeconds))
        : (finalDurationSeconds || baseDurationSeconds) - (baseDurationSeconds || finalDurationSeconds),
      completedAt,
      completedAtServerMs: completedAt,
    };
  }
  function formatLastCompletedText(record) {
    if (!record || !getCompletedAt(record)) return "";
    return "울림 " + formatCompletedBaseLabel(record) + " · " + formatCompletedElapsedText(record);
  }
  function formatCompletedBadgeText(record) {
    if (!record || !getCompletedAt(record)) return "";
    const parts = [formatCompletedBaseLabel(record) + " 완료"];
    const adjustedText = formatAdjustedDeltaText(record.adjustedDeltaSeconds);
    if (adjustedText) parts.push(adjustedText);
    return parts.join(" · ");
  }
  function formatCompletedBaseLabel(record) {
    const presetKey = record && record.presetKey ? String(record.presetKey) : "";
    if (presetKey) return core.getPresetDisplay(presetKey);
    return core.formatPresetBadge((record && (record.baseDurationSeconds || record.durationSeconds)) || 0);
  }
  function formatAdjustedDeltaText(value) {
    const delta = Math.trunc(Number(value) || 0);
    if (delta === 0) return "";
    return (delta > 0 ? "+" : "") + delta + "초";
  }
  function getCompletedAt(record) {
    return Math.max(0, Number((record && (record.completedAtServerMs || record.completedAt)) || 0));
  }
  function getCompletedElapsedMinutes(record) {
    const completedAt = getCompletedAt(record);
    if (completedAt <= 0) return 0;
    return Math.max(0, Math.floor((getNow() - completedAt) / 60000));
  }
  function formatCompletedElapsedText(record) {
    return formatElapsedAge(getCompletedAt(record));
  }
  function getTimerFamilyForCompletedRecord(record) {
    if (!record) return "";
    return getTimerFamilyForPreset(record.presetKey) || getTimerFamilyForDuration(record.baseDurationSeconds || record.durationSeconds);
  }
  function buildFinishRankMap(slots) {
    const map = new Map();
    slots
      .filter((slot) => slot && slot.status === "running")
      .slice()
      .sort((left, right) => {
        const diff = store.getDisplaySeconds(left) - store.getDisplaySeconds(right);
        if (diff !== 0) return diff;
        return String(left.id).localeCompare(String(right.id));
      })
      .forEach((slot, index) => {
        const order = index + 1;
        map.set(slot.id, {
          order,
          label: `${order}순위`,
          tone: order === 1 ? "1" : order === 2 ? "2" : order === 3 ? "3" : "late",
        });
      });
    return map;
  }

  function getTimerFamilyForDuration(durationSeconds) {
    const safeDuration = Math.max(0, Math.round(Number(durationSeconds) || 0));
    return TIMER_FAMILY_BY_DURATION[safeDuration] || "";
  }

  function getTimerFamilyForPreset(presetKey) {
    return TIMER_FAMILY_BY_PRESET[String(presetKey || "")] || "";
  }

  function getTimerFamilyForSlot(slot) {
    if (!slot) return "";
    return getTimerFamilyForPreset(slot.presetKey) || getTimerFamilyForDuration(slot.durationSeconds);
  }

  function getUrgencyInfo(slot) {
    if (!slot || slot.status !== "running") return null;
    const remainingSeconds = store.getDisplaySeconds(slot);
    if (remainingSeconds > 180) {
      return { tone: "steady", label: "여유" };
    }
    if (remainingSeconds > 150) {
      return { tone: "red-1", label: "임박" };
    }
    if (remainingSeconds > 120) {
      return { tone: "red-2", label: "임박" };
    }
    if (remainingSeconds > 90) {
      return { tone: "red-3", label: "임박" };
    }
    if (remainingSeconds > 60) {
      return { tone: "red-4", label: "임박" };
    }
    if (remainingSeconds > 30) {
      return { tone: "red-5", label: "임박" };
    }
    return { tone: "red-6", label: "즉시" };
  }

  function hasNewlyExpired(previousBoardState, nextBoardState) {
    const previousMainSlots = new Map();
    (((previousBoardState && previousBoardState.main) || {}).slots || []).forEach((slot) => {
      if (slot && slot.id) previousMainSlots.set(slot.id, slot);
    });
    const nextMainSlots = (((nextBoardState && nextBoardState.main) || {}).slots || []);
    if (nextMainSlots.some((slot) => slot && !isTestSlot(slot)
      && slot.status === "expired"
      && (!previousMainSlots.get(slot.id) || previousMainSlots.get(slot.id).status !== "expired"))) {
      return true;
    }

    if (nextMainSlots.some((slot) => {
      if (!slot || isTestSlot(slot) || slot.status !== "idle" || !slot.lastCompleted) return false;
      const previous = previousMainSlots.get(slot.id);
      if (!previous || previous.status !== "running") return false;
      const previousCompletedAt = getCompletedAt(getCompletedRecordForSlot(previous));
      const nextCompletedAt = getCompletedAt(getCompletedRecordForSlot(slot));
      // A clear action also transitions running -> idle, but preserves the
      // old lastCompleted record. Only a newer completed record is an alert.
      return nextCompletedAt > 0 && nextCompletedAt > previousCompletedAt;
    })) return true;
    const previousSplitStatuses = new Map();
    const previousSplitSlots = ((previousBoardState && previousBoardState.split) || {}).slots || {};
    Object.keys(previousSplitSlots).forEach((slotId) => {
      const entries = Array.isArray(previousSplitSlots[slotId]) ? previousSplitSlots[slotId] : [];
      entries.forEach((entry) => {
        if (entry && entry.id) previousSplitStatuses.set(entry.id, entry.status);
      });
    });

    const nextSplitSlots = ((nextBoardState && nextBoardState.split) || {}).slots || {};
    return Object.keys(nextSplitSlots).some((slotId) => {
      const entries = Array.isArray(nextSplitSlots[slotId]) ? nextSplitSlots[slotId] : [];
      return entries.some((entry) => entry && entry.status === "expired" && previousSplitStatuses.get(entry.id) !== "expired");
    });
  }

  function updateSlotView(view, slot, splitEntriesOverride) {
    const isIdle = slot.status === "idle";
    const isExpired = slot.status === "expired";
    const testMode = isTestSlot(slot);
    const splitEntries = Array.isArray(splitEntriesOverride)
      ? splitEntriesOverride
      : (splitStore ? splitStore.getEntries(slot.id) : []);
    const hasSplitEntries = splitEntries.length > 0;
    const showPresetGrid = isIdle || (isExpired && !hasSplitEntries);
    const rankInfo = latestFinishRanks.get(slot.id) || null;
    const urgencyInfo = getUrgencyInfo(slot);
    view.card.dataset.state = slot.status;
    view.statusChip.dataset.state = slot.status;
    view.statusChip.dataset.rank = rankInfo ? rankInfo.tone : "";
    view.statusChip.textContent = testMode ? "테스트" : getChipLabel(slot.status, rankInfo);
    view.statusChip.hidden = !testMode;
    view.presetGrid.hidden = !showPresetGrid;
    view.presetGrid.dataset.mode = isExpired ? "expired" : "start";
    view.timerPanel.hidden = showPresetGrid;
    view.readout.hidden = showPresetGrid;
    view.actions.hidden = showPresetGrid;
    setCardState(view.card, slot, rankInfo, urgencyInfo);
    updateIdleLastCompleted(view, slot);
    updateSlotInfo(view, slot, rankInfo);
    updateHourglass(view.hourglass, (isIdle || isExpired) ? 0 : store.getDisplaySeconds(slot), slot.status, view.waterSurface, view.waterUrgencyFrame);

    if (showPresetGrid) {
      setAddMode(view, false);
      view.splitSection.hidden = true;
      view.timerPanel.dataset.hasSplit = "false";
      view.secondaryAction.hidden = false;
      return;
    }

    const addModeOpen = isAddMode(view) && slot.status === "running" && !hasSplitEntries;
    setAddMode(view, addModeOpen);
    view.readout.hidden = false;
    view.actions.hidden = false;
    view.timerPanel.dataset.hasSplit = hasSplitEntries ? "true" : "false";
    setReadoutLayoutMode(view);
    view.stateLabel.dataset.state = slot.status;
    view.stateLabel.dataset.rank = rankInfo ? rankInfo.tone : "";
    view.stateLabel.dataset.urgency = urgencyInfo ? urgencyInfo.tone : "";
    view.stateLabel.textContent = getPanelLabel(slot.status, addModeOpen, urgencyInfo);
    view.stateLabel.hidden = slot.status !== "expired";
    const totalText = slot.status === "running" || slot.status === "paused"
      ? `/ ${core.formatDuration(slot.durationSeconds)}`
      : "";
    if (view.total.textContent !== totalText) view.total.textContent = totalText;
    view.total.hidden = !(slot.status === "running" || slot.status === "paused");
    const displayText = core.formatDuration(store.getDisplaySeconds(slot));
    setMainReadoutPresentation(view, slot.status, displayText, true);
    // Keep the live countdown visible while choosing an auxiliary timer.
    // The counter is operationally more important than the preset chooser.
    view.adjustControls.hidden = false;
    // Once a split entry owns its own +/- rail, hide the main increase row in
    // the DOM as well as visually.  This prevents hidden descendants from
    // remaining in accessibility/hit-test queries on compact OV cards.
    view.adjustTopRow.hidden = addModeOpen || slot.status !== "running";
    view.adjustBottomRow.hidden = addModeOpen || slot.status !== "running";
    [view.adjustTopRow, view.adjustBottomRow].forEach((row) => {
      if (!row) return;
      const buttons = typeof row.querySelectorAll === "function"
        ? Array.from(row.querySelectorAll("button"))
        : Array.from(row.children || []).filter((child) => child && child.tagName === "BUTTON");
      buttons.forEach((button) => {
        button.hidden = row.hidden;
      });
    });
    if (slot.status !== "running" || addModeOpen) {
      view.adjustFlash.hidden = true;
      if (view.adjustFlash.classList && typeof view.adjustFlash.classList.remove === "function") {
        view.adjustFlash.classList.remove("is-visible");
      }
    }

    if (slot.status === "running") {
      configureActionButton(view.primaryAction, "삭제", "is-secondary", "clear", () => clearMainTimer(slot.id));
      configureActionButton(view.splitAction, addModeOpen ? "닫기" : "추가", "is-split", "add", () => toggleAddMode(view));
      view.secondaryAction.hidden = true;
      view.splitAction.hidden = hasSplitEntries;
      view.actions.dataset.mode = hasSplitEntries ? "running-no-add" : "running";
    } else if (slot.status === "paused") {
      configureActionButton(view.primaryAction, "삭제", "is-secondary", "clear", () => clearMainTimer(slot.id));
      view.secondaryAction.hidden = true;
      view.splitAction.hidden = true;
      view.actions.dataset.mode = "single";
      setAddMode(view, false);
    } else {
      configureActionButton(view.primaryAction, "삭제", "is-primary", "clear", () => clearMainTimer(slot.id));
      view.secondaryAction.hidden = true;
      view.splitAction.hidden = true;
      view.actions.dataset.mode = "single";
      setAddMode(view, false);
    }

    renderSplitView(view, slot, splitEntries);
  }

  function updateSlotInfo(view, slot, rankInfo) {
    if (!view || !slot || !view.slotInfoState || !view.slotInfoCurrent || !view.slotInfoLog) return;
    const status = String(slot.status || "idle");
    view.slotInfo.dataset.state = status;
    view.slotInfoState.hidden = true;
    view.slotInfoCurrent.hidden = true;
    const labels = renderSlotActivityLog(view.slotInfoLog, slot.activityLog, slot.lastCompleted);
    const hasActivity = labels.length > 0;
    view.slotInfo.dataset.hasActivity = hasActivity ? "true" : "false";
    view.card.dataset.hasActivity = hasActivity ? "true" : "false";
    setAccessibleName(view.slotInfo, labels.length > 0
      ? `${getPhysicalSlotLabel(slot)}번 최근 동작, ${labels.join(", ")}`
      : `${getPhysicalSlotLabel(slot)}번 최근 동작 없음`);
  }

  function renderSlotActivityLog(container, activityLog, lastCompleted) {
    if (!container) return [];
    container.dataset.layoutOwner = "v3";
    container.dataset.visibleRows = "2";
    const entries = (Array.isArray(activityLog) ? activityLog : [])
      .filter((entry) => entry && entry.action && Number(entry.at) > 0)
      .map((entry) => Object.assign({}, entry));
    const lastCompletedAt = getCompletedAt(lastCompleted);
    if (lastCompletedAt > 0 && !entries.some((entry) => entry.action === "completed" && Math.abs(Number(entry.at) - lastCompletedAt) < 1000)) {
      entries.push({
        at: lastCompletedAt,
        action: "completed",
        presetKey: lastCompleted.presetKey || "",
        durationSeconds: lastCompleted.baseDurationSeconds || lastCompleted.durationSeconds || 0,
      });
    }
    const visibleEntries = entries
      .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
      .slice(0, 4);
    // Keep the spoken/native log complete, while the visual completion age
    // stays compact once it reaches hours or days.
    const labels = visibleEntries.map(formatActivityLogEntry);
    const displayLabels = visibleEntries.map((entry, index) => entry && entry.action === "completed"
      ? formatCompletedActivity(entry, true)
      : labels[index]);
    const renderKey = JSON.stringify(visibleEntries.map((entry, index) => [labels[index], displayLabels[index], entry.at, entry.action, entry.presetKey, entry.durationSeconds, entry.deltaSeconds]));
    if (container.dataset.renderKey === renderKey) return labels;
    container.dataset.renderKey = renderKey;
    const rows = labels.map((label, index) => {
      const row = document.createElement("div");
      row.className = "slot-info-log-row";
      row.dataset.ageIndex = String(index);
      row.dataset.action = String(visibleEntries[index].action || "state");
      if (typeof row.setAttribute === "function") row.setAttribute("role", "listitem");
      const text = document.createElement("span");
      const accessibleLabel = labels[index];
      text.textContent = displayLabels[index];
      row.title = accessibleLabel;
      setAccessibleName(row, accessibleLabel);
      row.appendChild(text);
      return row;
    });
    container.replaceChildren(...rows);
    return labels;
  }

  function formatActivityLogEntry(entry) {
    if (!entry) return "상태 변경";
    const action = String(entry.action || "");
    const splitPrefix = String(entry.peerSlotId || "").startsWith("split:") ? "보조 " : "";
    const preset = entry.presetKey
      ? `${core.getPresetDisplay(entry.presetKey)}분`
      : formatCompletedDuration(entry.durationSeconds);
    if (action === "completed") return formatCompletedActivity(entry);
    if (action === "start") return `${splitPrefix}${preset || "타이머"} 시작`;
    if (action === "pause") return `${splitPrefix}${preset || "타이머"} 정지`;
    if (action === "resume") return `${splitPrefix}${preset || "타이머"} 재개`;
    if (action === "clear") return `${splitPrefix}${preset || "타이머"} 삭제`;
    if (action === "adjust") {
      const delta = Math.trunc(Number(entry.deltaSeconds) || 0);
      if (delta > 0) return `${splitPrefix}+${delta}초 추가`;
      if (delta < 0) return `${splitPrefix}${delta}초 차감`;
      return `${splitPrefix}시간 조정`;
    }
    if (action === "move") return "위치 이동";
    return "상태 변경";
  }

  function formatCompletedActivity(entry, compactElapsed) {
    const splitPrefix = String(entry && entry.peerSlotId || "").startsWith("split:") ? "보조 " : "";
    const durationLabel = entry && entry.presetKey
      ? `${core.getPresetDisplay(entry.presetKey)}분`
      : formatCompletedDuration(entry && entry.durationSeconds);
    const completedLabel = `${formatElapsedAge(Math.max(0, Number(entry && entry.at) || 0), compactElapsed === true)} 완료`;
    return `${splitPrefix}${durationLabel || "시간 미상"} · ${completedLabel}`;
  }

  function formatElapsedAge(completedAt, compact) {
    const elapsedMinutes = Math.max(0, Math.floor((getNow() - Math.max(0, Number(completedAt) || 0)) / 60000));
    if (elapsedMinutes <= 0) return "방금";
    if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return compact ? `${elapsedHours}시간` : `${elapsedHours}시간 전`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    return compact ? `${elapsedDays}일` : `${elapsedDays}일 전`;
  }

  function formatCompletedDuration(durationSeconds) {
    const seconds = Math.max(0, Math.round(Number(durationSeconds) || 0));
    if (seconds <= 0) return "";
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (remainder === 0) return `${minutes}분`;
    if (minutes <= 0) return `${remainder}초`;
    return `${minutes}분 ${remainder}초`;
  }

  function formatKstClock(value) {
    const shifted = new Date(Math.max(0, Number(value) || 0) + 9 * 60 * 60 * 1000);
    return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
  }

  function formatSlotActivity(entry) {
    if (!entry) return "기록";
    const preset = entry.presetKey
      ? `${core.getPresetDisplay(entry.presetKey)}분`
      : (entry.durationSeconds > 0 ? core.formatPresetBadge(entry.durationSeconds) : "");
    if (entry.action === "start") return `${preset || "타이머"} 시작`;
    if (entry.action === "pause") return "일시정지";
    if (entry.action === "resume") return "재개";
    if (entry.action === "completed") return `${preset || "타이머"} 종료`;
    if (entry.action === "clear") return "삭제";
    if (entry.action === "adjust") {
      const delta = Math.trunc(Number(entry.deltaSeconds) || 0);
      return `${delta >= 0 ? "+" : ""}${delta}초 조정`;
    }
    if (entry.action === "move") return "위치 이동";
    return "상태 변경";
  }

  function setReadoutText(view, text, forceFit) {
    if (!view || !view.readout) return;
    const nextText = String(text || "");
    const currentText = view.readout.dataset && view.readout.dataset.displayValue
      ? view.readout.dataset.displayValue
      : view.readout.textContent;
    const changed = currentText !== nextText;
    if (changed) {
      setCountdownReadout(view.readout, nextText);
    }
    fitTimerReadout(view, Boolean(forceFit));
  }

  function setMainReadoutPresentation(view, status, text, forceFit) {
    const displayText = String(text || "");
    setReadoutText(view, displayText, forceFit);
    setAccessibleName(
      view.readout,
      status === "paused"
        ? `일시정지, 남은 시간 ${displayText}, 다시 누르면 재개`
        : `남은 시간 ${displayText}, 누르면 일시정지`,
    );
  }

  function setCountdownReadout(readout, text) {
    if (!readout) return;
    const nextText = String(text || "");
    if (readout.dataset && readout.dataset.displayValue === nextText) return;
    if (readout.dataset) readout.dataset.displayValue = nextText;
    if (!readout.ownerDocument || typeof readout.replaceChildren !== "function") {
      readout.textContent = nextText;
      return;
    }
    const match = nextText.match(/^(\d+):(\d{2})$/);
    if (!match) {
      readout.textContent = nextText;
      return;
    }
    const minutes = document.createElement("span");
    minutes.className = "countdown-minutes";
    minutes.textContent = match[1];
    const separator = document.createElement("span");
    separator.className = "countdown-separator";
    separator.textContent = ":";
    const seconds = document.createElement("span");
    seconds.className = "countdown-seconds";
    seconds.textContent = match[2];
    readout.replaceChildren(minutes, separator, seconds);
  }

  function renderSplitView(view, slot, splitEntriesOverride) {
    if (!splitStore || !slot) {
      view.splitSection.hidden = true;
      return;
    }
    const entries = Array.isArray(splitEntriesOverride) ? splitEntriesOverride : splitStore.getEntries(slot.id);
    const addMode = isAddMode(view) && slot.status === "running" && entries.length === 0;
    view.splitList.hidden = entries.length === 0;
    view.addPresetGrid.hidden = !addMode;
    const previousHasSplit = view.timerPanel.dataset.hasSplit === "true";
    const nextHasSplit = entries.length > 0;
    view.timerPanel.dataset.hasSplit = nextHasSplit ? "true" : "false";
    setReadoutLayoutMode(view);
    if (previousHasSplit !== nextHasSplit) requestReadoutFit();

    const currentCards = Array.from(view.splitList.children);
    const canPatchCards = currentCards.length === entries.length
      && entries.every((entry, index) => currentCards[index] && currentCards[index].dataset.entryId === entry.id);

    if (canPatchCards) {
      entries.forEach((entry, index) => {
        updateSplitTimerCard(currentCards[index], slot.id, entry);
      });
      view.splitSection.hidden = !addMode && entries.length === 0;
      return;
    }

    view.splitList.replaceChildren();
    entries.forEach((entry) => {
      view.splitList.appendChild(createSplitTimerCard(view, slot.id, entry));
    });

    view.splitSection.hidden = !addMode && entries.length === 0;
  }

  function createSplitTimerCard(view, slotId, entry) {
    const card = document.createElement("div");
    card.className = "split-timer-unit";
    card.dataset.entryId = entry.id;

    const head = document.createElement("div");
    head.className = "split-timer-head";

    const badge = document.createElement("span");
    badge.className = "split-timer-badge";

    const state = document.createElement("span");
    state.className = "split-timer-state";

    head.appendChild(badge);
    head.appendChild(state);

    const readoutCluster = document.createElement("div");
    readoutCluster.className = "split-readout-cluster";
    readoutCluster.appendChild(head);

    const readout = document.createElement("div");
    readout.className = "split-timer-readout";
    readoutCluster.appendChild(readout);

    const total = document.createElement("div");
    total.className = "split-timer-total";
    readoutCluster.appendChild(total);

    const hourglass = createHourglass("timer-hourglass split-hourglass", "보조 타이머 남은 시간 절대 게이지");
    readoutCluster.appendChild(hourglass);

    const positiveControls = document.createElement("div");
    positiveControls.className = "split-timer-controls";
    positiveControls.dataset.tone = "up";

    const negativeControls = document.createElement("div");
    negativeControls.className = "split-timer-controls";
    negativeControls.dataset.tone = "down";

    [
      { key: "plus-second", label: "+10", deltaSeconds: 10 },
      { key: "plus-minute", label: "+60", deltaSeconds: 60 },
      { key: "minus-second", label: "-10", deltaSeconds: -10 },
      { key: "minus-minute", label: "-60", deltaSeconds: -60 },
    ].forEach((control) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "split-adjust-button";
      button.dataset.adjustKey = control.key;
      button.dataset.deltaSeconds = String(control.deltaSeconds);
      button.textContent = control.label;
      setAccessibleName(button, `보조 타이머 ${control.label}`);
      bindPress(button, () => handleAdjustSplitTimer(view, slotId, entry.id, control.deltaSeconds));
      if (control.deltaSeconds > 0) {
        positiveControls.appendChild(button);
      } else {
        negativeControls.appendChild(button);
      }
    });

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "split-clear-button";
    clearButton.textContent = "삭제";
    setAccessibleName(clearButton, "보조 타이머 삭제");
    bindPress(clearButton, () => handleClearSplitTimer(view, slotId, entry.id));

    const positiveRail = document.createElement("div");
    positiveRail.className = "split-positive-rail";
    positiveRail.appendChild(positiveControls);
    const negativeRail = document.createElement("div");
    negativeRail.className = "split-negative-rail";
    negativeRail.appendChild(negativeControls);
    negativeRail.appendChild(clearButton);
    card.appendChild(positiveRail);
    card.appendChild(readoutCluster);
    card.appendChild(negativeRail);
    card.__ctFields = {
      badge,
      state,
      readout,
      total,
      hourglass,
      readoutCluster,
      readoutMotionTimerId: 0,
      controls: positiveControls,
      secondaryControls: negativeControls,
      clearButton,
      positiveRail,
      negativeRail,
    };
    updateSplitTimerCard(card, slotId, entry);
    return card;
  }

  function updateSplitTimerCard(card, slotId, entry) {
    if (!card || !entry) return;
    const fields = card.__ctFields || {};
    card.dataset.entryId = entry.id;
    card.dataset.state = entry.status;
    const timerFamily = getTimerFamilyForSplitEntry(entry);
    if (timerFamily) {
      card.dataset.timerFamily = timerFamily;
    } else {
      delete card.dataset.timerFamily;
    }
    const badgeText = formatSplitOriginalText(entry);
    const stateText = getSplitStateLabel(entry.status);
    const remainingSeconds = entry.status === "expired" ? 0 : splitStore.getDisplaySeconds(entry);
    const totalText = `/ ${core.formatDuration(entry.durationSeconds)}`;
    if (fields.badge && fields.badge.textContent !== badgeText) fields.badge.textContent = badgeText;
    if (fields.state && fields.state.textContent !== stateText) fields.state.textContent = stateText;
    const displayText = core.formatDuration(remainingSeconds);
    if (fields.readout) {
      setCountdownReadout(fields.readout, displayText);
      setAccessibleName(fields.readout, `보조 타이머 남은 시간 ${displayText}`);
    }
    if (fields.total && fields.total.textContent !== totalText) fields.total.textContent = totalText;
    if (fields.controls) fields.controls.hidden = entry.status === "expired";
    if (fields.secondaryControls) fields.secondaryControls.hidden = entry.status === "expired";
    updateHourglass(fields.hourglass, remainingSeconds, entry.status);
    if (fields.clearButton) {
      fields.clearButton.dataset.entryId = entry.id;
      setAccessibleName(fields.clearButton, `보조 타이머 ${formatSplitOriginalText(entry)} 삭제`);
    }
  }

  function formatSplitOriginalText(entry) {
    if (!entry) return "";
    const baseDurationSeconds = Math.max(0, Number(entry.baseDurationSeconds || entry.durationSeconds) || 0);
    const baseLabel = entry.presetKey ? core.getPresetDisplay(entry.presetKey) : core.formatPresetBadge(baseDurationSeconds);
    const adjustedText = formatAdjustedDeltaText(entry.adjustedDeltaSeconds);
    return adjustedText ? `${baseLabel} · ${adjustedText}` : baseLabel;
  }

  function getTimerFamilyForSplitEntry(entry) {
    if (!entry) return "";
    return getTimerFamilyForPreset(entry.presetKey) || getTimerFamilyForDuration(entry.baseDurationSeconds || entry.durationSeconds);
  }

  function getSplitStateLabel(status) {
    if (status === "paused") return "정지";
    if (status === "expired") return "완료";
    return "진행";
  }

  function createHourglass(className, label) {
    const hourglass = document.createElement("div");
    hourglass.className = className || "timer-hourglass";
    hourglass.dataset.state = "idle";
    const upper = document.createElement("span");
    upper.className = "hourglass-chamber hourglass-upper";
    const sand = document.createElement("span");
    sand.className = "hourglass-sand";
    upper.appendChild(sand);
    const stream = document.createElement("span");
    stream.className = "hourglass-stream";
    const lower = document.createElement("span");
    lower.className = "hourglass-chamber hourglass-lower";
    const scale = document.createElement("span");
    scale.className = "hourglass-scale";
    if (typeof scale.setAttribute === "function") scale.setAttribute("aria-hidden", "true");
    ["5", "4", "2", "0"].forEach((label) => {
      const mark = document.createElement("span");
      mark.textContent = label;
      scale.appendChild(mark);
    });
    hourglass.appendChild(upper);
    hourglass.appendChild(stream);
    hourglass.appendChild(lower);
    hourglass.appendChild(scale);
    if (typeof hourglass.setAttribute === "function") {
      hourglass.setAttribute("role", "img");
      hourglass.setAttribute("aria-label", label || "남은 시간 절대 게이지");
    }
    return hourglass;
  }

  function updateHourglass(hourglass, remainingSeconds, state, surface, urgencyFrame) {
    if (!hourglass) return;
    const remaining = Math.max(0, Number(remainingSeconds) || 0);
    const safeState = String(state || "idle");
    const renderKey = `${safeState}:${Math.ceil(remaining)}`;
    if (hourglass.dataset && hourglass.dataset.renderKey === renderKey) return;
    if (hourglass.dataset) hourglass.dataset.renderKey = renderKey;
    const level = Math.min(1, remaining / HOURGLASS_ABSOLUTE_MAX_SECONDS);
    const sandLevel = `${Math.round(level * 1000) / 10}%`;
    const waterColor = getWaterLevelColor(level);
    if (hourglass.style && typeof hourglass.style.setProperty === "function") {
      hourglass.style.setProperty("--sand-level", sandLevel);
      hourglass.style.setProperty("--water-rgb", waterColor.join(", "));
    } else if (hourglass.style) {
      hourglass.style["--sand-level"] = sandLevel;
      hourglass.style["--water-rgb"] = waterColor.join(", ");
    }
    hourglass.dataset.state = safeState;
    hourglass.dataset.overflow = remaining > HOURGLASS_ABSOLUTE_MAX_SECONDS ? "true" : "false";
    const levelBand = level <= 0 ? "empty" : level <= 0.12 ? "move" : level <= 0.35 ? "imminent" : level <= 0.65 ? "prepare" : "ready";
    hourglass.dataset.levelBand = levelBand;
    if (surface) {
      if (surface.style && typeof surface.style.setProperty === "function") {
        surface.style.setProperty("--sand-level", sandLevel);
        surface.style.setProperty("--water-rgb", waterColor.join(", "));
      }
      surface.dataset.state = safeState;
      surface.dataset.levelBand = levelBand;
      surface.hidden = safeState === "idle";
    }
    if (urgencyFrame) {
      urgencyFrame.dataset.levelBand = levelBand;
      urgencyFrame.hidden = safeState !== "running" || (levelBand !== "imminent" && levelBand !== "move");
    }
    const roundedMinutes = Math.floor(remaining / 60);
    const roundedSeconds = Math.floor(remaining % 60);
    const bandLabel = level <= 0 ? "완료" : level <= 0.12 ? "즉시 준비" : level <= 0.35 ? "임박" : level <= 0.65 ? "준비" : "여유";
    const label = `남은 시간 ${roundedMinutes}분 ${roundedSeconds}초, ${bandLabel} 구간, 5분 기준 절대 물높이`;
    hourglass.title = label;
    if (typeof hourglass.setAttribute === "function") hourglass.setAttribute("aria-label", label);
  }

  function getWaterLevelColor(level) {
    void level;
    // Height/area communicates remaining time. Keep the surface line teal so
    // orange/red belong exclusively to the full-card urgency perimeter.
    return [30, 178, 192];
  }

  function setAccessibleName(element, label) {
    if (!element) return;
    if (typeof element.setAttribute === "function") {
      element.setAttribute("aria-label", label);
    } else {
      element.ariaLabel = label;
    }
  }

  function toggleAddMode(view) {
    if (!view || view.splitAction.hidden) return;
    const slot = getMainSlot(view.card.dataset.slotId);
    if (!slot || slot.status !== "running") return;
    if (splitStore && splitStore.getEntries(slot.id).length > 0) {
      setAddMode(view, false);
      updateSlotView(view, slot);
      return;
    }
    setAddMode(view, !isAddMode(view));
    updateSlotView(view, slot);
  }

  function isAddMode(view) {
    return Boolean(view && view.addPresetGrid.dataset.open === "true");
  }

  function setAddMode(view, open) {
    if (!view) return;
    view.addPresetGrid.dataset.open = open ? "true" : "false";
    view.splitAction.dataset.open = open ? "true" : "false";
    view.timerPanel.dataset.addMode = open ? "true" : "false";
    if (view.card && view.card.dataset) {
      view.card.dataset.addMode = open ? "true" : "false";
    }
  }

  function getMainSlot(slotId) {
    return store.getSnapshot().slots.find((slot) => slot.id === slotId) || null;
  }

  function configureActionButton(button, label, toneClass, actionName, action) {
    button.textContent = label;
    button.className = `action-button ${toneClass}`;
    button.dataset.action = actionName;
    button.__ctAction = action;
  }

  function setCardState(card, slot, rankInfo, urgencyInfo) {
    const status = slot && slot.status ? slot.status : "idle";
    const nextClassName = status === "expired" ? "slot-card is-expired" : "slot-card";
    const nextFinishRank = status === "running" && rankInfo ? rankInfo.tone : (status === "expired" ? "expired" : "none");
    const nextUrgency = status === "running" && urgencyInfo ? urgencyInfo.tone : (status === "expired" ? "expired" : "none");
    if (card.className !== nextClassName) card.className = nextClassName;
    if (card.dataset.state !== status) card.dataset.state = status;
    if (card.dataset.finishRank !== nextFinishRank) card.dataset.finishRank = nextFinishRank;
    if (card.dataset.urgency !== nextUrgency) card.dataset.urgency = nextUrgency;
    card.dataset.testMode = isTestSlot(slot) ? "true" : "false";
    const timerFamily = getTimerFamilyForSlot(slot);
    if (timerFamily && status !== "idle") {
      if (card.dataset.timerFamily !== timerFamily) card.dataset.timerFamily = timerFamily;
    } else {
      delete card.dataset.timerFamily;
    }
    if (status !== "idle") card.dataset.recentAlert = "false";
  }

  function isTestSlot(slot) {
    const activityLog = slot && Array.isArray(slot.activityLog) ? slot.activityLog : [];
    const latest = activityLog.length > 0 ? activityLog[activityLog.length - 1] : null;
    return Boolean(latest && latest.action === "test");
  }

  function getChipLabel(status, rankInfo) {
    if (status === "running") return "진행";
    if (status === "paused") return "정지";
    if (status === "expired") return "완료";
    return "대기";
  }

  function getPanelLabel(status, addMode, urgencyInfo) {
    if (addMode) return "추가 시간";
    if (status === "running") return urgencyInfo ? urgencyInfo.label : "남은 시간";
    if (status === "paused") return "멈춘 시간";
    return "종료";
  }
})(window);
