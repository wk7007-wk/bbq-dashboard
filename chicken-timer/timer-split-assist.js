(function (global) {
  const STORAGE_KEY = "chicken-timer-split-assist-v1";
  const core = global.ChickenTimerCore || null;
  const PRESETS = ["2", "3", "5", "7"];
  const MAX_ENTRIES_PER_SLOT = 1;
  const RECENT_COMPLETED_MS = 90 * 1000;

  function createStore(options) {
    const storage = options && options.storage ? options.storage : null;
    const now = options && typeof options.now === "function" ? options.now : () => Date.now();
    let state = loadState(storage, now);

    function getEntries(slotId) {
      const entries = Array.isArray(state.slots[slotId]) ? state.slots[slotId] : [];
      return sortEntries(entries, now).map(cloneEntry);
    }

    function getState() {
      return cloneState(state);
    }

    function getPresets() {
      return PRESETS.slice();
    }

    function add(slotId, presetKey) {
      const slotEntries = ensureSlotEntries(slotId);
      const durationSeconds = core && typeof core.resolvePresetDurationSeconds === "function"
        ? core.resolvePresetDurationSeconds(presetKey)
        : Math.max(1, Number(presetKey || 0)) * 60;
      if (slotEntries.length >= MAX_ENTRIES_PER_SLOT) return false;
      const currentMs = now();
      slotEntries.push({
        id: `${slotId}-${currentMs}-${Math.random().toString(36).slice(2, 6)}`,
        presetKey: normalizePresetKey(presetKey),
        baseDurationSeconds: durationSeconds,
        durationSeconds,
        adjustedDeltaSeconds: 0,
        remainingSeconds: durationSeconds,
        endAt: currentMs + durationSeconds * 1000,
        status: "running",
        completedAt: 0,
        completedAtServerMs: 0,
      });
      pruneEntries(slotEntries);
      persist();
      return true;
    }

    function adjust(slotId, entryId, deltaSeconds) {
      const entry = findEntry(slotId, entryId);
      if (!entry || (entry.status !== "running" && entry.status !== "paused")) return false;
      const currentSeconds = Math.max(1, getDisplaySeconds(entry));
      const nextSeconds = Math.max(1, currentSeconds + Math.trunc(Number(deltaSeconds) || 0));
      const actualDeltaSeconds = nextSeconds - currentSeconds;
      const durationBase = Math.max(1, Number(entry.durationSeconds || currentSeconds));
      if (!entry.baseDurationSeconds) {
        entry.baseDurationSeconds = Math.max(1, durationBase - normalizeSignedSeconds(entry.adjustedDeltaSeconds));
      }
      entry.durationSeconds = Math.max(1, durationBase + actualDeltaSeconds);
      entry.adjustedDeltaSeconds = normalizeSignedSeconds(entry.adjustedDeltaSeconds) + actualDeltaSeconds;
      entry.remainingSeconds = nextSeconds;
      entry.endAt = entry.status === "running" ? now() + nextSeconds * 1000 : 0;
      persist();
      return true;
    }

    function clearEntry(slotId, entryId) {
      const slotEntries = state.slots[slotId];
      if (!Array.isArray(slotEntries) || slotEntries.length === 0) return false;
      const index = slotEntries.findIndex((entry) => entry && entry.id === entryId);
      if (index < 0) return false;
      slotEntries.splice(index, 1);
      if (slotEntries.length === 0) {
        delete state.slots[slotId];
      }
      persist();
      return true;
    }

    function pauseAll(slotId) {
      const slotEntries = state.slots[slotId];
      if (!Array.isArray(slotEntries) || slotEntries.length === 0) return false;
      let changed = false;
      slotEntries.forEach((entry) => {
        if (entry.status !== "running") return;
        entry.remainingSeconds = getDisplaySeconds(entry);
        entry.endAt = 0;
        entry.status = "paused";
        changed = true;
      });
      if (changed) persist();
      return changed;
    }

    function resumeAll(slotId) {
      const slotEntries = state.slots[slotId];
      if (!Array.isArray(slotEntries) || slotEntries.length === 0) return false;
      let changed = false;
      const currentMs = now();
      slotEntries.forEach((entry) => {
        if (entry.status !== "paused") return;
        const seconds = Math.max(1, Number(entry.remainingSeconds || entry.durationSeconds || 0));
        entry.remainingSeconds = seconds;
        entry.endAt = currentMs + seconds * 1000;
        entry.status = "running";
        changed = true;
      });
      if (changed) persist();
      return changed;
    }

    function clearSlot(slotId) {
      if (!state.slots[slotId]) return false;
      delete state.slots[slotId];
      persist();
      return true;
    }

    function swapSlots(leftSlotId, rightSlotId) {
      if (!leftSlotId || !rightSlotId || leftSlotId === rightSlotId) return false;
      const leftEntries = Array.isArray(state.slots[leftSlotId]) ? state.slots[leftSlotId].map(cloneEntry) : [];
      const rightEntries = Array.isArray(state.slots[rightSlotId]) ? state.slots[rightSlotId].map(cloneEntry) : [];
      if (leftEntries.length > 0) {
        state.slots[rightSlotId] = leftEntries;
      } else {
        delete state.slots[rightSlotId];
      }
      if (rightEntries.length > 0) {
        state.slots[leftSlotId] = rightEntries;
      } else {
        delete state.slots[leftSlotId];
      }
      persist();
      return true;
    }

    function tick() {
      let alertCount = 0;
      const changedSlotIds = new Set();
      const currentMs = now();
      Object.keys(state.slots).forEach((slotId) => {
        const slotEntries = state.slots[slotId];
        if (!Array.isArray(slotEntries) || slotEntries.length === 0) {
          delete state.slots[slotId];
          return;
        }
        slotEntries.forEach((entry) => {
          if (entry.status !== "running") return;
          entry.remainingSeconds = Math.max(0, Math.ceil((entry.endAt - currentMs) / 1000));
          if (entry.endAt > currentMs) return;
          entry.remainingSeconds = 0;
          entry.completedAt = Math.max(0, Number(entry.endAt) || currentMs);
          entry.completedAtServerMs = entry.completedAt;
          entry.endAt = 0;
          entry.status = "expired";
          changedSlotIds.add(slotId);
          alertCount += 1;
        });
      });
      if (alertCount > 0) persist();
      return { changed: alertCount > 0, alertCount, slotIds: Array.from(changedSlotIds) };
    }

    function getDisplaySeconds(entry) {
      if (!entry) return 0;
      if (entry.status === "running" && entry.endAt > 0) {
        return Math.max(0, Math.ceil((entry.endAt - now()) / 1000));
      }
      if (entry.status === "expired") return 0;
      return Math.max(0, Number(entry.remainingSeconds || entry.durationSeconds || 0));
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
      return true;
    }

    function persist() {
      if (!storage) return;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
    }

    function ensureSlotEntries(slotId) {
      if (!Array.isArray(state.slots[slotId])) {
        state.slots[slotId] = [];
      }
      return state.slots[slotId];
    }

    function findEntry(slotId, entryId) {
      const slotEntries = state.slots[slotId];
      if (!Array.isArray(slotEntries) || slotEntries.length === 0) return null;
      const safeEntryId = String(entryId || "");
      return slotEntries.find((entry) => entry && entry.id === safeEntryId) || null;
    }

    return {
      getEntries,
      getState,
      getPresets,
      add,
      adjust,
      clearEntry,
      pauseAll,
      resumeAll,
      clearSlot,
      swapSlots,
      tick,
      getDisplaySeconds,
      replaceState,
    };
  }

  function loadState(storage, now) {
    try {
      const raw = storage ? storage.getItem(STORAGE_KEY) : null;
      if (!raw) return { slots: {} };
      return sanitizeState(JSON.parse(raw), now);
    } catch (_) {
      return { slots: {} };
    }
  }

  function sanitizeState(raw, now) {
    const next = { slots: {} };
    const sourceSlots = raw && raw.slots && typeof raw.slots === "object" ? raw.slots : {};
    Object.keys(sourceSlots).forEach((slotId) => {
      const items = Array.isArray(sourceSlots[slotId]) ? sourceSlots[slotId] : [];
      const sanitized = items.map((entry) => sanitizeEntry(entry, now)).filter(Boolean);
      if (sanitized.length > 0) {
        next.slots[slotId] = sortEntries(sanitized, now).slice(0, MAX_ENTRIES_PER_SLOT);
      }
    });
    return next;
  }

  function sanitizeEntry(entry, now) {
    const safe = {
      id: entry && entry.id ? String(entry.id) : `split-${Math.random().toString(36).slice(2, 8)}`,
      presetKey: normalizePresetKey(entry && entry.presetKey),
      baseDurationSeconds: Math.max(0, Number((entry && entry.baseDurationSeconds) || 0)),
      durationSeconds: Math.max(0, Number((entry && entry.durationSeconds) || 0)),
      adjustedDeltaSeconds: normalizeSignedSeconds(entry && entry.adjustedDeltaSeconds),
      remainingSeconds: Math.max(0, Number((entry && entry.remainingSeconds) || 0)),
      endAt: Math.max(0, Number((entry && entry.endAt) || 0)),
      status: ["running", "paused", "expired"].includes(entry && entry.status) ? entry.status : "expired",
      completedAt: Math.max(0, Number((entry && (entry.completedAtServerMs || entry.completedAt)) || 0)),
      completedAtServerMs: Math.max(0, Number((entry && (entry.completedAtServerMs || entry.completedAt)) || 0)),
    };

    if (safe.durationSeconds <= 0) return null;
    if (safe.baseDurationSeconds <= 0) safe.baseDurationSeconds = safe.durationSeconds;
    if (safe.status === "running" && safe.endAt > 0) {
      if (safe.endAt <= now()) {
        safe.status = "expired";
        safe.remainingSeconds = 0;
        safe.completedAt = safe.endAt;
        safe.completedAtServerMs = safe.endAt;
        safe.endAt = 0;
      }
      return safe;
    }
    if (safe.status === "paused") {
      safe.endAt = 0;
      safe.remainingSeconds = Math.max(1, safe.remainingSeconds || safe.durationSeconds);
      return safe;
    }
    safe.status = "expired";
    safe.remainingSeconds = 0;
    safe.endAt = 0;
    return safe;
  }

  function pruneEntries(entries) {
    while (entries.length > MAX_ENTRIES_PER_SLOT) {
      const expiredIndex = entries.findIndex((entry) => entry.status === "expired");
      if (expiredIndex >= 0) {
        entries.splice(expiredIndex, 1);
        continue;
      }
      entries.shift();
    }
  }

  function sortEntries(entries, now) {
    const currentMs = typeof now === "function" ? now() : Date.now();
    return entries.slice().sort((a, b) => {
      const weightA = statusWeight(a, currentMs);
      const weightB = statusWeight(b, currentMs);
      if (weightA !== weightB) return weightA - weightB;
      const timeA = a.status === "running" ? a.endAt : a.remainingSeconds;
      const timeB = b.status === "running" ? b.endAt : b.remainingSeconds;
      return timeA - timeB;
    });
  }

  function statusWeight(entry, currentMs) {
    const status = entry && entry.status;
    if (status === "running") return 0;
    if (status === "paused") return 1;
    if (status === "expired") {
      const completedAt = getCompletedAt(entry);
      if (completedAt > 0 && currentMs - completedAt < RECENT_COMPLETED_MS) return 2;
    }
    return 3;
  }

  function getCompletedAt(entry) {
    return Math.max(0, Number((entry && (entry.completedAtServerMs || entry.completedAt)) || 0));
  }

  function normalizeSignedSeconds(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  function normalizePresetKey(presetKey) {
    const safeKey = String(presetKey || "");
    if (core && Array.isArray(core.PRESET_DEFS) && core.PRESET_DEFS.some((preset) => preset.key === safeKey)) {
      return safeKey;
    }
    return "";
  }

  function cloneEntry(entry) {
    return {
      id: entry.id,
      presetKey: entry.presetKey || "",
      baseDurationSeconds: entry.baseDurationSeconds,
      durationSeconds: entry.durationSeconds,
      adjustedDeltaSeconds: normalizeSignedSeconds(entry.adjustedDeltaSeconds),
      remainingSeconds: entry.remainingSeconds,
      endAt: entry.endAt,
      status: entry.status,
      completedAt: getCompletedAt(entry),
      completedAtServerMs: getCompletedAt(entry),
    };
  }

  function cloneState(state) {
    const next = { slots: {} };
    Object.keys(state && state.slots ? state.slots : {}).forEach((slotId) => {
      const entries = Array.isArray(state.slots[slotId]) ? state.slots[slotId] : [];
      next.slots[slotId] = entries.map(cloneEntry);
    });
    return next;
  }

  global.ChickenTimerSplitAssist = {
    createStore,
  };
})(window);
