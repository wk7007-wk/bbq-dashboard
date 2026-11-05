(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('profile') !== 'subnote') return;
  // The existing PIN gate reloads after unlock. Never mount a higher-layer
  // memo page while its locked shell has no timer application.
  if (document.body && document.body.dataset && document.body.dataset.authState === 'locked') return;
  const shell = document.querySelector('.app-shell');
  const board = document.querySelector('#board');
  if (!shell || !board || !window.NotebookWorkMemos || window.__notebookWorkMounted) return;
  window.__notebookWorkMounted = true;
  const timerBar = document.createElement('header'); timerBar.className = 'work-timer-bar';
  const timerLabel = document.createElement('strong'); timerLabel.textContent = '타이머';
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'work-mode-open'; button.textContent = '메모';
  button.setAttribute('aria-label', '메모로 돌아가기');
  const timerAlert = document.createElement('button');
  timerAlert.type = 'button'; timerAlert.className = 'work-timer-alert'; timerAlert.hidden = true;
  timerAlert.addEventListener('click', () => {
    const target = board.querySelector('.slot-card[data-state="expired"], .split-timer-unit[data-state="expired"]');
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({block:'center'});
  });
  timerBar.appendChild(timerLabel); timerBar.appendChild(timerAlert); timerBar.appendChild(button);
  shell.insertBefore(timerBar, board);
  shell.classList.add('work-timer-shell');
  new MutationObserver(() => { refreshHistorySource(); }).observe(board, {childList: true, subtree: true});
  const panel = document.createElement('section');
  panel.className = 'work-panel'; panel.hidden = true; panel.setAttribute('aria-label', '메모');
  panel.innerHTML = '<div class="wk-seg" role="tablist" aria-label="화면 전환"><button type="button" role="tab" aria-selected="true" class="wk-seg-on" tabindex="-1">메모</button><button type="button" role="tab" aria-selected="false" data-back>타이머<span class="wk-badge" data-seg-badge hidden></span></button></div>' +
    '<button type="button" class="wk-urgent" data-urgent hidden></button><span data-timer-status role="status" aria-live="polite" hidden></span>' +
    '<div class="work-columns"><section class="work-search wk-card-box"><h2 class="wk-card-title">주소 검색</h2><div class="work-search-line"><label class="wk-field"><svg class="wk-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><span class="work-sr-only">건물 이름이나 주소 일부</span><input data-query autocomplete="off" enterkeyhint="search" placeholder="건물·주소 일부 검색"><kbd class="wk-kbd">Enter</kbd></label><button type="button" class="wk-stage" data-stage-query title="입력한 글자를 그대로 메모에 담기">+ 담기</button><button type="button" class="work-sr-only" data-search tabindex="-1">검색</button></div><p data-search-status aria-live="polite"></p><div data-cache-results></div><div data-memo-results></div><div data-external-results></div><div data-ai-results></div><p data-selection></p><div data-selected-actions hidden><label>고객용 한국어 주소<textarea data-selected-customer readonly></textarea></label><div class="work-actions"><button type="button" data-copy-selection>고객 한국어 복사</button><button type="button" data-stage-selection>선택값 임시 담기</button></div><div><button type="button" data-confirm>맞음</button><button type="button" data-reject>아님</button><button type="button" data-undo>되돌림</button></div><label>주소 수정<input data-correction></label><button type="button" data-correct>수정 반영</button><button type="button" data-retry-feedback hidden>처리 확인 재시도</button><p data-feedback-status role="status"></p></div></section><div class="work-workspace"><aside class="work-records" aria-label="최근 타이머 기록"><div data-history class="work-history-list"></div></aside>' +
    '<section class="work-memos wk-card-box"><h2 class="wk-card-title">메모<span class="wk-share" data-share></span></h2><div class="wk-memo-head"><div class="wk-kind" role="group" aria-label="메모 종류"><button type="button" data-temporary aria-pressed="false">임시 메모</button><button type="button" data-fixed aria-pressed="true">자주 쓰는 문구</button></div><button type="button" class="wk-new" data-new>+ 새 메모</button></div><label class="wk-line-field"><span class="work-sr-only">메모 한 줄</span><input data-line autocomplete="off" enterkeyhint="done" placeholder="메모 한 줄 쓰고 Enter"></label><div class="work-fixed-chips" data-fixed-chips></div><div data-batch hidden><p>목록 순서로 복사 · 카드 안에서는 이름, 주소/문구 순서 · 값 사이는 줄바꿈</p><div class="work-actions"><button type="button" data-copy-batch disabled>선택값 복사 (0)</button><button type="button" data-unselect>선택 해제</button></div><div data-list-manual hidden><label>선택한 한국어 값 · 수동 복사<textarea data-list-manual-text readonly></textarea></label><button type="button" data-list-manual-select>문구 전체 선택</button></div></div><details class="work-help"><summary>직원 사용 안내 · 한국어 / Tiếng Việt / 日本語</summary><div class="work-help-languages"><section lang="ko"><h3>한국어</h3><p>주소·건물명을 입력하거나 검색 결과를 임시 카드에 담습니다. 필요한 값만 선택해 복사한 뒤 포스에 붙여넣습니다. 자주 쓰는 문구는 고정으로 저장합니다. ‘기록’은 타이머를 열고 ‘메모로’는 이 화면으로 돌아옵니다. 주소검색은 매장 연결에서 사용할 수 있습니다.</p></section><section lang="vi"><h3>Tiếng Việt</h3><p>Nhập địa chỉ hoặc tên tòa nhà, rồi thêm vào thẻ tạm. Khi có kết quả tìm kiếm, bạn cũng có thể lưu giá trị đã chọn. Chỉ chọn các giá trị cần dùng, sao chép rồi dán vào POS. Lưu câu thường dùng vào ghi chú cố định. Nhấn “기록” để mở bộ hẹn giờ, nhấn “메모로” để quay lại. Tìm kiếm địa chỉ chỉ dùng trong kết nối của cửa hàng.</p></section><section lang="ja"><h3>日本語</h3><p>住所・建物名の入力値や選択した検索結果を一時カードに保存します。必要な値だけを選んでコピーし、POSに貼り付けます。よく使う文章は固定メモに保存します。「기록」でタイマーを開き、「메모로」でメモに戻ります。住所検索は店舗の接続から利用できます。</p></section></div></details><div class="wk-undo" data-undo hidden><span data-undo-text></span><button type="button" data-undo-btn>되돌리기</button></div><div data-list class="work-list"></div><div data-editor hidden><p data-current-kind></p>' +
    '<label>제목<input data-title></label><label data-name-label hidden>이름 / 건물명<input data-name></label><label>메모<textarea data-customer rows="2"></textarea></label>' +
    '<details class="work-staff"><summary>직원 설명 · 한국어 / Tiếng Việt / 日本語</summary><div class="work-languages">' +
    '<div><label>한국어<textarea data-ko></textarea></label><button type="button" data-copy-ko>직원 한국어 복사</button></div>' +
    '<div><label>베트남어<textarea data-vi></textarea></label><button type="button" data-copy-vi>직원 베트남어 복사</button></div>' +
    '<div><label>일본어<textarea data-ja></textarea></label><button type="button" data-copy-ja>직원 일본어 복사</button></div></div>' +
    '<button type="button" data-copy-all>직원 세 언어 복사</button><div data-manual hidden><label>직원 설명 · 수동 복사<textarea data-manual-text readonly></textarea></label><button type="button" data-manual-select>직원 문구 전체 선택</button></div></details>' +
    '<div class="work-actions"><button type="button" class="wk-primary" data-save>저장</button><button type="button" data-copy>복사</button><button type="button" data-pin hidden>고정</button><button type="button" data-clear hidden>지우기</button></div><div data-clear-confirm hidden><p>이 임시 메모만 지웁니다.</p><div class="work-actions"><button type="button" class="wk-danger" data-clear-now>지우기</button><button type="button" data-clear-cancel>취소</button></div></div></div><p data-status role="status"></p></section></div></div>';
  shell.appendChild(panel);
  const $ = (name) => panel.querySelector('[data-' + name + ']');
  function showTimerStatus() {
    const done = board.querySelectorAll('.slot-card[data-state="expired"], .split-timer-unit[data-state="expired"]').length;
    $('timer-status').textContent = done ? '완료 알림 ' + done + '건' : ''; $('timer-status').hidden = !done; timerAlert.hidden = !done; timerAlert.textContent = done ? '완료 ' + done : '';
    timerAlert.setAttribute('aria-label', done ? '완료 알림 ' + done + '건 보기' : '완료 알림');
    $('seg-badge').textContent = done ? String(done) : ''; $('seg-badge').hidden = !done;
    $('urgent').textContent = done ? '완료된 타이머 ' + done + '개 — 눌러서 확인' : ''; $('urgent').hidden = !done;
  }
  new MutationObserver(showTimerStatus).observe(board, {attributes: true, subtree: true, attributeFilter: ['data-state']});
  showTimerStatus();
  let db, current = null, kind = 'temporary', clearTarget = null, editing = false;
  let displayed = {};
  function rememberFields() { ['title','name','customer','ko','vi','ja'].forEach((name) => { displayed[name] = $(name).value; }); }
  const viewKey = 'notebook-work:view:subnote:v1';
  try { db = window.NotebookWorkMemos.store(window.localStorage); db.list(); db.drafts(); }
  catch (_) { $('status').textContent = '저장 자료를 읽을 수 없습니다. 기존 자료를 보존합니다.'; }
  function report(text) { $('status').textContent = text; }
  // ---- 1104 사장님 "공장sot로 메모 공유되게": /chicken-timer/memos 가 공유 원본, 이 기기 저장소는 사본 ----
  // 1104 사고("새로고침 하니깐 메모다 지워졌어"): 공장 저장이 거절됐는데 빈 공장 내용으로 이 기기 메모를 덮어 지웠다.
  // 지금 규칙: 이 기기 메모는 공장이 '지웠다'고 적은 것(deleted)만 지운다. 공장에 없는 메모는 공장에 올리고,
  // 못 올리면 이 기기에 그대로 둔다. 직원 메모(staff_notes)는 공장에 안 올리고 이 기기에만 둔다(서버가 받지 않음).
  const share = (() => {
    const api = '/chicken-timer/memos';
    const shared = ['title', 'name_ko', 'customer_ko', 'source_kind', 'created_at', 'created_order'];
    let rev = -1, on = false, queue = Promise.resolve(), retry = null, pending = 0, deferred = false, first = true;
    const failedIds = new Set(), retryIds = new Set();   // failed=공장이 받지 않는 모양(400·413, 이번 접속 동안 다시 안 보냄), retry=잠깐 끊김(다시 보냄)
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const mark = (text, live) => { const el = $('share'); if (el) { el.textContent = text; el.classList.toggle('wk-share-on', !!live); } };
    const showLive = () => { const n = failedIds.size + retryIds.size; mark(n ? '공장 공유 · ' + n + '개는 아직 이 기기에만' : '공장 공유', true); };
    const same = (a, b) => shared.every((k) => (a[k] === undefined ? null : a[k]) === (b[k] === undefined ? null : b[k])) &&
      JSON.stringify(a.temporary_source || null) === JSON.stringify(b.temporary_source || null);
    const keepHere = (x) => { const o = {}; ['staff_notes', 'staff_meta', 'source_revision'].forEach((k) => { if (x[k] !== undefined) o[k] = x[k]; }); return o; };
    async function call(method, body, query) {
      const res = await fetch(api + (query || ''), {method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: body ? {'Content-Type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined});
      let data = null; try { data = await res.json(); } catch (_) {}
      return {status: res.status, data};
    }
    function send(body) {
      pending += 1;
      queue = queue.then(async () => {
        try {
          const r = await call('POST', body);
          if (r.status === 200) { if (body.op === 'put') { failedIds.delete(body.item.id); retryIds.delete(body.item.id); } }
          else if (r.status === 409) { deferred = true; if (body.base > 0) report('다른 기기에서 바뀌어 새로 불러왔어요'); }
          else if (r.status === 400 || r.status === 413) { if (body.op === 'put') failedIds.add(body.item.id); mark('공장 저장 안 됨(' + r.status + ') — 이 기기에는 그대로 있어요', false); }
          else { if (body.op === 'put') retryIds.add(body.item.id); mark('공장 저장 안 됨(' + r.status + ') — 이 기기에는 그대로, 곧 다시 올려요', false); }
        } catch (_) { if (body.op === 'put') retryIds.add(body.item.id); mark('공장 연결 끊김 — 이 기기에는 그대로, 곧 다시 올려요', false); }
        pending -= 1;
        if (pending === 0 && deferred) { deferred = false; await refresh(); }
      });
    }
    function apply(data) {
      if (!db || !data || data.ok !== true || !Number.isInteger(data.rev) || !Array.isArray(data.fixed) || !Array.isArray(data.temps)) return;
      if (pending > 0) { deferred = true; return; }   // 내가 올리는 중이면 다 올린 뒤 새로 받는다
      if (data.rev === rev && !first) {
        // 공장은 그대로인데 잠깐 끊겨 못 올린 메모가 있으면 화면은 건드리지 않고 다시 올리기만 한다(긴 대기 한 바퀴마다)
        if (!retryIds.size) return;
        let mine; try { mine = db.snapshot(); } catch (_) { return; }
        const remote = new Map();
        data.fixed.forEach((r) => r && remote.set('fixed:' + r.id, r)); data.temps.forEach((r) => r && remote.set('temps:' + r.id, r));
        [['fixed', 'fixed', mine.fixed], ['temps', 'temporary', mine.temps]].forEach(([col, kind, rows]) => rows.forEach((l) => {
          if (!retryIds.has(l.id)) return;
          const r = remote.get(col + ':' + l.id);
          if (!r) send({op: 'put', kind, item: Object.assign({}, l, {revision: Math.max(1, l.revision)}), base: 0});
          else if (l.revision > r.revision && !same(l, r)) send({op: 'put', kind, item: l, base: r.revision});
          else retryIds.delete(l.id);
        }));
        return;
      }
      let local;
      try { local = db.snapshot(); } catch (_) { return; }
      const gone = new Map();
      (Array.isArray(data.deleted) ? data.deleted : []).forEach((t) => { if (t && typeof t.id === 'string') gone.set(t.kind + ':' + t.id, Number.isInteger(t.revision) ? t.revision : 0); });
      if (first) {
        // 사고 때 지워진 고정 메모 되살리기: 이 기기 초안에 저장된 판(1 이상)으로 남아 있고, 목록·공장 어디에도 없고, 공장이 지웠다고 적지 않은 것
        try {
          const drafts = db.drafts().filter((d) => d && Number.isInteger(d.revision) && d.revision >= 1 && !local.fixed.some((x) => x.id === d.id) &&
            !data.fixed.some((x) => x.id === d.id) && !gone.has('fixed:' + d.id));
          local.fixed = local.fixed.concat(drafts);
        } catch (_) {}
      }
      const sends = [];
      const merge = (col, kind, remoteRows, localRows) => {
        const mine = new Map(localRows.map((x) => [x.id, x]));
        const out = [];
        remoteRows.forEach((r) => {
          if (!r || typeof r.id !== 'string') return;
          const l = mine.get(r.id); mine.delete(r.id);
          if (l && l.revision > r.revision && !same(l, r)) { out.push(l); if (!failedIds.has(l.id)) sends.push({op: 'put', kind, item: l, base: r.revision}); }
          else out.push(l ? Object.assign(keepHere(l), r) : r);
        });
        mine.forEach((l) => {
          const g = gone.get(col + ':' + l.id);
          if (g !== undefined && l.revision <= g) return;   // 다른 기기에서 지운 메모
          out.push(l);                                       // 공장에 없는 이 기기 메모: 지우지 않고 올린다
          if (!failedIds.has(l.id)) sends.push({op: 'put', kind, item: Object.assign({}, l, {revision: Math.max(1, l.revision)}), base: 0});
        });
        return out;
      };
      const fixed = merge('fixed', 'fixed', data.fixed, local.fixed);
      const temps = merge('temps', 'temporary', data.temps, local.temps);
      try { db.replaceAll({fixed, temps}); } catch (_) { return; }
      first = false;
      rev = data.rev;
      if (current && !editing) current = null;
      draw();
      sends.forEach(send);
    }
    async function refresh() { try { const r = await call('GET'); if (r.status === 200) apply(r.data); } catch (_) {} }
    async function loop() {
      while (on) {
        try {
          const r = await call('GET', null, '?wait=' + Math.max(rev, 0));
          if (r.status === 200) { apply(r.data); if (pending > 0) await queue; showLive(); }
          else { mark('공장 공유 끊김(' + r.status + ') — 이 기기에는 그대로 있어요', false); await pause(5000); }
        } catch (_) { mark('공장 공유 끊김 — 이 기기에는 그대로 있어요', false); await pause(5000); }
      }
    }
    async function start() {
      clearTimeout(retry);
      try {
        const r = await call('GET');
        if (r.status !== 200 || !r.data || r.data.ok !== true) {
          mark(r.status === 401 ? '이 기기에만 저장(공장 허용 밖)' : '이 기기에만 저장', false);
          retry = setTimeout(start, r.status === 401 ? 300000 : 60000); return;
        }
        on = true;
        apply(r.data);
        showLive();
        loop();
      } catch (_) { mark('이 기기에만 저장', false); retry = setTimeout(start, 60000); }
    }
    function wrap(store) {
      if (!store) return store;
      const o = {save: store.save, saveTemporary: store.saveTemporary, clearTemporary: store.clearTemporary, remove: store.remove};
      store.save = (draft) => { const saved = o.save(draft); if (on && saved && saved.revision === draft.revision + 1) send({op: 'put', kind: 'fixed', item: saved, base: draft.revision}); return saved; };
      store.saveTemporary = (draft) => { const saved = o.saveTemporary(draft); if (on && saved && saved.revision === draft.revision + 1) send({op: 'put', kind: 'temporary', item: saved, base: draft.revision}); return saved; };
      store.clearTemporary = (id, revision) => { const r = o.clearTemporary(id, revision); if (on) send({op: 'delete', kind: 'temporary', id, base: revision}); return r; };
      store.remove = (id, revision) => { const r = o.remove(id, revision); if (on) send({op: 'delete', kind: 'fixed', id, base: revision}); return r; };
      return store;
    }
    return {start, wrap};
  })();
  db = share.wrap(db);
  function rememberView() {
    try { window.localStorage.setItem(viewKey, JSON.stringify({kind, id: current && current.id})); } catch (_) {}
  }
  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try { await navigator.clipboard.writeText(text); return; } catch (_) {}
    }
    // The live factory origin is HTTP. Copy only this explicit button's plain
    // text during its user gesture. Customer buttons never include staff/DOM.
    const active = document.activeElement;
    const selection = window.getSelection && window.getSelection();
    const ranges = [];
    if (selection) for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i).cloneRange());
    const start = active && active.selectionStart, end = active && active.selectionEnd;
    const field = document.createElement('textarea');
    field.value = text; field.readOnly = true; field.tabIndex = -1;
    field.setAttribute('aria-hidden', 'true');
    field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(field);
    try {
      field.focus({preventScroll: true}); field.select();
      if (typeof document.execCommand !== 'function' || document.execCommand('copy') !== true) throw new Error('copy failed');
    } finally {
      field.remove();
      try {
        if (active && active.isConnected) {
          active.focus({preventScroll: true});
          if (typeof start === 'number' && typeof active.setSelectionRange === 'function') active.setSelectionRange(start, end);
        }
        if (selection) { selection.removeAllRanges(); ranges.forEach((range) => selection.addRange(range)); }
      } catch (_) {}
    }
  }
  // Selection belongs only to explicit temporary fields, never to the fixed
  // store, staff notes, search DOM, or an entire search-result object.
  const picks = new Map();
  function selectionStatus() {
    let count = 0; picks.forEach((pick) => { count += pick.fields.size; });
    $('copy-batch').disabled = count === 0;
    $('copy-batch').textContent = '선택값 복사 (' + count + ')';
  }
  function invalidatePick(id) {
    picks.delete(id); selectionStatus(); $('list-manual').hidden = true;
  }
  async function copyListText(text) {
    if (!text.length) { report('복사할 한국어 값이 없습니다.'); return; }
    try { await copyText(text); $('list-manual').hidden = true; report('선택한 한국어 값을 복사했습니다'); return true; }
    catch (_) {
      $('list-manual-text').value = text; $('list-manual').hidden = false;
      $('list-manual-text').focus(); $('list-manual-text').select();
      report('복사하지 못했습니다. 선택된 한국어 값을 직접 복사해 주세요.'); return false;
    }
  }
  function timeOf(ms) {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms), now = new Date(), two = (n) => String(n).padStart(2, '0');
    return d.toDateString() === now.toDateString() ? two(d.getHours()) + ':' + two(d.getMinutes()) : (d.getMonth() + 1) + '/' + d.getDate();
  }
  function draw() {
    if (!db) return;
    let fixed, temps;
    try { fixed = db.list(); temps = db.temporaries(); }
    catch (_) { $('list').replaceChildren(); report('저장 자료를 읽을 수 없습니다. 기존 자료를 보존합니다.'); return; }
    $('fixed-chips').replaceChildren();
    $('batch').hidden = false;
    picks.forEach((pick, id) => {
      const entry = temps.find((x) => x.id === id);
      if (!entry || entry.revision !== pick.revision) invalidatePick(id);
    });
    $('list').replaceChildren();
    const rows = fixed.map((entry) => ['fixed', entry]).concat(temps.slice().reverse().map((entry) => ['temporary', entry]));
    if (!rows.length) {
      const none = document.createElement('p'); none.className = 'wk-none'; none.textContent = '아직 메모가 없어요. 위 칸에 한 줄 쓰고 Enter.';
      $('list').appendChild(none);
    }
    rows.forEach(([rowKind, entry]) => {
      function edit() {
        if (!capture()) return;
        try {
          kind = rowKind;
          current = rowKind === 'temporary' ? db.temporary(entry.id) : db.drafts().find((x) => x.id === entry.id) || db.list().find((x) => x.id === entry.id);
          editing = true; fill(); rememberView();
        } catch (_) { report('항목을 읽지 못했습니다. 편집 내용을 보존합니다.'); }
      }
      const value = rowKind === 'fixed' ? (entry.customer_ko || entry.title || '') : (entry.customer_ko || entry.name_ko || entry.title || '');
      const row = document.createElement('article'); row.className = 'wk-row wk-row-' + rowKind;
      row.setAttribute(rowKind === 'temporary' ? 'data-temp-card' : 'data-fixed-row', entry.id);
      const primary = document.createElement('button'); primary.type = 'button'; primary.className = 'wk-row-copy';
      primary.setAttribute('data-copy-address', entry.id); primary.title = '누르면 복사';
      const lead = document.createElement('span'); lead.className = 'wk-row-lead'; lead.textContent = rowKind === 'fixed' ? '고정' : timeOf(entry.created_at);
      const text = document.createElement('span'); text.className = 'wk-row-text';
      if (rowKind === 'fixed' && entry.title && entry.customer_ko && entry.title !== entry.customer_ko) {
        const head = document.createElement('b'); head.textContent = entry.title; text.appendChild(head); text.appendChild(document.createTextNode(entry.customer_ko));
      } else if (rowKind === 'temporary' && entry.name_ko && entry.customer_ko && entry.name_ko !== entry.customer_ko) {
        text.textContent = entry.name_ko + ' · ' + entry.customer_ko;
      } else text.textContent = value || '빈 메모';
      const state = document.createElement('span'); state.className = 'wk-row-state';
      const head = document.createElement('span'); head.className = 'wk-row-head';
      head.appendChild(lead); head.appendChild(state);
      primary.appendChild(head); primary.appendChild(text);
      primary.addEventListener('click', async () => {
        try {
          const latest = rowKind === 'temporary' ? db.temporary(entry.id) : db.list().find((x) => x.id === entry.id);
          if (!latest || latest.revision !== entry.revision) { draw(); report('항목이 바뀌었습니다. 다시 눌러 주세요.'); return; }
          if (!value) { edit(); return; }
          if (await copyListText(value)) {
            row.classList.add('wk-copied'); state.textContent = '복사됨';
            setTimeout(() => { row.classList.remove('wk-copied'); state.textContent = ''; }, 1400);
          }
        } catch (_) { report('항목을 읽지 못했습니다. 기존 원문을 보존합니다.'); }
      });
      if (rowKind === 'temporary') {
        const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'wk-pin'; pin.textContent = '고정'; pin.title = '고정으로 옮기기';
        pin.addEventListener('click', () => {
          if (!capture()) return;
          try {
            const latest = db.temporary(entry.id);
            if (!latest || latest.revision !== entry.revision) { draw(); report('항목이 바뀌었습니다. 다시 눌러 주세요.'); return; }
            db.pinTemporary(entry.id, entry.revision);
            try { db.clearTemporary(entry.id, entry.revision); } catch (_) {}
            if (current && current.id === entry.id) { current = null; editing = false; fill(); }
            draw(); report('고정했습니다');
          } catch (_) { report('고정하지 못했습니다. 기존 항목을 보존합니다.'); }
        });
        row.appendChild(primary); row.appendChild(pin);
      }
      const more = document.createElement('button'); more.type = 'button'; more.className = 'wk-more'; more.textContent = '수정';
      more.setAttribute('aria-label', '수정'); more.title = '수정';
      if (rowKind === 'temporary') more.setAttribute('data-edit-temp', entry.id);
      more.addEventListener('click', edit);
      if (rowKind !== 'temporary') row.appendChild(primary);
      const del = document.createElement('button'); del.type = 'button'; del.className = 'wk-del'; del.textContent = '×';
      del.setAttribute('aria-label', '지우기'); del.title = '지우기';
      del.addEventListener('click', () => removeRow(rowKind, entry));
      row.appendChild(more); row.appendChild(del); $('list').appendChild(row);
    });
    selectionStatus();
  }
  // 1104 사장님 "삭제는 x표시로 쉽게. 게시판 답변처럼": × 한 번에 지우고, 6초 동안 되돌리기
  let undoTimer = null, lastRemoved = null;
  function removeRow(rowKind, entry) {
    if (!capture()) return;
    try {
      if (rowKind === 'temporary') db.clearTemporary(entry.id, entry.revision); else db.remove(entry.id, entry.revision);
      if (current && current.id === entry.id) { current = null; editing = false; fill(); }
      lastRemoved = {rowKind, entry};
      $('undo-text').textContent = '지웠어요';
      $('undo').hidden = false;
      clearTimeout(undoTimer); undoTimer = setTimeout(() => { $('undo').hidden = true; lastRemoved = null; }, 6000);
      draw();
    } catch (_) { draw(); report('지우지 못했습니다. 다른 화면에서 바뀌었는지 확인해 주세요.'); }
  }
  $('undo-btn').addEventListener('click', () => {
    if (!lastRemoved) return;
    const {rowKind, entry} = lastRemoved; lastRemoved = null;
    try {
      const back = Object.assign({}, entry, {revision: 0});
      if (rowKind === 'temporary') db.saveTemporary(back); else db.save(back);
    } catch (_) { report('되돌리지 못했습니다.'); }
    $('undo').hidden = true; clearTimeout(undoTimer); draw();
  });
  $('copy-batch').addEventListener('click', async () => {
    try {
      const rows = db.temporaries(), texts = [];
      for (const [id, pick] of picks) {
        const row = rows.find((x) => x.id === id);
        if (!row || row.revision !== pick.revision) { draw(); report('선택한 항목이 바뀌었습니다. 현재 값을 확인한 뒤 다시 선택해 주세요.'); return; }
      }
      rows.forEach((row) => {
        const pick = picks.get(row.id); if (!pick) return;
        ['name_ko','customer_ko'].forEach((field) => { if (pick.fields.has(field) && typeof row[field] === 'string' && row[field].length) texts.push(row[field]); });
      });
      await copyListText(texts.join('\n'));
    } catch (_) { report('선택한 항목을 읽지 못했습니다. 기존 원문을 보존합니다.'); }
  });
  $('unselect').addEventListener('click', () => { picks.clear(); $('list-manual').hidden = true; draw(); });
  $('list-manual-select').addEventListener('click', () => { $('list-manual-text').focus(); $('list-manual-text').select(); });
  function fill() {
    ['fixed','temporary'].forEach((name) => {
      $(name).setAttribute('aria-pressed', String(kind === name));
      $(name).removeAttribute('style');
    });
    $('new').textContent = kind === 'temporary' ? '+ 새 메모' : '+ 새 문구';
    $('pin').hidden = $('clear').hidden = kind !== 'temporary';
    $('batch').hidden = $('name-label').hidden = kind !== 'temporary';
    $('current-kind').textContent = kind === 'temporary' ? '임시 메모 · 이 기기에 자동 보관' : '고정 메모';
    $('editor').setAttribute('data-kind', kind);
    $('clear-confirm').hidden = true; clearTarget = null; $('manual').hidden = true;
    $('editor').hidden = !current || !editing; if (!current) return;
    $('name').value = current.name_ko || '';
    $('title').value = current.title || ''; $('customer').value = current.customer_ko || '';
    const notes = current.staff_notes || {}; ['ko','vi','ja'].forEach((lang) => { $(lang).value = notes[lang] || ''; });
    rememberFields(); updateStaffButtons();
  }
  function sourceKey(item) { return JSON.stringify([item.customer_ko || '', (item.staff_notes || {}).ko || '']); }
  function ready(lang) {
    const meta = (current && current.staff_meta || {})[lang];
    return !!(current && (current.staff_notes || {})[lang] && meta && meta.source_key === sourceKey(current));
  }
  function updateStaffButtons() {
    ['ko','vi','ja'].forEach((lang) => { $('copy-' + lang).disabled = !ready(lang); });
    $('copy-all').disabled = !['ko','vi','ja'].every(ready);
  }
  function capture(changed) {
    if (!current) return true;
    if (changed) { $('manual').hidden = true; $('clear-confirm').hidden = true; clearTarget = null; }
    const oldKey = sourceKey(current);
    const meta = Object.assign({}, current.staff_meta || {});
    // Textareas normalize CRLF for display. An unrelated action must not
    // rewrite the saved snapshot's line endings or any untouched value.
    const value = (name, old) => changed === name || $(name).value !== displayed[name] ? $(name).value : old;
    current = Object.assign({}, current, {title: value('title', current.title || ''), customer_ko: value('customer', current.customer_ko || ''),
      staff_notes: Object.assign({}, current.staff_notes, {ko:value('ko', (current.staff_notes || {}).ko || ''), vi:value('vi', (current.staff_notes || {}).vi || ''), ja:value('ja', (current.staff_notes || {}).ja || '')})});
    const key = sourceKey(current);
    if (key !== oldKey) current.source_revision = (current.source_revision || 0) + 1;
    if (['ko','vi','ja'].includes(changed)) meta[changed] = {source_key: key, source_revision: current.source_revision || 0, provenance: 'user'};
    current.staff_meta = meta;
    if (kind === 'temporary' && ($('name').value || Object.prototype.hasOwnProperty.call(current, 'name_ko'))) current.name_ko = value('name', current.name_ko || '');
    updateStaffButtons();
    try {
      if (kind === 'temporary') current = db.saveTemporary(current); else db.saveDraft(current);
      rememberFields();
      if (kind === 'temporary' && changed) { invalidatePick(current.id); draw(); }
      report(kind === 'temporary' ? '임시 보관했습니다' : '편집 중'); return true;
    } catch (_) { report('저장하지 못했습니다. 다른 화면의 변경과 현재 편집 내용을 보존합니다.'); return false; }
  }
  ['title','name','customer','ko','vi','ja'].forEach((name) => $(name).addEventListener('input', () => capture(name)));
  ['fixed','temporary'].forEach((next) => $(next).addEventListener('click', () => {
    if (next === kind || !capture()) return;
    kind = next; current = null; editing = false; fill(); draw(); rememberView();
  }));
  function newMemo(title, text, temporary, sourceKind, name, openEditor = true) {
    if (!db || !capture()) return;
    const next = {id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), revision: 0, title, customer_ko: text, staff_notes: {ko:'',vi:'',ja:''}, staff_meta: {}, created_at: Date.now()};
    if (sourceKind) next.source_kind = sourceKind;
    if (typeof name === 'string') next.name_ko = name;
    try {
      if (temporary) { next.created_order = db.temporaries().reduce((order, item) => Math.max(order, item.created_order || 0), 0) + 1; const saved = db.saveTemporary(next); kind = 'temporary'; current = saved; }
      else { db.saveDraft(next); current = next; }
      editing = openEditor; fill(); draw(); rememberView(); report(temporary ? '새 임시 항목에 담았습니다' : '새 고정 메모를 편집합니다');
    } catch (_) { report('새 항목을 저장하지 못했습니다. 기존 항목과 입력값을 보존합니다.'); }
  }
  $('new').addEventListener('click', () => newMemo('', '', kind === 'temporary'));
  let lineComposing = false;
  $('line').addEventListener('compositionstart', () => { lineComposing = true; });
  $('line').addEventListener('compositionend', () => { lineComposing = false; });
  let lineEnterPending = false;
  const addLine = () => { const text = $('line').value.trim(); if (!text) return; newMemo('', text, true, 'line', undefined, false); $('line').value = ''; };
  const isLineEnter = (event) => event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
  $('line').addEventListener('keydown', (event) => {
    if (!isLineEnter(event)) return;
    if (event.isComposing || lineComposing || event.keyCode === 229) { lineEnterPending = true; return; }
    event.preventDefault(); lineEnterPending = false; addLine();
  });
  $('line').addEventListener('keyup', (event) => {
    if (!isLineEnter(event) || !lineEnterPending) return;
    lineEnterPending = false; addLine();
  });
  $('save').addEventListener('click', () => { if (!current || !db || !capture()) return; try { if (kind === 'fixed') { current = db.save(current); db.saveDraft(current); } draw(); rememberView(); report('저장했습니다'); } catch (_) { report('저장하지 못했습니다. 편집 내용을 보존합니다.'); } });
  $('pin').addEventListener('click', () => { if (kind !== 'temporary' || !current || !capture()) return; try { db.pinTemporary(current.id, current.revision); report('새 고정 메모로 복사 저장했습니다. 임시는 그대로 보관합니다.'); } catch (_) { report('고정 저장을 확인하지 못했습니다. 임시 원문을 보존합니다.'); } });
  $('clear').addEventListener('click', () => { if (kind !== 'temporary' || !current) return; clearTarget = {id: current.id, revision: current.revision}; $('clear-confirm').hidden = false; });
  $('clear-cancel').addEventListener('click', () => { clearTarget = null; $('clear-confirm').hidden = true; });
  $('clear-now').addEventListener('click', () => {
    if (!clearTarget || kind !== 'temporary' || !current || current.id !== clearTarget.id || current.revision !== clearTarget.revision) { report('현재 임시 항목을 다시 선택해 주세요.'); return; }
    try { db.clearTemporary(clearTarget.id, clearTarget.revision); current = null; fill(); draw(); rememberView(); report('선택한 임시 항목만 비웠습니다'); }
    catch (_) { report('다른 화면의 변경 또는 비우기 결과를 확인해 주세요. 현재 원문을 보존합니다.'); }
  });
  $('copy').addEventListener('click', async () => { if (!current) return; if (!capture() && kind === 'temporary') return; if (current.customer_ko.length === 0) { report('복사할 고객 한국어 문구가 없습니다.'); return; } try { await copyText(current.customer_ko); report('한국어 문구를 복사했습니다'); } catch (_) { $('customer').focus(); $('customer').select(); report('복사하지 못했습니다. 선택된 문구를 직접 복사해 주세요.'); } });
  async function copyStaff(languages) {
    if (kind === 'temporary' && !capture()) return;
    if (!current || !languages.every(ready)) { report('현재 원문의 직원 설명을 확인해 주세요.'); return; }
    const text = languages.map((lang) => current.staff_notes[lang]).join('\n\n');
    try { await copyText(text); report('직원 설명을 복사했습니다'); }
    catch (_) { $('manual-text').value = text; $('manual').hidden = false; $('manual-text').focus(); $('manual-text').select(); report('직원 설명을 복사하지 못했습니다. 선택된 직원 문구를 직접 복사해 주세요.'); }
  }
  ['ko','vi','ja'].forEach((lang) => $('copy-' + lang).addEventListener('click', () => copyStaff([lang])));
  $('copy-all').addEventListener('click', () => copyStaff(['ko','vi','ja']));
  $('manual-select').addEventListener('click', () => { $('manual-text').focus(); $('manual-text').select(); });
  const searchAdapters = window.NotebookWorkSearchAdapters || {};
  let selected = null, searchGeneration = null, pendingFeedback = null;
  async function privateRequest(path, payload) {
    // The real notebook origin and device authorization are not verified yet.
    // Do not send an address or feedback to an arbitrary same-origin host.
    throw new Error('private API not connected');
  }
  const mapDbItem = (item) => {
        if (!item || typeof item.name !== 'string' || typeof item.address !== 'string' ||
            !['db', 'naver'].includes(item.source) || typeof item.confirmed !== 'boolean') throw new Error('invalid address');
        const strs = (v, n) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x).slice(0, n) : [];
        return {name: item.name, address: item.address, jibun: typeof item.jibun === 'string' ? item.jibun : '', source: item.source, confirmed: item.confirmed, uses: Number.isFinite(item.uses) ? item.uses : null,
          // 1104 #5604 통합 검색 계약: 전화·원문·최근 배달·맞은 조각·별명·일치 종류(없으면 빈 값 — 예전 서버도 그대로)
          phones: strs(item.phones, 5), raw_line: typeof item.raw_line === 'string' ? item.raw_line : '',
          // #5628: 서버 날짜는 epoch 초(number|null) — 숫자도 보존(옛 글자 ISO 도 받음), 모르면 빈 값
          last_delivery_at: Number.isFinite(item.last_delivery_at) || typeof item.last_delivery_at === 'string' ? item.last_delivery_at : '',
          matched_tokens: strs(item.matched_tokens, 8), matched_alias: typeof item.matched_alias === 'string' ? item.matched_alias : '',
          match_kind: ['all', 'partial', 'similar'].includes(item.match_kind) ? item.match_kind : '',
          matched_query: typeof item.matched_query === 'string' ? item.matched_query : '',
          dong: typeof item.dong === 'string' ? item.dong : '', ho: typeof item.ho === 'string' ? item.ho : '',
          last_seen_at: Number.isFinite(item.last_seen_at) || typeof item.last_seen_at === 'string' ? item.last_seen_at : ''};
  };
  const cacheSearch = searchAdapters.cacheSearch || (async (query) => {
    const endpoint = '/chicken-timer/search';
    const note = (text) => { if ($('query').value.trim() === String(query).trim()) $('search-status').textContent = text; };
    try {
      // Verify the existing permitted source before sending an address.
      // No PIN/token is read from storage, placed in a URL, or issued here.
      const probe = await fetch(endpoint, {credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
      if (probe.status === 401) {
        note('주소검색 허용 밖 (401) — 매장 인터넷이나 탭넷으로 열어 주세요');
        throw new Error('address access denied');
      }
      if (!probe.ok) { note('주소검색 서버 응답 ' + probe.status + ' — 공장 화면 주소로 열렸는지 확인해 주세요'); throw new Error('address access denied'); }
      const capability = await probe.json();
      if (capability.ok !== true || capability.address_search !== true) throw new Error('invalid capability');
      const response = await fetch(endpoint + '?' + new URLSearchParams({q: query, lane: 'db'}),
        {credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
      if (response.status === 401) {
        note('매장 연결 상태를 확인한 뒤 다시 검색해 주세요');
        throw new Error('address access denied');
      }
      if (response.status === 502) throw new Error('address lookup unresolved');
      if (!response.ok) { note('주소검색 응답 ' + response.status + ' — 잠시 뒤 다시 찾아 주세요'); throw new Error('address access denied'); }
      const body = await response.json();
      if (body.ok !== true || !Array.isArray(body.results)) throw new Error('invalid address result');
      const results = body.results.map(mapDbItem);
      if (Number.isInteger(body.next_offset) && body.next_offset > 0) results.next_offset = body.next_offset;   // 더 보기
      note('');
      return results;
    } catch (error) {
      if (error.message === 'address lookup unresolved') note('못 찾았어요 — 이름 일부(예: 삼익)나 도로명으로 다시 찾아 보세요');
      else if (error.message !== 'address access denied') note('주소검색 서버에 닿지 않아요 (' + (error && error.name || '연결') + ') — 공장 연결을 확인해 주세요');
      throw error;
    }
  });
  const externalSearch = searchAdapters.externalSearch || (async (query) => {
    const response = await fetch('/chicken-timer/search?' + new URLSearchParams({q: query, lane: 'naver'}),
      {credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
    if (!response.ok) throw new Error('map lookup failed');
    const body = await response.json();
    if (body.ok !== true || !Array.isArray(body.results)) throw new Error('invalid map result');
    return body.results.filter((item) => item && typeof item.name === 'string' && typeof item.address === 'string')
      .map((item) => ({name: item.name, address: item.address, jibun: typeof item.jibun === 'string' ? item.jibun : '', source: item.source === 'db' ? 'db' : 'naver', confirmed: item.confirmed === true, uses: Number.isFinite(item.uses) ? item.uses : null,
        provider: item.provider === 'kakao' || item.provider === 'ncp' ? item.provider : '',
        match_kind: item.match_kind === 'similar' ? 'similar' : '', matched_query: typeof item.matched_query === 'string' ? item.matched_query : ''}));
  });
  const safeExternal = searchAdapters.safeExternal || ((query) => query);
  // 두 갈래가 같은 곳을 두 번 보이지 않게: 도로명+번지(없으면 공백 뺀 주소)가 같고 이름도 같거나 한쪽 이름이 비었을 때만 같은 곳
  const addrKey = (text) => { const m = String(text || '').match(/([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/); return m ? m[1] + ' ' + m[2] : String(text || '').replace(/\s+/g, ''); };
  const placeOf = (candidate) => ({road: addrKey(candidate.address), name: String(candidate.name || '').replace(/\s+/g, '')});
  const samePlace = (a, b) => a.road === b.road && (a.name === b.name || !a.name || !b.name);
  const laneSeen = {}, laneDone = {};
  // 배달 기록 줄에 '카카오 ✓': 카카오(또는 네이버) 지도도 같은 곳을 찾았다는 표시 — 지도 검색이 실제로 돈다는 것도 보인다
  function alsoMark(row, provider) {
    const name = row && row.querySelector('.wk-res-name');
    if (!name || name.querySelector('.wk-src-also')) return;
    const also = document.createElement('span'); also.className = 'wk-src wk-src-also';
    const who = provider === 'ncp' ? '네이버' : '카카오';
    also.textContent = who + ' ✓'; also.title = who + ' 지도에도 같은 곳';
    name.appendChild(also);
  }
  // 1104 #5561·#5567·#5604: AI 풀이 갈래 — DB·지도 두 갈래가 끝나고 보인 결과가 0~1 이면 한 번만(서버에 없으면 조용히 끔)
  const aiAsked = new Map(); let aiUnsupported = false;
  const looksPrivate = (q) => /(?:\d[\s().-]*){7,}/.test(q) || /(?:010|050\d)/.test(q) || /계좌|전화|비번|비밀번호|현관|password/i.test(q);
  async function aiLane(query) {
    const box = $('ai-results'); if (!box || !query) return;
    if (aiUnsupported || looksPrivate(query)) { box.replaceChildren(); return; }
    let items = aiAsked.get(query);
    if (!items) {
      const st = document.createElement('p'); st.className = 'wk-lane-status'; st.textContent = 'AI 도 같이 찾는 중…'; box.replaceChildren(st);
      try {
        const r = await fetch('/chicken-timer/search?' + new URLSearchParams({q: query, lane: 'ai'}), {credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
        if (r.status === 400) { aiAsked.set(query, []); box.replaceChildren(); return; }   // #5628: 400 은 이 검색어만 건너뜀(다른 검색은 계속 AI)
        const body = r.ok ? await r.json() : null;
        items = body && body.ok === true && Array.isArray(body.results) ? body.results.filter((x) => x && typeof x.name === 'string' && typeof x.address === 'string') : [];
        aiAsked.set(query, items);
      } catch (_) { box.replaceChildren(); return; }
    }
    if ($('query').value.trim() !== query) return;                                  // 그사이 다른 검색
    {
      const shownHere = laneSeen[query] || {cache: [], external: []};             // DB·지도에 이미 보인 같은 곳은 빼기
      items = items.filter((x) => { const k = placeOf({name: x.name, address: x.address}); return !shownHere.cache.concat(shownHere.external).some((y) => samePlace(y.k, k)); });
      box.replaceChildren();
      if (!items.length) return;                                                    // AI 가 더 찾은 곳이 없으면 칸을 비워 둔다
      const tokens = query.split(/\s+/).filter(Boolean);
      items.slice(0, 3).forEach((x) => box.appendChild(resultRow({name: x.name, address: x.address, jibun: typeof x.jibun === 'string' ? x.jibun : '', source: 'ai',
        confirmed: false, provider: x.provider, phones: [], matched_tokens: [], matched_alias: '', ai_note: typeof x.interpreted_query === 'string' ? x.interpreted_query : typeof x.interpreted === 'string' ? x.interpreted : ''}, tokens)));
    }
  }
  // #5620 메모 갈래: 메모(고정·임시)에 적어 둔 말도 검색 — 빈칸 뺀 글에 조각이 모두 들어 있으면(최근 것 먼저 3개)
  function memoLane(query) {
    const box = $('memo-results'); if (!box) return;
    box.replaceChildren();
    if (!db || !query) return;
    const norm = (t) => String(t || '').replace(/\s+/g, '');
    const toks = query.split(/\s+/).map(norm).filter(Boolean);
    let rows = [];
    try { rows = db.list().concat(db.temporaries()); } catch (_) { return; }
    const hits = rows.filter((m) => { const t = norm([m.title, m.name_ko, m.customer_ko].join(' ')); return toks.length && toks.every((k) => t.indexOf(k) > -1); })
      .sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0)).slice(0, 3);
    if (!hits.length) return;
    const tokens = query.split(/\s+/).filter(Boolean);
    hits.forEach((m) => box.appendChild(resultRow({name: m.title || m.name_ko || String(m.customer_ko || '').slice(0, 24), address: String(m.customer_ko || ''), jibun: '',
      source: 'memo', confirmed: false, phones: [], matched_tokens: [], matched_alias: ''}, tokens)));
  }
  function settleEmpty(query) {
    const done = laneDone[query] || {};
    const finished = (lane) => done[lane] && (done[lane].state === 'ready' || done[lane].state === 'error');
    const old = panel.querySelector('[data-cache-results] > .wk-empty');
    const none = finished('cache') && finished('external') && !(done.cache.n || 0) && !(done.external.n || 0) && $('query').value.trim() === query;
    if (none && !old) {
      const empty = document.createElement('div'); empty.className = 'wk-empty';
      const head = document.createElement('strong'); head.textContent = '찾는 주소가 없어요';
      const tip = document.createElement('span'); tip.textContent = '‘삼익’처럼 이름 일부만 넣거나 도로명으로 찾아 보세요.';
      empty.appendChild(head); empty.appendChild(tip); $('cache-results').appendChild(empty);
    } else if (!none && old) old.remove();
  }
    // 1104 사장님 "주소는 구주소 신주소모두뜨게": 지번은 도로명과 같은 시·군 앞부분을 빼고 짧게 붙인다
    const shortJibun = (road, jibun) => {
      let j = String(jibun || '').trim(); if (!j || j === road) return '';
      const parts = j.split(/\s+/), roadParts = String(road || '').split(/\s+/);
      let i = 0; while (i < parts.length - 1 && i < 2 && (parts[i] === roadParts[i] || parts[i].replace(/도$/, '') === roadParts[i].replace(/도$/, ''))) i += 1;
      return parts.slice(i).join(' ');
    };
    const fullAddress = (c) => { const j = shortJibun(c.address, c.jibun); return j ? c.address + ' (' + j + ')' : c.address; };
  // 맞은 조각 강조: 빈칸으로 나눈 검색어(또는 서버가 준 matched_tokens)를 글 안에서 모두 칠한다
  function markTokens(text, tokens) {
    const frag = document.createDocumentFragment(); text = String(text || '');
    const toks = (tokens || []).map((t) => String(t || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    let i = 0;
    while (i < text.length) {
      let best = -1, bestTok = '';
      toks.forEach((t) => { const at = text.indexOf(t, i); if (at > -1 && (best < 0 || at < best)) { best = at; bestTok = t; } });
      if (best < 0) { frag.appendChild(document.createTextNode(text.slice(i))); break; }
      if (best > i) frag.appendChild(document.createTextNode(text.slice(i, best)));
      const m = document.createElement('mark'); m.textContent = text.slice(best, best + bestTok.length); frag.appendChild(m);
      i = best + bestTok.length;
    }
    return frag;
  }
  // 전화번호 강조: 숫자 조각은 하이픈·빈칸을 건너 숫자끼리 맞춘다(어느 자리든)
  function markPhone(phone, tokens) {
    const s = String(phone || ''), frag = document.createDocumentFragment();
    const digits = (tokens || []).map((t) => String(t).replace(/\D/g, '')).filter((t) => t.length >= 2);
    const pos = []; for (let k = 0; k < s.length; k++) if (/\d/.test(s[k])) pos.push(k);
    const only = pos.map((k) => s[k]).join(''), hit = new Array(s.length).fill(false);
    digits.forEach((d) => { let from = 0, at; while ((at = only.indexOf(d, from)) > -1) { for (let k = at; k < at + d.length; k++) hit[pos[k]] = true; from = at + 1; } });
    let buf = '', on = false;
    const flush = () => { if (!buf) return; if (on) { const m = document.createElement('mark'); m.textContent = buf; frag.appendChild(m); } else frag.appendChild(document.createTextNode(buf)); buf = ''; };
    for (let k = 0; k < s.length; k++) { const h = hit[k] || (!/\d/.test(s[k]) && !!hit[k - 1] && !!hit[k + 1]); if (h !== on) { flush(); on = h; } buf += s[k]; }
    flush(); return frag;
  }
  const monthDay = (v) => {   // epoch 초(숫자) 또는 ISO 글자 → 'MM-DD'(기기 시간대)
    if (Number.isFinite(v) && v > 0) { const d = new Date(v * 1000); return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    const m = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[2] + '-' + m[3] : '';
  };
  // 결과 한 줄(DB·지도·AI 같은 모양) — 1104 사장님 "주소가 메인 … 버튼은 작게" + 통합 검색(별명·전화·원문)
  function resultRow(candidate, tokens) {
    const row = document.createElement('div'); row.className = 'work-search-result';
    const top = document.createElement('div'); top.className = 'wk-res-top';
    const displayName = candidate.name || candidate.address;
    const name = document.createElement('strong'); name.className = 'wk-res-name'; name.appendChild(markTokens(displayName, tokens));
    const src = document.createElement('span'); let cls = 'wk-src', label, tip;
    if (candidate.source === 'ai') { cls += ' wk-src-ai'; label = 'AI 추정'; tip = 'AI 가 말을 풀어 지도로 다시 찾은 곳 — 배달 기록 없음'; }
    else if (candidate.source === 'memo') { cls += ' wk-src-memo'; label = '메모'; tip = '메모에 적어 둔 것'; }
    else if (candidate.source === 'naver') {
      cls += ' wk-src-map';
      label = candidate.provider === 'ncp' ? '네이버 지도' : candidate.provider === 'kakao' ? '카카오 지도' : '지도';
      tip = label + ' 검색 — 우리 가게 배달 기록 없음';
    }
    else if (Number.isFinite(candidate.uses) && candidate.uses >= 3) { cls += ' wk-src-hi'; label = '배달 ' + candidate.uses + '회'; tip = '우리 가게 배달 기록 ' + candidate.uses + '회'; }
    else if (Number.isFinite(candidate.uses) && candidate.uses > 0) { label = '배달 ' + candidate.uses + '회'; tip = '배달 기록이 적음'; }
    else { if (candidate.confirmed) cls += ' wk-src-hi'; label = candidate.confirmed ? '확인됨' : 'DB'; tip = candidate.confirmed ? '배달 기록으로 확인된 주소' : '배달 DB 기록'; }
    src.className = cls; src.textContent = label; src.title = tip; name.appendChild(src);
    if (candidate.matched_alias) { const al = document.createElement('span'); al.className = 'wk-alias'; al.textContent = '‘' + candidate.matched_alias + '’으로 찾음'; name.appendChild(al); }
    if (candidate.ai_note) { const an = document.createElement('span'); an.className = 'wk-alias wk-ai-note'; an.textContent = 'AI 풀이 ‘' + candidate.ai_note + '’'; name.appendChild(an); }
    const acts = document.createElement('span'); acts.className = 'wk-res-acts';
    const address = document.createElement('span'); address.className = 'wk-res-addr';
    const addressText = String(candidate.address || '');
    const nameText = String(candidate.name || '').trim();
    const comparable = (value) => value.replace(/[\s()（）]/g, '');
    const duplicateAddress = !!nameText && !!addressText && comparable(nameText) === comparable(addressText);
    if (!duplicateAddress) address.appendChild(markTokens(addressText, tokens));
    const jibunText = shortJibun(candidate.address, candidate.jibun);
    const add = document.createElement('button'); add.type = 'button'; add.className = 'wk-add'; add.textContent = '메모로';
    add.setAttribute('aria-label', (candidate.name || candidate.address) + ' 메모로 옮기기'); add.title = '메모로 옮기기';
    add.addEventListener('click', () => {
      newMemo(candidate.name, fullAddress(candidate), true, 'selected_result', candidate.name, false);
      add.textContent = '✓'; row.classList.add('wk-copied'); setTimeout(() => { add.textContent = '메모로'; row.classList.remove('wk-copied'); }, 1200);
    });
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'wk-copy'; copy.textContent = '복사';
    copy.setAttribute('aria-label', (candidate.name || candidate.address) + ' 주소 복사'); copy.title = '주소 복사';
    copy.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (await copyListText(fullAddress(candidate))) { copy.textContent = '✓'; setTimeout(() => { copy.textContent = '복사'; }, 1200); }
    });
    acts.appendChild(copy); if (candidate.source !== 'memo') acts.appendChild(add);   // 메모 결과는 이미 메모라 '메모로' 없음
    top.appendChild(name);
    const dongHo = [candidate.dong && !/동$/.test(candidate.dong) ? candidate.dong + '동' : candidate.dong, candidate.ho && !/호$/.test(candidate.ho) ? candidate.ho + '호' : candidate.ho].filter(Boolean).join(' ');
    if (dongHo && (duplicateAddress || addressText.indexOf(dongHo) < 0)) {
      if (!duplicateAddress && addressText) address.appendChild(document.createTextNode(' · '));
      address.appendChild(markTokens(dongHo, tokens));
    }
    row.appendChild(top);
    if (!duplicateAddress || dongHo) row.appendChild(address);
    if (jibunText) { const j = document.createElement('span'); j.className = 'wk-jibun'; j.appendChild(markTokens('지번 ' + jibunText, tokens)); row.appendChild(j); }
    row.appendChild(acts);
    const phones = candidate.phones || [];
    if (phones.length || candidate.last_delivery_at || candidate.last_seen_at) {   // 1104 사장님 "번호도 원문베이스로": 전화(맞은 숫자 강조)·최근 배달
      const ph = document.createElement('span'); ph.className = 'wk-phone';
      if (phones.length) { ph.appendChild(document.createTextNode('☎ ')); ph.appendChild(markPhone(phones[0], tokens)); if (phones.length > 1) ph.appendChild(document.createTextNode(' 외 ' + (phones.length - 1))); }
      const md = monthDay(candidate.last_delivery_at), ms = md ? '' : monthDay(candidate.last_seen_at);
      if (md) ph.appendChild(document.createTextNode((phones.length ? ' · ' : '') + '최근 배달 ' + md));
      else if (ms) ph.appendChild(document.createTextNode((phones.length ? ' · ' : '') + '최근 기록 ' + ms));
      row.appendChild(ph);
    }
    if (candidate.raw_line) {   // 원문 한 줄 펼쳐 보기(줄을 눌러 메모로 옮기는 것과 따로)
      const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'wk-rawbtn'; rb.textContent = '원문 ▾';
      const rl = document.createElement('span'); rl.className = 'wk-rawline'; rl.hidden = true; rl.appendChild(markTokens(candidate.raw_line, tokens));
      rb.addEventListener('click', (event) => { event.stopPropagation(); rl.hidden = !rl.hidden; rb.textContent = rl.hidden ? '원문 ▾' : '원문 ▴'; });
      row.appendChild(rb); row.appendChild(rl);
    }
    return row;
  }
  const renderedQuery = {}, laneStatus = {};
  const searcher = window.NotebookWorkSearch && window.NotebookWorkSearch.create({
    cacheSearch,
    externalSearch, safeExternal,
    onChange(update) {
      if (update.state !== 'ready' && laneSeen[update.query]) laneSeen[update.query][update.lane] = [];   // 다시 찾을 때 옛 줄과 겹침 판정 안 함
      if (update.lane === 'cache' && update.state === 'pending') { const ai = $('ai-results'); if (ai) ai.replaceChildren(); }
      const target = $(update.lane + '-results');
      const statusText = update.lane === 'cache'
        ? ({pending:'찾는 중…', ready:''}[update.state] || '')
        : ({pending:'카카오 지도에서도 찾는 중…', error:'카카오 지도 검색이 안 돼요 — 배달 기록만 보여요'}[update.state] || '');
      if (update.state !== 'ready' && renderedQuery[update.lane] === update.query && laneStatus[update.lane]) {
        laneStatus[update.lane].textContent = statusText;
        return;
      }
      target.replaceChildren();
      const title = document.createElement('p'); title.className = 'wk-lane-status' + (update.state === 'error' ? ' wk-err' : '');
      title.textContent = statusText; laneStatus[update.lane] = title;
      target.appendChild(title);
      const mark = (n) => { (laneDone[update.query] = laneDone[update.query] || {})[update.lane] = {state: update.state, n}; settleEmpty(update.query); };
      if (update.state !== 'ready' || !Array.isArray(update.result)) { mark(0); return; }
      renderedQuery[update.lane] = update.query;
      if (update.lane === 'cache' && Number.isFinite(update.result.backupFileMtime)) {
        $('search-status').textContent = '';
      }
      const seen = (laneSeen[update.query] = laneSeen[update.query] || {cache: [], external: []});
      const isDb = update.lane === 'cache';
      const mine = [], alsoOnMap = [];
      const shown = update.result.filter((candidate) => candidate && typeof candidate.name === 'string' && typeof candidate.address === 'string')
        .filter((candidate) => {
          const k = placeOf(candidate);
          if (mine.some((x) => samePlace(x.k, k))) return false;
          if (!isDb) {
            const db = seen.cache.find((x) => samePlace(x.k, k));
            if (db) { alsoMark(db.row, candidate.provider); return false; }   // 배달 기록 줄에 합침
          } else {
            const map = seen.external.find((x) => samePlace(x.k, k));
            if (map) { map.row.remove(); seen.external = seen.external.filter((x) => x !== map); alsoOnMap.push([k, map.provider]); }
          }
          mine.push({k}); return true;
        })
        .slice(0, isDb ? 20 : 3);
      mark(shown.length);
      if (!shown.length) {
        seen[update.lane] = [];
        if (!isDb && update.result.length === 0) { title.textContent = '카카오 지도: 더 찾은 곳 없음'; return; }
        if (!title.textContent) target.replaceChildren();
        return;
      }
      seen[update.lane] = [];
      const qTokens = String(update.query || '').trim().split(/\s+/).filter(Boolean);
      let partialShown = false, similarShown = false;
      shown.forEach((candidate) => {
        if (isDb && candidate.match_kind === 'partial' && !partialShown) {   // 여러 조각 중 일부만 맞은 기록은 아래로
          partialShown = true; const ph = document.createElement('p'); ph.className = 'wk-partial'; ph.textContent = '일부만 맞음'; target.appendChild(ph);
        }
        if (candidate.match_kind === 'similar' && !similarShown) {             // 0건 → 서버가 말을 나눠 찾은 비슷한 곳
          similarShown = true; const sh = document.createElement('p'); sh.className = 'wk-partial';
          sh.textContent = candidate.matched_query ? '‘' + candidate.matched_query + '’(으)로 찾은 비슷한 곳' : '비슷한 곳'; target.appendChild(sh);
        }
        const row = resultRow(candidate, candidate.matched_tokens && candidate.matched_tokens.length ? candidate.matched_tokens : qTokens);
        target.appendChild(row);
        const k = placeOf(candidate);
        seen[update.lane].push({k, row, provider: candidate.provider});
        if (isDb) alsoOnMap.filter(([mk]) => samePlace(mk, k)).forEach(([, provider]) => alsoMark(row, provider));
      });
      if (isDb && Number.isInteger(update.result.next_offset)) {   // 더 보기(서버가 다음 쪽이 있다고 할 때만)
        const more = document.createElement('button'); more.type = 'button'; more.className = 'wk-more-results'; more.textContent = '더 보기';
        let offset = update.result.next_offset;
        more.addEventListener('click', async () => {
          more.disabled = true; more.textContent = '불러오는 중…';
          try {
            const r = await fetch('/chicken-timer/search?' + new URLSearchParams({q: update.query, lane: 'db', offset: String(offset)}), {credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
            const body = r.ok ? await r.json() : null;
            const items = body && body.ok === true && Array.isArray(body.results) ? body.results.map(mapDbItem) : [];
            items.forEach((c) => target.insertBefore(resultRow(c, c.matched_tokens.length ? c.matched_tokens : qTokens), more));
            if (body && Number.isInteger(body.next_offset) && body.next_offset > offset) { offset = body.next_offset; more.disabled = false; more.textContent = '더 보기'; }
            else more.remove();
          } catch (_) { more.disabled = false; more.textContent = '더 보기(다시)'; }
        });
        target.appendChild(more);
      }
      if (update.lane === 'cache') { const foot = document.createElement('p'); foot.className = 'wk-foot'; foot.textContent = '줄을 누르면 메모로 옮겨져요'; target.appendChild(foot); }
      settleEmpty(update.query);
    }
  });
  $('query').addEventListener('input', () => { if (searcher) searcher.invalidate($('query').value); selected = null; $('selected-actions').hidden = true; });
  $('stage-query').addEventListener('click', () => {
    const text = $('query').value;
    if (!text.trim()) { $('search-status').textContent = '임시로 담을 주소를 입력해 주세요'; return; }
    newMemo('입력 주소', text, true, 'address_input', undefined, false);
  });
  $('stage-selection').addEventListener('click', () => { if (selected) newMemo(selected.candidate.name, selected.candidate.address, true, 'selected_result', selected.candidate.name); });
  $('copy-selection').addEventListener('click', async () => {
    if (!selected || !$('selected-customer').value) return;
    try { await copyText($('selected-customer').value); $('feedback-status').textContent = '고객 한국어 주소를 복사했습니다'; }
    catch (_) { $('selected-customer').focus(); $('selected-customer').select(); $('feedback-status').textContent = '복사하지 못했습니다. 선택된 주소를 직접 복사해 주세요.'; }
  });
  async function sendFeedback(intent) {
    try {
      const result = await privateRequest('/notebook-work/feedback', intent.payload);
      if (pendingFeedback !== intent) return;
      pendingFeedback = null;
      if (selected !== intent.selection) { $('retry-feedback').hidden = true; return; }
      selected.candidate.feedback_revision = result.revision;
      $('retry-feedback').hidden = true; $('feedback-status').textContent = '확인 내용을 저장했습니다';
      searcher.refreshCache(intent.selection.query, intent.selection.generation);
    } catch (_) {
      if (pendingFeedback !== intent) return;
      $('retry-feedback').hidden = false; $('feedback-status').textContent = '저장 결과를 확인할 수 없습니다';
    }
  }
  function feedback(action) {
    if (!selected || pendingFeedback || !selected.candidate.id || !window.crypto || typeof window.crypto.randomUUID !== 'function') return;
    const payload = {query:selected.query, id:selected.candidate.id, action,
      revision:selected.candidate.feedback_revision || 0, event_id:window.crypto.randomUUID()};
    if (action === 'correct') { payload.alias = $('correction').value.trim(); if (!payload.alias) return; }
    pendingFeedback = {selection:selected, payload}; $('feedback-status').textContent = '저장 중';
    sendFeedback(pendingFeedback);
  }
  ['confirm','reject','undo','correct'].forEach((action) => $(action).addEventListener('click', () => feedback(action)));
  $('retry-feedback').addEventListener('click', () => { if (pendingFeedback) sendFeedback(pendingFeedback); });
  let queryComposing = false;
  $('query').addEventListener('compositionstart', () => { queryComposing = true; });
  $('query').addEventListener('compositionend', () => { queryComposing = false; });
  // 윈도 한글 입력: 조합 중 누른 Enter(keyCode 229)는 글자만 확정한다 → 그 Enter 를 기억해 두었다가 키를 뗄 때 검색 한 번
  const isEnterKey = (event) => event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
  let queryEnterPending = false;
  $('query').addEventListener('keydown', (event) => {
    if (!isEnterKey(event)) return;
    if (event.isComposing || queryComposing || event.keyCode === 229) { queryEnterPending = true; return; }
    event.preventDefault(); queryEnterPending = false;
    $('search').click();
  });
  $('query').addEventListener('keyup', (event) => {
    if (!isEnterKey(event) || !queryEnterPending) return;
    queryEnterPending = false;
    $('search').click();
  });
  $('search').addEventListener('click', () => {
    if (!searcher || !$('query').value.trim()) { $('search-status').textContent = '검색어를 입력해 주세요'; return; }
    $('selection').textContent = '';
    selected = null; $('selected-actions').hidden = true;
    $('search-status').textContent = '';
    searchGeneration = typeof searchAdapters.generation === 'function' ? searchAdapters.generation() : null;
    searcher.search($('query').value, searchGeneration);
    aiLane($('query').value.trim());   // 1104 사장님 "ai는 비동기로 동시 돌려": DB·지도와 같이 바로(기다리지 않음)
    memoLane($('query').value.trim());   // #5620: 메모에 적어 둔 장소·별명도 다음 검색에서 찾힌다
  });
  try {
    const view = JSON.parse(window.localStorage.getItem(viewKey));
    if (view && ['fixed','temporary'].includes(view.kind)) {
      kind = view.kind;
      if (view.id && db) current = kind === 'temporary' ? db.temporary(view.id) : db.drafts().find((x) => x.id === view.id) || db.list().find((x) => x.id === view.id);
    }
  } catch (_) { report('마지막 선택을 복원하지 못했습니다. 기존 자료를 보존합니다.'); }
  fill();
  if (typeof window.addEventListener === 'function') window.addEventListener('storage', (event) => { if (event.key && event.key.startsWith('notebook-work:')) draw(); });
  let memoScroll = 0;
  function showTimer() {
    memoScroll = panel.scrollTop || 0;
    panel.hidden = true; timerBar.hidden = false; board.hidden = false;
    // Reuse the application's existing resize renderer after un-hiding its
    // original DOM; no start/restore/clear/store method is invoked here.
    if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') window.dispatchEvent(new Event('resize'));
  }
  function showMemo() {
    board.hidden = true; timerBar.hidden = true; panel.hidden = false; draw(); refreshHistorySource();
    panel.scrollTop = memoScroll;
  }
  let historySource = null, historyObserver = null, historyText = null, historyRows = [];
  function renderHistory() {
    if (!historySource) { $('history').textContent = ''; if ($('history').parentNode) $('history').parentNode.hidden = true; return; }
    // Copy only known text cells from the existing log list. Recovery/sync
    // controls and source nodes stay in their original board unchanged.
    const sourceRows = Array.from(historySource.children).filter((row) => row.tagName === 'LI').slice(0, 1); if ($('history').parentNode) $('history').parentNode.hidden = !sourceRows.length;
    const rows = sourceRows.map((row) =>
      ['.log-title','.log-status','.log-time'].map((name) => {
        const cell = row.querySelector(name); return cell ? cell.textContent : '';
      }).filter(Boolean).join(' · '));
    const text = JSON.stringify(rows);
    if (text === historyText) return;
    historyText = text;
    if (rows.length && sourceRows.length === historyRows.length && sourceRows.every((row, i) => row === historyRows[i])
        && $('history').children.length === rows.length) {
      // Keep the focused/clicked projection node through the log's time ticks.
      rows.forEach((text, i) => { $('history').children[i].textContent = text; });
      return;
    }
    historyRows = sourceRows; $('history').replaceChildren();
    if (!rows.length) { $('history').textContent = ''; return; }
    rows.forEach((text) => {
      const item = document.createElement('button'); item.type = 'button';
      item.className = 'work-history-item'; item.textContent = text;
      item.addEventListener('click', showTimer); $('history').appendChild(item);
    });
  }
  function refreshHistorySource() {
    const source = board.querySelector('#board-log > ol');
    if (source !== historySource) {
      if (historyObserver) historyObserver.disconnect();
      historySource = source; historyText = null;
      if (source) {
        historyObserver = new MutationObserver(renderHistory);
        historyObserver.observe(source, {childList:true, characterData:true, subtree:true});
      }
      renderHistory();
    }
  }
  button.addEventListener('click', showMemo);
  $('back').addEventListener('click', showTimer);
  $('urgent').addEventListener('click', () => { showTimer(); timerAlert.click(); });
  showMemo();
  share.start();
})();
