(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('profile') !== 'subnote') return;
  const shell = document.querySelector('.app-shell');
  const board = document.querySelector('#board');
  if (!shell || !board || !window.NotebookWorkMemos || window.__notebookWorkMounted) return;
  window.__notebookWorkMounted = true;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'work-mode-open'; button.textContent = '배달 업무';
  button.setAttribute('aria-label', '배달 업무 열기');
  function attachButton() {
    const head = document.querySelector('#recipe-strip > .board-cell-head');
    if (head && button.parentNode !== head) head.appendChild(button);
  }
  attachButton();
  new MutationObserver(attachButton).observe(board, {childList: true, subtree: true});
  const panel = document.createElement('section');
  panel.className = 'work-panel'; panel.hidden = true; panel.setAttribute('aria-label', '배달 업무');
  panel.innerHTML = '<header class="work-header"><button type="button" data-back>타이머</button><strong>배달 업무</strong><span data-timer-status aria-live="polite"></span></header>' +
    '<div class="work-columns"><section class="work-search"><h2>주소 검색</h2><label>주소 또는 건물명<input data-query autocomplete="off"></label><button type="button" data-search>검색</button><p data-search-status>검색 연결 준비 중</p><div data-cache-results></div><div data-external-results></div><p data-selection></p><div data-selected-actions hidden><label>고객용 한국어 주소<textarea data-selected-customer readonly></textarea></label><button type="button" data-copy-selection>고객 한국어 복사</button><div><button type="button" data-confirm>맞음</button><button type="button" data-reject>아님</button><button type="button" data-undo>되돌림</button></div><label>주소 수정<input data-correction></label><button type="button" data-correct>수정 반영</button><button type="button" data-retry-feedback hidden>처리 확인 재시도</button><p data-feedback-status role="status"></p></div></section>' +
    '<section class="work-memos"><h2>메모</h2><button type="button" data-new>새 메모</button><div data-list class="work-list"></div><div data-editor hidden>' +
    '<label>제목<input data-title></label><label>고객 문구 · 한국어<textarea data-customer></textarea></label>' +
    '<section class="work-staff"><h3>직원 설명</h3><div class="work-languages">' +
    '<div><label>한국어<textarea data-ko></textarea></label><button type="button" data-copy-ko>직원 한국어 복사</button></div>' +
    '<div><label>베트남어<textarea data-vi></textarea></label><button type="button" data-copy-vi>직원 베트남어 복사</button></div>' +
    '<div><label>일본어<textarea data-ja></textarea></label><button type="button" data-copy-ja>직원 일본어 복사</button></div></div>' +
    '<button type="button" data-copy-all>직원 세 언어 복사</button></section>' +
    '<div class="work-actions"><button type="button" data-save>저장</button><button type="button" data-copy>고객 한국어 복사</button></div></div><p data-status role="status"></p></section></div>';
  shell.appendChild(panel);
  const $ = (name) => panel.querySelector('[data-' + name + ']');
  function showTimerStatus() {
    const done = board.querySelectorAll('.slot-card[data-state="expired"], .split-timer-unit[data-state="expired"]').length;
    $('timer-status').textContent = done ? '완료 알림 ' + done + '건' : '';
  }
  new MutationObserver(showTimerStatus).observe(board, {attributes: true, subtree: true, attributeFilter: ['data-state']});
  showTimerStatus();
  let db, current = null;
  try { db = window.NotebookWorkMemos.store(window.localStorage); db.list(); db.drafts(); }
  catch (_) { $('status').textContent = '저장 자료를 읽을 수 없습니다. 기존 자료를 보존합니다.'; }
  function report(text) { $('status').textContent = text; }
  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try { await navigator.clipboard.writeText(text); return; } catch (_) {}
    }
    // The live factory origin is HTTP. Copy only this explicit button's plain
    // text, during its user gesture; never include staff notes or the DOM.
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
  function draw() {
    if (!db) return;
    let list, drafts;
    try { list = db.list(); drafts = db.drafts(); } catch (_) { report('저장 자료를 읽을 수 없습니다.'); return; }
    const known = new Set(list.map((x) => x.id));
    list = list.concat(drafts.filter((x) => x && !known.has(x.id)));
    $('list').replaceChildren();
    list.forEach((entry) => {
      const node = document.createElement('button'); node.type = 'button'; node.textContent = entry.title || '제목 없는 메모';
      node.addEventListener('click', () => { current = drafts.find((x) => x.id === entry.id) || entry; fill(); }); $('list').appendChild(node);
    });
  }
  function fill() {
    $('editor').hidden = !current; if (!current) return;
    $('title').value = current.title || ''; $('customer').value = current.customer_ko || '';
    const notes = current.staff_notes || {}; ['ko','vi','ja'].forEach((lang) => { $(lang).value = notes[lang] || ''; });
    updateStaffButtons();
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
    if (!current) return;
    const oldKey = sourceKey(current);
    const meta = Object.assign({}, current.staff_meta || {});
    current = Object.assign({}, current, {title: $('title').value, customer_ko: $('customer').value,
      staff_notes: {ko: $('ko').value, vi: $('vi').value, ja: $('ja').value}});
    const key = sourceKey(current);
    if (key !== oldKey) current.source_revision = (current.source_revision || 0) + 1;
    if (['ko','vi','ja'].includes(changed)) meta[changed] = {source_key: key, source_revision: current.source_revision || 0, provenance: 'user'};
    current.staff_meta = meta;
    updateStaffButtons();
    try { db.saveDraft(current); report('편집 중'); } catch (_) { report('초안을 저장하지 못했습니다. 화면의 내용을 보존합니다.'); }
  }
  ['title','customer','ko','vi','ja'].forEach((name) => $(name).addEventListener('input', () => capture(name)));
  $('new').addEventListener('click', () => { if (!db) return; current = {id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), revision: 0, title: '', customer_ko: '', staff_notes: {}}; fill(); capture(); draw(); });
  $('save').addEventListener('click', () => { if (!current || !db) return; capture(); try { current = db.save(current); db.saveDraft(current); draw(); report('저장했습니다'); } catch (_) { report('저장하지 못했습니다. 편집 내용을 보존합니다.'); } });
  $('copy').addEventListener('click', async () => { if (!current) return; capture(); if (current.customer_ko.length === 0) { report('복사할 고객 한국어 문구가 없습니다.'); return; } try { await copyText(current.customer_ko); report('한국어 문구를 복사했습니다'); } catch (_) { $('customer').focus(); $('customer').select(); report('복사하지 못했습니다. 선택된 문구를 직접 복사해 주세요.'); } });
  async function copyStaff(languages) {
    if (!current || !languages.every(ready)) { report('현재 원문의 직원 설명을 확인해 주세요.'); return; }
    const text = languages.map((lang) => current.staff_notes[lang]).join('\n\n');
    try { await copyText(text); report('직원 설명을 복사했습니다'); }
    catch (_) { report('직원 설명을 복사하지 못했습니다. 내용을 보존합니다.'); }
  }
  ['ko','vi','ja'].forEach((lang) => $('copy-' + lang).addEventListener('click', () => copyStaff([lang])));
  $('copy-all').addEventListener('click', () => copyStaff(['ko','vi','ja']));
  const searchAdapters = window.NotebookWorkSearchAdapters || {};
  let selected = null, searchGeneration = null, pendingFeedback = null;
  async function privateRequest(path, payload) {
    // The real notebook origin and device authorization are not verified yet.
    // Do not send an address or feedback to an arbitrary same-origin host.
    throw new Error('private API not connected');
  }
  const cacheSearch = searchAdapters.cacheSearch || (async (query) => {
    const result = await privateRequest('/notebook-work/local-search', {query});
    if (!Array.isArray(result.results)) throw new Error('invalid source');
    result.results.backupFileMtime = result.backup_file_mtime;
    return result.results;
  });
  const renderedQuery = {}, laneStatus = {};
  const searcher = window.NotebookWorkSearch && window.NotebookWorkSearch.create({
    cacheSearch,
    externalSearch: searchAdapters.externalSearch, safeExternal: searchAdapters.safeExternal,
    onChange(update) {
      const target = $(update.lane + '-results');
      const statusText = (update.lane === 'cache' ? '기존 자료' : '외부 보완') + ' · ' +
        ({pending:'확인 중', ready:'결과', error:'연결 미확인'}[update.state] || '미확인');
      if (update.state !== 'ready' && renderedQuery[update.lane] === update.query && laneStatus[update.lane]) {
        laneStatus[update.lane].textContent = statusText;
        return;
      }
      target.replaceChildren();
      const title = document.createElement('p');
      title.textContent = statusText; laneStatus[update.lane] = title;
      target.appendChild(title);
      if (update.state !== 'ready' || !Array.isArray(update.result)) return;
      renderedQuery[update.lane] = update.query;
      if (update.lane === 'cache' && Number.isFinite(update.result.backupFileMtime)) {
        $('search-status').textContent = '기존 백업 파일 시각 · ' + new Date(update.result.backupFileMtime * 1000).toLocaleString('ko-KR');
      }
      update.result.forEach((candidate) => {
        if (!candidate || typeof candidate.name !== 'string' || typeof candidate.address !== 'string') return;
        const row = document.createElement('button'); row.type = 'button';
        row.textContent = candidate.name + ' · ' + candidate.address;
        row.addEventListener('click', () => {
          $('selection').textContent = row.textContent;
          selected = {candidate, query:update.query, generation:searchGeneration};
          $('selected-customer').value = candidate.address;
          $('selected-actions').hidden = false; $('retry-feedback').hidden = !pendingFeedback;
          $('feedback-status').textContent = pendingFeedback ? '이전 확인의 저장 결과를 확인해 주세요' : ''; $('correction').value = '';
        });
        target.appendChild(row);
      });
    }
  });
  $('query').addEventListener('input', () => { if (searcher) searcher.invalidate($('query').value); selected = null; $('selected-actions').hidden = true; });
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
  $('search').addEventListener('click', () => {
    if (!searcher || !$('query').value.trim()) { $('search-status').textContent = '검색어를 입력해 주세요'; return; }
    $('selection').textContent = '';
    selected = null; $('selected-actions').hidden = true;
    $('search-status').textContent = '출처별 검색';
    searchGeneration = typeof searchAdapters.generation === 'function' ? searchAdapters.generation() : null;
    searcher.search($('query').value, searchGeneration);
  });
  button.addEventListener('click', () => { board.hidden = true; panel.hidden = false; draw(); });
  $('back').addEventListener('click', () => { panel.hidden = true; board.hidden = false; });
})();
