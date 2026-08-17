(function (root, factory) {
  "use strict";

  const moduleApi = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = moduleApi;
  }

  if (root && root.document) {
    const browserApi = moduleApi.create(root);
    root.ChickenTimerPhysicalEvidence = browserApi;
    browserApi.armFromLocation();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA = "chickentimer-web-runtime-evidence/v1";
  const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
  const REVISION_PATTERN = /^[A-Za-z0-9._-]{7,80}$/;
  const MAX_ASSETS = 32;
  const MAX_ASSET_BYTES = 2 * 1024 * 1024;
  const MAX_DOM_ITEMS = 96;
  const OPERATIONAL_STATES = Object.freeze(["idle", "running", "paused", "expired"]);
  const CRITICAL_SELECTORS = Object.freeze([
    "body",
    "#board",
    ".zone-group",
    ".slot-card",
    ".timer-panel",
    ".timer-readout",
    ".minute-button",
    ".adjust-button",
    ".timer-action",
    ".board-utility-rail",
    ".sync-status",
  ]);

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isPlainObject(value)) return value;
    const output = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        if (typeof value[key] !== "undefined") output[key] = canonicalize(value[key]);
      });
    return output;
  }

  function canonicalStringify(value) {
    return JSON.stringify(canonicalize(value));
  }

  function boundedText(value, limit) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function safeToken(value, fallback) {
    const text = boundedText(value, 80);
    return /^[A-Za-z0-9._:-]{1,80}$/.test(text) ? text : fallback;
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function rounded(value) {
    return Math.round(finiteNumber(value, 0) * 100) / 100;
  }

  function normalizeHex(value) {
    const text = String(value || "").trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(text) ? text : "";
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function documentLocation(global) {
    try {
      const url = new URL(global.location.href);
      return { origin: url.origin, pathname: boundedText(url.pathname, 240) };
    } catch (_) {
      return { origin: "unknown", pathname: "" };
    }
  }

  function orientation(global, width, height) {
    const screenOrientation = global.screen && global.screen.orientation;
    const type = safeToken(screenOrientation && screenOrientation.type, "unknown");
    const angle = rounded(screenOrientation && screenOrientation.angle);
    return {
      type,
      angle,
      geometry: width === height ? "square" : width > height ? "landscape" : "portrait",
    };
  }

  function getViewport(global) {
    const visual = global.visualViewport || null;
    return {
      layout: {
        width: rounded(global.innerWidth),
        height: rounded(global.innerHeight),
      },
      visual: visual
        ? {
            width: rounded(visual.width),
            height: rounded(visual.height),
            offsetLeft: rounded(visual.offsetLeft),
            offsetTop: rounded(visual.offsetTop),
            pageLeft: rounded(visual.pageLeft),
            pageTop: rounded(visual.pageTop),
            scale: rounded(visual.scale || 1),
          }
        : null,
      dpr: rounded(global.devicePixelRatio || 1),
    };
  }

  function getScreen(global) {
    const screen = global.screen || {};
    return {
      width: rounded(screen.width),
      height: rounded(screen.height),
      availWidth: rounded(screen.availWidth),
      availHeight: rounded(screen.availHeight),
      colorDepth: rounded(screen.colorDepth),
      pixelDepth: rounded(screen.pixelDepth),
    };
  }

  function getDisplayedState(global) {
    const document = global.document;
    const bodyData = (document.body && document.body.dataset) || {};
    const slots = [];
    Array.from(document.querySelectorAll(".slot-card"))
      .slice(0, 12)
      .forEach((card, index) => {
        const data = card.dataset || {};
        const readout = card.querySelector && card.querySelector(".timer-readout");
        const readoutData = (readout && readout.dataset) || {};
        const displayedValue = boundedText(readoutData.displayValue, 24);
        slots.push({
          index,
          slotId: safeToken(data.slotId, "slot-unknown"),
          zone: safeToken(data.zone, "unknown"),
          state: safeToken(data.state, "unknown"),
          hasActivity: String(data.hasActivity || "") === "true",
          recentAlert: String(data.recentAlert || "") === "true",
          displayedValue: /^[0-9:.\/-]{1,24}$/.test(displayedValue) ? displayedValue : "",
        });
      });

    return {
      profile: safeToken(bodyData.displayProfile, "unknown"),
      requestedProfile: safeToken(bodyData.profile, "default"),
      source: safeToken(bodyData.source, "web"),
      layout: safeToken(bodyData.countdownLayout, "unknown"),
      visibility: safeToken(document.visibilityState, "unknown"),
      focused: typeof document.hasFocus === "function" ? Boolean(document.hasFocus()) : null,
      slots,
    };
  }

  function getOperationalState(global) {
    const unknown = (reason) => ({
      known: false,
      safeIdle: false,
      reason,
      main: { total: 0, active: 0, running: 0, paused: 0, completedWait: 0 },
      split: { total: 0, active: 0, running: 0, paused: 0, completedWait: 0 },
    });
    try {
      const app = global.ChickenTimerBoardApp;
      if (!app || typeof app.getBoardState !== "function") return unknown("board_api_unavailable");
      const board = app.getBoardState();
      const mainSlots = board && board.main && board.main.slots;
      const splitSlots = board && board.split && board.split.slots;
      if (!Array.isArray(mainSlots) || mainSlots.length === 0 || !isPlainObject(splitSlots)) {
        return unknown("board_state_invalid");
      }
      const summarize = (entries) => {
        const summary = { total: entries.length, active: 0, running: 0, paused: 0, completedWait: 0 };
        for (const entry of entries) {
          const state = entry && boundedText(entry.status, 24);
          if (!OPERATIONAL_STATES.includes(state)) return null;
          if (state !== "idle") summary.active += 1;
          if (state === "running") summary.running += 1;
          if (state === "paused") summary.paused += 1;
          if (state === "expired") summary.completedWait += 1;
        }
        return summary;
      };
      const splitEntries = [];
      for (const key of Object.keys(splitSlots)) {
        const entries = splitSlots[key];
        if (!Array.isArray(entries)) return unknown("split_state_invalid");
        splitEntries.push(...entries);
      }
      const main = summarize(mainSlots);
      const split = summarize(splitEntries);
      if (!main || !split) return unknown("timer_state_unknown");
      return {
        known: true,
        safeIdle: main.active === 0 && split.active === 0 && split.total === 0,
        reason: main.active === 0 && split.active === 0 && split.total === 0 ? "idle" : "active_or_completed_wait",
        main,
        split,
      };
    } catch (_) {
      return unknown("board_state_exception");
    }
  }

  function elementKey(element, selector, index) {
    const data = element.dataset || {};
    const parts = [
      element.id ? `id:${safeToken(element.id, "")}` : "",
      data.slotId ? `slot:${safeToken(data.slotId, "")}` : "",
      data.zone ? `zone:${safeToken(data.zone, "")}` : "",
      data.role ? `role:${safeToken(data.role, "")}` : "",
      data.action ? `action:${safeToken(data.action, "")}` : "",
    ].filter(Boolean);
    return boundedText(parts.join("|") || `${selector}:${index}`, 160);
  }

  function measureCriticalDom(global) {
    const document = global.document;
    const output = [];
    for (const selector of CRITICAL_SELECTORS) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (let index = 0; index < elements.length; index += 1) {
        if (output.length >= MAX_DOM_ITEMS) return output;
        const element = elements[index];
        if (!element || typeof element.getBoundingClientRect !== "function") continue;
        const rect = element.getBoundingClientRect();
        const style = typeof global.getComputedStyle === "function" ? global.getComputedStyle(element) : {};
        output.push({
          selector,
          key: elementKey(element, selector, index),
          rect: {
            x: rounded(rect.x != null ? rect.x : rect.left),
            y: rounded(rect.y != null ? rect.y : rect.top),
            width: rounded(rect.width),
            height: rounded(rect.height),
          },
          target: {
            width: rounded(rect.width),
            height: rounded(rect.height),
          },
          computed: {
            display: safeToken(style.display, "unknown"),
            visibility: safeToken(style.visibility, "unknown"),
            opacity: rounded(style.opacity == null ? 1 : style.opacity),
            fontSize: boundedText(style.fontSize, 32),
            lineHeight: boundedText(style.lineHeight, 32),
            fontFamily: boundedText(style.fontFamily, 160),
            overflowX: safeToken(style.overflowX, "unknown"),
            overflowY: safeToken(style.overflowY, "unknown"),
          },
        });
      }
    }
    return output;
  }

  function assetCandidates(global) {
    const document = global.document;
    const base = global.location && global.location.href;
    const seen = new Set();
    const output = [];
    const append = (element, attribute, type) => {
      if (output.length >= MAX_ASSETS) return;
      const raw = element && element.getAttribute && element.getAttribute(attribute);
      if (!raw) return;
      let url;
      try {
        url = new URL(raw, base);
      } catch (_) {
        return;
      }
      const redactedUrl =
        url.protocol === "file:" ? `file://${url.pathname}` : `${url.origin}${url.pathname}`;
      const key = `${type}:${redactedUrl}`;
      if (seen.has(key)) return;
      seen.add(key);
      output.push({
        type,
        fetchUrl: url.href,
        url: boundedText(redactedUrl, 320),
        cacheKey: /^[a-f0-9]{12}$/.test(url.searchParams.get("v") || "")
          ? url.searchParams.get("v")
          : "",
        sameOrigin: url.origin === new URL(base).origin,
      });
    };
    Array.from(document.querySelectorAll("script[src]")).forEach((node) => append(node, "src", "script"));
    Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]')).forEach((node) => append(node, "href", "stylesheet"));
    Array.from(document.querySelectorAll("img[src]")).forEach((node) => append(node, "src", "image"));
    return output.sort((left, right) => `${left.type}:${left.url}`.localeCompare(`${right.type}:${right.url}`));
  }

  async function hashSameOriginAsset(global, candidate) {
    const receipt = {
      type: candidate.type,
      url: candidate.url,
      cacheKey: candidate.cacheKey,
      sameOrigin: candidate.sameOrigin,
      sha256: "",
      sizeBytes: null,
      hashStatus: candidate.sameOrigin ? "unavailable" : "cross_origin_redacted",
    };
    if (!candidate.sameOrigin || typeof global.fetch !== "function") return receipt;
    if (!global.crypto || !global.crypto.subtle || typeof global.crypto.subtle.digest !== "function") return receipt;
    try {
      const response = await global.fetch(candidate.fetchUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      if (!response || response.ok !== true) {
        receipt.hashStatus = `http_${response ? response.status : "error"}`;
        return receipt;
      }
      const declaredLength = Number(response.headers && response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_ASSET_BYTES) {
        receipt.hashStatus = "too_large";
        return receipt;
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_ASSET_BYTES) {
        receipt.hashStatus = "too_large";
        return receipt;
      }
      receipt.sha256 = normalizeHex(bytesToHex(await global.crypto.subtle.digest("SHA-256", bytes)));
      receipt.sizeBytes = bytes.byteLength;
      receipt.hashStatus = receipt.sha256 ? "hashed" : "unavailable";
      return receipt;
    } catch (_) {
      receipt.hashStatus = "fetch_failed";
      return receipt;
    }
  }

  async function collectAssets(global) {
    const output = [];
    for (const candidate of assetCandidates(global)) {
      output.push(await hashSameOriginAsset(global, candidate));
    }
    return output;
  }

  function create(global) {
    if (!global || !global.document) throw new Error("browser environment is required");
    let lastReceipt = null;

    async function collect(options) {
      const input = isPlainObject(options) ? options : {};
      const nonce = boundedText(input.nonce, 128);
      const revision = boundedText(input.revision, 80);
      if (!NONCE_PATTERN.test(nonce)) throw new Error("invalid evidence nonce");
      if (!REVISION_PATTERN.test(revision)) throw new Error("invalid evidence revision");
      if (global.document.visibilityState !== "visible") throw new Error("document is not visible");

      const viewport = getViewport(global);
      const generatedAt = new Date().toISOString();
      const receipt = canonicalize({
        schema: SCHEMA,
        nonce,
        revision,
        generatedAt,
        document: documentLocation(global),
        viewport,
        screen: getScreen(global),
        orientation: orientation(global, viewport.layout.width, viewport.layout.height),
        userAgent: boundedText(global.navigator && global.navigator.userAgent, 512),
        displayed: getDisplayedState(global),
        operational: getOperationalState(global),
        dom: measureCriticalDom(global),
        assets: await collectAssets(global),
        bounds: {
          maxAssets: MAX_ASSETS,
          maxAssetBytes: MAX_ASSET_BYTES,
          maxDomItems: MAX_DOM_ITEMS,
        },
        capabilities: {
          screenshot: false,
          polling: false,
          timerMutation: false,
          storageWrite: false,
          upload: false,
          userGestureRequired: false,
        },
      });
      lastReceipt = receipt;
      return receipt;
    }

    async function armFromLocation() {
      let params;
      try {
        params = new URL(global.location.href).searchParams;
      } catch (_) {
        return null;
      }
      const nonce = params.get("physicalEvidenceNonce") || "";
      const revision = params.get("physicalEvidenceRevision") || "";
      if (!nonce && !revision) return null;
      try {
        const receipt = await collect({ nonce, revision });
        if (typeof global.CustomEvent === "function" && typeof global.dispatchEvent === "function") {
          global.dispatchEvent(new global.CustomEvent("chickentimer:physical-evidence-ready", { detail: receipt }));
        }
        return receipt;
      } catch (error) {
        if (typeof global.CustomEvent === "function" && typeof global.dispatchEvent === "function") {
          global.dispatchEvent(
            new global.CustomEvent("chickentimer:physical-evidence-error", {
              detail: { message: boundedText(error && error.message, 160) },
            }),
          );
        }
        return null;
      }
    }

    return Object.freeze({
      schema: SCHEMA,
      collect,
      armFromLocation,
      canonicalStringify,
      getLastReceipt: () => lastReceipt,
    });
  }

  return Object.freeze({
    schema: SCHEMA,
    create,
    canonicalStringify,
    canonicalize,
  });
});
