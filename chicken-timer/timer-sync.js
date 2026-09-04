(function (global) {
  const FB_BASE_URL = "https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app";
  const SYNC_ROOT = "packhelper/chicken_timer/boards";
  const AUDIT_ROOT = "packhelper/chicken_timer/events";
  const CLOCK_ROOT = "packhelper/chicken_timer/clock";
  const UI_REFRESH_ROOT = "packhelper/chicken_timer/ui_refresh";
  const DEFAULT_SYNC_KEY = "main";
  const STORAGE_ACTOR_ID_KEY = "chicken-timer-sync-actor-id-v1";
  const STORAGE_SNAPSHOT_PREFIX = "chicken-timer-sync-snapshot:";
  const STORAGE_DIRTY_PREFIX = "chicken-timer-sync-dirty:";
  const OFFSET_REFRESH_MS = 5 * 60 * 1000;
  const FALLBACK_POLL_BASE_MS = 30 * 1000;
  const FALLBACK_POLL_MAX_MS = 60 * 1000;
  const FALLBACK_POLL_VISIBLE_MS = 4 * 1000;
  const FALLBACK_POLL_VISIBLE_MAX_MS = 12 * 1000;
  const STREAM_CONNECT_STALE_MS = 15 * 1000;
  const STREAM_CONNECT_STALE_ANDROID_MS = 3 * 1000;
  const STREAM_RECONNECT_MS = 1500;
  const UI_REFRESH_POLL_MS = 10 * 1000;
  const PULL_DEBOUNCE_MS = 120;
  const DIRTY_RETRY_DELAYS_MS = [5 * 1000, 15 * 1000, 30 * 1000, 60 * 1000];
  const ONLINE_STALE_MS = 15000;
  const OFFSET_STALE_MS = 10 * 60 * 1000;
  const INITIAL_OFFLINE_GRACE_MS = 8000;
  const DEFAULT_CLOCK_READY_TIMEOUT_MS = 1200;
  const CLOCK_SAMPLE_COUNT = 2;
  const MAX_FIREBASE_CLOCK_RTT_MS = 1500;
  const LOCAL_DEV_HOSTS = {
    "127.0.0.1": true,
    localhost: true,
  };

  function createChannel(options) {
    const location = options && options.location ? options.location : global.location || {};
    const search = options && typeof options.search === "string"
      ? options.search
      : String((location && location.search) || "");
    const params = new URLSearchParams(search);
    const syncKey = normalizeSyncKey((options && options.syncKey) || params.get("sync") || DEFAULT_SYNC_KEY);
    const storage = options && options.storage ? options.storage : null;
    const actorId = getOrCreateActorId(storage);
    const profile = options && options.profile ? String(options.profile) : "";

    if (isLocalDev(location)) {
      return createBroadcastChannel({ actorId, profile, storage, syncKey });
    }

    if (typeof global.fetch === "function") {
      return createFirebaseRestChannel({ actorId, profile, storage, syncKey });
    }

    return createNoopChannel(syncKey);
  }

  function createNoopChannel(syncKey) {
    let statusListener = null;
    return {
      connect(config) {
        statusListener = config && typeof config.onStatus === "function" ? config.onStatus : null;
        if (statusListener) statusListener({ state: "offline", label: "오프라인", detail: "로컬" });
      },
      publish() {},
      audit() {},
      close() {},
      getNow() {
        return Date.now();
      },
      getClockState() {
        return { state: "offline", label: "오프라인", source: "noop", fresh: false, hasOffset: false, offsetMs: 0, offsetAgeMs: 0 };
      },
      ensureClockReady() {
        return Promise.resolve(false);
      },
      getSyncKey() {
        return syncKey;
      },
      refreshFromRemote() {
        return Promise.resolve(false);
      },
    };
  }

  function createBroadcastChannel(options) {
    const storage = options.storage;
    const actorId = options.actorId;
    const profile = options.profile;
    const syncKey = options.syncKey;
    const snapshotKey = getSnapshotKey(syncKey);
    const channelName = `chicken-timer-sync:${syncKey}`;
    let broadcast = null;
    let applyRemoteState = null;
    let getLocalState = null;
    let statusListener = null;
    let lastRevision = 0;
    let storageListener = null;

    function connect(config) {
      applyRemoteState = config && typeof config.applyRemoteState === "function" ? config.applyRemoteState : null;
      getLocalState = config && typeof config.getLocalState === "function" ? config.getLocalState : null;
      statusListener = config && typeof config.onStatus === "function" ? config.onStatus : null;
      notifyLocalStatus();

      const cached = readCachedEnvelope(storage, syncKey);
      if (cached) {
        handleEnvelope(cached, true);
      } else if (getLocalState) {
        publish(getLocalState(), { reason: "bootstrap" });
      }

      if (typeof global.BroadcastChannel === "function") {
        broadcast = new global.BroadcastChannel(channelName);
        broadcast.onmessage = (event) => {
          handleEnvelope(event && event.data ? event.data : null, false);
        };
      }

      if (typeof global.addEventListener === "function") {
        storageListener = (event) => {
          if (!event || event.key !== snapshotKey || !event.newValue) return;
          handleEnvelope(safeParse(event.newValue), false);
        };
        global.addEventListener("storage", storageListener);
      }
    }

    function publish(boardState, meta) {
      if (!boardState) return;
      const envelope = createEnvelope({
        actorId,
        boardState,
        profile,
        reason: meta && meta.reason ? String(meta.reason) : "",
        revision: nextRevision(lastRevision, Date.now()),
        syncKey,
        updatedAt: Date.now(),
      });
      lastRevision = envelope.meta.revision;
      writeCachedEnvelope(storage, syncKey, envelope);
      if (broadcast) {
        broadcast.postMessage(envelope);
      }
    }

    function handleEnvelope(rawEnvelope, isInitial) {
      const envelope = sanitizeEnvelope(rawEnvelope);
      if (!envelope) return false;
      if (!isInitial && envelope.meta.revision <= lastRevision) return false;
      lastRevision = Math.max(lastRevision, envelope.meta.revision);
      writeCachedEnvelope(storage, syncKey, envelope);
      if (!isInitial && envelope.meta.actorId === actorId) return true;
      if (applyRemoteState) {
        applyRemoteState(cloneJson(envelope.board), envelope.meta);
      }
      return true;
    }

    function close() {
      if (broadcast) {
        try {
          broadcast.close();
        } catch (_) {}
        broadcast = null;
      }
      if (storageListener && typeof global.removeEventListener === "function") {
        global.removeEventListener("storage", storageListener);
      }
      storageListener = null;
    }

    return {
      connect,
      publish,
      audit() {},
      close,
      getNow() {
        return Date.now();
      },
      getClockState() {
        return { state: "synced", label: "동기화됨", source: "local", fresh: true, hasOffset: true, offsetMs: 0, offsetAgeMs: 0 };
      },
      ensureClockReady() {
        return Promise.resolve(true);
      },
      getSyncKey() {
        return syncKey;
      },
      refreshFromRemote() {
        return Promise.resolve(false);
      },
    };

    function notifyLocalStatus() {
      if (statusListener) statusListener({ state: "synced", label: "동기화됨", detail: "로컬" });
    }
  }

  function createFirebaseRestChannel(options) {
    const storage = options.storage;
    const actorId = options.actorId;
    const profile = options.profile;
    const syncKey = options.syncKey;
    const stateUrls = buildStateUrls(global);
    const writeUrls = stateUrls.filter((url) => String(url).indexOf("githubusercontent.com") < 0);
    const stateUrl = writeUrls[0] || stateUrls[0];
    const auditRootUrl = `${FB_BASE_URL}/${AUDIT_ROOT}/${syncKey}`;
    const refreshUrl = `${FB_BASE_URL}/${UI_REFRESH_ROOT}/${syncKey}.json`;
    let applyRemoteState = null;
    let getLocalState = null;
    let statusListener = null;
    let lastRevision = 0;
    let offsetMs = 0;
    let clockSample = null;
    let clockRefreshPromise = null;
    let clockSource = "none";
    let connectedAtMonoMs = 0;
    let lastStateOkMonoMs = 0;
    let lastErrorMonoMs = 0;
    let pullTimerId = 0;
    let fallbackPollTimerId = 0;
    let fallbackPollDelayMs = FALLBACK_POLL_VISIBLE_MS;
    let offsetTimerId = 0;
    let dirtyRetryTimerId = 0;
    let dirtyRetryAttempt = 0;
    let dirtyRetryExhausted = false;
    let dirtyConflict = false;
    let eventSource = null;
    let streamConnectTimerId = 0;
    let streamReconnectTimerId = 0;
    let streamOpen = false;
    let streamProven = false;
    let streamStartedMonoMs = 0;
    let uiRefreshPollTimerId = 0;
    let lanFallbackActive = false;
    let closed = false;
    let onlineListener = null;
    let offlineListener = null;
    let visibilityListener = null;
    let uiRefreshHandler = null;
    let refreshSource = null;
    let lastUiRefreshNonce = "";

    function visibleFallbackBaseMs() {
      return isPageHidden() ? FALLBACK_POLL_BASE_MS : FALLBACK_POLL_VISIBLE_MS;
    }

    function visibleFallbackMaxMs() {
      return isPageHidden() ? FALLBACK_POLL_MAX_MS : FALLBACK_POLL_VISIBLE_MAX_MS;
    }

    function connect(config) {
      applyRemoteState = config && typeof config.applyRemoteState === "function" ? config.applyRemoteState : null;
      getLocalState = config && typeof config.getLocalState === "function" ? config.getLocalState : null;
      statusListener = config && typeof config.onStatus === "function" ? config.onStatus : null;
      uiRefreshHandler = config && typeof config.onUiRefresh === "function" ? config.onUiRefresh : null;
      connectedAtMonoMs = getMonotonicNow();
      closed = false;
      notifyStatus();

      refreshOffset();
      if (typeof global.setInterval === "function") {
        offsetTimerId = global.setInterval(refreshOffset, OFFSET_REFRESH_MS);
      }

      if (typeof global.ChickenTimerLanApply !== "function") {
        global.ChickenTimerLanApply = applyLanEnvelope;
      }
      startStream();
      startUiRefreshWatch();
      syncLanFallback();
      pullRemote(true).then((ok) => {
        if (!ok && !isStreamHealthy()) scheduleFallbackPoll(visibleFallbackBaseMs());
        syncLanFallback();
      });
      wakeDirtyRetry(DIRTY_RETRY_DELAYS_MS[0]);
      if (typeof global.addEventListener === "function") {
        onlineListener = () => {
          notifyStatus();
          refreshOffset();
          restartStreamIfNeeded();
          if (!isStreamHealthy()) scheduleFallbackPoll(0);
          wakeDirtyRetry(100);
          syncLanFallback();
        };
        offlineListener = () => {
          cancelFallbackPoll();
          cancelDirtyRetry();
          notifyStatus();
          syncLanFallback();
        };
        visibilityListener = () => {
          if (isPageHidden()) {
            cancelFallbackPoll();
            cancelDirtyRetry();
            cancelUiRefreshPoll();
            clearStreamReconnect();
            stopLanFallback();
            return;
          }
          restartStreamIfNeeded();
          if (!isStreamHealthy()) scheduleFallbackPoll(0);
          startUiRefreshWatch();
          wakeDirtyRetry(100);
          syncLanFallback();
        };
        global.addEventListener("online", onlineListener);
        global.addEventListener("offline", offlineListener);
        if (global.document && typeof global.document.addEventListener === "function") {
          global.document.addEventListener("visibilitychange", visibilityListener);
        }
      }
    }

    function getNow() {
      return serverNowMs();
    }

    function publish(boardState, meta) {
      if (!boardState) return Promise.resolve(false);
      const reason = meta && meta.reason ? String(meta.reason) : "";
      const auditDetails = meta && meta.audit && typeof meta.audit === "object" ? cloneJson(meta.audit) : {};
      const envelope = createEnvelope({
        actorId,
        boardState,
        profile,
        reason,
        revision: nextRevision(lastRevision, getNow()),
        syncKey,
        updatedAt: getNow(),
      });
      const writeEnvelope = () => {
        lastRevision = envelope.meta.revision;
        writeCachedEnvelope(storage, syncKey, envelope);
        publishLanEnvelope(envelope);
        return putFirstJson(writeUrls, envelope)
          .then(() => {
            markStateOk();
            markDirtyDelivered();
            auditPublish(reason, envelope, auditDetails);
            notifyStatus();
            return true;
          })
          .catch(() => {
            const native = global.ChickenTimerNative;
            if (native && typeof native.publishTimerBoard === "function") {
              try {
                native.publishTimerBoard(JSON.stringify(envelope));
                markStateOk();
                markDirtyDelivered();
                notifyStatus();
                return true;
              } catch (_) {}
            }
            markError();
            dirtyConflict = false;
            writeDirtyEnvelope(storage, syncKey, envelope, auditDetails);
            wakeDirtyRetry(DIRTY_RETRY_DELAYS_MS[0]);
            notifyStatus();
            return false;
          });
      };

      if (shouldGuardAutomaticPublish(reason)) {
        return fetchFirstJson(stateUrls)
          .then((rawRemote) => {
            const remoteEnvelope = sanitizeEnvelope(rawRemote);
            if (remoteEnvelope && hasUnsafeAutomaticBoardRemoval(remoteEnvelope.board, envelope.board, auditDetails, getNow())) {
              lastRevision = Math.max(lastRevision, remoteEnvelope.meta.revision);
              writeCachedEnvelope(storage, syncKey, remoteEnvelope);
              audit("reject-stale-auto-publish", {
                reason,
                revision: envelope.meta.revision,
                remoteRevision: remoteEnvelope.meta.revision,
                slotIds: Array.isArray(auditDetails.slotIds) ? auditDetails.slotIds.slice() : [],
                board: summarizeBoardState(envelope.board),
                remote: summarizeBoardState(remoteEnvelope.board),
              });
              if (applyRemoteState && remoteEnvelope.meta.actorId !== actorId) {
                applyRemoteState(cloneJson(remoteEnvelope.board), remoteEnvelope.meta);
              }
              notifyStatus();
              return false;
            }
            return writeEnvelope();
          })
          .catch(() => writeEnvelope());
      }

      return writeEnvelope();
    }

    function audit(type, details) {
      return Promise.resolve(false);
    }

    function auditPublish(reason, envelope, auditDetails) {
      if (!shouldAuditPublishReason(reason)) return;
      audit("publish", Object.assign({}, auditDetails || {}, {
        reason,
        revision: envelope.meta.revision,
        board: summarizeBoardState(envelope.board),
      }));
    }

    function pullRemote(isInitial) {
      if (isConstrainedAndroidClient()) peekUiRefresh();
      return fetchFirstJson(stateUrls)
        .then((rawEnvelope) => {
          const envelope = sanitizeEnvelope(rawEnvelope);
          markStateOk();
          if (!envelope) {
            notifyStatus();
            return true;
          }
          handleEnvelope(envelope, isInitial);
          notifyStatus();
          syncLanFallback();
          return true;
        })
        .catch(() => {
          markError();
          notifyStatus();
          syncLanFallback();
          if (isInitial) {
            const cached = readCachedEnvelope(storage, syncKey);
            if (cached) {
              handleEnvelope(cached, true);
              return true;
            }
          }
          return false;
        });
    }

    function handleEnvelope(rawEnvelope, isInitial) {
      const envelope = sanitizeEnvelope(rawEnvelope);
      if (!envelope) return false;
      if (!isInitial && envelope.meta.revision <= lastRevision) return false;
      lastRevision = Math.max(lastRevision, envelope.meta.revision);
      writeCachedEnvelope(storage, syncKey, envelope);
      if (!isInitial && envelope.meta.actorId === actorId) return true;
      if (applyRemoteState) {
        applyRemoteState(cloneJson(envelope.board), envelope.meta);
      }
      return true;
    }

    function scheduleDirtyRetry(delayMs) {
      if (closed || dirtyRetryTimerId || dirtyRetryExhausted || dirtyConflict || confirmedOffline() || isPageHidden()) return;
      if (!readDirtyEnvelope(storage, syncKey) || typeof global.setTimeout !== "function") return;
      dirtyRetryTimerId = global.setTimeout(() => {
        dirtyRetryTimerId = 0;
        retryDirtyEnvelope();
      }, Math.max(0, Number(delayMs) || 0));
    }

    function retryDirtyEnvelope() {
      const dirty = readDirtyEnvelope(storage, syncKey);
      if (!dirty || dirtyConflict) {
        notifyStatus();
        return Promise.resolve(false);
      }
      return fetchFirstJson(stateUrls)
        .then((rawRemote) => {
          const remoteEnvelope = sanitizeEnvelope(rawRemote);
          if (remoteEnvelope && hasDirtySlotConflict(remoteEnvelope, dirty.envelope, dirty.audit, getNow())) {
            lastRevision = Math.max(lastRevision, remoteEnvelope.meta.revision);
            writeCachedEnvelope(storage, syncKey, remoteEnvelope);
            dirtyConflict = true;
            if (applyRemoteState && remoteEnvelope.meta.actorId !== actorId) {
              applyRemoteState(cloneJson(remoteEnvelope.board), remoteEnvelope.meta);
            }
            notifyStatus();
            return false;
          }
          return putFirstJson(writeUrls, dirty.envelope)
            .then(() => {
              markStateOk();
              markDirtyDelivered();
              auditPublish(dirty.envelope.meta.reason || "retry", dirty.envelope, dirty.audit || {});
              notifyStatus();
              return true;
            })
            .catch(() => {
              const native = global.ChickenTimerNative;
              if (native && typeof native.publishTimerBoard === "function") {
                native.publishTimerBoard(JSON.stringify(dirty.envelope));
                markStateOk();
                markDirtyDelivered();
                notifyStatus();
                return true;
              }
              throw new Error("native unavailable");
            });
        })
        .catch(() => {
          markError();
          if (dirtyRetryAttempt >= DIRTY_RETRY_DELAYS_MS.length - 1) {
            dirtyRetryExhausted = true;
          } else {
            dirtyRetryAttempt += 1;
            scheduleDirtyRetry(DIRTY_RETRY_DELAYS_MS[dirtyRetryAttempt]);
          }
          notifyStatus();
          return false;
        });
    }

    function cancelDirtyRetry() {
      if (dirtyRetryTimerId && typeof global.clearTimeout === "function") {
        global.clearTimeout(dirtyRetryTimerId);
      }
      dirtyRetryTimerId = 0;
    }

    function markDirtyDelivered() {
      clearDirtyEnvelope(storage, syncKey);
      dirtyConflict = false;
      dirtyRetryAttempt = 0;
      dirtyRetryExhausted = false;
      cancelDirtyRetry();
    }

    function wakeDirtyRetry(delayMs) {
      if (dirtyConflict || confirmedOffline() || isPageHidden()) return;
      const dirty = readDirtyEnvelope(storage, syncKey);
      if (!dirty) {
        dirtyRetryAttempt = 0;
        dirtyRetryExhausted = false;
        cancelDirtyRetry();
        return;
      }
      cancelDirtyRetry();
      dirtyRetryAttempt = 0;
      dirtyRetryExhausted = false;
      scheduleDirtyRetry(delayMs);
    }

    function schedulePull() {
      if (pullTimerId || typeof global.setTimeout !== "function") return;
      pullTimerId = global.setTimeout(() => {
        pullTimerId = 0;
        pullRemote(false);
      }, PULL_DEBOUNCE_MS);
    }

    function clearStreamReconnect() {
      if (streamReconnectTimerId && typeof global.clearTimeout === "function") {
        global.clearTimeout(streamReconnectTimerId);
      }
      streamReconnectTimerId = 0;
    }

    function discardDeadStream() {
      if (!eventSource) return false;
      const ready = Number(eventSource.readyState);
      if (ready !== 2) return false;
      try {
        eventSource.close();
      } catch (_) {}
      eventSource = null;
      streamOpen = false;
      streamProven = false;
      return true;
    }

    function restartStreamIfNeeded() {
      if (discardDeadStream()) {
        startStream();
        return;
      }
      if (!eventSource && typeof global.EventSource === "function") startStream();
    }

    function scheduleStreamRestart() {
      if (closed || eventSource || streamReconnectTimerId || isPageHidden() || confirmedOffline()) return;
      if (typeof global.setTimeout !== "function") {
        startStream();
        return;
      }
      streamReconnectTimerId = global.setTimeout(() => {
        streamReconnectTimerId = 0;
        if (closed || eventSource || isPageHidden() || confirmedOffline()) return;
        startStream();
      }, STREAM_RECONNECT_MS);
    }

    function startStream() {
      // 파이어 SSE 안 씀. 공장 JSON 폴링만.
      scheduleFallbackPoll(visibleFallbackBaseMs());
      return;
      if (closed || eventSource) return;
      if (typeof global.EventSource !== "function") {
        scheduleFallbackPoll(visibleFallbackBaseMs());
        return;
      }
      try {
        eventSource = new global.EventSource(stateUrl);
        streamStartedMonoMs = getMonotonicNow();
        streamProven = false;
        const onOpen = () => markStreamOpen();
        const onChange = () => {
          markStreamProven();
          schedulePull();
        };
        eventSource.onopen = onOpen;
        eventSource.onmessage = onChange;
        eventSource.addEventListener("put", onChange);
        eventSource.addEventListener("patch", onChange);
        eventSource.onerror = () => {
          streamOpen = false;
          streamProven = false;
          if (discardDeadStream()) scheduleStreamRestart();
          scheduleFallbackPoll(fallbackPollDelayMs);
          notifyStatus();
          syncLanFallback();
        };
        if (typeof global.setTimeout === "function") {
          const staleMs = isConstrainedAndroidClient()
            ? STREAM_CONNECT_STALE_ANDROID_MS
            : STREAM_CONNECT_STALE_MS;
          streamConnectTimerId = global.setTimeout(() => {
            streamConnectTimerId = 0;
            if (isStreamHealthy()) return;
            scheduleFallbackPoll(isConstrainedAndroidClient() ? 0 : visibleFallbackBaseMs());
            maybeRestartUnprovenAndroidStream();
          }, staleMs);
        }
      } catch (_) {
        eventSource = null;
        streamOpen = false;
        streamProven = false;
        scheduleFallbackPoll(visibleFallbackBaseMs());
      }
    }

    function handleUiRefreshSignal(raw) {
      if (!raw || typeof raw !== "object") return;
      const nonce = String(raw.nonce || "");
      if (!nonce || nonce === lastUiRefreshNonce) return;
      lastUiRefreshNonce = nonce;
      if (uiRefreshHandler) uiRefreshHandler({ nonce, at: raw.at, actor: raw.actor || "" });
    }

    function peekUiRefresh() {}

    function cancelUiRefreshPoll() {
      if (uiRefreshPollTimerId && typeof global.clearTimeout === "function") {
        global.clearTimeout(uiRefreshPollTimerId);
      }
      uiRefreshPollTimerId = 0;
    }

    function scheduleUiRefreshPoll() {
      if (closed || uiRefreshPollTimerId || isPageHidden() || !isConstrainedAndroidClient()) return;
      if (typeof global.setTimeout !== "function") return;
      uiRefreshPollTimerId = global.setTimeout(() => {
        uiRefreshPollTimerId = 0;
        if (closed || isPageHidden()) return;
        peekUiRefresh();
        scheduleUiRefreshPoll();
      }, UI_REFRESH_POLL_MS);
    }

    function startUiRefreshWatch() {
      return;
      if (closed) return;
      peekUiRefresh();
      if (isConstrainedAndroidClient()) {
        if (refreshSource) {
          try {
            refreshSource.close();
          } catch (_) {}
          refreshSource = null;
        }
        scheduleUiRefreshPoll();
        return;
      }
      if (refreshSource || typeof global.EventSource !== "function") return;
      try {
        refreshSource = new global.EventSource(refreshUrl);
        const onEvt = () => {
          peekUiRefresh();
        };
        refreshSource.onmessage = onEvt;
        refreshSource.addEventListener("put", onEvt);
        refreshSource.addEventListener("patch", onEvt);
      } catch (_) {
        refreshSource = null;
      }
    }

    function markStreamProven() {
      streamProven = true;
      markStreamOpen();
    }

    function markStreamOpen() {
      const recovered = !streamOpen;
      streamOpen = true;
      markStateOk();
      fallbackPollDelayMs = visibleFallbackBaseMs();
      if (isStreamHealthy()) {
        cancelFallbackPoll();
        if (streamConnectTimerId && typeof global.clearTimeout === "function") {
          global.clearTimeout(streamConnectTimerId);
        }
        streamConnectTimerId = 0;
      }
      if (recovered) {
        refreshOffset();
        wakeDirtyRetry(100);
      }
      notifyStatus();
      syncLanFallback();
    }

    function isStreamOpen() {
      if (!eventSource || !streamOpen) return false;
      const readyState = Number(eventSource.readyState);
      return !Number.isFinite(readyState) || readyState === 1;
    }

    function isStreamHealthy() {
      if (!isStreamOpen()) return false;
      return !isConstrainedAndroidClient() || streamProven;
    }

    function maybeRestartUnprovenAndroidStream() {
      if (!isConstrainedAndroidClient() || streamProven || !eventSource || closed) return;
      const ready = Number(eventSource.readyState);
      if (ready === 1) return;
      if (ready !== 0) return;
      if (getMonotonicNow() - streamStartedMonoMs < 8000) return;
      try {
        eventSource.close();
      } catch (_) {}
      eventSource = null;
      streamOpen = false;
      streamProven = false;
      scheduleStreamRestart();
    }

    function isPageHidden() {
      return Boolean(global.document && global.document.visibilityState === "hidden");
    }

    function confirmedOffline() {
      return Boolean(global.navigator && global.navigator.onLine === false);
    }

    function cancelFallbackPoll() {
      if (fallbackPollTimerId && typeof global.clearTimeout === "function") {
        global.clearTimeout(fallbackPollTimerId);
      }
      fallbackPollTimerId = 0;
    }

    function scheduleFallbackPoll(delayMs) {
      if (closed || fallbackPollTimerId || isStreamHealthy() || isPageHidden() || confirmedOffline()) return;
      if (typeof global.setTimeout !== "function") return;
      const delay = Math.max(0, Number(delayMs) || 0);
      fallbackPollTimerId = global.setTimeout(() => {
        fallbackPollTimerId = 0;
        if (closed || isStreamHealthy() || isPageHidden() || confirmedOffline()) return;
        pullRemote(false).then((ok) => {
          fallbackPollDelayMs = ok
            ? visibleFallbackBaseMs()
            : Math.min(visibleFallbackMaxMs(), Math.max(visibleFallbackBaseMs(), fallbackPollDelayMs * 2));
          scheduleFallbackPoll(fallbackPollDelayMs);
        });
      }, delay);
    }

    function refreshOffset() {
      if (clockRefreshPromise) return clockRefreshPromise;
      const pending = requestHostingClockSample()
        .catch(() => null)
        .then((hostingSample) => {
          if (hostingSample) {
            applyClockSample(hostingSample);
            notifyStatus();
            return hostingSample;
          }
          return null;
        })
        .then((sample) => {
          if (!sample) {
            applyClockSample(createClockSample({
              source: "local-fallback",
              serverMs: Date.now(),
              sentAtMonoMs: getMonotonicNow(),
              receivedAtMonoMs: getMonotonicNow(),
              sentAtLocalMs: Date.now(),
              receivedAtLocalMs: Date.now(),
            }));
            notifyStatus();
            return true;
          }
          return isOffsetFresh();
        })
        .catch(() => {
          markError();
          notifyStatus();
          return false;
        });
      clockRefreshPromise = pending.then((ready) => {
        clockRefreshPromise = null;
        return ready;
      }, () => {
        clockRefreshPromise = null;
        return false;
      });
      return clockRefreshPromise;
    }

    function requestFirebaseClockSample() {
      if (typeof global.fetch !== "function") return Promise.reject(new Error("fetch unavailable"));
      const sentAtMonoMs = getMonotonicNow();
      const sentAtLocalMs = Date.now();
      const clockUrl = `${FB_BASE_URL}/${CLOCK_ROOT}/${syncKey}.json`;
      return global.fetch(appendCacheBust(clockUrl), {
        method: "PUT",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ".sv": "timestamp" }),
      }).then((response) => {
        if (!response || !response.ok) {
          throw new Error(`http ${response ? response.status : 0}`);
        }
        return response.json();
      }).then((value) => {
        const receivedAtMonoMs = getMonotonicNow();
        const receivedAtLocalMs = Date.now();
        const serverMs = Number(value);
        if (!Number.isFinite(serverMs) || serverMs <= 0) {
          throw new Error("invalid firebase server timestamp");
        }
        return createClockSample({
          source: "firebase-timestamp",
          serverMs,
          sentAtMonoMs,
          receivedAtMonoMs,
          sentAtLocalMs,
          receivedAtLocalMs,
        });
      });
    }

    function requestHostingClockSample() {
      const clockUrl = getHostingClockUrl(global.location || {});
      if (!clockUrl || typeof global.fetch !== "function") return Promise.resolve(null);
      const sentAtMonoMs = getMonotonicNow();
      const sentAtLocalMs = Date.now();
      return global.fetch(appendCacheBust(clockUrl), {
        cache: "no-store",
        headers: { Accept: "text/html" },
      }).then((response) => {
        if (!response || !response.ok || !response.headers || typeof response.headers.get !== "function") {
          throw new Error(`http ${response ? response.status : 0}`);
        }
        const parsedDate = Date.parse(response.headers.get("date") || "");
        if (!Number.isFinite(parsedDate) || parsedDate <= 0) throw new Error("missing hosting date header");
        const receivedAtMonoMs = getMonotonicNow();
        const receivedAtLocalMs = Date.now();
        return createClockSample({
          source: "hosting-date",
          // HTTP Date has one-second precision. Use the middle of that second
          // before applying the round-trip midpoint estimate.
          serverMs: parsedDate + 500,
          sentAtMonoMs,
          receivedAtMonoMs,
          sentAtLocalMs,
          receivedAtLocalMs,
        });
      });
    }

    function applyClockSample(sample) {
      offsetMs = sample.offsetMs;
      clockSource = sample.source;
      clockSample = sample;
    }

    function ensureClockReady(options) {
      if (isOffsetFresh()) return Promise.resolve(true);
      const timeoutMs = Math.max(0, Number(options && options.timeoutMs) || DEFAULT_CLOCK_READY_TIMEOUT_MS);
      let timeoutId = 0;
      let settled = false;
      return new Promise((resolve) => {
        const finish = (ready) => {
          if (settled) return;
          settled = true;
          if (timeoutId && typeof global.clearTimeout === "function") {
            global.clearTimeout(timeoutId);
          }
          resolve(Boolean(ready && isOffsetFresh()));
        };
        if (timeoutMs > 0 && typeof global.setTimeout === "function") {
          timeoutId = global.setTimeout(() => finish(false), timeoutMs);
        }
        refreshOffset().then(finish).catch(() => finish(false));
      });
    }

    function close() {
      closed = true;
      if (pullTimerId && typeof global.clearTimeout === "function") {
        global.clearTimeout(pullTimerId);
      }
      pullTimerId = 0;
      clearStreamReconnect();
      cancelFallbackPoll();
      cancelUiRefreshPoll();
      stopLanFallback();
      if (offsetTimerId && typeof global.clearInterval === "function") {
        global.clearInterval(offsetTimerId);
      }
      offsetTimerId = 0;
      cancelDirtyRetry();
      if (streamConnectTimerId && typeof global.clearTimeout === "function") {
        global.clearTimeout(streamConnectTimerId);
      }
      streamConnectTimerId = 0;
      if (eventSource) {
        try {
          eventSource.close();
        } catch (_) {}
        eventSource = null;
      }
      if (refreshSource) {
        try {
          refreshSource.close();
        } catch (_) {}
        refreshSource = null;
      }
      streamOpen = false;
      streamProven = false;
      if (onlineListener && typeof global.removeEventListener === "function") {
        global.removeEventListener("online", onlineListener);
      }
      if (offlineListener && typeof global.removeEventListener === "function") {
        global.removeEventListener("offline", offlineListener);
      }
      if (visibilityListener && global.document && typeof global.document.removeEventListener === "function") {
        global.document.removeEventListener("visibilitychange", visibilityListener);
      }
      onlineListener = null;
      offlineListener = null;
      visibilityListener = null;
    }

    function notifyStatus() {
      if (!statusListener) return;
      const dirty = readDirtyEnvelope(storage, syncKey);
      const pendingCount = dirty ? 1 : 0;
      const clockState = getClockState();
      const offline = clockState.state === "offline";
      if (dirtyConflict) {
        statusListener({ state: "conflict", label: "보정중", detail: "충돌 대기", pendingCount });
        return;
      }
      if (pendingCount > 0) {
        statusListener({
          state: offline ? "offline" : "pending",
          label: offline ? "오프라인" : "보정중",
          detail: dirtyRetryExhausted ? "재연결 대기" : "재전송 대기",
          pendingCount,
        });
        return;
      }
      if (offline) {
        statusListener({ state: "offline", label: "오프라인", pendingCount });
        return;
      }
      if (clockState.state !== "synced") {
        statusListener({ state: "syncing", label: "보정중", detail: clockState.detail || "", pendingCount });
        return;
      }
      statusListener({ state: "synced", label: "동기화됨", pendingCount });
    }

    function serverNowMs() {
      if (clockSample && clockSample.sampledAtMonoMs >= 0) {
        const elapsedMs = Math.max(0, getMonotonicNow() - clockSample.sampledAtMonoMs);
        return Math.max(0, clockSample.serverAtSampleMs + elapsedMs);
      }
      return Date.now() + offsetMs;
    }

    function isOffsetFresh() {
      return Boolean(clockSample && clockSample.sampledAtMonoMs >= 0 && getMonotonicNow() - clockSample.sampledAtMonoMs <= OFFSET_STALE_MS);
    }

    function getClockState() {
      const monoNow = getMonotonicNow();
      const online = !(global.navigator && global.navigator.onLine === false);
      const stateFresh = isStreamHealthy() || (lastStateOkMonoMs > 0 && monoNow - lastStateOkMonoMs <= ONLINE_STALE_MS);
      const offsetFresh = isOffsetFresh();
      const hasInitialError = lastStateOkMonoMs <= 0 && lastErrorMonoMs > 0 && monoNow - connectedAtMonoMs > INITIAL_OFFLINE_GRACE_MS;
      const offline = !online || (lastStateOkMonoMs > 0 && !stateFresh) || hasInitialError;
      const hasOffset = Boolean(clockSample && clockSample.sampledAtMonoMs >= 0);
      const offsetAgeMs = hasOffset ? Math.max(0, monoNow - clockSample.sampledAtMonoMs) : 0;
      if (offline) {
        return { state: "offline", label: "오프라인", source: "move", clockSource, fresh: false, hasOffset, offsetMs, offsetAgeMs };
      }
      if (!offsetFresh) {
        return {
          state: "correcting",
          label: "보정중",
          detail: hasOffset ? "서버시간 갱신" : "서버시간 확인",
          source: "move",
          clockSource,
          fresh: false,
          hasOffset,
          offsetMs,
          offsetAgeMs,
        };
      }
      if (!stateFresh) {
        return {
          state: "correcting",
          label: "보정중",
          detail: "연결 확인",
          source: "move",
          clockSource,
          fresh: false,
          hasOffset,
          offsetMs,
          offsetAgeMs,
        };
      }
      return { state: "synced", label: "동기화됨", source: "move", clockSource, fresh: true, hasOffset, offsetMs, offsetAgeMs };
    }

    function markStateOk() {
      const monoNow = getMonotonicNow();
      lastStateOkMonoMs = monoNow;
    }

    function markError() {
      lastErrorMonoMs = getMonotonicNow();
    }

    function firebaseLooksDead() {
      if (isStreamHealthy()) return false;
      const now = getMonotonicNow();
      if (lastStateOkMonoMs > 0 && now - lastStateOkMonoMs > ONLINE_STALE_MS && lastErrorMonoMs >= lastStateOkMonoMs) {
        return true;
      }
      return lastStateOkMonoMs <= 0 && lastErrorMonoMs > 0 && now - connectedAtMonoMs > INITIAL_OFFLINE_GRACE_MS;
    }

    function lanNative() {
      return global.ChickenTimerNative && typeof global.ChickenTimerNative.startLanFallback === "function"
        ? global.ChickenTimerNative
        : null;
    }

    function startLanFallback() {
      const native = lanNative();
      if (!native || lanFallbackActive || isPageHidden() || closed) return;
      try {
        native.startLanFallback(syncKey);
        lanFallbackActive = true;
      } catch (_) {
        lanFallbackActive = false;
      }
    }

    function stopLanFallback() {
      if (!lanFallbackActive) return;
      const native = lanNative();
      try {
        if (native && typeof native.stopLanFallback === "function") native.stopLanFallback();
      } catch (_) {}
      lanFallbackActive = false;
    }

    function syncLanFallback() {
      if (isPageHidden() || closed || !lanNative()) {
        stopLanFallback();
        return;
      }
      // Note9/Tab stay on the same charged Wi-Fi. Keep LAN as the fast
      // peer path even while Firebase is healthy; Firebase remains the
      // durable shared room for the laptop and later recovery.
      startLanFallback();
    }

    function publishLanEnvelope(envelope) {
      if (!envelope) return;
      syncLanFallback();
      const native = lanNative();
      if (!native || !lanFallbackActive || typeof native.publishLanEnvelope !== "function") return;
      try {
        native.publishLanEnvelope(JSON.stringify(envelope));
      } catch (_) {}
    }

    function applyLanEnvelope(raw) {
      if (closed || !raw) return false;
      const parsed = typeof raw === "string" ? safeParse(raw) : raw;
      const envelope = sanitizeEnvelope(parsed);
      if (!envelope) return false;
      if (envelope.meta.syncKey !== syncKey) return false;
      if (envelope.meta.actorId === actorId) return false;
      return handleEnvelope(envelope, false);
    }

    return {
      connect,
      publish,
      audit,
      close,
      getNow,
      getClockState,
      ensureClockReady,
      getSyncKey() {
        return syncKey;
      },
      refreshFromRemote() {
        return pullRemote(true);
      },
    };
  }

  function createEnvelope(options) {
    return {
      meta: {
        actorId: options.actorId,
        profile: options.profile || "",
        reason: options.reason || "",
        revision: Math.max(1, Number(options.revision) || 0),
        syncKey: options.syncKey,
        updatedAt: Math.max(0, Number(options.updatedAt) || 0),
        version: 1,
      },
      board: cloneJson(options.boardState) || {
        main: { slots: [] },
        split: { slots: {} },
      },
    };
  }

  function sanitizeEnvelope(rawEnvelope) {
    if (!rawEnvelope || typeof rawEnvelope !== "object") return null;
    if (rawEnvelope.boards && typeof rawEnvelope.boards === "object") {
      const nested = rawEnvelope.boards.main || rawEnvelope.boards[DEFAULT_SYNC_KEY];
      if (nested && typeof nested === "object") rawEnvelope = nested;
    }
    const meta = rawEnvelope.meta && typeof rawEnvelope.meta === "object" ? rawEnvelope.meta : {};
    const revision = Math.max(0, Number(meta.revision) || 0);
    if (revision <= 0) return null;
    return {
      meta: {
        actorId: meta.actorId ? String(meta.actorId) : "",
        profile: meta.profile ? String(meta.profile) : "",
        reason: meta.reason ? String(meta.reason) : "",
        revision,
        syncKey: normalizeSyncKey(meta.syncKey || DEFAULT_SYNC_KEY),
        updatedAt: Math.max(0, Number(meta.updatedAt) || 0),
        version: Math.max(1, Number(meta.version) || 1),
      },
      board: cloneJson(rawEnvelope.board) || {
        main: { slots: [] },
        split: { slots: {} },
      },
    };
  }

  function normalizeSyncKey(value) {
    const raw = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return raw || DEFAULT_SYNC_KEY;
  }

  function shouldAuditPublishReason(reason) {
    return {
      start: true,
      clear: true,
      adjust: true,
      expired: true,
      tick: true,
      add: true,
      swap: true,
      "swap-undo": true,
      recover: true,
      "auto-blank-recovery": true,
      "recover-remote-blank": true,
      "startup-recovery": true,
      "manual-recovery": true,
      "manual-recovery-button": true,
      "manual-one-minute-recovery": true,
      "split-main-expired": true,
    }[String(reason || "")] === true;
  }

  function shouldGuardAutomaticPublish(reason) {
    return {
      expired: true,
      tick: true,
      "split-main-expired": true,
    }[String(reason || "")] === true;
  }

  function hasUnsafeAutomaticBoardRemoval(remoteBoard, nextBoard, auditDetails, currentNow) {
    const remoteSlots = getMainSlots(remoteBoard);
    const nextById = getMainSlotMap(nextBoard);
    const changedSlotIds = new Set(Array.isArray(auditDetails && auditDetails.slotIds) ? auditDetails.slotIds : []);
    const nowMs = Math.max(0, Number(currentNow) || Date.now());

    return remoteSlots.some((remoteSlot) => {
      if (!isActiveSlot(remoteSlot)) return false;
      const nextSlot = nextById.get(String(remoteSlot.id || ""));
      if (!isActiveSlot(nextSlot)) {
        return !(changedSlotIds.has(String(remoteSlot.id || "")) && isSlotDue(remoteSlot, nowMs));
      }
      return hasAutomaticSlotConflict(remoteSlot, nextSlot, nowMs);
    });
  }

  function hasDirtySlotConflict(remoteEnvelope, dirtyEnvelope, auditDetails, currentNow) {
    if (!remoteEnvelope || !dirtyEnvelope) return false;
    if (remoteEnvelope.meta.revision <= dirtyEnvelope.meta.revision) return false;
    const slotIds = Array.isArray(auditDetails && auditDetails.slotIds)
      ? auditDetails.slotIds.map((slotId) => String(slotId || "")).filter(Boolean)
      : [];
    if (slotIds.length === 0) return false;
    const remoteById = getMainSlotMap(remoteEnvelope.board);
    const dirtyById = getMainSlotMap(dirtyEnvelope.board);
    const nowMs = Math.max(0, Number(currentNow) || Date.now());
    return slotIds.some((slotId) => {
      const remoteSlot = remoteById.get(slotId) || null;
      const dirtySlot = dirtyById.get(slotId) || null;
      if (!remoteSlot && !dirtySlot) return false;
      if (isActiveSlot(remoteSlot) && !isSlotDue(remoteSlot, nowMs)) {
        if (!isActiveSlot(dirtySlot)) return true;
        return hasAutomaticSlotConflict(remoteSlot, dirtySlot, nowMs);
      }
      return false;
    });
  }

  function hasAutomaticSlotConflict(remoteSlot, nextSlot, nowMs) {
    if (!remoteSlot || !nextSlot) return true;
    if (String(remoteSlot.id || "") !== String(nextSlot.id || "")) return true;
    if (isSlotDue(remoteSlot, nowMs)) return false;

    const remoteEndAt = Math.max(0, Number(remoteSlot.endAt) || 0);
    const nextEndAt = Math.max(0, Number(nextSlot.endAt) || 0);
    const remoteDuration = Math.max(0, Number(remoteSlot.durationSeconds) || 0);
    const nextDuration = Math.max(0, Number(nextSlot.durationSeconds) || 0);
    const remotePreset = String(remoteSlot.presetKey || "");
    const nextPreset = String(nextSlot.presetKey || "");

    if (remoteEndAt > 0 && nextEndAt > 0 && Math.abs(remoteEndAt - nextEndAt) > 2000) return true;
    if (Math.abs(remoteDuration - nextDuration) > 1) return true;
    if (remotePreset !== nextPreset) return true;
    if (String(remoteSlot.status || "") !== String(nextSlot.status || "")) return true;
    return false;
  }

  function getMainSlots(boardState) {
    return boardState && boardState.main && Array.isArray(boardState.main.slots)
      ? boardState.main.slots
      : [];
  }

  function getMainSlotMap(boardState) {
    const map = new Map();
    getMainSlots(boardState).forEach((slot) => {
      if (!slot || !slot.id) return;
      map.set(String(slot.id), slot);
    });
    return map;
  }

  function isActiveSlot(slot) {
    const status = slot && slot.status ? String(slot.status) : "";
    return status === "running" || status === "paused" || status === "expired";
  }

  function isSlotDue(slot, nowMs) {
    const endAt = Math.max(0, Number(slot && slot.endAt) || 0);
    if (endAt <= 0) return String((slot && slot.status) || "") === "expired";
    return endAt <= Math.max(0, Number(nowMs) || 0) + 2000;
  }

  function createAuditEvent(options) {
    return {
      version: 1,
      type: normalizeAuditType(options.type),
      at: Math.max(0, Number(options.at) || 0),
      actorId: options.actorId ? String(options.actorId) : "",
      profile: options.profile ? String(options.profile) : "",
      syncKey: normalizeSyncKey(options.syncKey || DEFAULT_SYNC_KEY),
      revision: Math.max(0, Number(options.revision) || 0),
      details: sanitizeAuditDetails(options.details),
    };
  }

  function normalizeAuditType(value) {
    return String(value || "event")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event";
  }

  function sanitizeAuditDetails(details) {
    const cloned = cloneJson(details && typeof details === "object" ? details : {});
    const raw = JSON.stringify(cloned || {});
    if (raw.length <= 5000) return cloned || {};
    return { truncated: true, rawLength: raw.length };
  }

  function summarizeBoardState(boardState) {
    const mainSlots = boardState && boardState.main && Array.isArray(boardState.main.slots)
      ? boardState.main.slots
      : [];
    const slots = mainSlots.map((slot) => {
      const completed = slot && slot.lastCompleted && typeof slot.lastCompleted === "object" ? slot.lastCompleted : null;
      return {
        id: slot && slot.id ? String(slot.id) : "",
        status: slot && slot.status ? String(slot.status) : "idle",
        presetKey: slot && slot.presetKey ? String(slot.presetKey) : "",
        baseDurationSeconds: Math.max(0, Number((slot && slot.baseDurationSeconds) || 0)),
        durationSeconds: Math.max(0, Number((slot && slot.durationSeconds) || 0)),
        adjustedDeltaSeconds: Number((slot && slot.adjustedDeltaSeconds) || 0),
        remainingSeconds: Math.max(0, Number((slot && slot.remainingSeconds) || 0)),
        endAt: Math.max(0, Number((slot && slot.endAt) || 0)),
        lastCompletedAt: completed ? Math.max(0, Number(completed.completedAt) || 0) : 0,
        lastCompletedDurationSeconds: completed ? Math.max(0, Number(completed.durationSeconds) || 0) : 0,
        lastCompletedBaseDurationSeconds: completed ? Math.max(0, Number(completed.baseDurationSeconds) || 0) : 0,
        lastCompletedFinalDurationSeconds: completed ? Math.max(0, Number(completed.finalDurationSeconds || completed.durationSeconds) || 0) : 0,
        lastCompletedAdjustedDeltaSeconds: completed ? Number(completed.adjustedDeltaSeconds || 0) : 0,
        completionCount: Math.max(0, Math.trunc(Number((slot && slot.completionCount) || 0))),
      };
    });
    const splitSlots = boardState && boardState.split && boardState.split.slots && typeof boardState.split.slots === "object"
      ? boardState.split.slots
      : {};
    let splitCount = 0;
    Object.keys(splitSlots).forEach((slotId) => {
      const entries = Array.isArray(splitSlots[slotId]) ? splitSlots[slotId] : [];
      splitCount += entries.length;
    });
    return {
      activeMain: slots.filter((slot) => slot.status !== "idle").length,
      usefulMain: slots.filter((slot) => slot.status !== "idle" || slot.lastCompletedAt > 0).length,
      splitCount,
      slots,
    };
  }

  function formatKstDateKey(ms) {
    const date = new Date(Math.max(0, Number(ms) || 0) + 9 * 60 * 60 * 1000);
    const year = String(date.getUTCFullYear());
    const month = pad2(date.getUTCMonth() + 1);
    const day = pad2(date.getUTCDate());
    return `${year}${month}${day}`;
  }

  function pad2(value) {
    const text = String(Math.max(0, Number(value) || 0));
    return text.length >= 2 ? text : `0${text}`;
  }

  function isLocalDev(location) {
    const hostname = location && location.hostname ? String(location.hostname).toLowerCase() : "";
    const protocol = location && location.protocol ? String(location.protocol).toLowerCase() : "";
    return LOCAL_DEV_HOSTS[hostname] === true && (protocol === "http:" || protocol === "https:");
  }

  function nextRevision(lastRevision, currentNow) {
    return Math.max(Math.floor(Number(currentNow) || 0), Math.max(0, Number(lastRevision) || 0) + 1);
  }

  function getOrCreateActorId(storage) {
    const actorStorage = global.sessionStorage && typeof global.sessionStorage.getItem === "function"
      ? global.sessionStorage
      : storage;
    const cached = readStorage(actorStorage, STORAGE_ACTOR_ID_KEY);
    if (cached) return cached;
    const next = `actor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    writeStorage(actorStorage, STORAGE_ACTOR_ID_KEY, next);
    return next;
  }

  function getSnapshotKey(syncKey) {
    return `${STORAGE_SNAPSHOT_PREFIX}${syncKey}`;
  }

  function getDirtyKey(syncKey) {
    return `${STORAGE_DIRTY_PREFIX}${syncKey}`;
  }

  function readCachedEnvelope(storage, syncKey) {
    return sanitizeEnvelope(safeParse(readStorage(storage, getSnapshotKey(syncKey))));
  }

  function writeCachedEnvelope(storage, syncKey, envelope) {
    const safeEnvelope = sanitizeEnvelope(envelope);
    if (!safeEnvelope) return;
    writeStorage(storage, getSnapshotKey(syncKey), JSON.stringify(safeEnvelope));
  }

  function readDirtyEnvelope(storage, syncKey) {
    const raw = safeParse(readStorage(storage, getDirtyKey(syncKey)));
    if (!raw || typeof raw !== "object") return null;
    const envelope = sanitizeEnvelope(raw.envelope);
    if (!envelope) return null;
    const audit = raw.audit && typeof raw.audit === "object" ? cloneJson(raw.audit) : {};
    return {
      version: Math.max(1, Number(raw.version) || 1),
      at: Math.max(0, Number(raw.at) || 0),
      envelope,
      audit,
    };
  }

  function writeDirtyEnvelope(storage, syncKey, envelope, audit) {
    const safeEnvelope = sanitizeEnvelope(envelope);
    if (!safeEnvelope) return;
    writeStorage(storage, getDirtyKey(syncKey), JSON.stringify({
      version: 1,
      at: Date.now(),
      envelope: safeEnvelope,
      audit: audit && typeof audit === "object" ? cloneJson(audit) : {},
    }));
  }

  function clearDirtyEnvelope(storage, syncKey) {
    removeStorage(storage, getDirtyKey(syncKey));
  }

  function readStorage(storage, key) {
    if (!storage || typeof storage.getItem !== "function") return "";
    try {
      return storage.getItem(key) || "";
    } catch (_) {
      return "";
    }
  }

  function writeStorage(storage, key, value) {
    if (!storage || typeof storage.setItem !== "function") return;
    try {
      storage.setItem(key, String(value));
    } catch (_) {}
  }

  function removeStorage(storage, key) {
    if (!storage || typeof storage.removeItem !== "function") return;
    try {
      storage.removeItem(key);
    } catch (_) {}
  }

  function fetchJson(url) {
    if (typeof global.fetch !== "function") {
      return Promise.reject(new Error("fetch unavailable"));
    }
    const host = httpUrlHost(url);
    const lan = isStoreLanHost(host);
    const factory = !!(FACTORY_WAN_HOST && host === FACTORY_WAN_HOST);
    const ctrl = typeof global.AbortController === "function" ? new global.AbortController() : null;
    const timeoutMs = lan ? 800 : factory ? 2500 : 5000;
    const timer = ctrl && typeof global.setTimeout === "function"
      ? global.setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, timeoutMs)
      : 0;
    return global.fetch(appendCacheBust(url), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: ctrl ? ctrl.signal : undefined,
    }).then((response) => {
      if (timer && typeof global.clearTimeout === "function") global.clearTimeout(timer);
      if (!response || !response.ok) {
        throw new Error(`http ${response ? response.status : 0}`);
      }
      return response.json();
    }).catch((err) => {
      if (timer && typeof global.clearTimeout === "function") global.clearTimeout(timer);
      throw err;
    });
  }

  let FACTORY_WAN_HOST = "";
  let FACTORY_WAN_JSON = "";
  let sotReady = null;

  function factorySotCandidates() {
    const cands = [
      "https://gist.githubusercontent.com/wk7007-wk/a67e5de3271d6d0716b276dc6a8391cb/raw/factory_bridge.json",
      "https://wk7007-wk.github.io/bbq-dashboard/updates/endpoints.json",
    ];
    try {
      const loc = global.location || {};
      const host = String(loc.hostname || "");
      const origin = String(loc.origin || "");
      if (origin && host.indexOf("github.io") < 0) {
        cands.push(origin + "/endpoints.json");
        cands.push(origin + "/factory_bridge.json");
      }
    } catch (_) {}
    cands.push("https://wsl-ubuntu.tail785e65.ts.net/endpoints.json");
    cands.push("https://wsl-ubuntu.tail785e65.ts.net/factory_bridge.json");
    return cands;
  }

  function tableBases(ep) {
    const f = (ep && ep.sets && ep.sets.factory) || (ep && ep.factory) || {};
    const ip = String((ep && ep.public_ip) || "").trim();
    const magic = String((f && f.magic_base) || (ep && ep.magic_base) || "").replace(/\/$/, "");
    let wan = String((f && f.wan_base) || (ep && ep.wan_base) || "").replace(/\/$/, "");
    let wanHost = "";
    const match = wan.match(/^https?:\/\/([^/:]+)/i);
    if (match) wanHost = match[1];
    if (ip && (!wan || wanHost !== ip || wan.indexOf("https://") === 0)) {
      wan = "http://" + ip + ":2421";
    }
    return { ip: ip, magic: magic, wan: wan };
  }

  function applyFactorySot(ep) {
    if (!ep || typeof ep !== "object") return false;
    const t = tableBases(ep);
    if (!t.ip && !t.wan && !t.magic) return false;
    FACTORY_WAN_HOST = t.ip;
    let host = "";
    try { host = String((global.location || {}).hostname || ""); } catch (_) {}
    let live = t.wan;
    if (host.indexOf(".ts.net") >= 0 && t.magic) live = t.magic;
    else if ((host === "127.0.0.1" || host === "localhost") && t.magic) live = t.magic;
    if (!live) live = t.magic || t.wan;
    if (!live) return false;
    FACTORY_WAN_JSON = live.replace(/\/$/, "") + "/chicken_timer.json";
    return true;
  }

  function loadFactorySot() {
    if (sotReady) return sotReady;
    sotReady = (async function () {
      const cands = factorySotCandidates();
      for (let i = 0; i < cands.length; i++) {
        const u = cands[i];
        try {
          const r = await global.fetch(u, { cache: "no-cache" });
          if (!r || !r.ok) continue;
          const ep = await r.json();
          if (applyFactorySot(ep)) return ep;
        } catch (_) {}
      }
      return null;
    })();
    return sotReady;
  }
  loadFactorySot();

  function isStoreLanHost(host) {
    const match = String(host || "").match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a === 192 && b === 168) return true;
    return a === 10;
  }

  function httpUrlHost(url) {
    const match = String(url || "").match(/^https?:\/\/([^/:]+)/i);
    return match ? match[1] : "";
  }

  function parseNativeUrlList(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== "string") return [];
    const text = raw.trim();
    if (!text) return [];
    if (text.charAt(0) === "[") {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return text.split(",").map((item) => item.trim()).filter(Boolean);
  }

  function lanFactoryJsonUrls(globalObj) {
    const root = globalObj || global;
    const native = root.ChickenTimerNative;
    if (!native || typeof native.fastFactoryJsonUrls !== "function") return [];
    let raw;
    try {
      raw = native.fastFactoryJsonUrls();
    } catch (_) {
      return [];
    }
    const out = [];
    parseNativeUrlList(raw).forEach((item) => {
      const url = String(item || "").trim();
      const host = httpUrlHost(url);
      if (!isStoreLanHost(host)) return;
      if (url.indexOf(":2421/") < 0) return;
      if (url.indexOf("chicken_timer.json") < 0) return;
      const normalized = "http://" + host + ":2421/chicken_timer.json";
      if (out.indexOf(normalized) < 0) out.push(normalized);
    });
    return out;
  }

  function androidNative(globalObj) {
    const native = (globalObj || global).ChickenTimerNative;
    return !!(native && typeof native.fastFactoryJsonUrls === "function");
  }

  function buildStateUrls(globalObj) {
    if (!androidNative(globalObj)) {
      return [FACTORY_WAN_JSON];
    }
    const urls = [];
    lanFactoryJsonUrls(globalObj).forEach((url) => {
      if (urls.indexOf(url) < 0) urls.push(url);
    });
    if (urls.indexOf(FACTORY_WAN_JSON) < 0) urls.push(FACTORY_WAN_JSON);
    return urls;
  }

  function raceFirst(urls, runner) {
    const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (!list.length) return Promise.reject(new Error("no urls"));
    if (list.length === 1) return runner(list[0]);
    return new Promise((resolve, reject) => {
      let pending = list.length;
      let settled = false;
      list.forEach((url) => {
        runner(url).then((value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        }).catch(() => {
          pending -= 1;
          if (!settled && pending <= 0) reject(new Error("all failed"));
        });
      });
    });
  }

  function fetchFirstJson(urls) {
    return loadFactorySot().then(function () {
      const list = (Array.isArray(urls) && urls.length) ? urls : buildStateUrls(global);
      return raceFirst(list, fetchJson);
    });
  }

  function putAllJson(urls, value) {
    return loadFactorySot().then(function () {
    const list = Array.isArray(urls) && urls.length ? urls.filter(Boolean) : buildStateUrls(global).filter(Boolean);
    if (!list.length) return Promise.reject(new Error("no urls"));
    if (list.length === 1) return putJson(list[0], value);
    return new Promise((resolve, reject) => {
      let pending = list.length;
      let resolved = false;
      let lastErr = null;
      list.forEach((url) => {
        putJson(url, value).then((res) => {
          if (!resolved) {
            resolved = true;
            resolve(res);
          }
        }).catch((err) => {
          lastErr = err;
          pending -= 1;
          if (!resolved && pending <= 0) reject(lastErr || new Error("all failed"));
        });
      });
    });
    });
  }

  function putFirstJson(urls, value) {
    return putAllJson(urls, value);
  }

  function putJson(url, value) {
    if (typeof global.fetch !== "function") {
      return Promise.reject(new Error("fetch unavailable"));
    }
    return global.fetch(appendCacheBust(url), {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: "token chicken-timer",
      },
      body: JSON.stringify(value),
    }).then((response) => {
      if (!response || !response.ok) {
        throw new Error(`http ${response ? response.status : 0}`);
      }
      return response;
    });
  }

  function postJson(url, value) {
    if (typeof global.fetch !== "function") {
      return Promise.reject(new Error("fetch unavailable"));
    }
    return global.fetch(appendCacheBust(url), {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    }).then((response) => {
      if (!response || !response.ok) {
        throw new Error(`http ${response ? response.status : 0}`);
      }
      return response;
    });
  }

  function appendCacheBust(url) {
    const separator = url.indexOf("?") >= 0 ? "&" : "?";
    return `${url}${separator}t=${Date.now()}`;
  }

  function createClockSample(options) {
    const sentAtMonoMs = Math.max(0, Number(options && options.sentAtMonoMs) || 0);
    const receivedAtMonoMs = Math.max(sentAtMonoMs, Number(options && options.receivedAtMonoMs) || sentAtMonoMs);
    const sentAtLocalMs = Math.max(0, Number(options && options.sentAtLocalMs) || 0);
    const receivedAtLocalMs = Math.max(sentAtLocalMs, Number(options && options.receivedAtLocalMs) || sentAtLocalMs);
    const serverMs = Math.max(0, Number(options && options.serverMs) || 0);
    const sampledAtMonoMs = sentAtMonoMs + (receivedAtMonoMs - sentAtMonoMs) / 2;
    const sampledAtLocalMs = sentAtLocalMs + (receivedAtLocalMs - sentAtLocalMs) / 2;
    return {
      source: options && options.source ? String(options.source) : "unknown",
      serverAtSampleMs: serverMs,
      sampledAtMonoMs,
      offsetMs: serverMs - sampledAtLocalMs,
      rttMs: Math.max(0, receivedAtMonoMs - sentAtMonoMs),
    };
  }

  function getHostingClockUrl(location) {
    const protocol = location && location.protocol ? String(location.protocol).toLowerCase() : "";
    const hostname = location && location.hostname ? String(location.hostname) : "";
    if (protocol !== "http:" && protocol !== "https:") return "";
    if (!hostname) return "";
    const host = location && location.host ? String(location.host) : hostname;
    let path = location && location.pathname ? String(location.pathname) : "/";
    if (!path || path.charAt(0) !== "/") path = "/" + path;
    const lastSeg = path.split("/").pop();
    const looksLikeFile = lastSeg.indexOf(".") >= 0;
    const dir = looksLikeFile
      ? path.slice(0, path.lastIndexOf("/") + 1)
      : (path.charAt(path.length - 1) === "/" ? path : path + "/");
    return `${protocol}//${host}${dir}index.html`;
  }

  function isConstrainedAndroidClient() {
    const ua = String((global.navigator && global.navigator.userAgent) || "");
    return /Android/i.test(ua);
  }

  function getMonotonicNow() {
    const perf = global.performance;
    if (perf && typeof perf.now === "function") {
      const value = Number(perf.now());
      if (Number.isFinite(value) && value >= 0) return value;
    }
    return Date.now();
  }

  function safeParse(raw) {
    if (!raw || typeof raw !== "string") return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function cloneJson(value) {
    if (value == null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return null;
    }
  }

  global.ChickenTimerSync = {
    createChannel,
    buildStateUrls,
    isStoreLanHost,
  };
})(window);
