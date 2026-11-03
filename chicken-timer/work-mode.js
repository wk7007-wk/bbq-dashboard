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
    '<div class="work-columns"><section class="work-search"><div class="work-search-line"><label class="wk-field"><svg class="wk-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><span class="work-sr-only">건물 이름이나 주소 일부</span><input data-query autocomplete="off" enterkeyhint="search" placeholder="건물·주소 일부 검색"><kbd class="wk-kbd">Enter</kbd></label><button type="button" class="wk-stage" data-stage-query title="입력한 글자를 그대로 메모에 담기">+ 담기</button><button type="button" class="work-sr-only" data-search tabindex="-1">검색</button></div><p data-search-status aria-live="polite"></p><div data-cache-results></div><div data-external-results></div><p data-selection></p><div data-selected-actions hidden><label>고객용 한국어 주소<textarea data-selected-customer readonly></textarea></label><div class="work-actions"><button type="button" data-copy-selection>고객 한국어 복사</button><button type="button" data-stage-selection>선택값 임시 담기</button></div><div><button type="button" data-confirm>맞음</button><button type="button" data-reject>아님</button><button type="button" data-undo>되돌림</button></div><label>주소 수정<input data-correction></label><button type="button" data-correct>수정 반영</button><button type="button" data-retry-feedback hidden>처리 확인 재시도</button><p data-feedback-status role="status"></p></div></section><div class="work-workspace"><aside class="work-records" aria-label="최근 타이머 기록"><div data-history class="work-history-list"></div></aside>' +
    '<section class="work-memos"><div class="wk-memo-head"><div class="wk-kind" role="group" aria-label="메모 종류"><button type="button" data-temporary aria-pressed="false">임시 메모</button><button type="button" data-fixed aria-pressed="true">자주 쓰는 문구</button></div><button type="button" class="wk-new" data-new>+ 새 메모</button></div><div class="work-fixed-chips" data-fixed-chips></div><div data-batch hidden><p>목록 순서로 복사 · 카드 안에서는 이름, 주소/문구 순서 · 값 사이는 줄바꿈</p><div class="work-actions"><button type="button" data-copy-batch disabled>선택값 복사 (0)</button><button type="button" data-unselect>선택 해제</button></div><div data-list-manual hidden><label>선택한 한국어 값 · 수동 복사<textarea data-list-manual-text readonly></textarea></label><button type="button" data-list-manual-select>문구 전체 선택</button></div></div><details class="work-help"><summary>직원 사용 안내 · 한국어 / Tiếng Việt / 日本語</summary><div class="work-help-languages"><section lang="ko"><h3>한국어</h3><p>주소·건물명을 입력하거나 검색 결과를 임시 카드에 담습니다. 필요한 값만 선택해 복사한 뒤 포스에 붙여넣습니다. 자주 쓰는 문구는 고정으로 저장합니다. ‘기록’은 타이머를 열고 ‘메모로’는 이 화면으로 돌아옵니다. 주소검색은 매장 연결에서 사용할 수 있습니다.</p></section><section lang="vi"><h3>Tiếng Việt</h3><p>Nhập địa chỉ hoặc tên tòa nhà, rồi thêm vào thẻ tạm. Khi có kết quả tìm kiếm, bạn cũng có thể lưu giá trị đã chọn. Chỉ chọn các giá trị cần dùng, sao chép rồi dán vào POS. Lưu câu thường dùng vào ghi chú cố định. Nhấn “기록” để mở bộ hẹn giờ, nhấn “메모로” để quay lại. Tìm kiếm địa chỉ chỉ dùng trong kết nối của cửa hàng.</p></section><section lang="ja"><h3>日本語</h3><p>住所・建物名の入力値や選択した検索結果を一時カードに保存します。必要な値だけを選んでコピーし、POSに貼り付けます。よく使う文章は固定メモに保存します。「기록」でタイマーを開き、「메모로」でメモに戻ります。住所検索は店舗の接続から利用できます。</p></section></div></details><div data-list class="work-list"></div><div data-editor hidden><p data-current-kind></p>' +
    '<label>제목<input data-title></label><label data-name-label hidden>이름 / 건물명<input data-name></label><label>주소·문구<textarea data-customer></textarea></label>' +
    '<details class="work-staff"><summary>직원 설명 · 한국어 / Tiếng Việt / 日本語</summary><div class="work-languages">' +
    '<div><label>한국어<textarea data-ko></textarea></label><button type="button" data-copy-ko>직원 한국어 복사</button></div>' +
    '<div><label>베트남어<textarea data-vi></textarea></label><button type="button" data-copy-vi>직원 베트남어 복사</button></div>' +
    '<div><label>일본어<textarea data-ja></textarea></label><button type="button" data-copy-ja>직원 일본어 복사</button></div></div>' +
    '<button type="button" data-copy-all>직원 세 언어 복사</button><div data-manual hidden><label>직원 설명 · 수동 복사<textarea data-manual-text readonly></textarea></label><button type="button" data-manual-select>직원 문구 전체 선택</button></div></details>' +
    '<div class="work-actions"><button type="button" class="wk-primary" data-save>저장</button><button type="button" data-copy>복사</button><button type="button" data-pin hidden>자주 쓰는 문구로</button><button type="button" data-clear hidden>지우기</button></div><div data-clear-confirm hidden><p>이 임시 메모만 지웁니다.</p><div class="work-actions"><button type="button" class="wk-danger" data-clear-now>지우기</button><button type="button" data-clear-cancel>취소</button></div></div></div><p data-status role="status"></p></section></div></div>';
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
  function draw() {
    if (!db) return;
    let list, drafts;
    try { list = kind === 'temporary' ? db.temporaries() : db.list(); drafts = kind === 'temporary' ? [] : db.drafts(); }
    catch (_) { $('list').replaceChildren(); report('저장 자료를 읽을 수 없습니다. 기존 자료를 보존합니다.'); return; }
    $('fixed-chips').replaceChildren();
    try { db.list().forEach((item) => {
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'work-fixed-chip';
      chip.textContent = item.title || item.customer_ko || '고정 메모';
      chip.title = '누르면 복사';
      chip.addEventListener('click', async () => {
        if (typeof item.customer_ko === 'string' && item.customer_ko.length) {
          if (await copyListText(item.customer_ko)) { chip.classList.add('wk-copied'); setTimeout(() => chip.classList.remove('wk-copied'), 1400); }
          return;
        }
        if (!capture()) return;
        try { kind = 'fixed'; current = db.drafts().find((x) => x.id === item.id) || db.list().find((x) => x.id === item.id); editing = true; fill(); draw(); rememberView(); }
        catch (_) { report('항목을 읽지 못했습니다. 기존 원문을 보존합니다.'); }
      }); $('fixed-chips').appendChild(chip);
    }); } catch (_) { report('고정 메모를 읽지 못했습니다. 기존 자료를 보존합니다.'); }
    const known = new Set(list.map((x) => x.id));
    list = list.concat(drafts.filter((x) => x && !known.has(x.id)));
    $('batch').hidden = kind !== 'temporary';
    if (kind === 'temporary') {
      picks.forEach((pick, id) => {
        const entry = list.find((x) => x.id === id);
        if (!entry || entry.revision !== pick.revision) invalidatePick(id);
      });
    }
    $('list').replaceChildren();
    list.forEach((entry) => {
      function edit() {
        if (!capture()) return;
        try { current = kind === 'temporary' ? db.temporary(entry.id) : db.drafts().find((x) => x.id === entry.id) || db.list().find((x) => x.id === entry.id); editing = true; fill(); rememberView(); }
        catch (_) { report('항목을 읽지 못했습니다. 편집 내용을 보존합니다.'); }
      }
      if (kind !== 'temporary') {
        const node = document.createElement('button'); node.type = 'button';
        node.textContent = (entry.title || '제목 없는 메모') + (entry.customer_ko ? '\n' + entry.customer_ko : '');
        node.className = 'wk-fixed-row';
        node.addEventListener('click', edit); $('list').appendChild(node); return;
      }
      const card = document.createElement('article');
      card.setAttribute('data-temp-card', entry.id);
      card.className = 'wk-card';
      const primary = document.createElement('button'); primary.type = 'button'; primary.className = 'work-card-copy';
      primary.setAttribute('data-copy-address', entry.id);
      const heading = document.createElement('strong'); heading.className='work-card-name'; heading.textContent = entry.name_ko || entry.title || '임시 메모'; primary.appendChild(heading);
      const address = document.createElement('span'); address.className='work-card-address'; address.textContent=entry.customer_ko || ''; primary.appendChild(address);
      const copyState = document.createElement('span'); copyState.className='work-card-state'; primary.appendChild(copyState);
      primary.addEventListener('click', async () => {
        try {
          const latest = db.temporary(entry.id);
          if (!latest || latest.revision !== entry.revision) { draw(); report('항목이 바뀌었습니다. 현재 값을 확인한 뒤 다시 복사해 주세요.'); return; }
          if (await copyListText(entry.customer_ko || '')) { copyState.textContent = '✓ 복사됨'; card.classList.add('wk-copied'); setTimeout(() => { card.classList.remove('wk-copied'); copyState.textContent = ''; }, 1600); }
        } catch (_) { report('항목을 읽지 못했습니다. 기존 원문을 보존합니다.'); }
      }); card.appendChild(primary);
      const options = document.createElement('details'); options.className='work-card-options';
      const summary = document.createElement('summary'); summary.textContent='선택·복사'; options.appendChild(summary);
      const actions = document.createElement('div'); actions.className = 'work-actions';
      actions.setAttribute('style', 'margin-top:8px');
      function valueRow(field, label) {
        const text = typeof entry[field] === 'string' ? entry[field] : '';
        if (!text.length) return;
        const row = document.createElement('label');
        row.setAttribute('style', 'display:flex;align-items:center;gap:8px;min-height:44px;margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere');
        const check = document.createElement('input'); check.type = 'checkbox';
        check.setAttribute('data-pick', field);
        check.setAttribute('style', 'width:44px;height:44px;flex:0 0 44px;margin:0');
        check.setAttribute('aria-label', label + ' 선택');
        check.checked = !!(picks.get(entry.id) && picks.get(entry.id).fields.has(field));
        check.addEventListener('change', () => {
          const pick = picks.get(entry.id) || {revision: entry.revision, fields: new Set()};
          if (check.checked) pick.fields.add(field); else pick.fields.delete(field);
          if (pick.fields.size) picks.set(entry.id, pick); else picks.delete(entry.id);
          $('list-manual').hidden = true; selectionStatus();
        });
        const preview = document.createElement('span'); preview.textContent = label + '\n' + text;
        row.appendChild(check); row.appendChild(preview); options.appendChild(row);
        const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = label + ' 복사';
        copy.setAttribute('data-copy-field', field);
        copy.addEventListener('click', async () => {
          try {
            const latest = db.temporary(entry.id);
            if (!latest || latest.revision !== entry.revision) { draw(); report('항목이 바뀌었습니다. 현재 값을 확인한 뒤 다시 복사해 주세요.'); return; }
            await copyListText(text);
          } catch (_) { report('항목을 읽지 못했습니다. 기존 원문을 보존합니다.'); }
        });
        actions.appendChild(copy);
      }
      valueRow('name_ko', '이름 / 건물명');
      valueRow('customer_ko', '주소 / 문구');
      options.appendChild(actions); card.appendChild(options);
      const open = document.createElement('button'); open.type = 'button'; open.className = 'wk-more'; open.textContent = '⋯'; open.setAttribute('aria-label', '편집·지우기'); open.title = '편집·지우기';
      open.setAttribute('data-edit-temp', entry.id); open.addEventListener('click', edit); actions.appendChild(open);
      card.appendChild(open); $('list').appendChild(card);
    });
    selectionStatus();
  }
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
    $('current-kind').textContent = kind === 'temporary' ? '임시 메모 · 이 기기에 자동 보관' : '자주 쓰는 문구';
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
  const cacheSearch = searchAdapters.cacheSearch || (async (query) => {
    const endpoint = '/chicken-timer/search';
    const note = (text) => { if ($('query').value.trim() === String(query).trim()) $('search-status').textContent = text; };
    try {
      // Verify the existing permitted source before sending an address.
      // No PIN/token is read from storage, placed in a URL, or issued here.
      const probe = await fetch(endpoint, {credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
      if (probe.status === 401) {
        note('매장 연결 상태를 확인한 뒤 다시 검색해 주세요');
        throw new Error('address access denied');
      }
      if (!probe.ok) throw new Error('address unavailable');
      const capability = await probe.json();
      if (capability.ok !== true || capability.address_search !== true) throw new Error('invalid capability');
      const response = await fetch(endpoint + '?' + new URLSearchParams({q: query}),
        {credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
      if (response.status === 401) {
        note('매장 연결 상태를 확인한 뒤 다시 검색해 주세요');
        throw new Error('address access denied');
      }
      if (response.status === 502) throw new Error('address lookup unresolved');
      if (!response.ok) throw new Error('address lookup failed');
      const body = await response.json();
      if (body.ok !== true || !Array.isArray(body.results)) throw new Error('invalid address result');
      const results = body.results.map((item) => {
        if (!item || typeof item.name !== 'string' || typeof item.address !== 'string' ||
            !['db', 'naver'].includes(item.source) || typeof item.confirmed !== 'boolean') throw new Error('invalid address');
        return {name: item.name, address: item.address, source: item.source, confirmed: item.confirmed};
      });
      note('');
      return results;
    } catch (error) {
      if (error.message === 'address lookup unresolved') note('못 찾았어요 — 이름 일부(예: 삼익)나 도로명으로 다시 찾아 보세요');
      else if (error.message !== 'address access denied') note('주소검색 연결을 확인한 뒤 다시 시도해 주세요');
      throw error;
    }
  });
  const renderedQuery = {}, laneStatus = {};
  const searcher = window.NotebookWorkSearch && window.NotebookWorkSearch.create({
    cacheSearch,
    externalSearch: searchAdapters.externalSearch, safeExternal: searchAdapters.safeExternal,
    onChange(update) {
      const target = $(update.lane + '-results');
      if (update.lane === 'external' && typeof searchAdapters.externalSearch !== 'function') { target.replaceChildren(); return; }
      const statusText = update.lane === 'cache'
        ? ({pending:'찾는 중…', ready:''}[update.state] || '')
        : '외부 보완 · ' + ({pending:'확인 중', ready:'결과', error:'연결 미확인'}[update.state] || '미확인');
      if (update.state !== 'ready' && renderedQuery[update.lane] === update.query && laneStatus[update.lane]) {
        laneStatus[update.lane].textContent = statusText;
        return;
      }
      target.replaceChildren();
      const title = document.createElement('p'); title.className = 'wk-lane-status' + (update.state === 'error' ? ' wk-err' : '');
      title.textContent = statusText; laneStatus[update.lane] = title;
      target.appendChild(title);
      if (update.state !== 'ready' || !Array.isArray(update.result)) return;
      renderedQuery[update.lane] = update.query;
      if (update.lane === 'cache' && Number.isFinite(update.result.backupFileMtime)) {
        $('search-status').textContent = '';
      }
      const shown = update.result.slice(0, 3).filter((candidate) => candidate && typeof candidate.name === 'string' && typeof candidate.address === 'string');
      if (update.lane === 'cache' && !shown.length) {
        const empty = document.createElement('div'); empty.className = 'wk-empty';
        const head = document.createElement('strong'); head.textContent = '찾는 주소가 없어요';
        const tip = document.createElement('span'); tip.textContent = '‘삼익’처럼 이름 일부만 넣거나 도로명으로 찾아 보세요.';
        empty.appendChild(head); empty.appendChild(tip); target.appendChild(empty); return;
      }
      const marked = (text) => {
        const frag = document.createDocumentFragment(), q = String(update.query || '').trim();
        const at = q ? text.indexOf(q) : -1;
        if (at < 0) { frag.appendChild(document.createTextNode(text)); return frag; }
        frag.appendChild(document.createTextNode(text.slice(0, at)));
        const hit = document.createElement('mark'); hit.textContent = text.slice(at, at + q.length); frag.appendChild(hit);
        frag.appendChild(document.createTextNode(text.slice(at + q.length))); return frag;
      };
      shown.forEach((candidate) => {
        const row = document.createElement('div'); row.className = 'work-search-result';
        const label = document.createElement('span'); label.className = 'work-result-label';
        const name = document.createElement('strong'); name.appendChild(marked(candidate.name || candidate.address));
        if (candidate.source === 'db' || candidate.source === 'naver') {
          const src = document.createElement('span'); src.className = 'wk-src' + (candidate.source === 'naver' ? ' wk-src-map' : '');
          src.textContent = candidate.source === 'db' ? 'DB' : '지도'; name.appendChild(src);
        }
        const address = document.createElement('span'); address.textContent = candidate.address;
        label.appendChild(name); label.appendChild(address);
        const add = document.createElement('button'); add.type = 'button'; add.className = 'wk-add'; add.textContent = '+';
        add.setAttribute('aria-label', (candidate.name || candidate.address) + ' 메모에 담기'); add.title = '메모에 담기';
        add.addEventListener('click', () => newMemo(candidate.name, candidate.address, true, 'selected_result', candidate.name, false));
        row.appendChild(label); row.appendChild(add); target.appendChild(row);
      });
      if (update.lane === 'cache') { const foot = document.createElement('p'); foot.className = 'wk-foot'; foot.textContent = '줄을 누르면 메모에 담겨요'; target.appendChild(foot); }
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
  $('query').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || queryComposing || event.keyCode === 229) return;
    event.preventDefault();
    $('search').click();
  });
  $('search').addEventListener('click', () => {
    if (!searcher || !$('query').value.trim()) { $('search-status').textContent = '검색어를 입력해 주세요'; return; }
    $('selection').textContent = '';
    selected = null; $('selected-actions').hidden = true;
    $('search-status').textContent = '';
    searchGeneration = typeof searchAdapters.generation === 'function' ? searchAdapters.generation() : null;
    searcher.search($('query').value, searchGeneration);
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
})();
