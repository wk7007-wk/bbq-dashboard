(function (global) {
  const STORAGE_KEY = "chicken-timer-core-v1";
  const PRESET_DEFS = [
    { key: "2", display: "1.4", unit: "", durationSeconds: 100 },
    { key: "3", display: "3", unit: "", durationSeconds: 180 },
    { key: "4", display: "4", unit: "", durationSeconds: 240 },
    { key: "5", display: "4.4", unit: "", durationSeconds: 280 },
    { key: "6", display: "6", unit: "", durationSeconds: 360 },
    { key: "7", display: "7", unit: "", durationSeconds: 420 },
    { key: "8", display: "8", unit: "", durationSeconds: 480 },
    { key: "9", display: "9", unit: "", durationSeconds: 540 },
    { key: "10", display: "10", unit: "", durationSeconds: 600 },
    { key: "11", display: "11", unit: "", durationSeconds: 660 },
    { key: "13", display: "13", unit: "", durationSeconds: 780 },
    { key: "15", display: "15", unit: "", durationSeconds: 900 },
  ];
  // OV has a distinct operating recipe. Internal keys stay unambiguous while
  // the visible labels keep the requested decimal-minute notation.
  const OV_ONLY_PRESET_DEFS = [
    { key: "1", display: "1", unit: "", durationSeconds: 60 },
    { key: "4.2", display: "4.2", unit: "", durationSeconds: 260 },
    { key: "5.0", display: "5", unit: "", durationSeconds: 300 },
  ];
  const ALL_PRESET_DEFS = PRESET_DEFS.concat(OV_ONLY_PRESET_DEFS);
  const MINUTE_PRESETS = PRESET_DEFS.map((preset) => preset.key);
  const OV_MINUTE_PRESETS = ["1", "4", "4.2", "5", "5.0", "6", "7", "8", "13", "15"];
  const OV_ALL_MINUTE_PRESETS = ["2", "3", "1", "4", "4.2", "5", "5.0", "6", "7", "8", "9", "10", "11", "13", "15"];
  const MAX_SLOT_ACTIVITY_LOG = 40;
  const SLOT_DEFS = [
    { id: "slot-1", title: "튀김 3", kind: "", accent: "fryer-a", area: "slot1" },
    { id: "slot-2", title: "튀김 3", kind: "", accent: "fryer-a", area: "slot2" },
    { id: "slot-3", title: "튀김 3", kind: "", accent: "fryer-a", area: "slot3" },
    { id: "slot-4", title: "튀김 2", kind: "", accent: "fryer-b", area: "slot4" },
    { id: "slot-5", title: "튀김 2", kind: "", accent: "fryer-b", area: "slot5" },
    { id: "slot-6", title: "오븐", kind: "", accent: "oven", area: "slot6" },
  ];

  function normalizeSignedSeconds(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  function normalizeActivityLog(source) {
    if (!Array.isArray(source)) return [];
    return source
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const at = Math.max(0, Math.trunc(Number(entry.at) || 0));
        const action = String(entry.action || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
        if (at <= 0 || !action) return null;
        const durationSeconds = Math.max(0, Math.round(Number(entry.durationSeconds) || 0));
        const requestedBaseDurationSeconds = Math.max(0, Math.round(Number(entry.baseDurationSeconds) || 0));
        // Activity records describe the original preset and a later result.
        // Do not invalidate a known preset merely because adjustment changed
        // durationSeconds; old records did not carry a baseline field.
        const presetKey = normalizePresetKey(entry.presetKey, requestedBaseDurationSeconds)
          || normalizePresetKey(entry.presetKey, 0);
        const baseDurationSeconds = requestedBaseDurationSeconds
          || (presetKey ? resolvePresetDurationSeconds(presetKey) : 0);
        const adjustedDeltaSeconds = Number.isFinite(Number(entry.adjustedDeltaSeconds))
          ? normalizeSignedSeconds(entry.adjustedDeltaSeconds)
          : durationSeconds - baseDurationSeconds;
        return {
          at,
          action,
          presetKey,
          baseDurationSeconds,
          durationSeconds,
          adjustedDeltaSeconds,
          deltaSeconds: normalizeSignedSeconds(entry.deltaSeconds),
          peerSlotId: String(entry.peerSlotId || "").slice(0, 24),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.at - right.at)
      .slice(-MAX_SLOT_ACTIVITY_LOG);
  }

  function appendActivityLog(source, entry) {
    const next = normalizeActivityLog(source);
    const normalized = normalizeActivityLog([entry])[0] || null;
    if (!normalized) return next;
    const previous = next[next.length - 1] || null;
    if (previous && previous.at === normalized.at && previous.action === normalized.action) return next;
    next.push(normalized);
    return next.slice(-MAX_SLOT_ACTIVITY_LOG);
  }

  function normalizeLastCompleted(source) {
    if (!source) return null;
    const completedAtServerMs = Math.max(0, Number(source.completedAtServerMs || source.completedAt) || 0);
    const sourcePreset = normalizePresetKey(
      source.presetKey,
      source.baseDurationSeconds || source.finalDurationSeconds || source.durationSeconds,
    );
    const finalDurationSeconds = Math.max(0, Math.round(Number(source.finalDurationSeconds || source.durationSeconds || source.baseDurationSeconds) || 0));
    const presetDurationSeconds = sourcePreset ? resolvePresetDurationSeconds(sourcePreset) : 0;
    let baseDurationSeconds = Math.max(0, Math.round(Number(source.baseDurationSeconds) || 0));
    if (baseDurationSeconds <= 0) {
      baseDurationSeconds = presetDurationSeconds || finalDurationSeconds;
    }
    let adjustedDeltaSeconds = normalizeSignedSeconds(source.adjustedDeltaSeconds);
    if (!Number.isFinite(Number(source.adjustedDeltaSeconds))) {
      adjustedDeltaSeconds = finalDurationSeconds - baseDurationSeconds;
    }
    const presetKey = sourcePreset || inferPresetKeyFromDuration(baseDurationSeconds || finalDurationSeconds);
    const safeFinalDurationSeconds = finalDurationSeconds || Math.max(0, baseDurationSeconds + adjustedDeltaSeconds);
    if (safeFinalDurationSeconds <= 0 || completedAtServerMs <= 0) return null;
    return {
      durationSeconds: safeFinalDurationSeconds,
      baseDurationSeconds: baseDurationSeconds || safeFinalDurationSeconds,
      presetKey,
      finalDurationSeconds: safeFinalDurationSeconds,
      adjustedDeltaSeconds,
      completedAt: completedAtServerMs,
      completedAtServerMs,
    };
  }
  function createCompletedRecord(slot, completedAt) {
    if (!slot) return null;
    const finalDurationSeconds = Math.max(0, Math.round(Number(slot.durationSeconds || slot.remainingSeconds) || 0));
    const presetKey = normalizePresetKey(slot.presetKey, slot.baseDurationSeconds || slot.durationSeconds);
    const baseDurationSeconds = Math.max(0, Math.round(Number(slot.baseDurationSeconds) || 0))
      || (presetKey ? resolvePresetDurationSeconds(presetKey) : 0)
      || finalDurationSeconds;
    const adjustedDeltaSeconds = Number.isFinite(Number(slot.adjustedDeltaSeconds))
      ? normalizeSignedSeconds(slot.adjustedDeltaSeconds)
      : finalDurationSeconds - baseDurationSeconds;
    return normalizeLastCompleted({
      durationSeconds: finalDurationSeconds,
      baseDurationSeconds,
      presetKey,
      finalDurationSeconds,
      adjustedDeltaSeconds,
      completedAtServerMs: completedAt,
      completedAt,
    });
  }
  function normalizeCompletionCount(value, lastCompleted) {
    const parsed = Math.max(0, Math.trunc(Number(value) || 0));
    return lastCompleted ? Math.max(1, parsed) : parsed;
  }
  function createEmptySlot(id, lastCompleted, completionCount, activityLog) {
    const safeLastCompleted = normalizeLastCompleted(lastCompleted);
    return {
      id,
      status: "idle",
      presetKey: "",
      baseDurationSeconds: 0,
      durationSeconds: 0,
      adjustedDeltaSeconds: 0,
      remainingSeconds: 0,
      endAt: 0,
      lastCompleted: safeLastCompleted,
      completionCount: normalizeCompletionCount(completionCount, safeLastCompleted),
      activityLog: normalizeActivityLog(activityLog),
    };
  }
  function cloneSlot(slot) {
    return {
      id: slot.id,
      status: slot.status,
      presetKey: normalizePresetKey(slot.presetKey, slot.baseDurationSeconds || slot.durationSeconds),
      baseDurationSeconds: Math.max(0, Math.round(Number(slot.baseDurationSeconds) || 0)),
      durationSeconds: slot.durationSeconds,
      adjustedDeltaSeconds: normalizeSignedSeconds(slot.adjustedDeltaSeconds),
      remainingSeconds: slot.remainingSeconds,
      endAt: slot.endAt,
      lastCompleted: normalizeLastCompleted(slot.lastCompleted),
      completionCount: normalizeCompletionCount(slot.completionCount, slot.lastCompleted),
      activityLog: normalizeActivityLog(slot.activityLog),
    };
  }
  function formatDuration(totalSeconds) {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function getPresetDef(presetKey) {
    const safeKey = String(presetKey || "");
    return ALL_PRESET_DEFS.find((preset) => preset.key === safeKey) || null;
  }

  function normalizePresetKey(presetKey, durationSeconds) {
    const safeKey = String(presetKey || "");
    const safeDuration = Math.max(0, Math.round(Number(durationSeconds) || 0));
    const exactKey = getPresetDef(safeKey);
    if (exactKey && (safeDuration <= 0 || exactKey.durationSeconds === safeDuration)) return safeKey;
    const exactDuration = ALL_PRESET_DEFS.find((preset) => preset.durationSeconds === safeDuration) || null;
    return exactDuration ? exactDuration.key : "";
  }

  function inferPresetKeyFromDuration(durationSeconds) {
    const safeDuration = Math.max(0, Math.round(Number(durationSeconds) || 0));
    const preset = ALL_PRESET_DEFS.find((item) => item.durationSeconds === safeDuration) || null;
    return preset ? preset.key : "";
  }

  function resolvePresetDurationSeconds(presetKey) {
    const preset = getPresetDef(presetKey);
    if (preset) return preset.durationSeconds;
    return Math.max(1, Number(presetKey || 0)) * 60;
  }

  function getPresetDisplay(presetKey) {
    const preset = getPresetDef(presetKey);
    return preset ? preset.display : String(presetKey);
  }

  function getPresetUnit(presetKey) {
    const preset = getPresetDef(presetKey);
    return preset ? preset.unit : "분";
  }

  function formatPresetBadge(durationSeconds) {
    const safeDuration = Math.max(0, Math.round(Number(durationSeconds) || 0));
    const preset = ALL_PRESET_DEFS.find((item) => item.durationSeconds === safeDuration) || null;
    if (preset) {
      return preset.unit ? `${preset.display}${preset.unit}` : preset.display;
    }
    return formatDuration(safeDuration);
  }

  function createStore(options) {
    const storage = options && options.storage ? options.storage : null;
    const now = options && typeof options.now === "function" ? options.now : () => Date.now();
    const listeners = new Set();
    let state = loadState(storage, now);

    function getSnapshot() {
      return {
        slots: state.slots.map(cloneSlot),
      };
    }

    function getState() {
      return {
        slots: state.slots.map(cloneSlot),
      };
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    function notify(reason, slotIds) {
      const snapshot = getSnapshot();
      listeners.forEach((listener) => {
        listener(snapshot, { reason, slotIds: slotIds ? slotIds.slice() : [] });
      });
    }

    function persist() {
      if (!storage) return;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
    }

    function findSlot(slotId) {
      return state.slots.find((slot) => slot.id === slotId) || null;
    }

    function getDisplaySeconds(slot) {
      if (!slot) return 0;
      if (slot.status === "running" && slot.endAt > 0) {
        return Math.max(0, Math.ceil((slot.endAt - now()) / 1000));
      }
      if (slot.status === "expired") return 0;
      return Math.max(0, Number(slot.remainingSeconds || slot.durationSeconds || 0));
    }

    function start(slotId, presetKey) {
      const slot = findSlot(slotId);
      if (!slot) return false;
      const durationSeconds = resolvePresetDurationSeconds(presetKey);
      slot.status = "running";
      slot.presetKey = String(presetKey);
      slot.baseDurationSeconds = durationSeconds;
      slot.durationSeconds = durationSeconds;
      slot.adjustedDeltaSeconds = 0;
      slot.remainingSeconds = durationSeconds;
      slot.endAt = now() + durationSeconds * 1000;
      slot.activityLog = appendActivityLog(slot.activityLog, {
        at: now(),
        action: "start",
        presetKey: slot.presetKey,
        durationSeconds,
      });
      persist();
      notify("start", [slotId]);
      return true;
    }

    function pause(slotId) {
      const slot = findSlot(slotId);
      if (!slot || slot.status !== "running") return false;
      slot.remainingSeconds = getDisplaySeconds(slot);
      slot.status = "paused";
      slot.endAt = 0;
      slot.activityLog = appendActivityLog(slot.activityLog, {
        at: now(),
        action: "pause",
        presetKey: slot.presetKey,
        durationSeconds: slot.durationSeconds,
      });
      persist();
      notify("pause", [slotId]);
      return true;
    }

    function resume(slotId) {
      const slot = findSlot(slotId);
      if (!slot || slot.status !== "paused") return false;
      const seconds = Math.max(1, Number(slot.remainingSeconds || slot.durationSeconds || 0));
      slot.status = "running";
      slot.remainingSeconds = seconds;
      slot.endAt = now() + seconds * 1000;
      slot.activityLog = appendActivityLog(slot.activityLog, {
        at: now(),
        action: "resume",
        presetKey: slot.presetKey,
        durationSeconds: slot.durationSeconds,
      });
      persist();
      notify("resume", [slotId]);
      return true;
    }

    function applyTimeDeltaMs(slot, deltaMs) {
      if (!slot || (slot.status !== "running" && slot.status !== "paused")) return false;
      const deltaSeconds = Math.trunc((Number(deltaMs) || 0) / 1000);
      if (deltaSeconds === 0) return false;
      const currentSeconds = Math.max(1, getDisplaySeconds(slot));
      const nextSeconds = Math.max(1, currentSeconds + deltaSeconds);
      const actualDeltaSeconds = nextSeconds - currentSeconds;
      if (actualDeltaSeconds === 0) return false;
      const durationBase = Math.max(1, Number(slot.durationSeconds || currentSeconds));
      if (!slot.baseDurationSeconds) {
        const presetBase = slot.presetKey ? resolvePresetDurationSeconds(slot.presetKey) : 0;
        slot.baseDurationSeconds = Math.max(1, presetBase || (durationBase - normalizeSignedSeconds(slot.adjustedDeltaSeconds)));
      }
      slot.durationSeconds = Math.max(1, durationBase + actualDeltaSeconds);
      slot.adjustedDeltaSeconds = normalizeSignedSeconds(slot.adjustedDeltaSeconds) + actualDeltaSeconds;
      slot.remainingSeconds = nextSeconds;
      if (slot.status === "running") {
        const currentMs = now();
        const previousEndAt = Math.max(0, Number(slot.endAt) || 0);
        slot.endAt = previousEndAt > currentMs && actualDeltaSeconds > 0
          ? previousEndAt + actualDeltaSeconds * 1000
          : currentMs + nextSeconds * 1000;
      } else {
        slot.endAt = 0;
      }
      return true;
    }

    function adjust(slotId, deltaSeconds) {
      const slot = findSlot(slotId);
      if (!applyTimeDeltaMs(slot, Math.trunc(Number(deltaSeconds) || 0) * 1000)) return false;
      slot.activityLog = appendActivityLog(slot.activityLog, {
        at: now(),
        action: "adjust",
        presetKey: slot.presetKey,
        durationSeconds: slot.durationSeconds,
        deltaSeconds,
      });
      persist();
      notify("adjust", [slotId]);
      return true;
    }

    function addTime(slotId, deltaMs) {
      const slot = findSlot(slotId);
      if (!applyTimeDeltaMs(slot, deltaMs)) return false;
      slot.activityLog = appendActivityLog(slot.activityLog, {
        at: now(),
        action: "adjust",
        presetKey: slot.presetKey,
        durationSeconds: slot.durationSeconds,
        deltaSeconds: Math.trunc((Number(deltaMs) || 0) / 1000),
      });
      persist();
      notify("add-time", [slotId]);
      return true;
    }

    function clear(slotId) {
      const index = state.slots.findIndex((slot) => slot.id === slotId);
      if (index < 0) return false;
      const previous = state.slots[index];
      const activityLog = appendActivityLog(previous.activityLog, {
        at: now(),
        action: "clear",
        presetKey: previous.presetKey,
        durationSeconds: previous.durationSeconds,
      });
      state.slots[index] = createEmptySlot(slotId, previous.lastCompleted, previous.completionCount, activityLog);
      persist();
      notify("clear", [slotId]);
      return true;
    }

    function recordActivity(slotId, entry, options) {
      const slot = findSlot(slotId);
      if (!slot) return false;
      const nextLog = appendActivityLog(slot.activityLog, entry);
      if (JSON.stringify(nextLog) === JSON.stringify(slot.activityLog)) return false;
      slot.activityLog = nextLog;
      persist();
      if (!options || options.notify !== false) {
        notify((options && options.reason) || "activity", [slotId]);
      }
      return true;
    }

    function swapSlots(leftSlotId, rightSlotId) {
      const leftIndex = state.slots.findIndex((slot) => slot.id === leftSlotId);
      const rightIndex = state.slots.findIndex((slot) => slot.id === rightSlotId);
      if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) return false;
      const left = cloneSlot(state.slots[leftIndex]);
      const right = cloneSlot(state.slots[rightIndex]);
      state.slots[leftIndex] = Object.assign({}, right, {
        id: leftSlotId,
        lastCompleted: left.lastCompleted,
        completionCount: left.completionCount,
        activityLog: left.activityLog,
      });
      state.slots[rightIndex] = Object.assign({}, left, {
        id: rightSlotId,
        lastCompleted: right.lastCompleted,
        completionCount: right.completionCount,
        activityLog: right.activityLog,
      });
      state.slots[leftIndex].activityLog = appendActivityLog(left.activityLog, {
        at: now(), action: "move", peerSlotId: rightSlotId,
      });
      state.slots[rightIndex].activityLog = appendActivityLog(right.activityLog, {
        at: now(), action: "move", peerSlotId: leftSlotId,
      });
      persist();
      notify("swap", [leftSlotId, rightSlotId]);
      return true;
    }

    function tick() {
      const expiredSlotIds = [];
      const currentMs = now();

      state.slots.forEach((slot) => {
        if (slot.status !== "running" || slot.endAt <= 0) return;
        slot.remainingSeconds = Math.max(0, Math.ceil((slot.endAt - currentMs) / 1000));
        if (slot.endAt > currentMs) return;
        const completedRecord = createCompletedRecord(slot, slot.endAt || currentMs);
        const activityLog = appendActivityLog(slot.activityLog, {
          at: slot.endAt || currentMs,
          action: "completed",
          presetKey: slot.presetKey,
          durationSeconds: slot.durationSeconds,
        });
        Object.assign(slot, createEmptySlot(
          slot.id,
          completedRecord,
          normalizeCompletionCount(slot.completionCount, slot.lastCompleted) + 1,
          activityLog,
        ));
        expiredSlotIds.push(slot.id);
      });

      if (expiredSlotIds.length > 0) {
        persist();
        notify("expired", expiredSlotIds);
      }

      return {
        changed: expiredSlotIds.length > 0,
        alertCount: expiredSlotIds.length,
        slotIds: expiredSlotIds.slice(),
      };
    }

    function replaceState(nextState, options) {
      const safeState = sanitizeState(nextState, now);
      const previousJson = JSON.stringify(state);
      const nextJson = JSON.stringify(safeState);
      if (previousJson === nextJson) return false;
      state = safeState;
      if (!options || options.persist !== false) {
        persist();
      }
      if (!options || options.notify !== false) {
        notify((options && options.reason) || "replace", state.slots.map((slot) => slot.id));
      }
      return true;
    }

    return {
      getSnapshot,
      getState,
      getDisplaySeconds,
      subscribe,
      start,
      pause,
      resume,
      adjust,
      addTime,
      clear,
      recordActivity,
      swapSlots,
      tick,
      replaceState,
    };
  }

  function loadState(storage, now) {
    try {
      const raw = storage ? storage.getItem(STORAGE_KEY) : null;
      if (!raw) return createInitialState();
      const safeState = sanitizeState(JSON.parse(raw), now);
      const safeJson = JSON.stringify(safeState);
      if (safeJson !== raw) storage.setItem(STORAGE_KEY, safeJson);
      return safeState;
    } catch (_) {
      return createInitialState();
    }
  }

  function createInitialState() {
    return {
      slots: SLOT_DEFS.map((slot) => createEmptySlot(slot.id)),
    };
  }

  function sanitizeState(raw, now) {
    const slots = SLOT_DEFS.map((slot) => {
      const source = raw && Array.isArray(raw.slots)
        ? raw.slots.find((item) => item && item.id === slot.id)
        : null;
      return sanitizeSlot(source, slot.id, now);
    });
    return { slots };
  }

  function sanitizeSlot(source, slotId, now) {
    const durationSeconds = Math.max(0, Number((source && source.durationSeconds) || 0));
    let baseDurationSeconds = Math.max(0, Number((source && source.baseDurationSeconds) || 0));
    const presetKey = normalizePresetKey(
      source && source.presetKey,
      baseDurationSeconds || durationSeconds,
    ) || inferPresetKeyFromDuration(baseDurationSeconds || durationSeconds);
    if (baseDurationSeconds <= 0) {
      baseDurationSeconds = (presetKey ? resolvePresetDurationSeconds(presetKey) : 0) || durationSeconds;
    }
    const adjustedDeltaSeconds = Number.isFinite(Number(source && source.adjustedDeltaSeconds))
      ? normalizeSignedSeconds(source && source.adjustedDeltaSeconds)
      : Math.round(durationSeconds - baseDurationSeconds);
    const safe = {
      id: slotId,
      status: ["idle", "running", "paused", "expired"].includes(source && source.status)
        ? source.status
        : "idle",
      durationSeconds,
      presetKey,
      baseDurationSeconds,
      adjustedDeltaSeconds,
      remainingSeconds: Math.max(0, Number((source && source.remainingSeconds) || 0)),
      endAt: Math.max(0, Number((source && source.endAt) || 0)),
      lastCompleted: normalizeLastCompleted(source && source.lastCompleted),
      completionCount: normalizeCompletionCount(source && source.completionCount, source && source.lastCompleted),
      activityLog: normalizeActivityLog(source && source.activityLog),
    };

    if (safe.status === "idle") return createEmptySlot(slotId, safe.lastCompleted, safe.completionCount, safe.activityLog);
    if (safe.status === "running" && safe.durationSeconds > 0 && safe.endAt > 0) {
      if (safe.endAt <= now()) {
        const completedRecord = createCompletedRecord(safe, safe.endAt);
        const activityLog = appendActivityLog(safe.activityLog, {
          at: safe.endAt,
          action: "completed",
          presetKey: safe.presetKey,
          durationSeconds: safe.durationSeconds,
        });
        return createEmptySlot(slotId, completedRecord, safe.completionCount + 1, activityLog);
      }
      return safe;
    }
    if (safe.status === "paused" && safe.durationSeconds > 0) return safe;
    if (safe.status === "expired" && safe.durationSeconds > 0) return safe;
    return createEmptySlot(slotId, safe.lastCompleted, safe.completionCount, safe.activityLog);
  }

  global.ChickenTimerCore = {
    PRESET_DEFS,
    MINUTE_PRESETS,
    OV_MINUTE_PRESETS,
    OV_ALL_MINUTE_PRESETS,
    SLOT_DEFS,
    createStore,
    formatDuration,
    getPresetDef,
    getPresetDisplay,
    getPresetUnit,
    resolvePresetDurationSeconds,
    formatPresetBadge,
  };
})(window);
