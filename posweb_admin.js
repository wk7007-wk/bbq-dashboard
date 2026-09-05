(function (root) {
  var TOKEN_KEY = "posweb_admin_token";
  var MAGIC = "https://wsl-ubuntu.tail785e65.ts.net";
  var factoryOrigin = "";
  var originReady = null;

  function onGithubPages() {
    try {
      return String((root.location && root.location.hostname) || "").indexOf("github.io") >= 0;
    } catch (e) {
      return false;
    }
  }

  function factoryJsonUrl(name) {
    name = String(name || "").replace(/^\//, "");
    if (!onGithubPages() && !factoryOrigin) return "/" + name;
    return (factoryOrigin || MAGIC).replace(/\/$/, "") + "/" + name;
  }

  function factoryOrigins() {
    var out = [];
    var seen = {};
    function add(u) {
      u = String(u || "").replace(/\/$/, "");
      if (seen[u]) return;
      seen[u] = 1;
      out.push(u);
    }
    if (!onGithubPages()) add("");
    if (factoryOrigin) add(factoryOrigin);
    add(MAGIC);
    return out;
  }

  function resolveFactoryOrigin() {
    if (originReady) return originReady;
    originReady = Promise.resolve().then(function () {
      if (!onGithubPages()) {
        factoryOrigin = "";
        return factoryOrigin;
      }
      var cands = [
        "updates/endpoints.json",
        "https://wk7007-wk.github.io/bbq-dashboard/updates/endpoints.json",
        MAGIC + "/endpoints.json"
      ];
      var chain = Promise.reject(new Error("none"));
      cands.forEach(function (url) {
        chain = chain.catch(function () {
          return fetch(url, { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          }).then(function (ep) {
            var f = (ep && ep.sets && ep.sets.factory) || {};
            var live = String(f.magic_base || f.pages_base || "").replace(/\/$/, "");
            if (!live || live.indexOf("github.io") >= 0) live = MAGIC;
            factoryOrigin = live;
            return factoryOrigin;
          });
        });
      });
      return chain.catch(function () {
        factoryOrigin = MAGIC;
        return factoryOrigin;
      });
    });
    return originReady;
  }

  resolveFactoryOrigin();

  function isWebAdmin() {
    try {
      return !!(root.sessionStorage && root.sessionStorage.getItem(TOKEN_KEY));
    } catch (e) {
      return false;
    }
  }

  function writeToken() {
    try {
      return (root.sessionStorage && root.sessionStorage.getItem(TOKEN_KEY)) || "";
    } catch (e) {
      return "";
    }
  }

  function setWriteToken(token) {
    try {
      if (token) root.sessionStorage.setItem(TOKEN_KEY, token);
      else root.sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  var pinAttempts = 0;
  var pinLockUntil = 0;
  var PIN_MAX_ATTEMPTS = 5;
  var PIN_LOCK_MS = 30000;

  function setPinMessage(text, ok) {
    var el = document.getElementById("pinError");
    if (!el) return;
    el.style.color = ok ? "#2ECC71" : "#E74C3C";
    el.textContent = text || "";
  }

  function showSite(unlocked) {
    var overlay = document.getElementById("pinOverlay");
    if (unlocked) {
      document.body.classList.remove("auth-locked");
      if (overlay) overlay.classList.add("authed");
    } else {
      document.body.classList.add("auth-locked");
      if (overlay) overlay.classList.remove("authed");
    }
  }

  function applyWebAdminUi() {
    var unlocked = isWebAdmin() || !!root.isApp;
    showSite(unlocked);
    var notice = document.getElementById("standaloneReadOnlyNotice");
    if (notice) {
      notice.style.display = root.isApp ? "none" : (unlocked ? "block" : "none");
      notice.textContent = "관리자 웹 — 임계는 공장에 저장됩니다. 광고/배달료 실행은 공장, 수락·중지는 PC입니다.";
    }
    var btn = document.getElementById("webAdminBtn");
    if (btn) btn.textContent = unlocked ? "잠금" : "잠금";
    if (unlocked && typeof root.updMonitor === "function") {
      try { root.updMonitor(); } catch (e) {}
    }
  }

  function afterUnlock() {
    applyWebAdminUi();
    loadWebSettings();
    if (typeof root.startPoswebLive === "function") root.startPoswebLive();
  }

  function verifyPassword(pw) {
    setWriteToken(String(pw || "").trim());
    return factoryPutJson("posdelay_web_admin_ack.json", {
      ok: true,
      ts: Date.now(),
      source: "posweb_login"
    }).then(function (ok) {
      if (!ok) setWriteToken("");
      return ok;
    });
  }

  function checkPoswebPin() {
    var inp = document.getElementById("pinInput");
    var pw = inp ? String(inp.value || "").trim() : "";
    if (Date.now() < pinLockUntil) {
      var sec = Math.ceil((pinLockUntil - Date.now()) / 1000);
      setPinMessage("잠시 후 다시 시도 (" + sec + "초)");
      if (inp) inp.value = "";
      return;
    }
    if (!pw) {
      setPinMessage("비밀번호를 입력하세요");
      return;
    }
    setPinMessage("확인 중...");
    verifyPassword(pw).then(function (ok) {
      if (ok) {
        pinAttempts = 0;
        setPinMessage("접속되었습니다.", true);
        if (inp) inp.value = "";
        afterUnlock();
        return;
      }
      pinAttempts += 1;
      if (pinAttempts >= PIN_MAX_ATTEMPTS) {
        pinLockUntil = Date.now() + PIN_LOCK_MS;
        pinAttempts = 0;
        setPinMessage(PIN_MAX_ATTEMPTS + "회 틀림 — " + PIN_LOCK_MS / 1000 + "초 후 다시");
      } else {
        setPinMessage("비밀번호가 틀립니다 (" + pinAttempts + "/" + PIN_MAX_ATTEMPTS + ")");
      }
      if (inp) inp.value = "";
    });
  }

  function restorePoswebAuth() {
    if (root.isApp) {
      afterUnlock();
      return;
    }
    if (!isWebAdmin()) {
      applyWebAdminUi();
      var inp = document.getElementById("pinInput");
      if (inp) {
        inp.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") checkPoswebPin();
        });
      }
      return;
    }
    verifyPassword(writeToken()).then(function (ok) {
      if (ok) afterUnlock();
      else {
        applyWebAdminUi();
        var inp = document.getElementById("pinInput");
        if (inp) {
          inp.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") checkPoswebPin();
          });
        }
      }
    });
  }

  function toggleWebAdmin() {
    setWriteToken("");
    applyWebAdminUi();
    if (typeof root.toast === "function") root.toast("잠금", "ok");
  }

  function factoryGetJson(name) {
    return resolveFactoryOrigin().then(function () {
      return fetch(factoryJsonUrl(name) + "?t=" + Date.now(), { cache: "no-store" });
    }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    }).then(function (text) {
      var t = (text || "").trim();
      if (!t || t === "null") return {};
      return JSON.parse(t);
    }).catch(function () { return {}; });
  }

  function factoryPutJson(name, obj) {
    var headers = {
      "Content-Type": "application/json; charset=utf-8",
      "X-Write-Token": writeToken()
    };
    return resolveFactoryOrigin().then(function () {
      var url = factoryJsonUrl(name);
      if (obj == null) {
        return fetch(url, { method: "GET", cache: "no-store", headers: headers }).then(function (r) {
          return r.ok;
        });
      }
      return fetch(url, { method: "PUT", headers: headers, body: JSON.stringify(obj) }).then(function (r) {
        return r.ok;
      });
    }).catch(function () { return false; });
  }

  function countsToRanges(counts, mins) {
    var rows = [];
    for (var i = 0; i < counts.length; i++) {
      rows.push({ min: Number(counts[i]) || 0, target: Number(mins[i]) || 0 });
    }
    rows.sort(function (a, b) { return a.min - b.min; });
    return rows.map(function (row, idx) {
      var next = rows[idx + 1];
      return { min: row.min, max: next ? Math.max(row.min, next.min - 1) : 999, target: row.target };
    });
  }

  function rangesToCounts(ranges, prefix, dest) {
    var list = Array.isArray(ranges) ? ranges.slice(0, 3) : [];
    for (var i = 0; i < 3; i++) {
      var row = list[i] || {};
      dest[prefix + "_count_" + (i + 1)] = row.min != null ? row.min : 0;
      dest[prefix + "_min_" + (i + 1)] = row.target != null ? row.target : (i === 0 ? 20 : i === 1 ? 25 : 30);
    }
  }

  function buildAdSettingsPayload(S, gateSettings) {
    var now = Date.now();
    return {
      schema: "posdelay_ad_settings/v1",
      _source: "web_admin",
      _updated_at: now,
      _epoch: now,
      ad_enabled: !!S.ad_enabled,
      schedule_enabled: !!S.schedule_enabled,
      order_auto_off_enabled: !!S.order_auto_off_enabled,
      baemin_auto_enabled: !!S.baemin_auto_enabled,
      coupang_auto_enabled: !!S.coupang_auto_enabled,
      baemin_amount: Number(S.baemin_amount) || 0,
      baemin_mid_amount: Number(S.baemin_mid_amount) || 0,
      baemin_reduced_amount: Number(S.baemin_reduced_amount) || 0,
      baemin_zones: S.baemin_zones || undefined,
      coupang_zones: S.coupang_zones || undefined,
      baemin_thresholds: S.baemin_thresholds,
      coupang_thresholds: S.coupang_thresholds,
      ad_on_time: S.ad_on_time || "08:00",
      ad_off_time: S.ad_off_time || "22:00",
      baemin_delay_enabled: !!S.baemin_delay_enabled,
      baemin_delay_threshold: Number(S.baemin_delay_threshold) || 0,
      baemin_delay_minutes: Number(S.baemin_delay_minutes) || 0,
      baemin_target_time: Number(S.baemin_target_time) || 0,
      baemin_fixed_cook_time: Number(S.baemin_fixed_cook_time) || 0,
      coupang_delay_enabled: !!S.coupang_delay_enabled,
      coupang_delay_threshold: Number(S.coupang_delay_threshold) || 0,
      coupang_delay_minutes: Number(S.coupang_delay_minutes) || 0,
      coupang_target_time: Number(S.coupang_target_time) || 0,
      coupang_fixed_cook_time: Number(S.coupang_fixed_cook_time) || 0,
      defense: {
        gate_enabled: !!(gateSettings && gateSettings.enabled),
        fee_threshold: Number(gateSettings && gateSettings.threshold) || 8,
        fee_configured_high: Number(gateSettings && gateSettings.fee) || 0,
        fee_configured_base: Number(gateSettings && gateSettings.base) || 0,
        valid_minutes: Number(gateSettings && gateSettings.valid) || 30,
        stop_threshold: Number(gateSettings && gateSettings.threshold_stop) || 7,
        stop_source: (gateSettings && gateSettings._stopSource) || "PRINTER",
        mode: (gateSettings && (gateSettings._defenseMode || gateSettings.mode)) || "B"
      }
    };
  }

  function buildRuntimeV2(next) {
    function ch(prefix, source, maxMinute) {
      var counts = [next[prefix + "_count_1"], next[prefix + "_count_2"], next[prefix + "_count_3"]];
      var mins = [next[prefix + "_min_1"], next[prefix + "_min_2"], next[prefix + "_min_3"]];
      var oneCounts = [next[prefix + "_one_count_1"], next[prefix + "_one_count_2"], next[prefix + "_one_count_3"]];
      var oneMins = [next[prefix + "_one_min_1"] || mins[0], next[prefix + "_one_min_2"] || mins[1], next[prefix + "_one_min_3"] || mins[2]];
      var ranges = countsToRanges(counts, mins);
      var oneRanges = countsToRanges(oneCounts, oneMins);
      var src = next[prefix + "_source"] || source;
      var body = {
        enabled: next[prefix + "_enabled"] !== false,
        source: src
      };
      if (src === "PRINTER") {
        body.printer_to_minutes = ranges;
        body.one_person_printer_to_minutes = oneRanges;
        body.valid_minutes = 30;
      } else {
        body.kds_to_minutes = ranges;
        body.one_person_kds_to_minutes = oneRanges;
      }
      return body;
    }
    var peaks = [];
    if (next.peak1_start && next.peak1_end) peaks.push({ start: next.peak1_start, end: next.peak1_end });
    if (next.peak2_start && next.peak2_end) peaks.push({ start: next.peak2_start, end: next.peak2_end });
    return {
      version: 2,
      updated_at: Date.now(),
      updated_by: "web_admin",
      time_mode: { enabled: !!next.time_mode_enabled, peak_ranges: peaks },
      auto_accept: {
        enabled: next.auto_accept_enabled !== false,
        per_channel: {
          baemin: Object.assign({ label: "배민" }, ch("baemin_auto", "PRINTER", 70)),
          baemin_one: Object.assign({ label: "배민배달" }, ch("store_auto", "KDS", 30))
        }
      },
      shop_pause: {
        enabled: !!next.enabled,
        local_override_enabled: false,
        channels: ["baemin_one", "baemin_store_delivery", "coupang_eats"],
        per_channel: {
          baemin_one: {
            label: "배민1",
            source: "KDS",
            pause_at: next.baemin1_pause_at,
            resume_at: next.baemin1_resume_at,
            one_person_pause_at: next.baemin1_one_pause_at,
            one_person_resume_at: next.baemin1_one_resume_at,
            pause_duration: next.baemin1_pause_duration || "30분"
          },
          coupang_eats: {
            label: "쿠팡이츠",
            source: "KDS",
            pause_at: next.coupang_pause_at,
            resume_at: next.coupang_resume_at,
            one_person_pause_at: next.coupang_one_pause_at,
            one_person_resume_at: next.coupang_one_resume_at,
            pause_duration: ""
          }
        }
      }
    };
  }

  function applyRuntimeV2ToPolicy(obj, dest) {
    if (!obj || obj.version !== 2) return dest;
    var auto = obj.auto_accept || {};
    var sp = obj.shop_pause || {};
    dest.enabled = !!sp.enabled;
    dest.auto_accept_enabled = auto.enabled !== false;
    var tm = obj.time_mode || {};
    dest.time_mode_enabled = !!tm.enabled;
    var peaks = tm.peak_ranges || [];
    dest.peak1_start = (peaks[0] && peaks[0].start) || "";
    dest.peak1_end = (peaks[0] && peaks[0].end) || "";
    dest.peak2_start = (peaks[1] && peaks[1].start) || "";
    dest.peak2_end = (peaks[1] && peaks[1].end) || "";
    var baemin = (auto.per_channel || {}).baemin || {};
    var store = (auto.per_channel || {}).baemin_one || {};
    dest.baemin_auto_source = baemin.source === "PRINTER" || baemin.source === "프린터" ? "PRINTER" : "KDS";
    dest.store_auto_source = store.source === "PRINTER" || store.source === "프린터" ? "PRINTER" : "KDS";
    rangesToCounts(baemin.printer_to_minutes || baemin.kds_to_minutes, "baemin_auto", dest);
    rangesToCounts(baemin.one_person_printer_to_minutes || baemin.one_person_kds_to_minutes, "baemin_auto_one", dest);
    rangesToCounts(store.kds_to_minutes || store.printer_to_minutes, "store_auto", dest);
    rangesToCounts(store.one_person_kds_to_minutes || store.one_person_printer_to_minutes, "store_auto_one", dest);
    var b1 = (sp.per_channel || {}).baemin_one || {};
    var cp = (sp.per_channel || {}).coupang_eats || {};
    dest.baemin1_pause_at = b1.pause_at;
    dest.baemin1_resume_at = b1.resume_at;
    dest.baemin1_one_pause_at = b1.one_person_pause_at;
    dest.baemin1_one_resume_at = b1.one_person_resume_at;
    if (b1.pause_duration) dest.baemin1_pause_duration = b1.pause_duration;
    dest.coupang_pause_at = cp.pause_at;
    dest.coupang_resume_at = cp.resume_at;
    dest.coupang_one_pause_at = cp.one_person_pause_at;
    dest.coupang_one_resume_at = cp.one_person_resume_at;
    return dest;
  }

  var settingsReady = false;

  function saveWebAdSettings(S, gateSettings) {
    if (!isWebAdmin()) return Promise.resolve(false);
    if (!settingsReady) return Promise.resolve(false);
    S = S || root.S;
    if (!S || S.baemin_amount == null || Number(S.baemin_amount) <= 0) return Promise.resolve(false);
    return factoryPutJson("posdelay_ad_settings.json", buildAdSettingsPayload(S, gateSettings || root.gateSettings));
  }

  function saveWebPolicy(next) {
    if (!isWebAdmin()) return Promise.resolve(false);
    return factoryPutJson("runtime_config_v2.json", buildRuntimeV2(next));
  }

  function loadWebSettings() {
    return Promise.all([factoryGetJson("posdelay_ad_settings.json"), factoryGetJson("runtime_config_v2.json")]).then(function (pair) {
      var ad = pair[0] || {};
      var v2 = pair[1] || {};
      var S = root.S;
      if (ad && (ad.ad_enabled != null || ad.baemin_amount != null) && S) {
        Object.keys(ad).forEach(function (k) {
          if (k === "defense" || k.charAt(0) === "_" || k === "schema") return;
          S[k] = ad[k];
        });
        settingsReady = Number(S.baemin_amount) > 0;
        if (ad.defense && root.gateSettings) {
          root.gateSettings.enabled = !!ad.defense.gate_enabled;
          if (ad.defense.fee_threshold != null) root.gateSettings.threshold = ad.defense.fee_threshold;
          if (ad.defense.fee_configured_high != null) root.gateSettings.fee = ad.defense.fee_configured_high;
          if (ad.defense.fee_configured_base != null) root.gateSettings.base = ad.defense.fee_configured_base;
          if (ad.defense.valid_minutes != null) root.gateSettings.valid = ad.defense.valid_minutes;
          if (ad.defense.stop_threshold != null) root.gateSettings.threshold_stop = ad.defense.stop_threshold;
          if (ad.defense.stop_source) root.gateSettings._stopSource = ad.defense.stop_source;
          if (ad.defense.mode) root.gateSettings._defenseMode = ad.defense.mode;
        }
        if (typeof root.updSetUI === "function") root.updSetUI();
        if (typeof root.syncGatePriceDisplay === "function") {
          try { root.syncGatePriceDisplay(); } catch (e) {}
        }
      }
      if (v2 && v2.version === 2 && root.policySettings) {
        applyRuntimeV2ToPolicy(v2, root.policySettings);
        if (typeof root.normalizePolicySettings === "function") root.normalizePolicySettings();
        if (typeof root.applyPolicySettingsToUI === "function") root.applyPolicySettingsToUI();
        if (typeof root.initButtonValueControls === "function") root.initButtonValueControls();
        if (typeof root.syncButtonValueControls === "function") root.syncButtonValueControls();
      }
      return true;
    });
  }

  root.isWebAdmin = isWebAdmin;
  root.doToggleWebAdmin = toggleWebAdmin;
  root.toggleWebAdmin = toggleWebAdmin;
  root.checkPoswebPin = checkPoswebPin;
  root.restorePoswebAuth = restorePoswebAuth;
  root.applyWebAdminUi = applyWebAdminUi;
  root.saveWebAdSettings = saveWebAdSettings;
  root.saveWebPolicy = saveWebPolicy;
  root.loadWebSettings = loadWebSettings;
  root.countsToRanges = countsToRanges;
  root.buildRuntimeV2 = buildRuntimeV2;
  root.buildAdSettingsPayload = buildAdSettingsPayload;
  root.applyRuntimeV2ToPolicy = applyRuntimeV2ToPolicy;
  root.poswebFactory = {
    jsonUrl: factoryJsonUrl,
    resolveOrigin: resolveFactoryOrigin,
    onGithubPages: onGithubPages,
    origins: factoryOrigins
  };
})(typeof window !== "undefined" ? window : globalThis);
