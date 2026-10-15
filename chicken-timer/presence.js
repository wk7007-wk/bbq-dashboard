(function (global) {
  var STORAGE_KEY = "chicken-timer-viewer-id";
  var PERIOD_MS = 15000;

  function ident() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (saved && /^[A-Za-z0-9_-]{8,40}$/.test(saved)) return saved;
    } catch (err) {}
    var next = "";
    try {
      var bytes = new Uint8Array(12);
      global.crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length; i += 1) next += (bytes[i] & 15).toString(16);
    } catch (err2) {
      next = String(Math.random()).slice(2, 14);
    }
    next = next.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    while (next.length < 8) next += "0";
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, next);
    } catch (err3) {}
    return next;
  }

  function pair(width, height) {
    return { w: Math.round(Number(width) || 0), h: Math.round(Number(height) || 0) };
  }

  function payload() {
    var params = new URLSearchParams(global.location.search || "");
    var screen = global.screen || {};
    var visual = global.visualViewport || {};
    var nav = global.navigator || {};
    var net = nav.connection || nav.mozConnection || nav.webkitConnection || {};
    var zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (err) {}
    return {
      id: ident(),
      screen: pair(screen.width, screen.height),
      viewport: pair(global.innerWidth, global.innerHeight),
      visual: pair(visual.width, visual.height),
      dpr: Number(global.devicePixelRatio) || 1,
      orientation: (screen.orientation && screen.orientation.type) || "",
      profile: params.get("profile") || "",
      source: params.get("source") || "",
      ua: String(nav.userAgent || "").slice(0, 180),
      lang: nav.language || "",
      platform: nav.platform || "",
      timezone: zone,
      cores: nav.hardwareConcurrency || 0,
      memory: nav.deviceMemory || 0,
      net: net.effectiveType || "",
      host: global.location.hostname || ""
    };
  }

  function applyCut(cut) {
    if (cut && !global.__viewerCut) {
      global.__viewerCut = 1;
      var wall = global.document.createElement("section");
      wall.textContent = "공장에서 이 화면을 닫았습니다.";
      wall.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;background:#06111f;color:#f7fbff;font:600 22px sans-serif;z-index:99999";
      global.document.body.innerHTML = "";
      global.document.body.appendChild(wall);
      return;
    }
    if (!cut && global.__viewerCut) global.location.reload();
  }

  function target() {
    if (global.location.hostname !== "wk7007-wk.github.io") {
      return Promise.resolve(global.location.origin + "/chicken-timer/presence");
    }
    return global.fetch("https://wk7007-wk.github.io/bbq-dashboard/updates/endpoints.json", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (obj) {
        var factory = (obj && obj.sets && obj.sets.factory) || {};
        var base = String(factory.wan_base || "").replace(/\/$/, "");
        return base ? base + "/chicken-timer/presence" : "";
      })
      .catch(function () { return ""; });
  }

  function send() {
    target().then(function (url) {
      if (!url) return;
      return global.fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload())
      }).then(function (res) { return res.json(); }).then(function (body) {
        applyCut(Boolean(body && body.cut));
      });
    }).catch(function () {});
  }

  function boot() {
    send();
    global.setInterval(send, PERIOD_MS);
    global.addEventListener("resize", send);
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
