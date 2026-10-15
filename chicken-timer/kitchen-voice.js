// 1006 주방 알림(사장님): 공장이 kitchen_voice.json 에 올린 새 알림을 보드 기기마다 한 번.
// - 1006 "소리가 꽤 커. 음성 제거" → kitchen_voice.json voice=false 면 아무도 안 말하고 speakers·chimers 모두 띵동만.
// - 말할 기기(speakers, UA 조각 · 기본 탭 SM-T295N): 띵동 + 음성(한국어 → 베트남어). 주소에 ?voice=1 이면 이 기기도 말함.
// - 띵동만 기기(chimers · 기본 노트9 SM-N960N): 음성 없이 작은 띵동(1006 "알림 작게 유지, 음성 없이").
// - 모든 기기: 알림 글 토스트 10초(1006 "알림 토스트 10초") + 기록칸 '알림' 줄(ChickenTimerKitchenNotes → board-log.js).
// - 메아리 없게 보드 서버 시각(ChickenTimerBoardApp.getNow) 기준 '알림 + 5초'에 같이(늦으면 바로).
// - 레시피 칸: kitchen_now.json → ChickenTimerKitchenNow + 'chickentimer-kitchen-now' 이벤트(recipe-panel.js).
// 들은 id 는 기기에 기억(최근 60개). 화면·타이머 상태는 건드리지 않는다.
(function (global) {
  "use strict";
  var KEY = "kitchenVoicePlayed";
  var PLAY_DELAY_MS = 5000;
  var TOAST_MS = 10000;
  var played = [];
  try { played = JSON.parse(global.localStorage.getItem(KEY) || "[]") || []; } catch (e) { played = []; }
  var queue = [];
  var busy = false;
  var forced = /[?&]voice=1(&|$)/.test(String(global.location && global.location.search || ""));
  var chimeCache = { path: "", b64: "", mime: "" };

  function remember(id) {
    played.push(id);
    if (played.length > 60) played = played.slice(-60);
    try { global.localStorage.setItem(KEY, JSON.stringify(played)); } catch (e) { /* 저장 못 해도 재생은 함 */ }
  }

  function uaIn(list) {
    var ua = String(global.navigator && global.navigator.userAgent || "");
    for (var i = 0; i < (list || []).length; i++) if (list[i] && ua.indexOf(list[i]) >= 0) return true;
    return false;
  }

  function role(cfg) {
    if (cfg && cfg.voice === false) return forced || uaIn(cfg.speakers) || uaIn(cfg.chimers) ? "chime" : "quiet";
    if (forced) return "voice";
    var speakers = (cfg && cfg.speakers) || [];
    if (!speakers.length || uaIn(speakers)) return "voice";
    if (uaIn(cfg && cfg.chimers)) return "chime";
    return "quiet";
  }

  function boardNow() {
    var app = global.ChickenTimerBoardApp;
    return app && typeof app.getNow === "function" ? app.getNow() : Date.now();
  }

  // 1009 사장님 "타이머 알림문구는 터치시 삭제. 계속 남겨놓기 터치전까지": 화면 위 가운데에 쌓이고(최신이 위),
  // 그 칸을 누르면 지운다. 새로고침해도 안 지운 것은 다시 뜬다(이 기기 localStorage, 12시간·최대 6개).
  var OPEN_KEY = "kitchenToastsOpen";
  var OPEN_MAX = 6;
  var OPEN_KEEP_MS = 12 * 3600 * 1000;
  var stackEl = null;
  var ghostUntil = 0;
  function swallow(ev) {
    try { if (ev.cancelable !== false && ev.preventDefault) ev.preventDefault(); } catch (e) { /* 옛 기기 */ }
    if (ev.stopPropagation) ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  }
  ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"].forEach(function (t) {
    try {
      global.addEventListener(t, function (ev) { if (Date.now() < ghostUntil) swallow(ev); }, { capture: true, passive: false });
    } catch (e) { /* 옛 기기·시험 */ }
  });
  // 1009 사장님 "알림 터치 닫기에서 한 기계에서 터치하면 모든 기기에서 닫기": 누르면 공장에 알리고(presence {toast_close}),
  // 공장이 kitchen_voice.json 칸에 closed_at 을 남기면 모든 기기가 늘 읽는 그 목록에서 보고 같이 지운다.
  var closed = {};
  function presenceUrl() {
    if (global.location.hostname !== "wk7007-wk.github.io") return Promise.resolve(global.location.origin + "/chicken-timer/presence");
    return global.fetch("https://wk7007-wk.github.io/bbq-dashboard/updates/endpoints.json", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (obj) {
        var factory = (obj && obj.sets && obj.sets.factory) || {};
        var base = String(factory.wan_base || "").replace(/\/$/, "");
        return base ? base + "/chicken-timer/presence" : "";
      });
  }
  function closeEverywhere(id) {
    closed[id] = 1;
    try {
      presenceUrl().then(function (url) {
        if (!url) return;
        return global.fetch(url, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
                                   body: JSON.stringify({ toast_close: id }) });
      }).catch(function () { /* 공장 못 닿으면 이 기기만 닫힘 */ });
    } catch (e) { /* 옛 기기 */ }
  }
  function dropClosed() {
    try {
      if (stackEl) {
        Array.prototype.slice.call(stackEl.children).forEach(function (box) {
          if (closed[box.dataset.id] && box.parentNode) box.parentNode.removeChild(box);
        });
      }
      var list = openList();
      var keep = list.filter(function (y) { return !closed[y.id]; });
      if (keep.length !== list.length) saveOpen(keep);
    } catch (e) { /* 옛 기기 */ }
  }
  function openList() {
    try {
      var list = JSON.parse(global.localStorage.getItem(OPEN_KEY) || "[]");
      var now = Date.now();
      return (Array.isArray(list) ? list : []).filter(function (x) { return x && x.id && now - Number(x.shownAt || 0) < OPEN_KEEP_MS; });
    } catch (e) { return []; }
  }
  function saveOpen(list) {
    try { global.localStorage.setItem(OPEN_KEY, JSON.stringify(list.slice(0, OPEN_MAX))); } catch (e) { /* 저장 못 해도 화면은 그대로 */ }
  }
  function drawToast(x) {
    var doc = global.document;
    if (!stackEl) {
      stackEl = doc.createElement("div");
      stackEl.className = "kitchen-toasts";
      doc.body.appendChild(stackEl);
    }
    if (closed[x.id] || stackEl.querySelector('[data-id="' + String(x.id).replace(/"/g, "") + '"]')) return;
    var box = doc.createElement("div");
    box.className = "kitchen-toast";
    box.dataset.id = x.id;
    box.setAttribute("role", "status");
    var ko = doc.createElement("div");
    ko.className = "kitchen-toast-ko";
    ko.textContent = x.text || "";
    box.appendChild(ko);
    if (x.vi) {
      var vi = doc.createElement("div");
      vi.className = "kitchen-toast-vi";
      vi.textContent = x.vi;
      box.appendChild(vi);
    }
    var hint = doc.createElement("div");
    hint.className = "kitchen-toast-hint";
    hint.textContent = "터치하면 지움 · chạm để xóa";
    box.appendChild(hint);
    // 1010 사장님 "알림 터치 시 뒤 타이머 터치돼": 누른 터치는 알림에서 끝내고(아래로 안 넘김), 닫은 뒤 0.6초는 화면 터치 막기
    var shut = false;
    function closeIt(ev) {
      swallow(ev);
      if (shut) return;
      shut = true;
      ghostUntil = Date.now() + 600;
      if (box.parentNode) box.parentNode.removeChild(box);
      saveOpen(openList().filter(function (y) { return y.id !== x.id; }));
      closeEverywhere(x.id);
    }
    ["pointerdown", "touchstart", "mousedown"].forEach(function (t) { box.addEventListener(t, swallow, { passive: false }); });
    ["pointerup", "touchend", "click"].forEach(function (t) { box.addEventListener(t, closeIt, { passive: false }); });
    stackEl.insertBefore(box, stackEl.firstChild);
    while (stackEl.children.length > OPEN_MAX) stackEl.removeChild(stackEl.lastChild);
  }
  function toast(it) {
    try {
      if (closed[it.id]) return;                                       // 다른 기기에서 이미 닫음
      var x = { id: it.id, text: it.text || "", vi: it.vi || "", shownAt: Date.now() };
      var list = openList().filter(function (y) { return y.id !== x.id; });
      list.unshift(x);
      saveOpen(list);
      drawToast(x);
    } catch (e) { /* 토스트 못 띄워도 소리·기록칸은 그대로 */ }
  }
  function restoreToasts() {
    try { openList().slice().reverse().forEach(drawToast); } catch (e) { /* 옛 기기 */ }
  }

  function deviceSpeak(text, done) {
    try {
      if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) return done();
      var u = new global.SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.onend = u.onerror = function () { done(); };
      global.speechSynthesis.speak(u);
      global.setTimeout(done, 8000);
    } catch (e) { done(); }
  }

  function loadAudio(path) {
    if (!path) return Promise.resolve(null);
    if (path === chimeCache.path && chimeCache.b64) return Promise.resolve(chimeCache);
    return global.fetch(path + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) {
        if (a && a.b64 && path.indexOf("chime") >= 0) chimeCache = { path: path, b64: a.b64, mime: a.mime };
        return a;
      });
  }

  function drain() {
    if (busy || !queue.length) return;
    busy = true;
    var job = queue.shift();
    var it = job.it;
    var finished = false;
    function done() { if (finished) return; finished = true; busy = false; drain(); }
    var said = it.text + (it.vi ? ". " + it.vi : "");
    // 1008 베트남어 카톡(kind kakao_vi): 말하지 않고 띵동+글자만
    if (it.kind === "kakao_vi" && job.role === "voice") job = { it: it, role: "chime", chime: job.chime };
    var path = job.role === "voice" ? it.audio : job.role === "chime" ? job.chime : "";
    loadAudio(path)
      .then(function (a) {
        function go() {
          toast(it);
          if (job.role === "quiet") return done();
          if (!a || !a.b64) return job.role === "voice" ? deviceSpeak(said, done) : done();
          var au = new global.Audio("data:" + (a.mime || "audio/wav") + ";base64," + a.b64);
          au.onended = au.onerror = done;
          var p = au.play();
          if (p && p.catch) p.catch(function () { return job.role === "voice" ? deviceSpeak(said, done) : done(); });
          global.setTimeout(done, 20000);
        }
        var wait = it.kind === "kakao_vi" ? 0 : Number(it.at || 0) * 1000 + PLAY_DELAY_MS - boardNow();   // 다른 기기와 같은 순간에(베트남어 카톡은 바로)
        if (wait > 0 && wait < 15000) global.setTimeout(go, wait);
        else go();
      })
      .catch(function () { toast(it); done(); });
  }

  // 1010 포스웹 메인PC 켜기: 공장이 kitchen_voice.json 에 pc_wake {id,mac,at} 를 남기면, 앱 다리(wakeOnLan)가 있는 기기가
  // 120초 안의 새 id 를 한 번만 처리 → 매직패킷 → 공장 presence 에 {pc_wake_done,result} 보고. 옛 앱(다리 없음)은 아무것도 안 함.
  var WAKE_KEY = "pcWakeDone";
  var WAKE_FRESH_MS = 120000;
  function nativeBridge() { return global.ChickenTimerNative; }
  function readIdList(key) {
    try { return JSON.parse(global.localStorage.getItem(key) || "[]") || []; } catch (e) { return []; }
  }
  function handlePcWake(cfg, now) {
    var w = cfg && cfg.pc_wake;
    var nb = nativeBridge();
    if (!w || !w.id || !nb || typeof nb.wakeOnLan !== "function") return;
    if (!(now - Number(w.at || 0) * 1000 < WAKE_FRESH_MS)) return;
    var done = readIdList(WAKE_KEY);
    if (done.indexOf(w.id) >= 0) return;
    done.push(w.id);
    try { global.localStorage.setItem(WAKE_KEY, JSON.stringify(done.slice(-20))); } catch (e) { /* 저장 못 해도 진행 */ }
    var result;
    try { result = String(nb.wakeOnLan(String(w.mac || ""))); } catch (e) { result = "err:js"; }
    try {
      presenceUrl().then(function (url) {
        if (!url) return;
        return global.fetch(url, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
                                   body: JSON.stringify({ pc_wake_done: w.id, result: result }) });
      }).catch(function () { /* 공장 못 닿아도 신호는 이미 보냄 */ });
    } catch (e) { /* 옛 기기 */ }
  }
  // 1010 늘 켜진 보드: 공장이 알려 준 최신 versionCode(cfg.app_version)가 이 앱보다 크면 같은 값으로는 한 번만 업데이트 확인.
  function handleAppUpdate(cfg) {
    var nb = nativeBridge();
    var want = Number(cfg && cfg.app_version || 0);
    if (!want || !nb || typeof nb.getAppVersionCode !== "function" || typeof nb.checkUpdateNow !== "function") return;
    var have = 0;
    try { have = Number(nb.getAppVersionCode()); } catch (e) { return; }
    if (!(want > have)) return;
    var asked = readIdList("appUpdateAsked");
    if (asked.indexOf(want) >= 0) return;
    asked.push(want);
    try { global.localStorage.setItem("appUpdateAsked", JSON.stringify(asked.slice(-5))); } catch (e) { /* 저장 못 해도 진행 */ }
    try { nb.checkUpdateNow(); } catch (e) { /* 다음 새 버전 때 */ }
  }

  function tick() {
    if (!global.fetch) return;
    global.fetch("kitchen_voice.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) return;
        global.ChickenTimerKitchenNotes = (cfg.items || []).filter(function (it) { return it && it.id && it.text && it.kind !== "test"; })
          .map(function (it) { return { id: it.id, at: Number(it.at || 0) * 1000, text: it.text }; });
        var r = role(cfg);
        var now = boardNow();
        (cfg.items || []).forEach(function (it) { if (it && it.id && it.closed_at) closed[it.id] = 1; });
        dropClosed();
        handlePcWake(cfg, now);
        handleAppUpdate(cfg);
        (cfg.items || []).forEach(function (it) {
          if (!it || !it.id || played.indexOf(it.id) >= 0) return;
          remember(it.id);
          if (closed[it.id]) return;                                   // 이미 누가 닫은 알림은 소리도 안 냄
          if (now - Number(it.at || 0) * 1000 > Number(it.ttl || 180) * 1000) return;   // 오래된 건 안 알림
          queue.push({ it: it, role: r, chime: cfg.chime || "" });
        });
        drain();
      })
      .catch(function () { /* 공장 못 닿으면 다음에 */ });
  }

  var nowSig = "";
  function tickNow() {
    if (!global.fetch) return;
    global.fetch("kitchen_now.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var items = (d && d.items) || [];
        var sig = JSON.stringify(items.map(function (x) { return [x.key, x.state, x.tag, x.end, x.label || ""]; })) + JSON.stringify((d && d.recent) || {}) + JSON.stringify((d && d.slots) || {}) + JSON.stringify((d && d.predict) || {}) + JSON.stringify((d && d.predict_ov) || {});
        if (sig === nowSig) return;
        nowSig = sig;
        var byKey = {};
        var nth = 0;
        // 공장이 이미 줄 세워 줌: 타이머 도는 것(끝 빠른 순) → 대기(주문 순). 레시피마다 처음 나온 자리 = 순서.
        items.forEach(function (x) {
          if (!x || !x.key) return;
          var m = byKey[x.key];
          if (!m) byKey[x.key] = m = { rank: nth++, state: x.state, count: 0, cook: 0, wait: 0, end: 0, start: 0, labels: [] };
          m.count += 1;
          if (x.label && m.labels.indexOf(x.label) < 0) m.labels.push(x.label);
          if (x.state === "cook") { m.cook += 1; if (x.end && (!m.end || x.end < m.end)) { m.end = x.end; m.start = x.start || 0; } }
          else m.wait += 1;
        });
        global.ChickenTimerKitchenNow = { byKey: byKey, at: d && d.at, recent: (d && d.recent) || {}, slots: (d && d.slots) || {}, predict: (d && d.predict) || {}, predict_ov: (d && d.predict_ov) || {} };
        try { global.document.dispatchEvent(new global.CustomEvent("chickentimer-kitchen-now")); } catch (e) { /* 옛 기기 */ }
      })
      .catch(function () { /* 다음에 */ });
  }

  try {   // 기록칸 알림 줄 · 레시피 칸 주문 색 · 토스트 모양
    var st = global.document.createElement("style");
    st.textContent = '#board-log li[data-group="note"] .log-title{color:#ff6b3d;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}' +
      '.recipe-output-grid tr.is-order-wait td{background:rgba(255,166,0,.28)}' +
      '.recipe-output-grid tr.is-order-wait td:first-child{box-shadow:inset 5px 0 0 #ffa600;font-weight:700}' +
      '.recipe-output-grid tr.is-order-cook td{background:rgba(0,200,120,.30)}' +
      '.recipe-output-grid tr.is-order-cook td:first-child{box-shadow:inset 5px 0 0 #00c878;font-weight:700}' +
      '.recipe-order-badge{margin-left:6px;font-size:.85em;font-weight:700;white-space:nowrap}' +
      '.kitchen-toasts{position:fixed;left:50%;top:10px;z-index:200;transform:translateX(-50%);width:max-content;max-width:min(92vw,40rem);' +
      'display:flex;flex-direction:column;gap:.4rem;pointer-events:none}' +
      '.kitchen-toast{pointer-events:auto;cursor:pointer;padding:.6rem 1rem;border-radius:.8rem;background:rgba(20,20,22,.94);' +
      'border:2px solid #ff6b3d;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.5);text-align:center;animation:kt-in .25s ease}' +
      '@keyframes kt-in{from{transform:translateY(-120%);opacity:0}to{transform:none;opacity:1}}' +
      '.kitchen-toast-hint{margin-top:.25rem;font-size:.72rem;color:#aaa}' +
      '.kitchen-toast-ko{font-size:clamp(1.05rem,3.2vw,1.6rem);font-weight:900;line-height:1.25}' +
      '.kitchen-toast-vi{margin-top:.2rem;font-size:clamp(.85rem,2.4vw,1.15rem);font-weight:700;color:#ffd84d}';
    global.document.head.appendChild(st);
  } catch (e) { /* 모양 없이도 동작 */ }
  if (global.document.body) restoreToasts();   // 1009: 새로고침 뒤에도 안 지운 알림 다시
  else global.document.addEventListener("DOMContentLoaded", restoreToasts);
  global.setInterval(tick, 3000);
  global.setTimeout(tick, 1500);
  global.setInterval(tickNow, 3000);
  global.setTimeout(tickNow, 800);
})(typeof window !== "undefined" ? window : this);
