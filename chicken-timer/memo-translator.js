(function (global) {
  'use strict';
  const TRANSLATION_ROW_TTL_MS = 5 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 32000;
  const LANGUAGE_KEY = 'notebook-memo-translation:language:subnote:v1';
  const API_PATH = '/chicken-timer/memos';

  if (!global.document || !global.location) return;

  function mountWidget(host, options) {
    options = options || {};
    if (!host || host.dataset.translationMounted === 'true') return false;

    const widget = global.document.createElement('section');
    widget.className = 'wk-translation-widget';
    widget.dataset.context = options.context || 'memo';

    const nav = global.document.createElement('div');
    nav.className = 'wk-translation-nav';
    const tabs = global.document.createElement('div');
    tabs.className = 'wk-translation-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', (options.primaryLabel || '메모') + ' 도구');
    const primaryTab = global.document.createElement('button');
    primaryTab.type = 'button'; primaryTab.setAttribute('role', 'tab');
    primaryTab.textContent = options.primaryLabel || '메모';
    const translateTab = global.document.createElement('button');
    translateTab.type = 'button'; translateTab.setAttribute('role', 'tab'); translateTab.textContent = '번역';
    const scheduleTab = global.document.createElement('button');
    scheduleTab.type = 'button'; scheduleTab.setAttribute('role', 'tab'); scheduleTab.textContent = '근무표';
    tabs.appendChild(primaryTab); tabs.appendChild(translateTab); tabs.appendChild(scheduleTab);
    nav.appendChild(tabs);

    const languages = global.document.createElement('div');
    languages.className = 'wk-translation-languages';
    languages.setAttribute('role', 'group');
    languages.setAttribute('aria-label', '번역할 언어');
    const languageButtons = {};
    [['vi', '베트남어'], ['ja', '일본어']].forEach(([code, label]) => {
      const button = global.document.createElement('button');
      button.type = 'button'; button.textContent = label; button.dataset.language = code;
      button.setAttribute('aria-pressed', 'false');
      languages.appendChild(button); languageButtons[code] = button;
    });
    languages.hidden = true;
    nav.appendChild(languages);

    const pane = global.document.createElement('section');
    pane.className = 'wk-translation-pane';
    pane.setAttribute('aria-label', '한국어 문장 번역');
    pane.hidden = true;
    const compose = global.document.createElement('div');
    compose.className = 'wk-translation-compose';
    const input = global.document.createElement('textarea');
    input.className = 'wk-translation-input'; input.rows = 3; input.maxLength = 1500;
    input.placeholder = '한국어 문장을 입력하고 Enter';
    input.setAttribute('aria-label', '번역할 한국어 문장'); input.setAttribute('enterkeyhint', 'send');
    const send = global.document.createElement('button');
    send.type = 'button'; send.className = 'wk-translation-send'; send.textContent = '번역'; send.disabled = true;
    compose.appendChild(input); compose.appendChild(send);
    const results = global.document.createElement('div');
    results.className = 'wk-translation-results'; results.setAttribute('role', 'log');
    results.setAttribute('aria-live', 'polite'); results.setAttribute('aria-relevant', 'additions text');
    pane.appendChild(compose); pane.appendChild(results);
    const schedulePane = global.document.createElement('section');
    schedulePane.className = 'wk-schedule-pane';
    schedulePane.setAttribute('aria-label', '현재 근무표 수정 화면');
    schedulePane.hidden = true;
    const scheduleStatus = global.document.createElement('p');
    scheduleStatus.className = 'wk-schedule-status';
    scheduleStatus.setAttribute('role', 'status');
    scheduleStatus.setAttribute('aria-live', 'polite');
    scheduleStatus.textContent = '근무표 탭을 열면 현재 링크를 확인합니다.';
    const scheduleFrame = global.document.createElement('iframe');
    scheduleFrame.className = 'wk-schedule-frame';
    scheduleFrame.title = '근무표 수정 및 카톡 발송 화면';
    scheduleFrame.referrerPolicy = 'no-referrer';
    scheduleFrame.loading = 'lazy';
    scheduleFrame.hidden = true;
    schedulePane.appendChild(scheduleStatus); schedulePane.appendChild(scheduleFrame);
    widget.appendChild(nav); widget.appendChild(pane); widget.appendChild(schedulePane);
    if (options.before && options.before.parentNode === host) host.insertBefore(widget, options.before);
    else host.appendChild(widget);

    let language = 'vi';
    try {
      const saved = global.localStorage.getItem(LANGUAGE_KEY);
      if (saved === 'vi' || saved === 'ja') language = saved;
    } catch (_) {}
    const rows = new Set();

    function chooseLanguage(code) {
      if (code !== 'vi' && code !== 'ja') return;
      language = code;
      Object.keys(languageButtons).forEach((item) => languageButtons[item].setAttribute('aria-pressed', String(item === code)));
      try { global.localStorage.setItem(LANGUAGE_KEY, code); } catch (_) {}
    }

    function removeRow(record) {
      if (!rows.has(record)) return;
      rows.delete(record);
      global.clearTimeout(record.expiryTimer);
      global.clearTimeout(record.requestTimer);
      if (record.controller) record.controller.abort();
      record.row.remove();
    }

    function pruneExpired() {
      const now = Date.now();
      Array.from(rows).forEach((record) => { if (record.expiresAt <= now) removeRow(record); });
    }

    function failureReason(status, error) {
      if (error === 'off') return '번역이 잠시 중지되어 있어요.';
      if (status === 401 || status === 403) return '매장 연결 권한을 확인해 주세요.';
      if (status === 429) return '요청이 많아요. 잠시 뒤 다시 보내 주세요.';
      if (status === 400) return '문장이나 언어를 확인해 주세요.';
      if (status === 503) return '번역이 잠시 몰려 있어요. 다시 보내 주세요.';
      return '번역 연결을 확인해 주세요.';
    }

    async function translate(record) {
      try {
        const response = await global.fetch(API_PATH, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({op: 'translate', text: record.sourceText, to: record.language}),
          signal: record.controller ? record.controller.signal : undefined
        });
        let data = null;
        try { data = await response.json(); } catch (_) {}
        if (!record.row.isConnected) return;
        if (!response.ok || !data || data.ok !== true || typeof data.out !== 'string' || !data.out.trim()) {
          record.state.dataset.kind = 'error';
          record.state.textContent = failureReason(response.status, data && data.error);
          return;
        }
        record.output.textContent = data.out;
        record.state.textContent = '';
      } catch (error) {
        if (!record.row.isConnected) return;
        record.state.dataset.kind = 'error';
        record.state.textContent = error && error.name === 'AbortError' ? '응답 시간이 초과됐어요.' : '연결이 끊겨 번역하지 못했어요.';
      } finally {
        global.clearTimeout(record.requestTimer);
      }
    }

    function submit() {
      const sourceText = input.value;
      if (!sourceText.trim() || sourceText.length > 1500) return;
      const record = {sourceText, language, expiresAt: Date.now() + TRANSLATION_ROW_TTL_MS, row: null,
        output: null, state: null, controller: null, expiryTimer: null, requestTimer: null};
      const row = global.document.createElement('article');
      row.className = 'wk-translation-row'; row.setAttribute('aria-label', '번역 요청');
      const output = global.document.createElement('p');
      output.className = 'wk-translation-output'; output.textContent = '번역 중…';
      const source = global.document.createElement('div');
      source.className = 'wk-translation-source'; source.textContent = sourceText;
      const state = global.document.createElement('p');
      state.className = 'wk-translation-state'; state.setAttribute('role', 'status');
      row.appendChild(output); row.appendChild(source); row.appendChild(state);
      record.row = row; record.output = output; record.state = state;
      rows.add(record); results.appendChild(row);
      record.expiryTimer = global.setTimeout(() => removeRow(record), TRANSLATION_ROW_TTL_MS);
      record.controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
      record.requestTimer = global.setTimeout(() => {
        if (record.controller) record.controller.abort();
        else if (record.row.isConnected) {
          record.state.dataset.kind = 'error'; record.state.textContent = '응답 시간이 초과됐어요.';
        }
      }, REQUEST_TIMEOUT_MS);
      input.value = '';
      send.disabled = true;
      input.focus({preventScroll: true});
      results.scrollTop = results.scrollHeight;
      translate(record);
    }

    let scheduleRequest = 0;
    let scheduleUrl = '';
    let scheduleLoaded = false;
    scheduleFrame.addEventListener('load', () => {
      if (!scheduleUrl || scheduleFrame.src !== scheduleUrl) return;
      scheduleLoaded = true;
      scheduleStatus.hidden = true;
      scheduleStatus.textContent = '';
    });

    function selectView(view) {
      const translating = view === 'translate';
      const showingSchedule = view === 'schedule';
      widget.dataset.translationActive = String(view !== 'primary');
      widget.dataset.currentView = view;
      primaryTab.setAttribute('aria-selected', String(view === 'primary'));
      translateTab.setAttribute('aria-selected', String(translating));
      scheduleTab.setAttribute('aria-selected', String(showingSchedule));
      primaryTab.tabIndex = view === 'primary' ? 0 : -1;
      translateTab.tabIndex = translating ? 0 : -1;
      scheduleTab.tabIndex = showingSchedule ? 0 : -1;
      languages.hidden = !translating;
      pane.hidden = !translating;
      schedulePane.hidden = !showingSchedule;
      if (view !== 'schedule') scheduleRequest += 1;
      if (typeof options.onViewChange === 'function') options.onViewChange(view);
      if (view !== 'primary') pruneExpired();
    }

    async function openSchedule() {
      const request = ++scheduleRequest;
      scheduleFrame.hidden = true;
      scheduleStatus.hidden = false;
      scheduleStatus.textContent = '현재 근무표 링크를 확인 중…';
      try {
        const response = await global.fetch(API_PATH + '?view=workschedule', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: {Accept: 'application/json'}
        });
        let data = null;
        try { data = await response.json(); } catch (_) {}
        if (!response.ok || !data || data.ok !== true || typeof data.url !== 'string') throw new Error('unavailable');
        const url = new URL(data.url, global.location.href);
        if (url.origin !== global.location.origin || url.search || url.hash ||
            !/^\/updates\/workschedule\/\d{14}-[0-9a-f]{6}\/phone\.html$/.test(url.pathname)) throw new Error('unavailable');
        if (request !== scheduleRequest || widget.dataset.currentView !== 'schedule') return;
        if (scheduleUrl !== url.href) {
          scheduleUrl = url.href;
          scheduleLoaded = false;
          scheduleStatus.hidden = false;
          scheduleStatus.textContent = '근무표 화면을 여는 중…';
          scheduleFrame.src = scheduleUrl;
        } else if (!scheduleLoaded) {
          scheduleStatus.hidden = false;
          scheduleStatus.textContent = '근무표 화면을 여는 중…';
        } else {
          scheduleStatus.hidden = true;
          scheduleStatus.textContent = '';
        }
        scheduleFrame.hidden = false;
      } catch (_) {
        if (request !== scheduleRequest || widget.dataset.currentView !== 'schedule') return;
        scheduleStatus.hidden = false;
        scheduleStatus.textContent = '현재 근무표 연결을 확인해 주세요.';
      }
    }

    languageButtons.vi.addEventListener('click', () => chooseLanguage('vi'));
    languageButtons.ja.addEventListener('click', () => chooseLanguage('ja'));
    primaryTab.addEventListener('click', () => selectView('primary'));
    translateTab.addEventListener('click', () => selectView('translate'));
    scheduleTab.addEventListener('click', () => {
      if (widget.dataset.currentView === 'schedule') return;
      selectView('schedule'); openSchedule();
    });
    input.addEventListener('input', () => { send.disabled = !input.value.trim(); });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault(); submit();
    });
    send.addEventListener('click', submit);
    global.document.addEventListener('visibilitychange', pruneExpired);
    global.addEventListener('pagehide', () => {
      Array.from(rows).forEach(removeRow);
      input.value = '';
    }, {once: true});

    chooseLanguage(language);
    selectView(options.initialView === 'translate' ? 'translate' : 'primary');
    host.dataset.translationMounted = 'true';
    return true;
  }

  function mountMemoCard(card) {
    if (!card || card.dataset.translationMounted === 'true') return false;
    const title = Array.from(card.children).find((node) => node.classList && node.classList.contains('wk-card-title'));
    if (!title) return false;
    const shared = new Set([title]);
    Array.from(card.children).forEach((node) => {
      if (node.classList && (node.classList.contains('wk-seg') || node.classList.contains('wk-urgent') ||
          node.classList.contains('work-records')) || node.hasAttribute('data-timer-status')) shared.add(node);
    });
    const memoNodes = Array.from(card.children).filter((node) => !shared.has(node));
    const memoHidden = new Map(memoNodes.map((node) => [node, node.hidden]));
    const records = Array.from(shared).find((node) => node.classList && node.classList.contains('work-records'));
    const recordsHidden = records ? records.hidden : false;
    const titleHidden = title.hidden;
    return mountWidget(card, {
      before: title.nextSibling,
      context: 'memo',
      primaryLabel: '메모',
      onViewChange(view) {
        const secondary = view !== 'primary';
        const panel = card.closest('.work-panel');
        card.dataset.translationActive = String(secondary);
        if (panel) panel.dataset.notebookScheduleActive = String(view === 'schedule');
        title.hidden = secondary || titleHidden;
        memoNodes.forEach((node) => { node.hidden = secondary ? true : memoHidden.get(node); });
        if (records) records.hidden = secondary || recordsHidden;
      }
    });
  }

  if (new URLSearchParams(global.location.search).get('profile') !== 'subnote') return;
  const findCard = () => global.document.querySelector('.work-panel .work-memos:not([data-translation-mounted="true"])');
  if (mountMemoCard(findCard())) return;
  if (global.MutationObserver && global.document.body) {
    const observer = new global.MutationObserver(() => {
      if (mountMemoCard(findCard())) observer.disconnect();
    });
    observer.observe(global.document.body, {childList: true, subtree: true});
  }
})(window);
