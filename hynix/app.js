(function () {
  'use strict';

  var PORTAL_PIN_SHA256 = '5fac4c4102e357c594bbde07a5b34fd38cebb15b793543e695452afafdb1d605';
  var WORKSCHEDULE_BASE = '/workschedule_v2';
  var SCHEDULE_SOURCE = 'http://218.147.118.71:2421/workschedule.json';
  var OPS_MANUAL_PATH = '/packhelper/ops_manual';
  var ATTENDANCE_PATH = '/workschedule_v2/attendance';
  var CALENDAR_OUTBOX_PATH = WORKSCHEDULE_BASE + '/meta/calendar_core/google/outbox';
  var CALENDAR_PUBLIC_CONFIG_PATH = WORKSCHEDULE_BASE + '/meta/calendar_core/google/public_config';
  var KNOWLEDGE_CONTRACT_PATH = './knowledge_adapter_contract.json';
  var CONFIRMED_SCHEDULE_TARGETS = ['/workschedule_v2/overrides', '/workschedule_v2/status'];
  var WINDOW_DAYS = 7;
  var WEEKDAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var WEEKDAY_OPTIONS = [
    { key: 'sun', label: '일' },
    { key: 'mon', label: '월' },
    { key: 'tue', label: '화' },
    { key: 'wed', label: '수' },
    { key: 'thu', label: '목' },
    { key: 'fri', label: '금' },
    { key: 'sat', label: '토' }
  ];
  var SHIFT_PRESETS = [
    { key: 'night', label: '17:00~06:00', start: '17:00', end: '06:00' },
    { key: 'day', label: '09:00~18:00', start: '09:00', end: '18:00' },
    { key: 'mid', label: '12:00~21:00', start: '12:00', end: '21:00' },
    { key: 'custom', label: '직접', start: '', end: '' }
  ];
  var INLINE_SHIFT_PRESETS = [
    { key: 'off', label: '휴무', off: true },
    { key: 'night', label: '17-03', start: '17:00', end: '03:00' },
    { key: 'day', label: '09-18', start: '09:00', end: '18:00' },
    { key: 'mid', label: '12-21', start: '12:00', end: '21:00' },
    { key: 'clear', label: '비우기', clear: true },
    { key: 'custom', label: '직접', custom: true }
  ];
  var ROLE_OPTIONS = ['주방', '홀', '오토바이', '관리'];
  var APPLY_MODES = [
    { key: 'overwrite', label: '덮어쓰기' },
    { key: 'emptyOnly', label: '비어있는 날만' }
  ];
  var MANUAL_CATEGORY_LABELS = Object.freeze({
    customer_support: '고객 응대',
    coupon: '쿠폰',
    platform_help: '플랫폼 안내',
    task: '업무',
    delivery: '배달',
    discount: '할인',
    work: '근무',
    schedule_request: '근무 요청',
    ops_manual: '운영 기준',
    '기타': '기타'
  });
  var state = {
    employees: {},
    fixedSchedules: {},
    overrides: {},
    statuses: {},
    manualEntries: [],
    knowledgeContract: null,
    knowledgeContractError: '',
    knowledgeEditor: {
      lastRawId: '',
      lastSummaryId: '',
      statusMessage: ''
    },
    knowledgeQueueStatus: {
      pending: 0,
      done: 0,
      failed: 0,
      latest: null,
      loadError: ''
    },
    manualQuery: '',
    manualSearchFocusIndex: -1,
    scheduleView: 'week',
    scheduleVisibleWeeks: 1,
    scheduleShowEmptyEmployees: true,
    calendarPublicConfig: null,
    scheduleFocusDate: '',
    scheduleFocusEmployee: '',
    scheduleEditor: {
      open: false,
      dateKey: '',
      empId: '',
      preset: 'night',
      start: '17:00',
      end: '03:00',
      off: false,
      clear: false,
      submitting: false,
      statusMessage: ''
    },
    scheduleSelection: {
      dateKey: '',
      empId: ''
    },
    scheduleClipboard: null,
    scheduleCopiedFrom: {
      dateKey: '',
      empId: ''
    },
    scheduleLastTap: {
      dateKey: '',
      empId: '',
      at: 0
    },
    rosterAdd: {
      open: false,
      draft: '',
      submitting: false,
      statusMessage: ''
    },
    attendanceToday: null,
    attendanceOperational: null,
    edit: {
      scope: 'override',
      startDate: '',
      endDate: '',
      weekdays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      employeeIds: [],
      preset: 'night',
      start: '17:00',
      end: '06:00',
      roles: ['주방'],
      off: false,
      clear: false,
      applyMode: 'overwrite',
      pending: null,
      submitting: false,
      statusMessage: '',
      initialized: false
    },
    briefingContext: null,
    auth: {
      checking: true,
      authenticated: false,
      user: null,
      role: 'blocked',
      roleLabel: '미인증',
      error: '',
      unlockMethod: ''
    }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function manualCategoryLabel(value) {
    var key = String(value || '').trim().toLowerCase();
    return MANUAL_CATEGORY_LABELS[key] || '기타 분류';
  }

  function manualTagLabel(value) {
    var key = String(value || '').trim().toLowerCase();
    return MANUAL_CATEGORY_LABELS[key] || String(value || '');
  }

  window.HynixManualCategoryUi = Object.freeze({
    label: manualCategoryLabel,
    groups: function (categories) {
      return manualCategoryGroups((categories || []).map(function (category) {
        return { category: category };
      })).map(function (section) {
        return { label: section.label, count: section.entries.length };
      });
    }
  });

  function firebaseUrl() {
    return '';
  }

  async function authToken() {
    return '';
  }

  async function sha256hex(text) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function scheduleRest(path) {
    if (!window.FactorySchedule) return null;
    return window.FactorySchedule.restFrom(path, ['/workschedule_v2', 'workschedule_v2']);
  }

  async function readFirebaseJson(path) {
    return {};
  }

  async function fetchFirebaseScheduleTree() {
    async function one(path) {
      try {
        var val = await readFirebaseJson(path);
        return val && typeof val === 'object' ? val : {};
      } catch (e) {
        return {};
      }
    }
    var parts = await Promise.all([
      one(WORKSCHEDULE_BASE + '/employees'),
      one(WORKSCHEDULE_BASE + '/fixed_schedules'),
      one(WORKSCHEDULE_BASE + '/overrides'),
      one(WORKSCHEDULE_BASE + '/status')
    ]);
    return {
      employees: parts[0] || {},
      fixed_schedules: parts[1] || {},
      overrides: parts[2] || {},
      status: parts[3] || {}
    };
  }

  async function ensureScheduleTree() {
    var tree = {};
    try {
      tree = await window.FactorySchedule.load(false) || {};
    } catch (e) {
      tree = {};
    }
    if (window.FactorySchedule.planning(tree)) return tree;
    return tree;
  }

  async function readJson(path) {
    var rest = scheduleRest(path);
    if (rest !== null) {
      var tree = await ensureScheduleTree();
      return rest ? window.FactorySchedule.dig(tree, rest) : tree;
    }
    return readFirebaseJson(path);
  }

  async function loadKnowledgeContract() {
    try {
      var response = await fetch(KNOWLEDGE_CONTRACT_PATH, { cache: 'no-store' });
      if (!response.ok) throw new Error('knowledge contract unavailable');
      var contract = await response.json();
      if (!contract || contract.mode !== 'write_enabled') {
        throw new Error('knowledge contract mode mismatch');
      }
      state.knowledgeContract = contract;
      state.knowledgeContractError = '';
    } catch (error) {
      state.knowledgeContract = null;
      state.knowledgeContractError = String(error && error.message ? error.message : error);
    }
    return state.knowledgeContract;
  }

  async function putJson(path, payload) {
    var rest = scheduleRest(path);
    if (rest !== null) {
      var tree = await window.FactorySchedule.load(true);
      var next = rest ? window.FactorySchedule.setPath(tree || {}, rest, payload) : payload;
      var ok = await window.FactorySchedule.save(next);
      if (!ok) throw new Error('요청을 보내지 못했습니다.');
      return payload;
    }
    throw new Error('공장 근무표만 저장합니다.');
  }

  async function patchJson(path, payload) {
    var rest = scheduleRest(path);
    if (rest !== null) {
      var tree = await window.FactorySchedule.load(true);
      var cur = rest ? window.FactorySchedule.dig(tree, rest) : tree;
      var merged = (cur && typeof cur === 'object') ? Object.assign({}, cur, payload) : payload;
      var next = rest ? window.FactorySchedule.setPath(tree || {}, rest, merged) : merged;
      var ok = await window.FactorySchedule.save(next);
      if (!ok) throw new Error('요청을 보내지 못했습니다.');
      return payload;
    }
    throw new Error('공장 근무표만 저장합니다.');
  }

  async function deleteJson(path) {
    var rest = scheduleRest(path);
    if (rest === null) throw new Error('공장 근무표만 저장합니다.');
    var tree = await window.FactorySchedule.load(true);
    var next = window.FactorySchedule.setPath(tree || {}, rest, null);
    var ok = await window.FactorySchedule.save(next);
    if (!ok) throw new Error('요청을 보내지 못했습니다.');
    return null;
  }

  function safeFirebaseKey(value) {
    return String(value || 'request')
      .trim()
      .replace(/[.#$\[\]\/\s]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 180) || 'request';
  }

  function calendarOutboxItem(input) {
    var helper = window.HynixCalendarSyncLogic;
    if (!helper || typeof helper.buildOutboxItem !== 'function') {
      throw new Error('calendar_sync_logic_unavailable');
    }
    return helper.buildOutboxItem(Object.assign({}, input, { canonicalRoot: WORKSCHEDULE_BASE }));
  }

  async function queueCalendarTargets(targets) {
    var results = await Promise.all((targets || []).map(function (target) {
      return Promise.resolve().then(function () {
        var item = calendarOutboxItem(target);
        return putJson(CALENDAR_OUTBOX_PATH + '/' + item.id, item);
      }).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
    }));
    return {
      queued: results.filter(Boolean).length,
      failed: results.filter(function (ok) { return !ok; }).length
    };
  }

  function kstDateParts(date) {
    var formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short'
    });
    var parts = formatter.formatToParts(date);
    var map = {};
    parts.forEach(function (part) {
      map[part.type] = part.value;
    });
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
      weekday: map.weekday
    };
  }

  function dateKeyFromParts(parts) {
    return String(parts.year) + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0');
  }

  function shiftDateKey(key, deltaDays) {
    var base = new Date(key + 'T00:00:00+09:00');
    base.setUTCDate(base.getUTCDate() + deltaDays);
    var parts = kstDateParts(base);
    return dateKeyFromParts(parts);
  }

  function safeDateKey(value, fallback) {
    var text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
  }

  function clampDateKeyToFuture(dateKey, minDateKey) {
    if (!dateKey) return minDateKey;
    if (!minDateKey) return dateKey;
    return dateKey < minDateKey ? minDateKey : dateKey;
  }

  function sanitizedScheduleFocusDate(fallbackDateKey) {
    var selectedDate = safeDateKey(state.scheduleFocusDate, '');
    if (!selectedDate) return '';
    return clampDateKeyToFuture(selectedDate, fallbackDateKey || operationalInfo().calendarKey);
  }

  function dateKeyWeekdayIndex(key) {
    var safe = safeDateKey(key, '');
    if (!safe) return 0;
    var parts = safe.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return Number.isFinite(date.getTime()) ? date.getUTCDay() : 0;
  }

  function mondayWeekStartKey(key) {
    var weekday = dateKeyWeekdayIndex(key);
    return shiftDateKey(key, weekday === 0 ? -6 : 1 - weekday);
  }

  function buildScheduleRangeKeys(todayKey, options) {
    var helper = window.HynixScheduleLogic;
    if (helper && typeof helper.buildScheduleRangeKeys === 'function') {
      return helper.buildScheduleRangeKeys(todayKey, options);
    }
    var config = options && typeof options === 'object' ? options : {};
    var windowDays = Number(config.windowDays);
    var safeToday = safeDateKey(todayKey, '');
    var minDateKey = safeDateKey(config.minDateKey, safeToday);
    var keys = [];
    if (!safeToday) return keys;
    if (!Number.isFinite(windowDays) || windowDays <= 0) windowDays = WINDOW_DAYS;
    windowDays = Math.floor(windowDays);
    var startKey = mondayWeekStartKey(safeToday);
    for (var i = 0; i < Math.max(7, windowDays); i += 1) {
      var key = shiftDateKey(startKey, i);
      if (key >= minDateKey) keys.push(key);
    }
    return keys.slice(0, windowDays);
  }

  function scheduleWindowDays() {
    return scheduleVisibleWeekCount() * 7;
  }

  function scheduleVisibleWeekCount() {
    var weeks = Number(state.scheduleVisibleWeeks || 1);
    if (!Number.isFinite(weeks) || weeks <= 0) weeks = 1;
    return Math.max(1, Math.floor(weeks));
  }

  function scheduleBaseDateKey(info) {
    return info.calendarKey;
  }

  function scheduleVisibleDateKeys(info) {
    var anchor = scheduleBaseDateKey(info);
    var windowDays = scheduleWindowDays();
    if (!anchor) return [];
    return buildScheduleRangeKeys(anchor, {
      windowDays: windowDays,
      minDateKey: info.calendarKey
    });
  }

  function scheduleActiveEmployeePairs() {
    return activeEmployeePairs();
  }

  function employeeHasWorkInRange(empId, dateKeys) {
    if (!Array.isArray(dateKeys) || !dateKeys.length) return true;
    return dateKeys.some(function (dateKey) {
      var shift = buildShift(empId, state.employees[empId] || {}, dateKey);
      return shift && shift.state === 'shift';
    });
  }

  function firstEmployeeShiftStart(empId, dateKeys) {
    var best = 99999;
    (Array.isArray(dateKeys) ? dateKeys : []).forEach(function (dateKey) {
      var shift = buildShift(empId, state.employees[empId] || {}, dateKey);
      if (!shift || shift.state !== 'shift') return;
      var parsed = parseClock(shift.start);
      if (parsed !== null) best = Math.min(best, parsed);
    });
    return best;
  }

  function scheduleVisibleEmployees(dateKeys) {
    var pairs = scheduleActiveEmployeePairs();
    var enriched = pairs.map(function (pair) {
      var empId = pair[0];
      var hasWork = employeeHasWorkInRange(empId, dateKeys);
      return {
        pair: pair,
        hasWork: hasWork,
        firstStart: firstEmployeeShiftStart(empId, dateKeys)
      };
    });
    if (!state.scheduleShowEmptyEmployees) {
      enriched = enriched.filter(function (item) {
        return item.hasWork;
      });
    }
    enriched.sort(function (a, b) {
      if (a.hasWork !== b.hasWork) return a.hasWork ? -1 : 1;
      if (a.firstStart !== b.firstStart) return a.firstStart - b.firstStart;
      return a.pair[1].shortName.localeCompare(b.pair[1].shortName, 'ko');
    });
    return enriched.map(function (item) {
      return item.pair;
    });
  }

  function scheduleViewLabel() {
    return '타임스탬프';
  }

  function scheduleViewDescription() {
    var weeks = scheduleVisibleWeekCount();
    return weeks === 1 ? '현재 범위' : String(weeks) + '주 범위';
  }

  function compactShiftLabel(shift) {
    if (!shift) return '';
    if (shift.state === 'off') return '휴무';
    if (shift.state !== 'shift') return shift.state || '기타';
    var start = String(shift.start || '').trim();
    var end = String(shift.end || '').trim();
    return (start || '--:--') + '-' + (end || '--:--');
  }

  function dateDiffDays(startKey, endKey) {
    var start = new Date(startKey + 'T00:00:00+09:00').getTime();
    var end = new Date(endKey + 'T00:00:00+09:00').getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.round((end - start) / 86400000);
  }

  function dateRangeKeys(startKey, endKey, maxDays) {
    var info = operationalInfo();
    var start = safeDateKey(startKey, info.operationalKey);
    var end = safeDateKey(endKey, start);
    if (dateDiffDays(start, end) < 0) {
      var swap = start;
      start = end;
      end = swap;
    }
    var diff = Math.max(0, Math.min(maxDays || 62, dateDiffDays(start, end)));
    var keys = [];
    for (var i = 0; i <= diff; i += 1) {
      keys.push(shiftDateKey(start, i));
    }
    return keys;
  }

  function weekdayLabel(key) {
    var names = ['일', '월', '화', '수', '목', '금', '토'];
    return names[dateKeyWeekdayIndex(key)] || '';
  }

  function mmddLabel(key) {
    var parts = key.split('-');
    return parts[1] + '.' + parts[2];
  }

  function operationalInfo() {
    var now = new Date();
    var parts = kstDateParts(now);
    var minutes = parts.hour * 60 + parts.minute;
    var passed = minutes >= 360 ? minutes - 360 : minutes + 1080;
    var ratio = Math.max(0, Math.min(1, passed / 1440));
    var calendarKey = dateKeyFromParts(parts);
    var operationalKey = minutes >= 360 ? calendarKey : shiftDateKey(calendarKey, -1);
    return {
      nowLabel: String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0'),
      calendarKey: calendarKey,
      operationalKey: operationalKey,
      ratio: ratio,
      beforeBoundary: minutes < 360
    };
  }

  function setText(id, value) {
    var el = $(id);
    if (el) {
      el.textContent = value;
    }
  }

  function renderBoundary(info) {
    setText('boundaryState', info.beforeBoundary ? '전일 근무 기준' : '당일 근무 기준');
    setText('boundaryTime', '현재 KST ' + info.nowLabel);
    setText('boundaryLabel', info.beforeBoundary ? info.operationalKey + ' 근무일로 계산됩니다.' : info.operationalKey + ' 근무일을 보고 있습니다.');
    if ($('boundaryGaugeFill')) $('boundaryGaugeFill').style.width = String(Math.round(info.ratio * 100)) + '%';
    setText('todayKeyLabel', '오늘 ' + info.calendarKey);
    setText('operationalKeyLabel', '기준 ' + info.operationalKey);
  }

  function renderStaticLabels() {
    setText('scheduleTitle', '근무표');
    setText('editTitle', '여러 날 바꾸기');
    setText('attendancePortalTitle', '출퇴근 기록');
    var quickMetrics = document.querySelectorAll('.quick-access-overview .overview-metric');
    if (quickMetrics[0]) {
      var firstLabel = quickMetrics[0].querySelector('span');
      var firstValue = quickMetrics[0].querySelector('strong');
      if (firstLabel) firstLabel.textContent = '기본 보기';
      if (firstValue) firstValue.textContent = '근무표';
    }
    if (quickMetrics[1]) {
      var rangeLabel = quickMetrics[1].querySelector('span');
      var rangeValue = quickMetrics[1].querySelector('strong');
      if (rangeLabel) rangeLabel.textContent = '표 범위';
      if (rangeValue) rangeValue.textContent = '더보기로 확장';
    }
  }

  function canonicalFixedEntry(empId, emp, fixedEntry) {
    var helper = window.HynixScheduleLogic;
    if (helper && typeof helper.canonicalFixedScheduleEntry === 'function') {
      return helper.canonicalFixedScheduleEntry(empId, emp, fixedEntry);
    }
    return fixedEntry || null;
  }

  function weekdayKey(dateKey) {
    var keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return keys[dateKeyWeekdayIndex(dateKey)] || 'sun';
  }

  function weekdayLabelList(keys) {
    var labels = { sun: '일', mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토' };
    return keys.map(function (key) {
      return labels[key] || key;
    }).join(', ');
  }

  function selectedOverrideDates() {
    var dates = dateRangeKeys(state.edit.startDate, state.edit.endDate, 62);
    return dates.filter(function (key) {
      return state.edit.weekdays.indexOf(weekdayKey(key)) >= 0;
    });
  }

  function selectedFixedWeekdays() {
    var weekdays = state.edit.weekdays.filter(function (day) {
      return Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, day);
    });
    return weekdays.length ? weekdays : WEEKDAY_OPTIONS.map(function (item) { return item.key; });
  }

  function selectedFixedWeekdayNumbers() {
    return selectedFixedWeekdays().map(function (day) {
      return WEEKDAY_INDEX[day];
    });
  }

  function normalizeEmployee(empId, emp) {
    var name = String((emp && (emp.short_name || emp.name)) || empId);
    return {
      id: empId,
      shortName: name,
      fullName: String((emp && emp.name) || name),
      active: emp ? emp.active !== false : true,
      role: String((emp && emp.role) || '').trim(),
      color: String((emp && emp.color) || '#0f766e')
    };
  }

  function rowState(value) {
    if (!value || typeof value !== 'object') return '';
    return String(value.state || value.status || value.type || '').trim().toLowerCase();
  }

  function buildShift(empId, emp, dateKey) {
    var fixed = state.fixedSchedules[empId];
    var override = state.overrides[dateKey] && state.overrides[dateKey][empId];
    var status = state.statuses[dateKey] && state.statuses[dateKey][empId];
    var employee = normalizeEmployee(empId, emp);
    var fixedEntry = canonicalFixedEntry(empId, emp, fixed);
    var overrideState = rowState(override);
    var statusState = rowState(status);
    var fixedKind = fixed ? String(fixed.kind || fixed.type || 'fixed') : '';
    var weeklyAllowed = fixed && fixedKind === 'weekly' ? Array.isArray(fixed.days) && fixed.days.indexOf(weekdayKey(dateKey)) >= 0 : true;

    if (override && (override.off === true || override.dayoff === true || overrideState === 'off')) {
      return {
        id: empId,
        employee: employee,
        state: 'off',
        role: String(override.role || employee.role || '').trim(),
        note: '휴무'
      };
    }
    if (override && (overrideState === 'clear' || override.clear === true)) {
      return null;
    }

    if (override && (override.shift || override.start || override.end)) {
      var sourceShift = override.shift && typeof override.shift === 'object' ? override.shift : override;
      var overrideStart = String(sourceShift.start || override.start || '').trim();
      var overrideEnd = String(sourceShift.end || override.end || '').trim();
      if (overrideStart || overrideEnd) {
        return {
          id: empId,
          employee: employee,
          state: 'shift',
          start: overrideStart,
          end: overrideEnd,
          role: String(sourceShift.role || override.role || employee.role || '').trim()
        };
      }
    }

    if (statusState === 'off' || statusState === 'dayoff') {
      return {
        id: empId,
        employee: employee,
        state: 'off',
        role: String(employee.role || '').trim(),
        note: '휴무'
      };
    }
    if (statusState === 'none') {
      return null;
    }

    if (!fixedEntry || fixed && fixedKind === 'none' || fixed && fixedKind === 'weekly' && !weeklyAllowed) {
      return null;
    }

    return {
      id: empId,
      employee: employee,
      state: 'shift',
      start: String(fixedEntry.start || '').trim(),
      end: String(fixedEntry.end || '').trim(),
      role: String(fixedEntry.role || employee.role || '').trim()
    };
  }

  function isNightShift(shift) {
    return shift && shift.state === 'shift' && shift.end && shift.start && shift.end <= shift.start;
  }

  function inlinePresetForShift(shift) {
    if (!shift) {
      return {
        preset: 'night',
        start: '17:00',
        end: '03:00',
        off: false,
        clear: false
      };
    }
    if (shift.state === 'off') {
      return {
        preset: 'off',
        start: '',
        end: '',
        off: true,
        clear: false
      };
    }
    var start = String(shift.start || '').trim();
    var end = String(shift.end || '').trim();
    var preset = 'custom';
    INLINE_SHIFT_PRESETS.some(function (item) {
      if (item.start && item.end && item.start === start && item.end === end) {
        preset = item.key;
        return true;
      }
      return false;
    });
    return {
      preset: preset,
      start: start,
      end: end,
      off: false,
      clear: false
    };
  }

  function parseClock(value) {
    var match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    var hours = Number(match[1]);
    var minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return (hours * 60 + minutes) % 1440;
  }

  function formatClock(totalMinutes) {
    var safeMinutes = ((Number(totalMinutes) % 1440) + 1440) % 1440;
    var hours = Math.floor(safeMinutes / 60);
    var minutes = safeMinutes % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  function shiftClock(value, deltaMinutes) {
    var parsed = parseClock(value);
    if (parsed === null) return String(value || '').trim();
    return formatClock(parsed + Number(deltaMinutes || 0));
  }

  var STORE_GATE = {
    lat: 37.2094,
    lng: 127.4437,
    address: '이천시 부발읍 경충대로 2100',
    radiusM: 700
  };

  function distanceMeters(lat1, lng1, lat2, lng2) {
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function siteUnlocked() {
    return state.auth.authenticated && !state.auth.checking;
  }

  function applyGpsFix(lat, lng, accuracy) {
    var dist = distanceMeters(lat, lng, STORE_GATE.lat, STORE_GATE.lng);
    var meters = Math.round(dist);
    if (dist <= STORE_GATE.radiusM) {
      if (state.auth.authenticated) return true;
      setAuthState({
        checking: false,
        authenticated: true,
        user: { gps: true },
        role: 'operator',
        roleLabel: '가게 GPS',
        error: '',
        unlockMethod: 'gps',
        gpsDistance: meters
      });
      return true;
    }
    if (!state.auth.authenticated) {
      var msg = '가게 밖 ' + meters + 'm';
      if (state.auth.checking || state.auth.error !== msg) {
        setAuthState({
          checking: false,
          gpsDistance: meters,
          error: msg
        });
      }
    }
    return false;
  }

  function tryGpsUnlock() {
    if (!navigator.geolocation) return;
    var opts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 20000 };
    navigator.geolocation.getCurrentPosition(function (pos) {
      applyGpsFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    }, function () {
      if (!state.auth.authenticated) {
        setAuthState({ checking: false, error: state.auth.error || '비밀번호' });
      }
    }, opts);
    if (navigator.geolocation.watchPosition) {
      navigator.geolocation.watchPosition(function (pos) {
        applyGpsFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      }, function () {}, opts);
    }
  }

  function applySiteLock() {
    var unlocked = siteUnlocked();
    document.body.classList.toggle('site-locked', !unlocked);
    var lock = $('siteLockScreen');
    var content = $('portalContent');
    if (lock) lock.hidden = unlocked;
    if (content) content.hidden = !unlocked;
  }

  function clearSiteData() {
    state.employees = {};
    state.fixedSchedules = {};
    state.overrides = {};
    state.statuses = {};
    state.manualEntries = [];
    state.attendanceToday = null;
    state.attendanceOperational = null;
  }

  function scheduleEditorAccessInfo() {
    var params = new URLSearchParams(window.location.search || '');
    var forcedPreview = siteUnlocked() && (params.get('readonly') === '1' || params.get('testAuth') === '1');
    var rolePreview = state.auth.authenticated && state.auth.role === 'readonly';
    var previewOnly = forcedPreview || rolePreview;
    var canOpen = siteUnlocked();
    var canWrite = canOpen && !previewOnly && ['blocked', 'readonly'].indexOf(state.auth.role) < 0;
    return {
      previewOnly: previewOnly,
      canOpen: canOpen,
      canWrite: canWrite
    };
  }

  function captureScrollPosition() {
    var matrix = document.querySelector('.matrix-scroll');
    return {
      x: window.pageXOffset || document.documentElement.scrollLeft || 0,
      y: window.pageYOffset || document.documentElement.scrollTop || 0,
      matrixX: matrix ? matrix.scrollLeft : 0,
      matrixY: matrix ? matrix.scrollTop : 0
    };
  }

  function restoreScrollPosition(position) {
    if (!position) return;
    window.requestAnimationFrame(function () {
      window.scrollTo(position.x || 0, position.y || 0);
      var matrix = document.querySelector('.matrix-scroll');
      if (matrix) {
        matrix.scrollLeft = position.matrixX || 0;
        matrix.scrollTop = position.matrixY || 0;
      }
    });
  }

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = String(target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function selectedCellKey() {
    return {
      dateKey: state.scheduleSelection.dateKey || '',
      empId: state.scheduleSelection.empId || ''
    };
  }

  function hasSelectedCell() {
    var sel = selectedCellKey();
    return Boolean(sel.dateKey && sel.empId);
  }

  function findScheduleCellEl(dateKey, empId) {
    var grid = $('scheduleGrid');
    if (!grid || !dateKey || !empId) return null;
    var nodes = grid.querySelectorAll('[data-schedule-edit-open]');
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].getAttribute('data-schedule-edit-open') === dateKey && nodes[i].getAttribute('data-schedule-edit-emp') === empId) {
        return nodes[i];
      }
    }
    return null;
  }

  function removeScheduleEditorOverlay() {
    var grid = $('scheduleGrid');
    if (!grid) return;
    var overlay = grid.querySelector('[data-schedule-editor-overlay]');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function clipboardFromShift(shift) {
    if (!shift) {
      return { action: 'clear', start: '', end: '', label: '빈칸' };
    }
    if (shift.state === 'off') {
      return { action: 'off', start: '', end: '', label: '휴무' };
    }
    if (shift.state === 'shift') {
      return {
        action: 'upsert_shift',
        start: String(shift.start || '').trim(),
        end: String(shift.end || '').trim(),
        label: compactShiftLabel(shift) || '근무'
      };
    }
    return { action: 'clear', start: '', end: '', label: '빈칸' };
  }

  function writeSystemClipboard(text) {
    var value = String(text || '');
    if (!value) return;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(value).catch(function () {});
      return;
    }
    try {
      var area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    } catch (error) {}
  }

  function mergeInlineWriteLocal(items) {
    (items || []).forEach(function (item) {
      if (!item || !item.path) return;
      var prefix = WORKSCHEDULE_BASE + '/';
      var rest = item.path.indexOf(prefix) === 0 ? item.path.slice(prefix.length) : String(item.path || '').replace(/^\//, '');
      var parts = rest.split('/');
      if (parts[0] === 'overrides' && parts.length >= 3) {
        if (!state.overrides[parts[1]] || typeof state.overrides[parts[1]] !== 'object') state.overrides[parts[1]] = {};
        state.overrides[parts[1]][parts[2]] = item.payload;
      }
      if (parts[0] === 'status' && parts.length >= 3) {
        if (!state.statuses[parts[1]] || typeof state.statuses[parts[1]] !== 'object') state.statuses[parts[1]] = {};
        state.statuses[parts[1]][parts[2]] = item.payload;
      }
    });
  }

  function matrixCellClassNames(dateKey, empId, shift) {
    var info = operationalInfo();
    var editorOpen = state.scheduleEditor.open && state.scheduleEditor.dateKey === dateKey && state.scheduleEditor.empId === empId;
    var selected = state.scheduleSelection.dateKey === dateKey && state.scheduleSelection.empId === empId;
    var copied = state.scheduleCopiedFrom.dateKey === dateKey && state.scheduleCopiedFrom.empId === empId;
    var cellClasses = ['matrix-cell'];
    if (dateKey === info.operationalKey) cellClasses.push('is-today');
    if (shift && shift.state === 'off') cellClasses.push('is-off');
    if (shift && shift.state === 'shift') cellClasses.push('has-shift');
    if (editorOpen) cellClasses.push('is-open');
    if (selected) cellClasses.push('is-selected');
    if (copied) cellClasses.push('is-copied');
    return cellClasses;
  }

  function matrixCellInnerHtml(dateKey, empId, shift) {
    var info = operationalInfo();
    var emp = normalizeEmployee(empId, state.employees[empId] || {});
    var selected = state.scheduleSelection.dateKey === dateKey && state.scheduleSelection.empId === empId;
    var copied = state.scheduleCopiedFrom.dateKey === dateKey && state.scheduleCopiedFrom.empId === empId;
    var shiftLabel = compactShiftLabel(shift);
    var roleLabelText = shift ? (shift.role || '') : '';
    var chip = dateKey === info.operationalKey && shift && shift.state === 'shift' ? '<span class="cell-chip today">기준</span>' : '';
    var marks = '';
    if (selected) marks += '<span class="cell-select-mark" aria-hidden="true"></span>';
    if (copied) marks += '<span class="cell-copy-mark" aria-hidden="true"></span>';
    var editorOpen = state.scheduleEditor.open && state.scheduleEditor.dateKey === dateKey && state.scheduleEditor.empId === empId;
    var inlineValue = shift && shift.state === 'off' ? '휴무' : (shift && shift.start && shift.end ? shift.start + '-' + shift.end : '');
    return '<button class="matrix-cell-button' + (editorOpen ? ' is-editing' : '') + '" type="button" aria-label="' + escapeHtml(emp.shortName + ' ' + dateKey + ' ' + (shiftLabel || '빈칸')) + '" aria-selected="' + (selected ? 'true' : 'false') + '">' +
      (editorOpen ? '<input class="cell-inline-input" data-cell-inline="1" value="' + escapeHtml(inlineValue) + '" autofocus><span class="cell-inline-actions"><button type="button" data-schedule-editor-quick="off">휴무</button><button type="button" data-schedule-editor-quick="clear">비우기</button><button type="button" data-schedule-editor-action="copy">복사</button></span>' : (shiftLabel ? '<span class="matrix-time">' + escapeHtml(shiftLabel) + '</span>' : '<span class="matrix-time is-empty"></span>')) +
      (roleLabelText ? '<span class="matrix-role">' + escapeHtml(roleLabelText) + '</span>' : '') +
      (chip ? '<span class="matrix-chip-row">' + chip + '</span>' : '') +
      marks +
      '</button>';
  }

  function paintScheduleCell(dateKey, empId) {
    var cell = findScheduleCellEl(dateKey, empId);
    if (!cell || !cell.classList.contains('matrix-cell')) {
      syncSelectionClassesOnly();
      renderScheduleSheetBar();
      return;
    }
    var shift = buildShift(empId, state.employees[empId], dateKey);
    cell.className = matrixCellClassNames(dateKey, empId, shift).join(' ');
    cell.innerHTML = matrixCellInnerHtml(dateKey, empId, shift);
    cell.setAttribute('aria-selected', state.scheduleSelection.dateKey === dateKey && state.scheduleSelection.empId === empId ? 'true' : 'false');
  }

  function syncSelectionClassesOnly() {
    var grid = $('scheduleGrid');
    if (!grid) return;
    var nodes = grid.querySelectorAll('.matrix-cell');
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var dateKey = node.getAttribute('data-schedule-edit-open') || '';
      var empId = node.getAttribute('data-schedule-edit-emp') || '';
      var selected = state.scheduleSelection.dateKey === dateKey && state.scheduleSelection.empId === empId;
      var copied = state.scheduleCopiedFrom.dateKey === dateKey && state.scheduleCopiedFrom.empId === empId;
      node.classList.toggle('is-selected', selected);
      node.classList.toggle('is-copied', copied);
      node.setAttribute('aria-selected', selected ? 'true' : 'false');
      var btn = node.querySelector('.matrix-cell-button');
      if (!btn) continue;
      var selectMark = btn.querySelector('.cell-select-mark');
      var copyMark = btn.querySelector('.cell-copy-mark');
      if (selected && !selectMark) {
        selectMark = document.createElement('span');
        selectMark.className = 'cell-select-mark';
        selectMark.setAttribute('aria-hidden', 'true');
        btn.appendChild(selectMark);
      } else if (!selected && selectMark) {
        selectMark.parentNode.removeChild(selectMark);
      }
      if (copied && !copyMark) {
        copyMark = document.createElement('span');
        copyMark.className = 'cell-copy-mark';
        copyMark.setAttribute('aria-hidden', 'true');
        btn.appendChild(copyMark);
      } else if (!copied && copyMark) {
        copyMark.parentNode.removeChild(copyMark);
      }
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
  }

  function refreshScheduleSummaryTiles() {
    var info = operationalInfo();
    var stats = dayWorkStats(info.operationalKey);
    setText('summaryTodayCount', String(stats.count) + '명');
    setText('summaryNightCount', String(stats.nightCount) + '명');
    setText('summaryAttendance', scheduleBaseDateKey(info));
  }

  function selectScheduleCell(dateKey, empId) {
    if (!dateKey || !empId) return;
    state.scheduleSelection = { dateKey: dateKey, empId: empId };
    state.rosterAdd.open = false;
    syncSelectionClassesOnly();
    renderScheduleSheetBar();
    var cell = findScheduleCellEl(dateKey, empId);
    if (cell && typeof cell.scrollIntoView === 'function') {
      try {
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (error) {
        cell.scrollIntoView(false);
      }
    }
  }

  function handleScheduleCellPointer(dateKey, empId) {
    if (!dateKey || !empId) return;
    var access = scheduleEditorAccessInfo();
    if (!access.canOpen) {
      setText('scheduleStatus', '인증 후 열 수 있습니다.');
      return;
    }
    selectScheduleCell(dateKey, empId);
    openScheduleEditor(dateKey, empId);
  }

  function moveScheduleSelection(dCol, dRow) {
    var info = operationalInfo();
    var keys = scheduleVisibleDateKeys(info);
    if (!keys.length) keys = [scheduleBaseDateKey(info)];
    var employees = scheduleVisibleEmployees(keys).map(function (pair) { return pair[0]; });
    if (!employees.length) return;
    var dateKey = state.scheduleSelection.dateKey || keys[0];
    var empId = state.scheduleSelection.empId || employees[0];
    var col = keys.indexOf(dateKey);
    var row = employees.indexOf(empId);
    if (col < 0) col = 0;
    if (row < 0) row = 0;
    col = Math.max(0, Math.min(keys.length - 1, col + dCol));
    row = Math.max(0, Math.min(employees.length - 1, row + dRow));
    selectScheduleCell(keys[col], employees[row]);
  }

  function loadEditorFromSpec(dateKey, empId, spec) {
    state.scheduleEditor = Object.assign({}, state.scheduleEditor, {
      open: state.scheduleEditor.open,
      dateKey: dateKey,
      empId: empId,
      preset: spec.preset || (spec.action === 'off' ? 'off' : (spec.action === 'clear' ? 'clear' : 'custom')),
      start: spec.start || '',
      end: spec.end || '',
      off: spec.action === 'off' || Boolean(spec.off),
      clear: spec.action === 'clear' || Boolean(spec.clear),
      submitting: false,
      statusMessage: state.scheduleEditor.statusMessage || ''
    });
  }

  function sheetPresetSpec(presetKey) {
    var found = INLINE_SHIFT_PRESETS.filter(function (item) { return item.key === presetKey; })[0];
    if (!found) return null;
    if (found.off) return { action: 'off', preset: 'off', start: '', end: '', off: true, clear: false };
    if (found.clear) return { action: 'clear', preset: 'clear', start: '', end: '', off: false, clear: true };
    if (found.custom) return { action: 'custom', preset: 'custom', start: state.scheduleEditor.start || '17:00', end: state.scheduleEditor.end || '03:00', off: false, clear: false };
    return {
      action: 'upsert_shift',
      preset: found.key,
      start: found.start,
      end: found.end,
      off: false,
      clear: false
    };
  }

  async function applySpecToCell(dateKey, empId, spec) {
    if (!dateKey || !empId || !spec) return false;
    if (spec.action === 'custom') {
      openScheduleEditor(dateKey, empId);
      return false;
    }
    loadEditorFromSpec(dateKey, empId, spec);
    return submitScheduleInlineEdit({ fromSheet: true });
  }

  async function applySheetPreset(presetKey) {
    var access = scheduleEditorAccessInfo();
    if (!access.canWrite) {
      setText('scheduleStatus', '조회만 가능합니다.');
      return;
    }
    if (!hasSelectedCell()) {
      setText('scheduleStatus', '칸을 먼저 선택하세요.');
      return;
    }
    var spec = sheetPresetSpec(presetKey);
    if (!spec) return;
    await applySpecToCell(state.scheduleSelection.dateKey, state.scheduleSelection.empId, spec);
  }

  function copySelectedScheduleCell() {
    if (!hasSelectedCell()) {
      setText('scheduleStatus', '칸을 먼저 선택하세요.');
      return;
    }
    var dateKey = state.scheduleSelection.dateKey;
    var empId = state.scheduleSelection.empId;
    var shift = buildShift(empId, state.employees[empId], dateKey);
    var clip = clipboardFromShift(shift);
    state.scheduleClipboard = clip;
    state.scheduleCopiedFrom = { dateKey: dateKey, empId: empId };
    writeSystemClipboard(clip.label === '빈칸' ? '' : clip.label);
    syncSelectionClassesOnly();
    renderScheduleSheetBar();
    setText('scheduleStatus', '복사: ' + clip.label);
  }

  async function pasteScheduleClipboard() {
    var access = scheduleEditorAccessInfo();
    if (!access.canWrite) {
      setText('scheduleStatus', '조회만 가능합니다.');
      return;
    }
    if (!hasSelectedCell()) {
      setText('scheduleStatus', '칸을 먼저 선택하세요.');
      return;
    }
    var clip = state.scheduleClipboard;
    if (!clip) {
      setText('scheduleStatus', '복사된 근무가 없습니다.');
      return;
    }
    await applySpecToCell(state.scheduleSelection.dateKey, state.scheduleSelection.empId, {
      action: clip.action,
      start: clip.start,
      end: clip.end,
      off: clip.action === 'off',
      clear: clip.action === 'clear',
      preset: clip.action === 'off' ? 'off' : (clip.action === 'clear' ? 'clear' : 'custom')
    });
  }

  async function clearSelectedScheduleCell() {
    await applySheetPreset('clear');
  }

  async function copyPreviousDayToSelected() {
    var access = scheduleEditorAccessInfo();
    if (!access.canWrite) {
      setText('scheduleStatus', '조회만 가능합니다.');
      return;
    }
    if (!hasSelectedCell()) {
      setText('scheduleStatus', '칸을 먼저 선택하세요.');
      return;
    }
    var dateKey = state.scheduleSelection.dateKey;
    var empId = state.scheduleSelection.empId;
    var prevKey = shiftDateKey(dateKey, -1);
    var shift = buildShift(empId, state.employees[empId], prevKey);
    var clip = clipboardFromShift(shift);
    await applySpecToCell(dateKey, empId, {
      action: clip.action,
      start: clip.start,
      end: clip.end,
      off: clip.action === 'off',
      clear: clip.action === 'clear',
      preset: clip.action === 'off' ? 'off' : (clip.action === 'clear' ? 'clear' : 'custom')
    });
  }

  function sheetTileHtml(attrs, label, glyph, disabled, active) {
    return '<button class="sheet-tile' + (active ? ' is-active' : '') + (disabled ? ' is-disabled' : '') + '" type="button"' + attrs + (disabled ? ' disabled aria-disabled="true"' : '') + '>' +
      '<span class="sheet-tile-glyph" aria-hidden="true">' + glyph + '</span>' +
      '<span class="sheet-tile-label">' + escapeHtml(label) + '</span>' +
      '</button>';
  }

  function renderBriefingContext() {
    var box = $('briefingContext');
    if (!box) return;
    var ctx = state.briefingContext;
    if (!ctx || typeof ctx !== 'object') {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var todayKey = operationalInfo().calendarKey;
    var weatherDays = Array.isArray(ctx.weather_days) ? ctx.weather_days : [];
    var todayWeather = '';
    weatherDays.forEach(function (row) {
      if (row && row.date === todayKey) todayWeather = String(row.brief || '');
    });
    if (!todayWeather && weatherDays[0]) todayWeather = String(weatherDays[0].brief || '');
    var news = (Array.isArray(ctx.news_lines) ? ctx.news_lines : []).slice(0, 2);
    box.hidden = false;
    box.innerHTML = '<div class="briefing-chip"><b>날씨</b><span>' + escapeHtml(todayWeather || '갱신 대기') + '</span></div>' +
      '<div class="briefing-chip"><b>뉴스</b><span>' + escapeHtml(news.join(' · ') || '갱신 대기') + '</span></div>';
  }

  function renderScheduleSheetBar() {
    var bar = $('scheduleSheetBar');
    if (!bar) return;
    bar.hidden = true;
    bar.innerHTML = '';
    return;
    var access = scheduleEditorAccessInfo();
    var sel = selectedCellKey();
    var hasSel = Boolean(sel.dateKey && sel.empId);
    var shift = hasSel ? buildShift(sel.empId, state.employees[sel.empId], sel.dateKey) : null;
    var cellLabel = hasSel ? (compactShiftLabel(shift) || '빈칸') : '칸 선택';
    var who = hasSel ? (employeeName(sel.empId) + ' · ' + sel.dateKey) : '칸을 누르세요';
    var clip = state.scheduleClipboard;
    var clipToken = clip ? clip.label : '없음';
    var writeBlocked = !access.canWrite;
    var noSel = !hasSel;
    var disabled = writeBlocked || noSel;
    var tiles = '';
    tiles += sheetTileHtml(' data-sheet-action="copy"', '복사', '⧉', noSel || !access.canOpen, false);
    tiles += sheetTileHtml(' data-sheet-action="paste"', '붙여넣기', '⇩', disabled || !clip, false);
    tiles += sheetTileHtml(' data-sheet-preset="off"', '휴무', '⊘', disabled, false);
    tiles += sheetTileHtml(' data-sheet-preset="night"', '17-03', '☾', disabled, false);
    tiles += sheetTileHtml(' data-sheet-preset="day"', '09-18', '☀', disabled, false);
    tiles += sheetTileHtml(' data-sheet-preset="mid"', '12-21', '◐', disabled, false);
    tiles += sheetTileHtml(' data-sheet-preset="clear"', '비우기', '×', disabled, false);
    tiles += sheetTileHtml(' data-sheet-action="prev-day"', '전날복사', '⟲', disabled, false);
    tiles += sheetTileHtml(' data-sheet-preset="custom"', '직접', '✎', noSel || !access.canOpen, false);
    bar.innerHTML =
      '<div class="sheet-bar-main">' +
      '<div class="sheet-bar-cell">' +
      '<span class="sheet-bar-kicker">선택</span>' +
      '<strong class="sheet-bar-value">' + escapeHtml(who + (hasSel ? ' · ' + cellLabel : '')) + '</strong>' +
      '</div>' +
      '<div class="sheet-bar-clip">' +
      '<span class="sheet-bar-kicker">클립</span>' +
      '<span class="sheet-clip-token' + (clip ? ' has-value' : '') + '">' + escapeHtml(clipToken) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="sheet-bar-tiles" role="toolbar" aria-label="근무 빠른 조작">' + tiles + '</div>';
  }


  function setScheduleEditorMessage(message) {
    state.scheduleEditor.statusMessage = message;
    renderSchedule();
  }

  function rosterHelper() {
    return window.HynixScheduleLogic || null;
  }

  function parseRosterDraft(text) {
    var helper = rosterHelper();
    if (helper && typeof helper.parseRosterNames === 'function') {
      return helper.parseRosterNames(text);
    }
    return String(text || '').split(/[\n\r\t,;|/]+/).map(function (part) {
      return String(part || '').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  function rosterChipHtml(name) {
    return '<span class="roster-chip">' + escapeHtml(name) + '</span>';
  }

  function syncRosterDraft(value) {
    state.rosterAdd.draft = String(value || '');
    var chips = $('rosterAddChips');
    if (!chips) return;
    var names = parseRosterDraft(state.rosterAdd.draft);
    chips.innerHTML = names.map(rosterChipHtml).join('');
  }

  function restoreRosterAddFocus() {
    var input = $('rosterAddInput');
    if (!state.rosterAdd.open || !input) return;
    input.focus();
    var len = input.value.length;
    try {
      input.setSelectionRange(len, len);
    } catch (error) {}
  }

  function rosterAddPanelHtml() {
    if (!state.rosterAdd.open) return '';
    var access = scheduleEditorAccessInfo();
    var names = parseRosterDraft(state.rosterAdd.draft);
    var countLabel = names.length ? String(names.length) + '명' : '대기 없음';
    return '<div class="schedule-editor-overlay" data-roster-add-overlay>' +
      '<div class="schedule-editor-backdrop" data-roster-add-close></div>' +
      '<section class="schedule-modal-card schedule-edit-panel roster-add-card" role="dialog" aria-modal="true" aria-labelledby="rosterAddTitle">' +
      '<div class="inline-editor-head">' +
      '<div>' +
      '<strong id="rosterAddTitle">명단 추가</strong>' +
      '<span>이름 입력 후 Enter, 여러 이름은 붙여넣기</span>' +
      '</div>' +
      '<div class="inline-editor-badge-row"><span class="inline-mode-badge">' + escapeHtml(access.previewOnly ? '미리보기' : '바로 반영') + '</span><button class="icon-button" type="button" aria-label="명단 닫기" data-roster-add-close>x</button></div>' +
      '</div>' +
      '<label class="roster-add-field">' +
      '<span class="sr-only">이름 목록</span>' +
      '<textarea id="rosterAddInput" class="roster-add-input" rows="4" data-roster-add-field="draft" placeholder="김철수&#10;이영희" ' + (state.rosterAdd.submitting ? 'disabled' : '') + '>' + escapeHtml(state.rosterAdd.draft) + '</textarea>' +
      '</label>' +
      '<div class="roster-add-chips" id="rosterAddChips">' + names.map(rosterChipHtml).join('') + '</div>' +
      '<div class="inline-editor-footer">' +
      '<span class="request-status" id="rosterAddStatus">' + escapeHtml(state.rosterAdd.statusMessage || countLabel) + '</span>' +
      '<button class="request-button inline-save-button" type="button" data-roster-add-save' + (state.rosterAdd.submitting || access.previewOnly ? ' disabled' : '') + '>' + (state.rosterAdd.submitting ? '추가 중' : '추가') + '</button>' +
      '</div>' +
      '</section>' +
      '</div>';
  }

  function openRosterAdd() {
    var access = scheduleEditorAccessInfo();
    if (!access.canWrite) {
      setText('scheduleStatus', access.canOpen ? '조회 권한으로는 명단을 추가할 수 없습니다.' : '인증 후 명단을 추가할 수 있습니다.');
      return;
    }
    state.scheduleEditor = Object.assign({}, state.scheduleEditor, {
      open: false,
      dateKey: '',
      empId: '',
      submitting: false
    });
    state.rosterAdd.open = true;
    state.rosterAdd.submitting = false;
    if (!state.rosterAdd.statusMessage) {
      state.rosterAdd.statusMessage = '이름 입력 후 Enter, 또는 여러 이름 붙여넣기.';
    }
    renderSchedule();
  }

  function closeRosterAdd() {
    state.rosterAdd = Object.assign({}, state.rosterAdd, {
      open: false,
      draft: '',
      submitting: false,
      statusMessage: ''
    });
    renderSchedule();
  }

  async function submitRosterAdd() {
    var access = scheduleEditorAccessInfo();
    if (!access.canWrite || state.rosterAdd.submitting) return;
    var helper = rosterHelper();
    var plan = helper && typeof helper.planRosterAdds === 'function'
      ? helper.planRosterAdds(state.rosterAdd.draft, state.employees)
      : { names: parseRosterDraft(state.rosterAdd.draft), adds: [], skipped: [] };
    if (!plan.adds.length) {
      state.rosterAdd.statusMessage = plan.skipped.length ? '이미 있는 이름입니다.' : '이름을 입력하세요.';
      renderSchedule();
      return;
    }
    var now = Date.now();
    var records = {};
    plan.adds.forEach(function (item) {
      records[item.id] = Object.assign({}, item.payload, {
        source: 'hynix_portal',
        updated_at_ms: now
      });
    });
    state.rosterAdd.submitting = true;
    state.rosterAdd.statusMessage = String(plan.adds.length) + '명 저장 중';
    renderSchedule();
    try {
      await patchJson(WORKSCHEDULE_BASE + '/employees', records);
      Object.keys(records).forEach(function (empId) {
        state.employees[empId] = records[empId];
      });
      state.scheduleShowEmptyEmployees = true;
      state.rosterAdd.draft = '';
      state.rosterAdd.submitting = false;
      var added = plan.adds.map(function (item) { return item.name; }).join(', ');
      var extra = plan.skipped.length ? ' · 이미 있음 ' + String(plan.skipped.length) + '명' : '';
      state.rosterAdd.statusMessage = added + ' 추가' + extra;
      renderSchedule();
    } catch (error) {
      state.rosterAdd.submitting = false;
      state.rosterAdd.statusMessage = '저장하지 못했습니다. 다시 시도하세요.';
      renderSchedule();
    }
  }

  function maybeCommitRosterPaste(raw) {
    var names = parseRosterDraft(raw);
    if (names.length >= 2 || /[\n\r\t,;|]/.test(String(raw || ''))) {
      submitRosterAdd();
      return true;
    }
    return false;
  }

  function openScheduleEditor(dateKey, empId, options) {
    var access = scheduleEditorAccessInfo();
    if (!access.canOpen) {
      setText('scheduleStatus', '인증 후 열 수 있습니다.');
      return;
    }
    options = options || {};
    state.rosterAdd.open = false;
    selectScheduleCell(dateKey, empId);
    var currentShift = buildShift(empId, state.employees[empId] || {}, dateKey);
    var preset = inlinePresetForShift(currentShift);
    state.scheduleEditor = {
      open: true,
      dateKey: dateKey,
      empId: empId,
      preset: preset.preset,
      start: preset.start,
      end: preset.end,
      off: preset.off,
      clear: preset.clear,
      submitting: false,
      statusMessage: access.previewOnly
        ? '미리보기로 열렸습니다.'
        : (currentShift && currentShift.state === 'off'
          ? '휴무로 바꾸거나 시간을 조정할 수 있습니다.'
          : '직접 시간만 조정합니다.')
    };
    removeScheduleEditorOverlay();
    paintScheduleCell(dateKey, empId);
    restoreCellEditFocus();
  }

  function editorDraftValue() {
    var input = document.querySelector('[data-cell-inline="1"]');
    return input ? input.value : '';
  }

  function parseCellDraft(raw) {
    var value = String(raw || '').trim();
    if (!value) return { action: 'clear', clear: true, off: false };
    if (/^(휴무|휴|off)$/i.test(value)) return { action: 'off', clear: false, off: true };
    var match = value.match(/^(\d{1,2})(?::?(\d{2}))?\s*[-~]\s*(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return null;
    var startHour = Number(match[1]), startMinute = Number(match[2] || 0), endHour = Number(match[3]), endMinute = Number(match[4] || 0);
    if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;
    return { action: 'upsert_shift', clear: false, off: false, start: String(startHour).padStart(2, '0') + ':' + String(startMinute).padStart(2, '0'), end: String(endHour).padStart(2, '0') + ':' + String(endMinute).padStart(2, '0') };
  }

  function restoreCellEditFocus() {
    var input = document.querySelector('[data-cell-inline="1"]');
    if (!input) return;
    input.focus();
    input.select();
  }

  async function commitOpenCellFromInput(moveCol, moveRow) {
    var parsed = parseCellDraft(editorDraftValue());
    if (!parsed) { setText('scheduleStatus', '시간 형식'); restoreCellEditFocus(); return false; }
    Object.assign(state.scheduleEditor, parsed, { preset: parsed.action === 'off' ? 'off' : 'custom' });
    var saved = await submitScheduleInlineEdit();
    if (saved && (moveCol || moveRow)) { moveScheduleSelection(moveCol, moveRow); openScheduleEditor(state.scheduleSelection.dateKey, state.scheduleSelection.empId); }
    return saved;
  }

  function closeScheduleEditor(options) {
    options = options || {};
    var dateKey = state.scheduleEditor.dateKey;
    var empId = state.scheduleEditor.empId;
    var wasOpen = state.scheduleEditor.open;
    state.scheduleEditor = Object.assign({}, state.scheduleEditor, {
      open: false,
      submitting: false
    });
    if (options.rebuild) {
      renderSchedule();
      return;
    }
    if (wasOpen) removeScheduleEditorOverlay();
    if (dateKey && empId) paintScheduleCell(dateKey, empId);
    renderScheduleSheetBar();
  }

  function updateScheduleEditorField(field, value) {
    if (field === 'off') {
      state.scheduleEditor.off = Boolean(value);
      if (state.scheduleEditor.off) {
        state.scheduleEditor.clear = false;
        state.scheduleEditor.preset = 'off';
      }
      return;
    }
    if (field === 'clear') {
      state.scheduleEditor.clear = Boolean(value);
      if (state.scheduleEditor.clear) {
        state.scheduleEditor.off = false;
      }
      return;
    }
    if (field === 'preset') {
      var found = INLINE_SHIFT_PRESETS.filter(function (item) { return item.key === value; })[0];
      state.scheduleEditor.preset = value;
      state.scheduleEditor.off = Boolean(found && found.off);
      state.scheduleEditor.clear = false;
      if (found && found.start && found.end) {
        state.scheduleEditor.start = found.start;
        state.scheduleEditor.end = found.end;
      }
      if (found && found.custom) {
        state.scheduleEditor.start = state.scheduleEditor.start || '17:00';
        state.scheduleEditor.end = state.scheduleEditor.end || '03:00';
      }
      return;
    }
    if (field === 'start' || field === 'end') {
      state.scheduleEditor[field] = String(value || '');
      state.scheduleEditor.preset = 'custom';
      state.scheduleEditor.off = false;
      state.scheduleEditor.clear = false;
    }
  }

  function scheduleEditorAction() {
    if (state.scheduleEditor.clear) return 'clear';
    if (state.scheduleEditor.off) return 'off';
    return 'upsert_shift';
  }

  function setScheduleEditorQuickState(nextState) {
    state.scheduleEditor = Object.assign({}, state.scheduleEditor, nextState, {
      off: Boolean(nextState && nextState.off),
      clear: Boolean(nextState && nextState.clear)
    });
  }

  async function runScheduleQuickAction(action) {
    var access = scheduleEditorAccessInfo();
    if (!state.scheduleEditor.open) return;
    if (action === 'direct') {
      setScheduleEditorQuickState({
        preset: 'custom',
        off: false,
        clear: false,
        statusMessage: access.previewOnly ? '미리보기로 직접 입력을 엽니다.' : '직접 입력으로 바꿨습니다.'
      });
      renderSchedule();
      return;
    }
    if (action === 'off') {
      setScheduleEditorQuickState({
        preset: 'off',
        off: true,
        clear: false,
        statusMessage: access.previewOnly ? '미리보기로 휴무가 적용됩니다.' : '휴무로 바꿉니다.'
      });
    } else if (action === 'clear') {
      setScheduleEditorQuickState({
        preset: 'clear',
        off: false,
        clear: true,
        statusMessage: access.previewOnly ? '미리보기로 비웁니다.' : '비웁니다.'
      });
    } else if (action === 'start-1' || action === 'start+1' || action === 'end-1' || action === 'end+1' || action === 'all-1' || action === 'all+1') {
      var delta = action.indexOf('-1') >= 0 ? -60 : 60;
      var nextStart = state.scheduleEditor.start;
      var nextEnd = state.scheduleEditor.end;
      if (action.indexOf('start') === 0) {
        nextStart = shiftClock(nextStart, delta);
      } else if (action.indexOf('end') === 0) {
        nextEnd = shiftClock(nextEnd, delta);
      } else {
        nextStart = shiftClock(nextStart, delta);
        nextEnd = shiftClock(nextEnd, delta);
      }
      setScheduleEditorQuickState({
        preset: 'custom',
        start: nextStart,
        end: nextEnd,
        off: false,
        clear: false,
        statusMessage: access.previewOnly ? '미리보기로 시간만 바뀝니다.' : '바로 반영합니다.'
      });
    }
    renderSchedule();
    if (!access.canWrite || action === 'direct') {
      return;
    }
    await submitScheduleInlineEdit();
  }

  function buildInlineScheduleWriteItems(dateKey, empId) {
    var action = scheduleEditorAction();
    var now = Date.now();
    var empName = employeePayloadName(empId);
    var roleValue = state.employees[empId] && state.employees[empId].role ? String(state.employees[empId].role || '').trim() : empName;
    var overridePayload = {
      employee_id: empId,
      employee: empName,
      action: action,
      role: roleValue,
      apply_policy: 'overwrite',
      source: 'hynix_portal_inline',
      updated_at_ms: now
    };
    if (action === 'upsert_shift') {
      overridePayload = Object.assign({}, overridePayload, {
        state: 'shift',
        shift: {
          start: state.scheduleEditor.start,
          end: state.scheduleEditor.end,
          role: roleValue
        },
        start: state.scheduleEditor.start,
        end: state.scheduleEditor.end,
        role: roleValue,
        time_range: state.scheduleEditor.start + '-' + state.scheduleEditor.end
      });
    } else if (action === 'off') {
      overridePayload = Object.assign({}, overridePayload, {
        state: 'off',
        off: true,
        dayoff: true,
        work: false
      });
    } else {
      overridePayload = Object.assign({}, overridePayload, {
        state: 'clear',
        clear: true,
        work: false,
        off: false
      });
    }
    return [
      {
        path: WORKSCHEDULE_BASE + '/overrides/' + dateKey + '/' + empId,
        payload: overridePayload,
        calendar: { entity: 'daily_override', dateKey: dateKey, empId: empId, action: action, row: overridePayload }
      },
      {
        path: WORKSCHEDULE_BASE + '/status/' + dateKey + '/' + empId,
        payload: action === 'upsert_shift'
          ? {
            status: 'confirmed',
            state: 'confirmed',
            confirmed: true,
            updated_at_ms: now,
            source: 'hynix_portal_inline'
          }
          : action === 'off'
            ? {
              status: 'off',
              state: 'off',
              confirmed: true,
              updated_at_ms: now,
              source: 'hynix_portal_inline'
            }
            : {
              status: 'clear',
              state: 'clear',
              updated_at_ms: now,
              source: 'hynix_portal_inline'
            }
      }
    ];
  }

  function inlinePresetButtonHtml(item) {
    var active = state.scheduleEditor.preset === item.key || (item.key === 'off' && state.scheduleEditor.off);
    return '<button class="inline-chip' + (active ? ' is-active' : '') + '" type="button" data-schedule-editor-preset="' + item.key + '">' + escapeHtml(item.label) + '</button>';
  }

  function scheduleEditorHtml(dateKey, shift) {
    if (!state.scheduleEditor.open || state.scheduleEditor.dateKey !== dateKey || state.scheduleEditor.empId !== shift.id) {
      return '';
    }
    var editor = state.scheduleEditor;
    var access = scheduleEditorAccessInfo();
    var title = shift.state === 'off' ? '휴무' : ((shift.start || '--:--') + '~' + (shift.end || '--:--'));
    return '<div class="schedule-editor-overlay" data-schedule-editor-overlay>' +
      '<div class="schedule-editor-backdrop" data-schedule-editor-close></div>' +
      '<section class="schedule-modal-card schedule-edit-panel' + (editor.off ? ' is-off' : '') + (access.previewOnly ? ' is-preview' : ' is-live') + '" role="dialog" aria-modal="true" aria-labelledby="scheduleEditorTitle">' +
      '<div class="inline-editor-head">' +
      '<div>' +
      '<strong id="scheduleEditorTitle">' + escapeHtml(shift.employee.shortName) + '</strong>' +
      '<span>' + escapeHtml(dateKey + ' · ' + title) + '</span>' +
      '</div>' +
      '<div class="inline-editor-badge-row"><span class="inline-mode-badge">' + escapeHtml(access.previewOnly ? '미리보기' : '바로 반영') + '</span><button class="icon-button" type="button" aria-label="편집 닫기" data-schedule-editor-close>x</button></div>' +
      '</div>' +
      '<div class="inline-quick-grid">' +
      '<button class="inline-quick" type="button" data-schedule-editor-quick="start-1">출근 -1h</button>' +
      '<button class="inline-quick" type="button" data-schedule-editor-quick="start+1">출근 +1h</button>' +
      '<button class="inline-quick" type="button" data-schedule-editor-quick="end-1">퇴근 -1h</button>' +
      '<button class="inline-quick" type="button" data-schedule-editor-quick="end+1">퇴근 +1h</button>' +
      '<button class="inline-quick wide" type="button" data-schedule-editor-quick="all-1">전체 -1h</button>' +
      '<button class="inline-quick wide" type="button" data-schedule-editor-quick="all+1">전체 +1h</button>' +
      '<button class="inline-quick" type="button" data-schedule-editor-quick="off">휴무</button>' +
      '<button class="inline-quick" type="button" data-schedule-editor-quick="direct">직접</button>' +
      '</div>' +
      '<div class="inline-chip-row">' + INLINE_SHIFT_PRESETS.map(inlinePresetButtonHtml).join('') + '</div>' +
      '<div class="inline-time-grid">' +
      '<label><span>시작</span><input data-schedule-editor-field="start" type="time" value="' + escapeHtml(editor.start) + '"' + (editor.off ? ' disabled' : '') + '></label>' +
      '<label><span>종료</span><input data-schedule-editor-field="end" type="time" value="' + escapeHtml(editor.end) + '"' + (editor.off ? ' disabled' : '') + '></label>' +
      '<label class="toggle-field inline-toggle"><input data-schedule-editor-field="off" type="checkbox"' + (editor.off ? ' checked' : '') + '><span>휴무</span></label>' +
      '</div>' +
      '<div class="inline-editor-footer">' +
      '<span class="request-status">' + escapeHtml(editor.statusMessage || '누르면 바로 바꿀 수 있습니다.') + '</span>' +
      '<button class="request-button inline-save-button" type="button" data-schedule-editor-save' + (editor.submitting ? ' disabled' : '') + '>' + (editor.submitting ? '반영 중' : '직접 저장') + '</button>' +
      '</div>' +
      '</section>' +
      '</div>';
  }

  function scheduleEditorPanelHtml() {
    var editor = state.scheduleEditor;
    if (!editor.open || !editor.dateKey || !editor.empId) return '';
    var emp = normalizeEmployee(editor.empId, state.employees[editor.empId] || {});
    if (!emp.active) return '';
    var shift = buildShift(editor.empId, state.employees[editor.empId] || {}, editor.dateKey) || {
      id: editor.empId,
      employee: emp,
      state: 'shift',
      start: '',
      end: '',
      role: emp.role || ''
    };
    return scheduleEditorHtml(editor.dateKey, shift);
  }

  function dayShifts(dateKey) {
    return Object.keys(state.employees)
      .map(function (empId) {
        return buildShift(empId, state.employees[empId], dateKey);
      })
      .filter(Boolean)
      .filter(function (shift) {
        return shift.employee.active;
      })
      .sort(function (a, b) {
        if (a.state !== b.state) return a.state === 'shift' ? -1 : 1;
        if (a.state === 'shift' && b.state === 'shift') {
          return String(a.start || '99:99').localeCompare(String(b.start || '99:99'));
        }
        return a.employee.shortName.localeCompare(b.employee.shortName, 'ko');
      });
  }

  function dayWorkStats(dateKey) {
    var shifts = dayShifts(dateKey).filter(function (shift) {
      return shift.state === 'shift';
    });
    return {
      count: shifts.length,
      nightCount: shifts.filter(isNightShift).length
    };
  }

  function timelineSortKey(shift) {
    var parsed = parseClock(shift.start);
    return parsed === null ? 99999 : parsed;
  }

  function timelineEntries(dateKeys) {
    var entries = [];
    (Array.isArray(dateKeys) ? dateKeys : []).forEach(function (dateKey) {
      dayShifts(dateKey).forEach(function (shift) {
        if (!shift || shift.state !== 'shift') return;
        entries.push({
          dateKey: dateKey,
          shift: shift,
          sortKey: timelineSortKey(shift)
        });
      });
    });
    entries.sort(function (a, b) {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.shift.employee.shortName.localeCompare(b.shift.employee.shortName, 'ko');
    });
    return entries;
  }

  function renderScheduleTimeline(dateKeys, info) {
    var entries = timelineEntries(dateKeys);
    if (!entries.length) {
      return '<div class="empty-block"><div class="empty-title">표시할 근무자가 없습니다.</div><div class="empty-copy">다음 주 더보기로 다른 날짜를 확인하세요.</div></div>';
    }
    var grouped = [];
    entries.forEach(function (entry) {
      var group = grouped[grouped.length - 1];
      if (!group || group.dateKey !== entry.dateKey) {
        group = { dateKey: entry.dateKey, entries: [] };
        grouped.push(group);
      }
      group.entries.push(entry);
    });
    return '<div class="timeline-list">' + grouped.map(function (group) {
      var isToday = group.dateKey === info.operationalKey;
      var rows = group.entries.map(function (entry) {
        var shift = entry.shift;
        var editorOpen = state.scheduleEditor.open && state.scheduleEditor.dateKey === entry.dateKey && state.scheduleEditor.empId === shift.id;
        var role = shift.role || '근무';
        return '<button class="timeline-row' + (editorOpen ? ' is-open' : '') + '" type="button" data-schedule-edit-open="' + escapeHtml(entry.dateKey) + '" data-schedule-edit-emp="' + escapeHtml(shift.id) + '">' +
          '<span class="timeline-time">' + escapeHtml(compactShiftLabel(shift)) + '</span>' +
          '<span class="timeline-name">' + escapeHtml(shift.employee.shortName) + '</span>' +
          (role ? '<span class="timeline-role">' + escapeHtml(role) + '</span>' : '<span class="timeline-role"></span>') +
          '</button>';
      }).join('');
      return '<section class="timeline-day' + (isToday ? ' is-today' : '') + '">' +
        '<div class="timeline-day-head">' +
        '<strong>' + escapeHtml(mmddLabel(group.dateKey) + ' ' + weekdayLabel(group.dateKey)) + '</strong>' +
        '<span>' + escapeHtml(String(group.entries.length) + '명') + '</span>' +
        '</div>' +
        rows +
        '</section>';
    }).join('') + '</div>';
  }

  function timestampClockMinute(value) {
    var parsed = parseClock(value);
    if (parsed === null) return null;
    return parsed;
  }

  var TIMESTAMP_DAY_COLOR_STOPS = [
    { minute: 0, color: '#17213d' },
    { minute: 300, color: '#243c63' },
    { minute: 360, color: '#f59e42' },
    { minute: 720, color: '#fff3a3' },
    { minute: 1020, color: '#f59e42' },
    { minute: 1260, color: '#293d63' },
    { minute: 1440, color: '#17213d' }
  ];

  function hexToRgb(hex) {
    var normalized = String(hex || '').replace('#', '');
    if (normalized.length !== 6) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb) {
    return '#' + [rgb.r, rgb.g, rgb.b].map(function (value) {
      return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    }).join('');
  }

  function timestampColorAt(minute) {
    var safeMinute = Math.max(0, Math.min(1440, minute));
    for (var i = 0; i < TIMESTAMP_DAY_COLOR_STOPS.length - 1; i += 1) {
      var from = TIMESTAMP_DAY_COLOR_STOPS[i];
      var to = TIMESTAMP_DAY_COLOR_STOPS[i + 1];
      if (safeMinute >= from.minute && safeMinute <= to.minute) {
        var span = Math.max(1, to.minute - from.minute);
        var ratio = (safeMinute - from.minute) / span;
        var fromRgb = hexToRgb(from.color);
        var toRgb = hexToRgb(to.color);
        return rgbToHex({
          r: fromRgb.r + (toRgb.r - fromRgb.r) * ratio,
          g: fromRgb.g + (toRgb.g - fromRgb.g) * ratio,
          b: fromRgb.b + (toRgb.b - fromRgb.b) * ratio
        });
      }
    }
    return TIMESTAMP_DAY_COLOR_STOPS[TIMESTAMP_DAY_COLOR_STOPS.length - 1].color;
  }

  function timestampSegmentGradient(start, end) {
    var safeStart = Math.max(0, Math.min(1440, start));
    var safeEnd = Math.max(safeStart, Math.min(1440, end));
    var points = [safeStart];
    TIMESTAMP_DAY_COLOR_STOPS.forEach(function (stop) {
      if (stop.minute > safeStart && stop.minute < safeEnd) {
        points.push(stop.minute);
      }
    });
    if (safeEnd !== safeStart) points.push(safeEnd);
    var span = Math.max(1, safeEnd - safeStart);
    var stops = points.map(function (minute) {
      var pct = (minute - safeStart) / span * 100;
      return timestampColorAt(minute) + ' ' + pct.toFixed(2) + '%';
    });
    return 'linear-gradient(90deg, ' + stops.join(', ') + ')';
  }

  function timestampBarStyle(start, end) {
    var left = Math.max(0, Math.min(100, start / 1440 * 100));
    var width = Math.max(3, Math.min(100 - left, (end - start) / 1440 * 100));
    return 'left:' + left.toFixed(2) + '%;width:' + width.toFixed(2) + '%;background:' + timestampSegmentGradient(start, end) + ';';
  }

  function outputEmployeePairs() {
    return Object.keys(state.employees).map(function (empId) {
      return [empId, normalizeEmployee(empId, state.employees[empId]), state.employees[empId] || {}];
    }).filter(function (row) {
      return row[1].active;
    }).sort(function (a, b) {
      var sa = Number(a[2].sort_order);
      var sb = Number(b[2].sort_order);
      if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
      return a[1].shortName.localeCompare(b[1].shortName, 'ko');
    });
  }

  function outputGaugeHtml(shift) {
    if (!shift) return '<div class="out-track is-empty"></div>';
    if (shift.state === 'off') return '<div class="out-track is-off"><span>휴무</span></div>';
    var segs = timestampBarSegments(shift).map(function (style) {
      return '<span class="out-seg" style="' + style + '"></span>';
    }).join('');
    return '<div class="out-track"><span class="out-track-bg" aria-hidden="true"></span>' + segs + '</div>';
  }

  function outputAxisHtml() {
    return '<div class="out-axis" aria-hidden="true">' +
      '<span>00</span><span>06</span><span>12</span><span>17</span><span>24</span>' +
      '</div>';
  }

  function renderNameOutputBoard(keys) {
    var emps = outputEmployeePairs();
    var head = '<div class="out-name-head"><span class="out-name-who"></span>' + keys.map(function (key) {
      return '<span class="out-name-day">' + escapeHtml(mmddLabel(key) + ' ' + weekdayLabel(key)) + '</span>';
    }).join('') + '</div>';
    var rows = emps.map(function (row) {
      var empId = row[0];
      var emp = row[1];
      var cells = keys.map(function (dateKey) {
        var shift = buildShift(empId, state.employees[empId], dateKey);
        var label = compactShiftLabel(shift) || '';
        return '<div class="out-name-cell">' + outputGaugeHtml(shift) + '<span class="out-cell-label' + (shift && shift.state === 'off' ? ' is-off' : '') + '">' + escapeHtml(label) + '</span></div>';
      }).join('');
      return '<div class="out-name-row"><strong class="out-name-who">' + escapeHtml(emp.shortName) + '</strong>' + cells + '</div>';
    }).join('');
    return '<section class="out-board out-name" aria-label="이름 기준 근무표"><div class="out-scroll">' + head + (rows || '<div class="empty-block">명단이 없습니다.</div>') + '</div></section>';
  }

  function renderDateOutputBoard(keys) {
    var emps = outputEmployeePairs();
    var cards = keys.map(function (dateKey) {
      var rows = emps.map(function (row) {
        var empId = row[0];
        var shift = buildShift(empId, state.employees[empId], dateKey);
        return '<div class="out-date-row"><span class="out-date-who">' + escapeHtml(row[1].shortName) + '</span>' +
          outputGaugeHtml(shift) +
          '<span class="out-cell-label' + (shift && shift.state === 'off' ? ' is-off' : '') + '">' + escapeHtml(compactShiftLabel(shift) || '') + '</span></div>';
      }).join('');
      return '<article class="out-date-card"><h3>' + escapeHtml(mmddLabel(dateKey) + ' ' + weekdayLabel(dateKey)) + '</h3>' +
        '<div class="out-track is-legend"><span class="out-track-bg"></span></div>' + outputAxisHtml() + rows + '</article>';
    }).join('');
    return '<section class="out-board out-date" aria-label="날짜 기준 근무표">' + (cards || '<div class="empty-block">날짜가 없습니다.</div>') + '</section>';
  }

  function monthDateKeys(anchorKey) {
    var safe = safeDateKey(anchorKey, '') || operationalInfo().calendarKey;
    var parts = safe.split('-').map(Number);
    var year = parts[0];
    var month = parts[1];
    var first = year + '-' + String(month).padStart(2, '0') + '-01';
    var keys = [];
    var cur = first;
    while (cur.indexOf(String(year) + '-' + String(month).padStart(2, '0')) === 0) {
      keys.push(cur);
      cur = shiftDateKey(cur, 1);
      if (keys.length > 31) break;
    }
    return keys;
  }

  function renderCalendarOutputBoard(info) {
    var monthKeys = monthDateKeys(info.operationalKey);
    var emps = outputEmployeePairs();
    var startWeekday = dateKeyWeekdayIndex(monthKeys[0] || info.operationalKey);
    var mondayIndex = startWeekday === 0 ? 6 : startWeekday - 1;
    var blanks = '';
    for (var i = 0; i < mondayIndex; i += 1) blanks += '<div class="out-cal-cell is-pad"></div>';
    var cells = monthKeys.map(function (dateKey) {
      var people = emps.map(function (row) {
        var shift = buildShift(row[0], state.employees[row[0]], dateKey);
        if (!shift) return '';
        if (shift.state === 'off') {
          return '<div class="out-cal-person is-off"><span>' + escapeHtml(row[1].shortName) + '</span><b>휴</b></div>';
        }
        return '<div class="out-cal-person"><span>' + escapeHtml(row[1].shortName) + '</span>' + outputGaugeHtml(shift) + '</div>';
      }).join('');
      var today = dateKey === info.operationalKey ? ' is-today' : '';
      return '<div class="out-cal-cell' + today + '"><strong>' + escapeHtml(String(Number(dateKey.slice(8)))) + '</strong>' +
        '<div class="out-track is-legend"><span class="out-track-bg"></span></div>' + people + '</div>';
    }).join('');
    var labels = ['월', '화', '수', '목', '금', '토', '일'].map(function (d) {
      return '<span>' + d + '</span>';
    }).join('');
    var title = monthKeys[0] ? monthKeys[0].slice(0, 7) : '';
    return '<section class="out-board out-cal" aria-label="달력형 근무표"><h3 class="out-cal-title">' + escapeHtml(title) + '</h3>' +
      '<div class="out-cal-week">' + labels + '</div><div class="out-cal-grid">' + blanks + cells + '</div></section>';
  }

  function timestampBarSegments(shift) {
    var start = timestampClockMinute(shift && shift.start);
    var end = timestampClockMinute(shift && shift.end);
    if (start === null || end === null) {
      return [];
    }
    if (end <= start) {
      return [
        timestampBarStyle(start, 1440),
        timestampBarStyle(0, end)
      ];
    }
    return [timestampBarStyle(start, end)];
  }

  function renderTimestampGauge(dateKeys, info) {
    var entries = timelineEntries(dateKeys);
    var rangeLabel = dateKeys.length
      ? (dateKeys[0] === dateKeys[dateKeys.length - 1] ? dateKeys[0] : dateKeys[0] + ' ~ ' + dateKeys[dateKeys.length - 1])
      : info.calendarKey;
    var rows = entries.length ? entries.map(function (entry) {
      var shift = entry.shift;
      var bars = timestampBarSegments(shift).map(function (style) {
        return '<span class="timestamp-bar-segment" style="' + style + '"></span>';
      }).join('');
      return '<button class="timestamp-row" type="button" data-schedule-edit-open="' + escapeHtml(entry.dateKey) + '" data-schedule-edit-emp="' + escapeHtml(shift.id) + '">' +
        '<span class="timestamp-label">' + escapeHtml(mmddLabel(entry.dateKey) + ' ' + weekdayLabel(entry.dateKey) + ' · ' + shift.employee.shortName) + '</span>' +
        '<span class="timestamp-track" aria-hidden="true">' + bars + '</span>' +
        '<span class="timestamp-time">' + escapeHtml(compactShiftLabel(shift)) + '</span>' +
        '</button>';
    }).join('') : '<div class="timestamp-empty">표시할 근무 없음</div>';
    return '<section class="timestamp-panel" aria-label="날짜별 타임스탬프">' +
      '<div class="timestamp-panel-head">' +
      '<span class="timestamp-tab" role="tab" aria-selected="true">날짜별</span>' +
      '<span class="timestamp-range">' + escapeHtml(rangeLabel) + '</span>' +
      '</div>' +
      '<div class="timestamp-scale" aria-hidden="true"></div>' +
      '<div class="timestamp-axis" aria-hidden="true">' +
      '<span class="timestamp-axis-label" data-timestamp-axis-label="00">00</span>' +
      '<span class="timestamp-axis-label" data-timestamp-axis-label="06">06</span>' +
      '<span class="timestamp-axis-label" data-timestamp-axis-label="12">12</span>' +
      '<span class="timestamp-axis-label" data-timestamp-axis-label="17">17</span>' +
      '<span class="timestamp-axis-label" data-timestamp-axis-label="24">24</span>' +
      '</div>' +
      '<div class="timestamp-rows">' + rows + '</div>' +
      '</section>';
  }

  function renderHeroPrimary() {
    var key = operationalInfo().operationalKey;
    var primary = dayShifts(key).filter(function (shift) { return shift.state === 'shift'; })[0] || null;
    setText('heroPrimaryName', primary ? (primary.employee.shortName + ' / ' + primary.employee.fullName + ' / ' + primary.id) : '오늘 기준 근무자 없음');
    setText('heroPrimaryShift', primary ? ((primary.start || '시간 미정') + '~' + (primary.end || '시간 미정')) : '표시할 근무 없음');
    setText('heroPrimaryMeta', primary ? ((primary.role || '근무') + ' · 기준') : '기준 확인 대기');
  }

  function renderSchedule() {
    var info = operationalInfo();
    var anchorDate = scheduleBaseDateKey(info);
    var access = scheduleEditorAccessInfo();
    var keys = scheduleVisibleDateKeys(info);
    var tableHtml = '';
    var stats = dayWorkStats(info.operationalKey);

    if (!keys.length) {
      keys = [anchorDate];
    }
    if (state.scheduleEditor.open && keys.indexOf(state.scheduleEditor.dateKey) < 0) {
      state.scheduleEditor = Object.assign({}, state.scheduleEditor, {
        open: false,
        dateKey: '',
        empId: '',
        submitting: false
      });
    }

    var employees = scheduleVisibleEmployees(keys);
    var dateHeaders = keys.map(function (key) {
      var isToday = key === info.operationalKey;
      var isCalendarToday = key === info.calendarKey;
      var labels = [
        '<span class="date-mmdd">' + escapeHtml(mmddLabel(key)) + '</span>',
        '<span class="date-weekday">' + escapeHtml(weekdayLabel(key)) + '</span>',
        '<span class="date-key">' + escapeHtml(key) + '</span>'
      ];
      if (isToday) labels.push('<span class="date-badge">기준일</span>');
      if (isCalendarToday && !isToday) labels.push('<span class="date-badge is-calendar">오늘</span>');
      return '<th class="matrix-head' + (isToday ? ' is-today' : '') + '"><div class="matrix-head-inner">' + labels.join('') + '</div></th>';
    }).join('');

    var rowsHtml = employees.map(function (pair) {
      var empId = pair[0];
      var emp = pair[1];
      var rowClasses = ['matrix-row'];
      if (empId === state.scheduleFocusEmployee) rowClasses.push('is-focused');
      var rowCells = keys.map(function (dateKey) {
        var shift = buildShift(empId, state.employees[empId], dateKey);
        var cellClasses = matrixCellClassNames(dateKey, empId, shift);
        return '<td class="' + cellClasses.join(' ') + '" data-schedule-edit-open="' + escapeHtml(dateKey) + '" data-schedule-edit-emp="' + escapeHtml(empId) + '" aria-selected="' + (state.scheduleSelection.dateKey === dateKey && state.scheduleSelection.empId === empId ? 'true' : 'false') + '">' +
          matrixCellInnerHtml(dateKey, empId, shift) +
          '</td>';
      }).join('');
      var employeeMeta = emp.fullName && emp.fullName !== emp.shortName ? '<span class="employee-id">' + escapeHtml(emp.fullName) + '</span>' : '';
      var employeeRole = emp.role ? '<span class="employee-role">' + escapeHtml(emp.role) + '</span>' : '';
      return '<tr class="' + rowClasses.join(' ') + '">' +
        '<th class="matrix-sticky">' +
        '<button class="employee-focus-button" type="button" data-schedule-employee-focus="' + escapeHtml(empId) + '">' +
        '<span class="employee-name">' + escapeHtml(emp.shortName) + '</span>' +
        employeeMeta +
        employeeRole +
        '</button>' +
        '</th>' +
        rowCells +
        '</tr>';
    }).join('');

    if (state.scheduleView === 'name') {
      tableHtml = renderNameOutputBoard(keys) + rosterAddPanelHtml();
    } else if (state.scheduleView === 'date') {
      tableHtml = renderDateOutputBoard(keys) + rosterAddPanelHtml();
    } else if (state.scheduleView === 'calendar') {
      tableHtml = renderCalendarOutputBoard(info) + rosterAddPanelHtml();
    } else {
      tableHtml = (state.scheduleView === 'timeline'
        ? renderTimestampGauge(keys, info)
        : (employees.length
          ? '<div class="matrix-scroll"><table class="schedule-matrix"><thead><tr><th class="matrix-sticky head-sticky"><div class="matrix-sticky-head">직원</div></th>' + dateHeaders + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
          : '<div class="empty-block"><div class="empty-title">표시할 근무자가 없습니다.</div><div class="empty-copy">근무 없는 직원 표시를 켜면 전체 직원을 볼 수 있습니다.</div>' +
            (access.canWrite ? '<button class="range-button" type="button" data-roster-add-open>명단 추가</button>' : '') +
            '</div>')) + rosterAddPanelHtml();
    }

    renderScheduleToolbar();
    renderBriefingContext();
    renderScheduleSheetBar();
    $('scheduleGrid').innerHTML = tableHtml;
    var viewTitle = {
      week: '근무표',
      timeline: '날짜별',
      name: '이름 기준',
      date: '날짜 기준',
      calendar: '달력형'
    };
    setText('scheduleTitle', viewTitle[state.scheduleView] || '근무표');
    setText('scheduleRangeLabel', keys[0] === keys[keys.length - 1]
      ? keys[0] + ' 기준 · ' + scheduleViewDescription()
      : keys[0] + ' ~ ' + keys[keys.length - 1] + ' · ' + scheduleViewDescription());
    setText('summaryTodayCount', String(stats.count) + '명');
    setText('summaryNightCount', String(stats.nightCount) + '명');
    setText('summaryAttendance', anchorDate);
    setText('todayKeyLabel', '오늘 ' + info.calendarKey);
    setText('operationalKeyLabel', '기준 ' + info.operationalKey);
    setText('scheduleStatus', '');
    if (state.rosterAdd.open) restoreRosterAddFocus();
  }

  function attendanceSummary(row) {
    if (!row || typeof row !== 'object') {
      return '기록 없음';
    }
    var keys = Object.keys(row).filter(function (key) { return row[key] && typeof row[key] === 'object'; });
    return keys.length ? String(keys.length) + '건' : '기록 없음';
  }

  function roleLabel(role) {
    var labels = {
      owner: '관리 권한',
      operator: '수정 권한',
      pos: '수정 권한',
      readonly: '조회 권한',
      authenticated: '인증됨',
      blocked: '미인증'
    };
    return labels[role] || labels.authenticated;
  }

  function portalUnlocked() {
    return state.auth.authenticated && !state.auth.checking && ['blocked', 'readonly'].indexOf(state.auth.role) < 0;
  }

  function renderAuthPanel() {
    var status = state.auth.checking ? '접속 확인 중' : (state.auth.authenticated ? state.auth.roleLabel : '접속 비밀번호 필요');
    var detail = state.auth.error ? ' · ' + state.auth.error : '';
    setText('authState', status + detail);
    if ($('authLoginRow')) $('authLoginRow').hidden = state.auth.authenticated;
    if ($('authSignOutButton')) $('authSignOutButton').hidden = !state.auth.authenticated;
    applySiteLock();
    renderCalendarConnect();
  }

  function calendarConnectionView() {
    var helper = window.HynixCalendarSyncLogic;
    if (!helper || typeof helper.calendarConnectionView !== 'function') {
      return { label: 'Google 캘린더 연결', status: '연결 기능을 불러오지 못했습니다. 새로고침 후 다시 눌러주세요.', disabled: false, startPath: '', action: 'load_error' };
    }
    return helper.calendarConnectionView(state.calendarPublicConfig, state.auth.role);
  }

  function renderCalendarConnect() {
    var banner = $('calendarConnectBanner');
    var ownerVisible = state.auth.authenticated && !state.auth.checking && state.auth.role === 'owner';
    if (!banner || !$('calendarConnectButton')) return;
    banner.hidden = !ownerVisible;
    banner.setAttribute('aria-hidden', ownerVisible ? 'false' : 'true');
    if (!ownerVisible) return;
    var view = calendarConnectionView();
    $('calendarConnectButton').textContent = view.label;
    $('calendarConnectButton').disabled = view.disabled;
    $('calendarConnectButton').setAttribute('aria-disabled', view.disabled ? 'true' : 'false');
    setText('calendarConnectStatus', view.status);
  }

  async function loadCalendarPublicConfig() {
    state.calendarPublicConfig = null;
    renderCalendarConnect();
  }

  function startCalendarOAuth() {
    var view = calendarConnectionView();
    if (view.disabled) {
      setText('calendarConnectStatus', view.status);
      return;
    }
    if (!view.startPath) {
      setText('calendarConnectStatus', '캘린더 연결 진행 화면으로 이동합니다.');
      window.location.assign('./calendar-connect.html');
      return;
    }
    setText('calendarConnectStatus', 'Google 로그인 화면으로 이동합니다.');
    var target = new URL(view.startPath, window.location.origin);
    target.searchParams.set('return_to', window.location.pathname || '/hynix/');
    window.location.assign(target.toString());
  }

  function setAuthState(nextState) {
    var wasUnlocked = siteUnlocked();
    state.auth = Object.assign({}, state.auth, nextState);
    renderAuthPanel();
    renderPortalSections();
    if (!siteUnlocked()) {
      if (!wasUnlocked) clearSiteData();
    } else if (!wasUnlocked) {
      refreshPage();
    }
    if (state.auth.authenticated && state.auth.role === 'owner') loadCalendarPublicConfig();
  }

  function initPortalAuth() {
    var unlocked = false;
    try { unlocked = sessionStorage.getItem('hynix_unlocked') === '1'; } catch (e) {}
    if (unlocked) {
      setAuthState({
        checking: false,
        authenticated: true,
        user: { local: true },
        role: 'owner',
        roleLabel: '관리 권한',
        error: '',
        unlockMethod: 'password'
      });
      return;
    }
    setAuthState({
      checking: false,
      authenticated: false,
      user: null,
      role: 'blocked',
      roleLabel: roleLabel('blocked'),
      error: ''
    });
  }

  async function loadPortalRole(user) {
    var candidates = [
      '/hynix_auth/auth_roles/' + user.uid,
      WORKSCHEDULE_BASE + '/attendance_meta/config/auth_roles/' + user.uid
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var row = await readJson(candidates[i]);
        if (row && typeof row === 'object') {
          return {
            enabled: row.enabled !== false,
            role: String(row.role || 'authenticated')
          };
        }
      } catch (error) {
        // Some roles are intentionally not readable by non-owner accounts.
      }
    }
    return { enabled: true, role: 'authenticated' };
  }

  async function signInPortal() {
    var input = $('authPasswordInput');
    var password = input ? input.value.trim() : '';
    if (!password) {
      setAuthState({ checking: false, error: '비밀번호를 입력하세요.' });
      return;
    }
    setAuthState({ checking: true, error: '' });
    var hex = await sha256hex('hynix-portal:' + password);
    if (hex !== PORTAL_PIN_SHA256) {
      setAuthState({
        checking: false,
        authenticated: false,
        user: null,
        role: 'blocked',
        roleLabel: roleLabel('blocked'),
        error: '비밀번호가 올바르지 않습니다.'
      });
      return;
    }
    try { sessionStorage.setItem('hynix_unlocked', '1'); } catch (e) {}
    if (input) input.value = '';
    setAuthState({
      checking: false,
      authenticated: true,
      user: { local: true },
      role: 'owner',
      roleLabel: '관리 권한',
      error: '',
      unlockMethod: 'password'
    });
  }

  async function signOutPortal() {
    try { sessionStorage.removeItem('hynix_unlocked'); } catch (e) {}
    setAuthState({
      checking: false,
      authenticated: false,
      user: null,
      role: 'blocked',
      roleLabel: roleLabel('blocked'),
      error: '',
      unlockMethod: ''
    });
  }

  function activatePortal(targetId) {
    var targetIds = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-portal-target]'), function (button) {
      var active = button.getAttribute('data-portal-target') === targetId;
      targetIds.push(button.getAttribute('data-portal-target'));
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.setAttribute('tabindex', active ? '0' : '-1');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.portal-view'), function (view) {
      if (targetIds.indexOf(view.id) < 0) return;
      var active = view.id === targetId;
      view.classList.toggle('is-active', active);
      view.hidden = !active;
    });
  }

  function tablistTabs(tablist) {
    return Array.prototype.filter.call(tablist.querySelectorAll('[role="tab"]'), function (tab) {
      return tab.closest('[role="tablist"]') === tablist;
    });
  }

  function handleTablistKeydown(event) {
    var keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (keys.indexOf(event.key) < 0 || !event.target || !event.target.closest) return false;
    var tab = event.target.closest('[role="tab"]');
    var tablist = tab && tab.closest('[role="tablist"]');
    if (!tab || !tablist) return false;
    var tabs = tablistTabs(tablist);
    var currentIndex = tabs.indexOf(tab);
    if (currentIndex < 0 || tabs.length < 2) return false;
    var nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else nextIndex = (currentIndex + 1) % tabs.length;
    event.preventDefault();
    var nextId = tabs[nextIndex].id;
    tabs[nextIndex].click();
    var currentTab = document.getElementById(nextId);
    if (currentTab) currentTab.focus();
    return true;
  }

  function lockedPanel(title) {
    var reason = state.auth.checking ? '접속 확인 중' : '비밀번호 필요';
    if (state.auth.authenticated && state.auth.role === 'readonly') {
      reason = '조회만';
    }
    return '<div class="locked-panel">' +
      '<div class="lock-mark">잠김</div>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<p>' + escapeHtml(reason) + '</p>' +
      '</div>';
  }

  function activeEmployeePairs() {
    return Object.keys(state.employees).map(function (empId) {
      return [empId, normalizeEmployee(empId, state.employees[empId])];
    }).filter(function (pair) {
      return pair[1].active;
    }).sort(function (a, b) {
      return a[1].shortName.localeCompare(b[1].shortName, 'ko');
    });
  }

  function activeEmployeeOptions(selectedIds) {
    var pairs = activeEmployeePairs();
    var selected = selectedIds || [];
    if (!pairs.length) {
      return '<option value="">직원 로딩 중</option>';
    }
    return pairs.map(function (pair) {
      var selectedAttr = selected.indexOf(pair[0]) >= 0 ? ' selected' : '';
      return '<option value="' + escapeHtml(pair[0]) + '"' + selectedAttr + '>' + escapeHtml(pair[1].shortName + ' / ' + pair[1].fullName) + '</option>';
    }).join('');
  }

  function renderScheduleToolbar() {
    if (!$('scheduleToolbar')) return;
    var access = scheduleEditorAccessInfo();
    var visibleWeeks = scheduleVisibleWeekCount();
    var moreButton = '<button class="range-button" type="button" data-schedule-weeks="more">다음 주 더보기</button>';
    var resetButton = visibleWeeks > 1
      ? '<button class="range-button ghost" type="button" data-schedule-weeks="reset">기본 범위</button>'
      : '';
    $('scheduleToolbar').innerHTML =
      '<div class="schedule-toolbar-row">' +
      '<div class="schedule-segment timestamp-segment" role="tablist" aria-label="근무표 보기">' +
      '<button class="segmented-option' + (state.scheduleView === 'week' ? ' is-active' : '') + '" id="scheduleWeekTab" type="button" role="tab" aria-selected="' + (state.scheduleView === 'week' ? 'true' : 'false') + '" data-schedule-view="week">입력</button>' +
      '<button class="segmented-option' + (state.scheduleView === 'name' ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + (state.scheduleView === 'name' ? 'true' : 'false') + '" data-schedule-view="name">이름</button>' +
      '<button class="segmented-option' + (state.scheduleView === 'date' || state.scheduleView === 'timeline' ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + (state.scheduleView === 'date' || state.scheduleView === 'timeline' ? 'true' : 'false') + '" data-schedule-view="date">날짜</button>' +
      '<button class="segmented-option' + (state.scheduleView === 'calendar' ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + (state.scheduleView === 'calendar' ? 'true' : 'false') + '" data-schedule-view="calendar">달력</button>' +
      '</div>' +
      (access.canWrite
        ? '<button class="range-button" type="button" data-roster-add-open>명단 추가</button>'
        : '') +
      '<label class="schedule-filter toggle-filter empty-filter">' +
      '<input id="scheduleShowEmptyEmployeesToggle" type="checkbox" ' + (state.scheduleShowEmptyEmployees ? 'checked' : '') + '>' +
      '<span>근무 없는 직원 표시</span>' +
      '</label>' +
      '<details class="schedule-range-disclosure">' +
      '<summary>범위 조정</summary>' +
      '<div class="schedule-range-actions">' + moreButton + resetButton + '</div>' +
      '</details>' +
      '</div>';
    $('scheduleGrid').setAttribute('aria-labelledby', state.scheduleView === 'timeline' ? 'scheduleTimelineTab' : 'scheduleWeekTab');
  }

  function ensureEditDefaults() {
    var info = operationalInfo();
    var pairs = activeEmployeePairs();
    if (!state.edit.startDate) state.edit.startDate = info.operationalKey;
    if (!state.edit.endDate) state.edit.endDate = state.edit.startDate;
    if (!state.edit.weekdays.length) {
      state.edit.weekdays = WEEKDAY_OPTIONS.map(function (item) { return item.key; });
    }
    if (!state.edit.employeeIds.length && pairs.length && !state.edit.initialized) {
      state.edit.employeeIds = pairs.map(function (pair) { return pair[0]; });
      state.edit.initialized = true;
    }
  }

  function employeeName(empId) {
    var emp = normalizeEmployee(empId, state.employees[empId] || {});
    return emp.shortName || empId;
  }

  function selectedEmployees() {
    var validIds = activeEmployeePairs().map(function (pair) { return pair[0]; });
    return state.edit.employeeIds.filter(function (empId) {
      return validIds.indexOf(empId) >= 0;
    });
  }

  function selectedDates() {
    return state.edit.scope === 'fixed' ? [] : selectedOverrideDates();
  }

  function selectedFixedDaysLabel() {
    var weekdays = selectedFixedWeekdays();
    if (weekdays.length === 7) return '매일';
    return weekdayLabelList(weekdays);
  }

  function selectedWhoLabel(ids) {
    if (!ids.length) return '직원 선택 필요';
    var names = ids.slice(0, 3).map(employeeName);
    return names.join(', ') + (ids.length > 3 ? ' 외 ' + String(ids.length - 3) + '명' : '');
  }

  function selectedWhenLabel(dates) {
    if (state.edit.scope === 'fixed') {
      return selectedFixedDaysLabel();
    }
    if (!dates.length) return '날짜 선택 필요';
    var range = dates[0] === dates[dates.length - 1] ? dates[0] : dates[0] + ' ~ ' + dates[dates.length - 1];
    return range + ' / ' + String(dates.length) + '일';
  }

  function selectedWhatLabel() {
    if (state.edit.scope === 'fixed' && state.edit.clear) return '기본표 제거';
    if (state.edit.clear) return '비우기';
    if (state.edit.off) return '휴무';
    var roles = state.edit.roles.length ? ' / ' + state.edit.roles.join(', ') : '';
    return (state.edit.start || '--:--') + '~' + (state.edit.end || '--:--') + roles;
  }

  function editSummary() {
    var employees = selectedEmployees();
    var applyMode = APPLY_MODES.filter(function (item) { return item.key === state.edit.applyMode; })[0] || APPLY_MODES[0];
    var dates = selectedDates();
    var count = state.edit.scope === 'fixed' ? employees.length : dates.length * employees.length;
    return {
      scope: state.edit.scope,
      dates: dates,
      employees: employees,
      who: selectedWhoLabel(employees),
      when: selectedWhenLabel(dates),
      what: selectedWhatLabel(),
      count: count,
      applyMode: applyMode
    };
  }

  function editApplyPolicy() {
    return state.edit.applyMode === 'emptyOnly' ? 'empty_only' : 'overwrite';
  }

  function editAction() {
    if (state.edit.clear) return 'clear';
    if (state.edit.off) return 'off';
    return 'upsert_shift';
  }

  function employeePayloadName(empId) {
    var emp = normalizeEmployee(empId, state.employees[empId] || {});
    return emp.fullName || emp.shortName || empId;
  }

  function buildOverrideWriteItems(dates, employees) {
    var action = editAction();
    var items = [];
    var roleValue = state.edit.roles.join(', ') || '';
    dates.forEach(function (dateKey) {
      employees.forEach(function (empId) {
        var item = {
          path: WORKSCHEDULE_BASE + '/overrides/' + dateKey + '/' + empId,
          payload: {
            employee_id: empId,
            employee: employeePayloadName(empId),
            action: action,
            role: roleValue || employeePayloadName(empId),
            apply_policy: editApplyPolicy(),
            source: 'hynix_portal',
            updated_at_ms: Date.now()
          }
        };
        if (action === 'upsert_shift') {
          var shiftRole = roleValue || employeePayloadName(empId);
          item.payload = Object.assign({}, item.payload, {
            state: 'shift',
            shift: {
              start: state.edit.start,
              end: state.edit.end,
              role: shiftRole
            },
            start: state.edit.start,
            end: state.edit.end,
            role: shiftRole,
            time_range: state.edit.start + '-' + state.edit.end
          });
        } else if (action === 'off') {
          item.payload = Object.assign({}, item.payload, {
            state: 'off',
            off: true,
            dayoff: true,
            work: false
          });
        } else {
          item.payload = Object.assign({}, item.payload, {
            state: 'clear',
            clear: true,
            work: false,
            off: false
          });
        }
        item.calendar = { entity: 'daily_override', dateKey: dateKey, empId: empId, action: action, row: item.payload };
        items.push(item);
        items.push({
          path: WORKSCHEDULE_BASE + '/status/' + dateKey + '/' + empId,
          payload: action === 'upsert_shift'
            ? {
              status: 'confirmed',
              state: 'confirmed',
              confirmed: true,
              updated_at_ms: Date.now(),
              source: 'hynix_portal'
            }
            : action === 'off'
              ? {
                status: 'off',
                state: 'off',
                confirmed: true,
                updated_at_ms: Date.now(),
                source: 'hynix_portal'
              }
              : {
                status: 'clear',
                state: 'clear',
                updated_at_ms: Date.now(),
                source: 'hynix_portal'
              }
        });
      });
    });
    return items;
  }

  function buildFixedWriteItems(employees) {
    var now = Date.now();
    var selectedDays = selectedFixedWeekdays();
    var items = [];
    employees.forEach(function (empId) {
      var path = WORKSCHEDULE_BASE + '/fixed_schedules/' + empId;
      if (state.edit.clear) {
        items.push({
          path: path,
          delete: true,
          calendar: { entity: 'fixed_schedule', empId: empId, action: 'reconcile_fixed_horizon', row: { state: 'clear', updated_at_ms: now } }
        });
        return;
      }
      if (state.edit.off) {
        var offItem = {
          path: path,
          payload: {
            kind: 'fixed',
            type: 'fixed',
            off: selectedFixedWeekdayNumbers(),
            role: state.edit.roles.join(', ') || employeePayloadName(empId),
            source: 'hynix_portal_fixed',
            updated_at_ms: now
          }
        };
        offItem.calendar = { entity: 'fixed_schedule', empId: empId, action: 'reconcile_fixed_horizon', row: offItem.payload };
        items.push(offItem);
        return;
      }
      var record = {
        kind: selectedDays.length === 7 ? 'fixed' : 'weekly',
        type: selectedDays.length === 7 ? 'fixed' : 'weekly',
        start: state.edit.start,
        end: state.edit.end,
        role: state.edit.roles.join(', ') || employeePayloadName(empId),
        source: 'hynix_portal_fixed',
        updated_at_ms: now
      };
      if (selectedDays.length < 7) {
        record.days = selectedDays.slice();
        record.dayTimes = {};
        selectedDays.forEach(function (day) {
          record.dayTimes[day] = {
            start: state.edit.start,
            end: state.edit.end,
            role: record.role
          };
        });
      }
      items.push({
        path: path,
        payload: record,
        calendar: { entity: 'fixed_schedule', empId: empId, action: 'reconcile_fixed_horizon', row: record }
      });
    });
    return items;
  }

  function buildEditWritePlan() {
    var summary = editSummary();
    var employees = summary.employees;
    if (!employees.length) {
      return { error: '직원을 선택하세요.' };
    }
    if (state.edit.scope === 'fixed') {
      if (!state.edit.off && !state.edit.clear && (!state.edit.start || !state.edit.end)) {
        return { error: '근무 시간을 입력하세요.' };
      }
    } else {
      if (!summary.dates.length) {
        return { error: '날짜를 선택하세요.' };
      }
      if (!state.edit.off && !state.edit.clear && (!state.edit.start || !state.edit.end)) {
        return { error: '근무 시간을 입력하세요.' };
      }
    }

    var dates = summary.dates;
    var writeItems = state.edit.scope === 'fixed' ? buildFixedWriteItems(employees) : buildOverrideWriteItems(dates, employees);
    return {
      scope: state.edit.scope,
      employeeIds: employees.slice(),
      dates: dates,
      items: writeItems,
      expectedCount: summary.count,
      statusMessage: state.edit.scope === 'fixed' ? '기본표 즉시 반영' : '날짜별 근무 즉시 반영'
    };
  }

  async function submitEditRequest() {
    if (!portalUnlocked()) {
      state.edit.statusMessage = '인증 후 요청할 수 있습니다.';
      renderEditPortal();
      return;
    }
    var plan = buildEditWritePlan();
    if (plan.error) {
      state.edit.pending = null;
      state.edit.statusMessage = plan.error;
      renderEditPortal();
      return;
    }
    state.edit.submitting = true;
    state.edit.statusMessage = '즉시 반영하는 중입니다.';
    renderEditPortal();
    try {
      for (var i = 0; i < plan.items.length; i += 1) {
        var item = plan.items[i];
        if (item.delete) {
          await deleteJson(item.path);
        } else {
          await putJson(item.path, item.payload);
        }
      }
      state.edit.pending = {
        modeLabel: plan.scope === 'fixed' ? '기본표 변경' : '날짜별 변경',
        who: selectedWhoLabel(plan.employeeIds),
        when: selectedWhenLabel(plan.scope === 'fixed' ? [] : plan.dates),
        what: selectedWhatLabel(),
        count: plan.expectedCount
      };
      state.edit.statusMessage = plan.statusMessage + ' 완료.';
    } catch (error) {
      state.edit.pending = null;
      state.edit.statusMessage = '즉시 반영에 실패했습니다. 잠시 후 다시 시도하세요.';
    } finally {
      state.edit.submitting = false;
      renderEditPortal();
      await refreshPage();
    }
  }

  async function submitScheduleInlineEdit(options) {
    options = options || {};
    var access = scheduleEditorAccessInfo();
    var scrollPosition = captureScrollPosition();
    var saved = false;
    var fromSheet = Boolean(options.fromSheet);
    if (!access.canOpen) {
      state.scheduleEditor.statusMessage = '인증 후 열 수 있습니다.';
      if (!fromSheet) renderScheduleSheetBar();
      setText('scheduleStatus', state.scheduleEditor.statusMessage);
      return false;
    }
    if (!access.canWrite) {
      state.scheduleEditor.statusMessage = '미리보기만 가능합니다.';
      setText('scheduleStatus', state.scheduleEditor.statusMessage);
      renderScheduleSheetBar();
      return false;
    }
    var dateKey = state.scheduleEditor.dateKey || state.scheduleSelection.dateKey;
    var empId = state.scheduleEditor.empId || state.scheduleSelection.empId;
    if (!dateKey || !empId) {
      state.scheduleEditor.statusMessage = '칸을 먼저 선택하세요.';
      setText('scheduleStatus', state.scheduleEditor.statusMessage);
      renderScheduleSheetBar();
      return false;
    }
    state.scheduleEditor.dateKey = dateKey;
    state.scheduleEditor.empId = empId;
    if (!state.scheduleEditor.off && !state.scheduleEditor.clear && (!state.scheduleEditor.start || !state.scheduleEditor.end)) {
      state.scheduleEditor.statusMessage = '시간을 먼저 넣어 주세요.';
      setText('scheduleStatus', state.scheduleEditor.statusMessage);
      renderScheduleSheetBar();
      return false;
    }
    state.scheduleEditor.submitting = true;
    state.scheduleEditor.statusMessage = '저장 중';
    renderScheduleSheetBar();
    var saveButton = document.querySelector('[data-schedule-editor-save]');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = '반영 중';
    }
    try {
      var items = buildInlineScheduleWriteItems(dateKey, empId);
      for (var i = 0; i < items.length; i += 1) {
        await putJson(items[i].path, items[i].payload);
      }
      mergeInlineWriteLocal(items);
      var calendarResult = await queueCalendarTargets(items.filter(function (item) { return item.calendar; }).map(function (item) { return item.calendar; }));
      state.scheduleEditor.statusMessage = calendarResult.failed
        ? '저장됨 · 캘린더 재시도 필요'
        : '저장됨';
      saved = true;
    } catch (error) {
      state.scheduleEditor.statusMessage = '저장 실패';
    } finally {
      state.scheduleEditor.submitting = false;
      if (saved) {
        state.scheduleSelection = { dateKey: dateKey, empId: empId };
        state.scheduleEditor = Object.assign({}, state.scheduleEditor, {
          open: false
        });
        removeScheduleEditorOverlay();
        paintScheduleCell(dateKey, empId);
        refreshScheduleSummaryTiles();
        renderScheduleSheetBar();
        setText('scheduleStatus', state.scheduleEditor.statusMessage || '저장됨');
      } else {
        renderScheduleSheetBar();
        setText('scheduleStatus', state.scheduleEditor.statusMessage || '저장 실패');
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = '직접 저장';
        }
      }
      restoreScrollPosition(scrollPosition);
    }
    return saved;
  }

  function resetEditRequestState() {
    state.edit.pending = null;
    state.edit.statusMessage = '';
  }

  function weekdayChipsHtml() {
    return WEEKDAY_OPTIONS.map(function (item) {
      var active = state.edit.weekdays.indexOf(item.key) >= 0;
      return '<button class="choice-chip' + (active ? ' is-active' : '') + '" type="button" data-edit-weekday="' + item.key + '">' + item.label + '</button>';
    }).join('');
  }

  function presetChipsHtml() {
    return SHIFT_PRESETS.map(function (item) {
      var active = state.edit.preset === item.key;
      return '<button class="choice-chip wide' + (active ? ' is-active' : '') + '" type="button" data-edit-preset="' + item.key + '">' + escapeHtml(item.label) + '</button>';
    }).join('');
  }

  function roleChipsHtml() {
    return ROLE_OPTIONS.map(function (role) {
      var active = state.edit.roles.indexOf(role) >= 0;
      return '<button class="choice-chip' + (active ? ' is-active' : '') + '" type="button" data-edit-role="' + escapeHtml(role) + '">' + escapeHtml(role) + '</button>';
    }).join('');
  }

  function applyModeHtml() {
    return APPLY_MODES.map(function (item) {
      var active = state.edit.applyMode === item.key;
      return '<button class="segmented-option' + (active ? ' is-active' : '') + '" type="button" data-edit-apply="' + item.key + '">' + escapeHtml(item.label) + '</button>';
    }).join('');
  }

  function editPendingHtml() {
    var pending = state.edit.pending;
    if (!pending) {
      return '<div class="pending-summary" id="editPendingSummary">최근 반영 없음</div>';
    }
    return '<div class="pending-summary is-ready" id="editPendingSummary">' +
      '<strong>' + escapeHtml(pending.modeLabel + ' 즉시 반영 완료') + '</strong>' +
      '<span>' + escapeHtml(pending.who + ' / ' + pending.when + ' / ' + pending.what + ' / ' + String(pending.count) + '건') + '</span>' +
      '</div>';
  }

  function summaryItemsHtml(summary) {
    return [
      ['누구', summary.who],
      ['언제', summary.when],
      ['무엇으로', summary.what],
      ['몇 건', String(summary.count) + '건']
    ].map(function (item) {
      return '<div class="summary-pill"><span>' + item[0] + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>';
    }).join('');
  }

  function renderEditPortal() {
    if (!$('editPortalBody')) return;
    if (!portalUnlocked()) {
      $('editPortalBody').innerHTML = lockedPanel('근무 바꾸기');
      return;
    }
    ensureEditDefaults();
    var edit = state.edit;
    var summary = editSummary();
    var fixedScope = edit.scope === 'fixed';
    var weekdayBlock = '<div class="choice-block"><span>요일</span><div class="choice-row">' + weekdayChipsHtml() + '</div></div>';
    var dateFields = (
      '<label><span>날짜 시작</span><input id="editStartDateInput" data-edit-field="startDate" type="date" value="' + escapeHtml(edit.startDate) + '"></label>' +
      '<label><span>날짜 끝</span><input id="editEndDateInput" data-edit-field="endDate" type="date" value="' + escapeHtml(edit.endDate) + '"></label>'
    );
    var presetBlock = '<div class="choice-row">' +
      '<button class="mini-button' + (edit.preset === 'off' ? ' is-active' : '') + '" type="button" data-edit-preset="off">휴무</button>' +
      '<button class="mini-button' + (edit.preset === 'clear' ? ' is-active' : '') + '" type="button" data-edit-preset="clear">비우기</button>' +
      '<button class="mini-button' + (edit.preset === 'custom' ? ' is-active' : '') + '" type="button" data-edit-preset="custom">시간</button></div>';
    $('editPortalBody').innerHTML =
      '<div class="edit-workbench">' +
      '<div class="mode-segment" role="tablist" aria-label="근무 수정 범위"><button class="segmented-option' + (!fixedScope ? ' is-active' : '') + '" type="button" data-edit-scope="override">날짜별</button><button class="segmented-option' + (fixedScope ? ' is-active' : '') + '" type="button" data-edit-scope="fixed">기본표</button></div>' +
      '<div class="edit-band">' +
      '<div class="band-head"><h3>대상</h3></div>' +
      '<div class="field-grid target-grid">' +
      dateFields +
      '<label class="employee-select-field"><span>직원 선택</span><select id="editEmployeeSelect" multiple size="5">' + activeEmployeeOptions(edit.employeeIds) + '</select></label>' +
      '</div>' +
      weekdayBlock +
      '<div class="choice-row compact"><button class="mini-button" type="button" data-edit-action="employees-all">전체</button><button class="mini-button" type="button" data-edit-action="employees-clear">해제</button></div>' +
      '</div>' +
      '<div class="edit-band">' +
      '<div class="band-head"><h3>내용</h3></div>' + presetBlock +
      '<div class="field-grid content-grid">' +
      '<label><span>시작</span><input id="editStartInput" data-edit-field="start" type="time" value="' + escapeHtml(edit.start) + '"' + (edit.off || edit.clear ? ' disabled' : '') + '></label>' +
      '<label><span>종료</span><input id="editEndInput" data-edit-field="end" type="time" value="' + escapeHtml(edit.end) + '"' + (edit.off || edit.clear ? ' disabled' : '') + '></label>' +
      '<label class="toggle-field"><input id="editOffInput" data-edit-field="off" type="checkbox"' + (edit.off ? ' checked' : '') + '><span>휴무</span></label>' +
      '<label class="toggle-field"><input id="editClearInput" data-edit-field="clear" type="checkbox"' + (edit.clear ? ' checked' : '') + '><span>비우기</span></label>' +
      '</div>' +
      '<div class="choice-block"><span>역할</span><div class="choice-row">' + roleChipsHtml() + '</div></div>' +
      (!fixedScope ? '<div class="choice-block"><span>적용</span><div class="mode-segment small">' + applyModeHtml() + '</div></div>' : '') +
      '</div>' +
      '<div class="edit-band confirm-band">' +
      '<div class="request-actions">' +
      '<button class="request-button" type="button" data-request-action="edit"' + (edit.submitting ? ' disabled' : '') + '>' + (edit.submitting ? '반영 중' : '반영') + '</button>' +
      '<span class="request-status" id="editRequestStatus">' + escapeHtml(edit.statusMessage || '') + '</span>' +
      '</div>' +
      '<span class="edit-summary-inline">' + escapeHtml(summary.who + ' · ' + summary.when + ' · ' + summary.what + ' · ' + summary.count + '건') + '</span>' +
      editPendingHtml() +
      '</div>' +
      '</div>';
  }

  function attendanceRows(row) {
    if (!row || typeof row !== 'object') return [];
    return Object.keys(row).map(function (empId) {
      var record = row[empId];
      if (!record || typeof record !== 'object') return null;
      var employee = normalizeEmployee(empId, state.employees[empId] || {});
      return {
        empId: empId,
        name: employee.shortName,
        fullName: employee.fullName,
        start: record.actual_start || record.start || record.in || '',
        end: record.actual_end || record.end || record.out || '',
        diff: record.diff_start,
        state: record.state || record.status || '',
        source: record.actual_start_source || record.source || ''
      };
    }).filter(Boolean).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ko');
    });
  }

  function attendanceDiffLabel(value) {
    if (value === null || value === undefined || value === '') return '-';
    var diff = Number(value || 0);
    if (!Number.isFinite(diff)) return '-';
    if (diff > 0) return '+' + diff + '분';
    if (diff < 0) return String(diff) + '분';
    return '정시';
  }

  function renderAttendancePortal() {
    if (!$('attendancePortalBody')) return;
    if (!portalUnlocked()) {
      $('attendancePortalBody').innerHTML = lockedPanel('출퇴근 기록');
      return;
    }
    var info = operationalInfo();
    var rows = attendanceRows(state.attendanceOperational);
    var table = rows.length ? '<div class="table-scroll"><table class="portal-table"><thead><tr><th>직원</th><th>출근</th><th>퇴근</th><th>차이</th><th>상태</th></tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr><td><strong>' + escapeHtml(row.name) + '</strong><span>' + escapeHtml(row.fullName) + '</span></td><td>' + escapeHtml(row.start || '-') + '</td><td>' + escapeHtml(row.end || '-') + '</td><td>' + escapeHtml(attendanceDiffLabel(row.diff)) + '</td><td>' + escapeHtml(row.state || row.source || '기록됨') + '</td></tr>';
      }).join('') + '</tbody></table></div>' :
      '<div class="empty-block"><div class="empty-title">출근 기록 없음</div><div class="empty-copy">현재 기준일에 표시할 기록이 없습니다.</div></div>';
    $('attendancePortalBody').innerHTML =
      '<div class="request-panel">' +
      '<div class="portal-summary-line"><strong>' + escapeHtml(info.operationalKey) + '</strong><span>' + escapeHtml(String(rows.length) + '건 표시 중') + '</span></div>' +
      table +
      '</div>';
  }

  function renderPortalSections() {
    renderAuthPanel();
    renderEditPortal();
    var attendanceSection = $('attendancePortalSection');
    var hasAttendance = attendanceRows(state.attendanceOperational).length > 0;
    if (attendanceSection) attendanceSection.hidden = !hasAttendance;
    if (hasAttendance) renderAttendancePortal();
  }

  async function markRequestPrepared(kind) {
    if (!portalUnlocked()) {
      renderPortalSections();
      return;
    }
    if (kind === 'edit') {
      await submitEditRequest();
      return;
    }
    if (kind !== 'attendance') return;
    var targetId = 'attendanceRequestStatus';
    var message = '확인 요청을 준비했습니다. 기록 변경은 실행하지 않았습니다.';
    setText(targetId, message);
  }

  function updateSelectedEmployeesFromControl() {
    var select = $('editEmployeeSelect');
    if (!select) return;
    state.edit.employeeIds = Array.prototype.slice.call(select.options).filter(function (option) {
      return option.selected && option.value;
    }).map(function (option) {
      return option.value;
    });
  }

  function updateEditField(field, value) {
    if (field === 'off') {
      state.edit.off = Boolean(value);
      if (state.edit.off) state.edit.clear = false;
      return;
    }
    if (field === 'clear') {
      state.edit.clear = Boolean(value);
      if (state.edit.clear) state.edit.off = false;
      return;
    }
    if (['startDate', 'endDate', 'start', 'end'].indexOf(field) >= 0) {
      state.edit[field] = String(value || '');
      if (field === 'start' || field === 'end') state.edit.preset = 'custom';
    }
  }

  function handleEditClick(button) {
    var scope = button.getAttribute('data-edit-scope');
    var weekday = button.getAttribute('data-edit-weekday');
    var preset = button.getAttribute('data-edit-preset');
    var role = button.getAttribute('data-edit-role');
    var apply = button.getAttribute('data-edit-apply');
    var action = button.getAttribute('data-edit-action');

    if (scope) {
      state.edit.scope = scope === 'fixed' ? 'fixed' : 'override';
      resetEditRequestState();
      renderEditPortal();
      return true;
    }
    if (weekday) {
      var idx = state.edit.weekdays.indexOf(weekday);
      if (idx >= 0) {
        state.edit.weekdays.splice(idx, 1);
      } else {
        state.edit.weekdays.push(weekday);
      }
      resetEditRequestState();
      renderEditPortal();
      return true;
    }
    if (preset) {
      var found = SHIFT_PRESETS.filter(function (item) { return item.key === preset; })[0];
      state.edit.preset = preset;
      if (found && found.key !== 'custom') {
        state.edit.start = found.start;
        state.edit.end = found.end;
      }
      state.edit.off = false;
      state.edit.clear = false;
      resetEditRequestState();
      renderEditPortal();
      return true;
    }
    if (role) {
      var roleIndex = state.edit.roles.indexOf(role);
      if (roleIndex >= 0) {
        state.edit.roles.splice(roleIndex, 1);
      } else {
        state.edit.roles.push(role);
      }
      resetEditRequestState();
      renderEditPortal();
      return true;
    }
    if (apply) {
      state.edit.applyMode = apply;
      resetEditRequestState();
      renderEditPortal();
      return true;
    }
    if (action === 'employees-all') {
      state.edit.employeeIds = activeEmployeePairs().map(function (pair) { return pair[0]; });
      resetEditRequestState();
      renderEditPortal();
      return true;
    }
    if (action === 'employees-clear') {
      state.edit.employeeIds = [];
      resetEditRequestState();
      renderEditPortal();
      return true;
    }
    return false;
  }

  function normalizeManualEntries(payload) {
    if (!payload) return [];

    function looksInternalManualText(text) {
      var lower = text.toLowerCase();
      return /firebase|storebot|codex|mcp|rtdb|json|raw|memo|worker|queue|dry_run|no_publish|firebaseio|auth_roles|hynix_auth/.test(lower) ||
        /\b(?:request|action)[_-]?id\b/.test(lower) ||
        /\/packhelper|\/workschedule|\/order|\/subphone|\/hynix_auth/.test(text) ||
        /내부\s*로직|내부\s*처리|충돌\s*분석|분석\s*원문|파이어베이스|(?:DB|Firebase|파이어베이스|내부)\s*경로|처리\s*설명/.test(text) ||
        /["']?[A-Za-z0-9_]+["']?\s*:/.test(text) ||
        /[{}[\]]/.test(text);
    }

    function cleanManualText(value, maxLength) {
      if (value === null || value === undefined || typeof value === 'object') return '';
      var text = String(value).replace(/\s+/g, ' ').trim();
      if (!text || looksInternalManualText(text)) return '';
      if (maxLength && text.length > maxLength) {
        return text.slice(0, maxLength - 1).trim() + '...';
      }
      return text;
    }

    function firstPublicField(item, fields, maxLength) {
      for (var i = 0; i < fields.length; i += 1) {
        var text = cleanManualText(item[fields[i]], maxLength);
        if (text) return text;
      }
      return '';
    }

    function cleanManualList(value, maxLength) {
      var items = [];
      if (Array.isArray(value)) {
        items = value.slice();
      } else if (typeof value === 'string') {
        items = value.split(/[\n•·]+/);
      } else if (value && typeof value === 'object') {
        items = Object.keys(value).sort().map(function (key) {
          return value[key];
        });
      }
      return items.map(function (item) {
        return cleanManualText(item, maxLength);
      }).filter(Boolean);
    }

    function publicTags(item) {
      var source = Array.isArray(item.public_tags) ? item.public_tags : item.tags;
      if (!Array.isArray(source)) return [];
      return source.map(function (tag) {
        return cleanManualText(tag, 24);
      }).filter(Boolean).slice(0, 4);
    }

    function publicSourceLabel(item) {
      var direct = firstPublicField(item, ['public_source', 'source_label', 'source_name', 'owner', 'updated_by', 'source'], 40);
      if (direct) return direct;
      var types = Array.isArray(item.sourceTypes) ? item.sourceTypes : (Array.isArray(item.source_types) ? item.source_types : []);
      for (var i = 0; i < types.length; i += 1) {
        var key = String(types[i] || '').toLowerCase();
        if (/manual|ops/.test(key)) return '운영메뉴얼';
        if (/kakao|chat/.test(key)) return '카카오';
        if (/site|web/.test(key)) return '사이트';
        if (/cli|tool/.test(key)) return '관리도구';
      }
      return '';
    }

    function extractRows(value) {
      if (!value) return [];
      if (Array.isArray(value)) return value.slice();
      if (typeof value !== 'object') return [];
      var nestedKeys = ['entries', 'manual_entries', 'manualEntries', 'items', 'records', 'data', 'latest', 'current', 'snapshot'];
      for (var i = 0; i < nestedKeys.length; i += 1) {
        var nested = extractRows(value[nestedKeys[i]]);
        if (nested.length) return nested;
      }
      return Object.keys(value).map(function (key) {
        var item = value[key];
        if (item && typeof item === 'object') {
          item._key = key;
          return item;
        }
        return null;
      }).filter(Boolean);
    }

    return extractRows(payload).map(function (item, index) {
      var title = firstPublicField(item, ['public_title', 'user_title', 'display_title', 'title', 'subject', 'name'], 48);
      var summary = firstPublicField(item, ['public_summary', 'user_summary', 'summary', 'short_summary', 'description', 'overview'], 120);
      var body = firstPublicField(item, ['public_body', 'user_body', 'body', 'content', 'details', 'detail', 'note', 'memo'], 260);
      var criteria = firstPublicField(item, ['public_criteria', 'user_criteria', 'criteria', 'standard', 'action_standard', 'basis', 'rule', 'how_to'], 140);
      var appliesTo = firstPublicField(item, ['applies_to', 'appliesTo', 'situation', 'when', 'target', 'audience', 'scope', 'use_case'], 90);
      var actions = cleanManualList(item.public_actions || item.actions || item.steps || item.procedures || item.action_steps, 70);
      var cautions = cleanManualList(item.public_cautions || item.cautions || item.warnings || item.alerts || item.caution, 70);
      var source = publicSourceLabel(item);
      var category = firstPublicField(item, ['public_category', 'category', 'manual_category', 'section', 'group'], 28) || '기타';
      var tags = publicTags(item);
      var status = firstPublicField(item, ['public_status', 'status', 'state', 'visibility'], 28) || (item.deleted ? 'hidden' : '');
      var updated = Number(item.updated_at_ms || item.updatedAtMs || item.updatedAt || item.ts || item.created_at_ms || 0);
      if (!Number.isFinite(updated) || updated <= 0) {
        var parsedUpdated = Date.parse(item.updated_at || item.updatedAt || item.created_at || item.createdAt || '');
        updated = Number.isFinite(parsedUpdated) ? parsedUpdated : 0;
      }
      if (!title && (summary || criteria || appliesTo)) {
        title = '운영 기준 ' + (index + 1);
      }
      return {
        title: title,
        summary: summary,
        body: body,
        criteria: criteria,
        appliesTo: appliesTo,
        actions: actions,
        cautions: cautions,
        source: source,
        category: category,
        status: status,
        outputEnabled: item.output_enabled !== false,
        deleted: item.deleted === true,
        tags: tags,
        updated: updated
      };
    }).filter(function (item) {
      var status = String(item.status || '').toLowerCase();
      var hidden = item.deleted || item.outputEnabled === false || /hidden|held|disabled|deleted|archived|output_disabled/.test(status);
      return !hidden && item.title && (item.summary || item.body || item.criteria || item.appliesTo || item.actions.length || item.cautions.length);
    }).sort(function (a, b) {
      return b.updated - a.updated;
    });
  }

  function manualCategoryGroups(entries) {
    var sections = [];
    var byCategory = {};
    entries.forEach(function (entry) {
      var category = entry.category || '기타';
      var label = manualCategoryLabel(category);
      if (!byCategory[label]) {
        byCategory[label] = {
          id: 'manualCategory' + String(sections.length + 1),
          label: label,
          entries: []
        };
        sections.push(byCategory[label]);
      }
      byCategory[label].entries.push(entry);
    });
    return sections;
  }

  function manualCategorySections() {
    return manualCategoryGroups(state.manualEntries);
  }

  function categoryList() {
    var categories = ['all'];
    state.manualEntries.forEach(function (entry) {
      var category = entry.category || '기타';
      if (categories.indexOf(category) < 0) categories.push(category);
    });
    return categories;
  }

  function manualEntrySearchText(entry) {
    return [
      entry.title,
      entry.summary,
      entry.body,
      entry.criteria,
      entry.appliesTo,
      entry.category,
      manualCategoryLabel(entry.category),
      entry.source
    ].concat(entry.tags, entry.actions, entry.cautions).join(' ').toLowerCase();
  }

  function manualEntryMatchesQuery(entry, query) {
    return !query || manualEntrySearchText(entry).indexOf(query) >= 0;
  }

  function highlightManualText(value, query) {
    var text = String(value || '');
    if (!query) return escapeHtml(text);
    var lower = text.toLowerCase();
    var needle = query.toLowerCase();
    var cursor = 0;
    var html = '';
    while (needle && cursor < text.length) {
      var index = lower.indexOf(needle, cursor);
      if (index < 0) break;
      html += escapeHtml(text.slice(cursor, index));
      html += '<mark>' + escapeHtml(text.slice(index, index + needle.length)) + '</mark>';
      cursor = index + needle.length;
    }
    return html + escapeHtml(text.slice(cursor));
  }

  function manualSearchMatchCount(query) {
    if (!query) return state.manualEntries.length;
    var count = 0;
    state.manualEntries.forEach(function (entry) {
      if (manualEntryMatchesQuery(entry, query)) count += 1;
    });
    return count;
  }

  function knowledgeSample() {
    var contract = state.knowledgeContract || {};
    return contract.preview_sample && typeof contract.preview_sample === 'object' ? contract.preview_sample : {};
  }

  function knowledgeVariantLabel(key) {
    var labels = {
      staff_brief: '직원',
      manager_checklist: '관리자',
      search_answer: '검색',
      kakao_reply: '카톡',
      site_manual_section: '사이트'
    };
    return labels[key] || key;
  }

  function compactKnowledgeText(value, limit) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (limit && text.length > limit) {
      return text.slice(0, Math.max(0, limit - 1)).trim() + '...';
    }
    return text;
  }

  function knowledgeWritePaths() {
    var contract = state.knowledgeContract || {};
    var paths = contract.write_paths && typeof contract.write_paths === 'object' ? contract.write_paths : {};
    return {
      raw: paths.raw_inputs_path || '/packhelper/ops_knowledge/raw_items',
      summaries: paths.structured_summaries_path || '/packhelper/ops_knowledge/structured_summaries',
      outputs: paths.output_variants_path || '/packhelper/ops_knowledge/output_variants',
      deleteRequests: paths.delete_requests_path || '/packhelper/ops_knowledge/delete_requests',
      queue: paths.queue_path || '/packhelper/ops_knowledge/queue',
      audit: paths.audit_path || '/packhelper/ops_knowledge/audit'
    };
  }

  function normalizeKnowledgeQueueStatus(payload) {
    var rows = [];
    if (payload && typeof payload === 'object') {
      rows = Object.keys(payload).map(function (key) {
        var value = payload[key];
        if (!value || typeof value !== 'object') return null;
        value._key = key;
        return value;
      }).filter(Boolean);
    }
    rows.sort(function (a, b) {
      return Number(b.updated_at_ms || b.created_at_ms || b.created_at || 0) - Number(a.updated_at_ms || a.created_at_ms || a.created_at || 0);
    });
    return rows.reduce(function (acc, item) {
      var status = String(item.status || 'pending');
      if (status === 'done') acc.done += 1;
      else if (status === 'failed') acc.failed += 1;
      else if (status === 'pending' || status === 'running' || status === 'retry') acc.pending += 1;
      if (!acc.latest) acc.latest = item;
      return acc;
    }, { pending: 0, done: 0, failed: 0, latest: null, loadError: '' });
  }

  async function loadKnowledgeQueueStatus() {
    try {
      state.knowledgeQueueStatus = normalizeKnowledgeQueueStatus(await readJson(knowledgeWritePaths().queue));
    } catch (error) {
      state.knowledgeQueueStatus = { pending: 0, done: 0, failed: 0, latest: null, loadError: '정리 상태를 불러오지 못했습니다.' };
    }
  }

  function knowledgeActor() {
    var user = state.auth.user || {};
    return user.email || user.uid || state.auth.role || 'hynix_site';
  }

  function knowledgeAudit(action, sourceId, beforeValue, afterValue, status, reason) {
    var id = safeFirebaseKey('audit_' + Date.now() + '_' + action + '_' + sourceId);
    return {
      schema_version: 1,
      id: id,
      actor: knowledgeActor(),
      channel: 'site',
      source: 'hynix_site',
      action: action,
      source_id: sourceId,
      timestamp: Date.now(),
      timestamp_ms: Date.now(),
      before: beforeValue || null,
      after: afterValue || null,
      status: status || 'prepared',
      reason: reason || ''
    };
  }

  function writeGuardHtml() {
    var access = scheduleEditorAccessInfo(false);
    var safety = state.knowledgeContract && state.knowledgeContract.safety ? state.knowledgeContract.safety : {};
    var label = access.canWrite ? '쓰기 가능' : (access.canOpen ? '읽기 권한' : '인증 필요');
    return '<div class="knowledge-write-guard">' +
      '<span>' + escapeHtml(label) + '</span>' +
      '<span>변경 이력 보관</span>' +
      '<span>검토 후 숨김</span>' +
      '<span>카톡 발송은 확인 후</span>' +
      (safety.hard_delete_disabled ? '<span>원문 보존</span>' : '') +
      '</div>';
  }

  function knowledgeRawPayload(text) {
    var id = safeFirebaseKey('raw_' + Date.now() + '_' + text.slice(0, 24));
    return {
      id: id,
      source: 'hynix_site_form',
      channel: 'site',
      text: text,
      author: knowledgeActor(),
      timestamp: new Date().toISOString(),
      timestamp_ms: Date.now(),
      tags: ['ops_manual'],
      source_path: '/hynix/site/manual-panel',
      raw_preserved: true,
      status: 'active',
      deleted: false,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now()
    };
  }

  function knowledgeQueueJobPayload(raw) {
    var createdAt = Date.now();
    var jobId = safeFirebaseKey('opsq_' + raw.id);
    return {
      job_id: jobId,
      source_id: raw.id,
      type: 'summary_and_outputs',
      status: 'pending',
      priority: 5,
      created_at: createdAt,
      created_at_ms: createdAt,
      updated_at_ms: createdAt,
      attempts: 0,
      requested_outputs: ['structured_summary', 'staff_brief', 'manager_checklist', 'search_answer', 'kakao_reply', 'site_manual_section'],
      actor: knowledgeActor(),
      channel: 'site',
      source: 'hynix_site',
      source_path: knowledgeWritePaths().raw + '/' + safeFirebaseKey(raw.id),
      no_blocking_ai_on_ingest: true,
      async_processing: true,
      immediate_ack: true
    };
  }

  function knowledgeSummaryPayload(raw) {
    var points = String(raw.text || '').split(/\n+/).map(function (line) {
      return compactKnowledgeText(line, 120);
    }).filter(Boolean).slice(0, 5);
    if (!points.length) points = [compactKnowledgeText(raw.text, 120)];
    var id = safeFirebaseKey('summary_' + (raw.id || Date.now()));
    return {
      id: id,
      summary: compactKnowledgeText(raw.text, 220),
      key_points: points,
      category: /근무|스케줄|schedule/.test(raw.text) ? 'schedule_request' : 'ops_manual',
      audience: /관리|승인|확인/.test(raw.text) ? 'manager' : 'mixed',
      source_ids: [raw.id],
      citations: [{
        source_id: raw.id,
        source: raw.source,
        channel: raw.channel,
        author: raw.author,
        timestamp: raw.timestamp,
        source_path: raw.source_path
      }],
      confidence: 0.58,
      status: 'active',
      deleted: false,
      updated_at_ms: Date.now(),
      source_contract: {
        raw_preserved: true,
        summary_is_derived: true,
        summary_is_canonical_source: false,
        canonical_schedule_source: '/workschedule_v2',
        attendance_source: '/workschedule_v2/attendance',
        summary_as_schedule_source_allowed: false
      }
    };
  }

  function knowledgeOutputPayload(summary, variantKey) {
    var id = safeFirebaseKey('output_' + variantKey + '_' + (summary.id || Date.now()));
    var base = {
      id: id,
      variant_key: variantKey,
      source_ids: summary.source_ids || [],
      citations: summary.citations || [],
      status: 'active',
      deleted: false,
      updated_at_ms: Date.now()
    };
    if (variantKey === 'kakao_reply') {
      base.text = compactKnowledgeText(summary.summary, 180);
      base.send_enabled = true;
      base.send_guard = {
        explicit_action_required: true,
        room_guard_required: true,
        mass_send_disabled: true,
        audit_required: true
      };
    } else {
      base.title = summary.category || 'ops_manual';
      base.summary = compactKnowledgeText(summary.summary, 220);
      base.body = (summary.key_points || []).join('\n');
    }
    return base;
  }

  async function saveKnowledgeWrite(writePath, payload, auditAction, beforeValue, reason) {
    if (!canWritePortal()) {
      state.knowledgeEditor.statusMessage = '쓰기 권한이 필요합니다.';
      renderKnowledgePreview();
      return null;
    }
    var paths = knowledgeWritePaths();
    var audit = knowledgeAudit(auditAction, payload.id || payload.source_id || writePath, beforeValue, payload, 'applied', reason || '');
    await putJson(writePath, payload);
    await putJson(paths.audit + '/' + safeFirebaseKey(audit.id), audit);
    return audit;
  }

  async function saveKnowledgeIngest(raw) {
    if (!canWritePortal()) {
      state.knowledgeEditor.statusMessage = '쓰기 권한이 필요합니다.';
      renderKnowledgePreview();
      return null;
    }
    var paths = knowledgeWritePaths();
    var job = knowledgeQueueJobPayload(raw);
    var audit = knowledgeAudit('operation_knowledge.ingest', raw.id, null, raw, 'applied', '');
    await putJson(paths.raw + '/' + safeFirebaseKey(raw.id), raw);
    await putJson(paths.queue + '/' + safeFirebaseKey(job.job_id), job);
    await putJson(paths.audit + '/' + safeFirebaseKey(audit.id), audit);
    state.knowledgeQueueStatus.pending += 1;
    state.knowledgeQueueStatus.latest = job;
    return { audit: audit, job: job };
  }

  function currentKnowledgeText() {
    var input = $('knowledgeRawText');
    return input ? compactKnowledgeText(input.value, 2000) : '';
  }

  function currentKnowledgeTargetId() {
    var input = $('knowledgeTargetId');
    return input ? compactKnowledgeText(input.value, 120) : '';
  }

  function currentKnowledgeTargetType() {
    var input = $('knowledgeTargetType');
    return input ? compactKnowledgeText(input.value, 40) : 'raw';
  }

  function knowledgeTargetPath(targetType, sourceId) {
    var paths = knowledgeWritePaths();
    var key = safeFirebaseKey(sourceId);
    if (targetType === 'summary') return paths.summaries + '/' + key;
    if (targetType === 'output') return paths.outputs + '/' + key;
    return paths.raw + '/' + key;
  }

  function knowledgeQueueStatusHtml() {
    var status = state.knowledgeQueueStatus || {};
    var latest = status.latest || {};
    var latestState = String(latest.status || '').toLowerCase();
    var latestText = '최근 정리 없음';
    if (latestState === 'done') latestText = '최근 정리 완료';
    else if (latestState === 'failed') latestText = '최근 확인 필요';
    else if (latestState) latestText = '최근 정리 대기';
    var loadError = status.loadError ? '<span class="is-warn">' + escapeHtml(status.loadError) + '</span>' : '';
    return '<div class="knowledge-queue-status" aria-label="운영 지식 정리 상태">' +
      '<span>정리 중 ' + escapeHtml(String(status.pending || 0)) + '</span>' +
      '<span>완료 ' + escapeHtml(String(status.done || 0)) + '</span>' +
      '<span>확인 필요 ' + escapeHtml(String(status.failed || 0)) + '</span>' +
      '<span>' + escapeHtml(latestText) + '</span>' +
      loadError +
      '</div>';
  }

  async function handleKnowledgeAction(action) {
    var paths = knowledgeWritePaths();
    var text = currentKnowledgeText();
    try {
      if (!canWritePortal()) {
        state.knowledgeEditor.statusMessage = '쓰기 권한이 필요합니다.';
        renderKnowledgePreview();
        return;
      }
      if (action === 'save-raw') {
        if (!text) throw new Error('저장할 내용을 입력하세요.');
        var raw = knowledgeRawPayload(text);
        var ingest = await saveKnowledgeIngest(raw);
        state.knowledgeEditor.lastRawId = raw.id;
        state.knowledgeEditor.statusMessage = '반영됐습니다. 정리 중입니다.';
      } else if (action === 'save-summary') {
        if (!text) throw new Error('요약할 내용을 입력하세요.');
        var rawForSummary = knowledgeRawPayload(text);
        rawForSummary.id = state.knowledgeEditor.lastRawId || rawForSummary.id;
        var summary = knowledgeSummaryPayload(rawForSummary);
        await saveKnowledgeWrite(paths.summaries + '/' + safeFirebaseKey(summary.id), summary, 'operation_knowledge.upsert_summary', null, '');
        state.knowledgeEditor.lastSummaryId = summary.id;
        state.knowledgeEditor.statusMessage = '요약이 반영됐습니다.';
      } else if (action === 'save-output') {
        if (!text) throw new Error('출력으로 만들 내용을 입력하세요.');
        var rawForOutput = knowledgeRawPayload(text);
        rawForOutput.id = state.knowledgeEditor.lastRawId || rawForOutput.id;
        var summaryForOutput = knowledgeSummaryPayload(rawForOutput);
        summaryForOutput.id = state.knowledgeEditor.lastSummaryId || summaryForOutput.id;
        var siteOutput = knowledgeOutputPayload(summaryForOutput, 'site_manual_section');
        var kakaoOutput = knowledgeOutputPayload(summaryForOutput, 'kakao_reply');
        await saveKnowledgeWrite(paths.outputs + '/' + safeFirebaseKey(siteOutput.id), siteOutput, 'operation_knowledge.upsert_output_variant', null, '');
        await saveKnowledgeWrite(paths.outputs + '/' + safeFirebaseKey(kakaoOutput.id), kakaoOutput, 'operation_knowledge.upsert_output_variant', null, '');
        state.knowledgeEditor.statusMessage = '사이트/카톡 출력이 반영됐습니다.';
      } else if (action === 'request-delete') {
        var deleteId = currentKnowledgeTargetId();
        if (!deleteId) throw new Error('항목을 선택하거나 입력하세요.');
        var request = {
          id: safeFirebaseKey('delete_req_' + Date.now() + '_' + deleteId),
          target_type: currentKnowledgeTargetType(),
          source_id: deleteId,
          target_path: knowledgeTargetPath(currentKnowledgeTargetType(), deleteId),
          reason: 'site_delete_request',
          status: 'pending_review',
          hard_delete: false,
          soft_delete_first: true,
          created_at_ms: Date.now(),
          actor: knowledgeActor()
        };
        await saveKnowledgeWrite(paths.deleteRequests + '/' + safeFirebaseKey(request.id), request, 'operation_knowledge.request_delete', null, request.reason);
        state.knowledgeEditor.statusMessage = '삭제요청이 저장됐습니다.';
      } else if (action === 'soft-delete') {
        var softId = currentKnowledgeTargetId();
        if (!softId) throw new Error('항목을 선택하거나 입력하세요.');
        var patch = { deleted: true, status: 'hidden', visibility: 'hidden', output_enabled: false, deleted_at_ms: Date.now(), updated_at_ms: Date.now(), delete_reason: 'site_soft_delete' };
        await patchJson(knowledgeTargetPath(currentKnowledgeTargetType(), softId), patch);
        var softAudit = knowledgeAudit('operation_knowledge.soft_delete', softId, null, patch, 'applied', 'site_soft_delete');
        await putJson(paths.audit + '/' + safeFirebaseKey(softAudit.id), softAudit);
        state.knowledgeEditor.statusMessage = '숨김이 반영됐습니다.';
      } else if (action === 'restore') {
        var restoreId = currentKnowledgeTargetId();
        if (!restoreId) throw new Error('항목을 선택하거나 입력하세요.');
        var restorePatch = { deleted: false, status: 'active', visibility: 'active', output_enabled: true, restored_at_ms: Date.now(), updated_at_ms: Date.now(), delete_reason: null };
        await patchJson(knowledgeTargetPath(currentKnowledgeTargetType(), restoreId), restorePatch);
        var restoreAudit = knowledgeAudit('operation_knowledge.restore', restoreId, null, restorePatch, 'applied', '');
        await putJson(paths.audit + '/' + safeFirebaseKey(restoreAudit.id), restoreAudit);
        state.knowledgeEditor.statusMessage = '복구가 반영됐습니다.';
      }
      await refreshPage();
    } catch (error) {
      state.knowledgeEditor.statusMessage = String(error && error.message ? error.message : error);
      renderKnowledgePreview();
    }
  }

  function renderKnowledgePreview() {
    var panel = $('knowledgePreviewPanel');
    if (!panel) return;
    if (state.knowledgeContractError) {
      panel.innerHTML = '<div class="knowledge-empty"><strong>운영 기준 확인 필요</strong><span>잠시 후 다시 시도하세요.</span></div>';
      return;
    }
    var contract = state.knowledgeContract;
    if (!contract) {
      panel.innerHTML = '<div class="knowledge-empty"><strong>운영 기준 확인 중</strong><span>원문을 보존하고 보기 좋게 정리합니다.</span></div>';
      return;
    }
    var sample = knowledgeSample();
    var rawItems = Array.isArray(sample.raw_items) ? sample.raw_items.slice(0, 2) : [];
    var structured = sample.structured_summary && typeof sample.structured_summary === 'object' ? sample.structured_summary : {};
    var variants = sample.output_variants && typeof sample.output_variants === 'object' ? sample.output_variants : {};
    var source = contract.source_separation && typeof contract.source_separation === 'object' ? contract.source_separation : {};
    var rawHtml = rawItems.length ? rawItems.map(function (item) {
      var meta = [item.source, item.channel, item.author].filter(Boolean).join(' / ');
      return '<div class="knowledge-source-row"><span>' + escapeHtml(meta || '출처 확인') + '</span><p>' + escapeHtml(compactKnowledgeText(item.text || '', 110)) + '</p></div>';
    }).join('') : '<p class="knowledge-muted">원문 샘플이 없습니다.</p>';
    var points = Array.isArray(structured.key_points) ? structured.key_points.slice(0, 3) : [];
    var pointsHtml = points.length ? '<ul class="knowledge-points">' + points.map(function (point) {
      return '<li>' + escapeHtml(compactKnowledgeText(point, 78)) + '</li>';
    }).join('') + '</ul>' : '<p class="knowledge-muted">핵심 포인트 대기 중</p>';
    var variantKeys = Object.keys(variants).slice(0, 5);
    var variantHtml = variantKeys.length ? variantKeys.map(function (key) {
      return '<span class="knowledge-chip">' + escapeHtml(knowledgeVariantLabel(key)) + '</span>';
    }).join('') : '<span class="knowledge-chip">출력 준비</span>';
    var access = scheduleEditorAccessInfo(false);
    var disabled = access.canWrite ? '' : ' disabled';
    var status = state.knowledgeEditor.statusMessage ? '<p class="knowledge-status">' + escapeHtml(state.knowledgeEditor.statusMessage) + '</p>' : '';
    panel.innerHTML = '<section class="knowledge-preview-card" aria-label="운영 지식화 입력 작업대">' +
      '<div class="knowledge-preview-head"><div><span class="knowledge-kicker">운영메모 반영</span><strong>원문 보존 · 정리 · 출력</strong></div><span class="knowledge-lock">' + (access.canWrite ? '쓰기 가능' : '권한 필요') + '</span></div>' +
      '<div class="knowledge-preview-grid">' +
      '<article><span class="knowledge-label">원문/출처</span>' + rawHtml + '</article>' +
      '<article><span class="knowledge-label">정리된 기준</span><strong>운영 기준</strong><p>' + escapeHtml(compactKnowledgeText(structured.summary || '요약 대기 중', 150)) + '</p>' + pointsHtml + '</article>' +
      '<article><span class="knowledge-label">출력 형태</span><div class="knowledge-chip-row">' + variantHtml + '</div><p class="knowledge-muted">카톡 발송은 확인된 요청만 사용합니다.</p></article>' +
      '</div>' +
      writeGuardHtml() +
      knowledgeQueueStatusHtml() +
      '<div class="knowledge-editor">' +
      '<label class="knowledge-field"><span>입력 원문</span><textarea id="knowledgeRawText" rows="3" placeholder="카톡, 운영메모, 수정 요청을 원문 그대로 입력"></textarea></label>' +
      '<div class="knowledge-actions">' +
      '<button type="button" data-knowledge-action="save-raw"' + disabled + '>저장</button>' +
      '<button type="button" data-knowledge-action="save-summary"' + disabled + '>요약 반영</button>' +
      '<button type="button" data-knowledge-action="save-output"' + disabled + '>출력 반영</button>' +
      '</div>' +
      '<div class="knowledge-delete-row">' +
      '<label><span>대상</span><select id="knowledgeTargetType"><option value="raw">원문</option><option value="summary">요약</option><option value="output">출력</option></select></label>' +
      '<label><span>항목</span><input id="knowledgeTargetId" type="text" placeholder="원문 또는 요약 항목"></label>' +
      '<button type="button" data-knowledge-action="request-delete"' + disabled + '>삭제요청</button>' +
      '<button type="button" data-knowledge-action="soft-delete"' + disabled + '>숨김</button>' +
      '<button type="button" data-knowledge-action="restore"' + disabled + '>복구</button>' +
      '</div>' +
      status +
      '</div>' +
      '<div class="knowledge-preview-foot"><span>원문 보존</span><span>정리 상태 표시</span><span>근무표와 분리 관리</span><span>확인된 요청만 발송</span></div>' +
      '</section>';
  }

  function scrollManualTarget(targetId) {
    var target = targetId === 'manualList' ? $('manualList') : $(targetId);
    if (!target || typeof target.scrollIntoView !== 'function') return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderManualChips(sections) {
    var chips = ['<button class="chip active" type="button" data-manual-scroll="manualList">전체 처음</button>'];
    sections.forEach(function (section) {
      chips.push('<button class="chip" type="button" data-manual-scroll="' + escapeHtml(section.id) + '">' + escapeHtml(section.label) + '</button>');
    });
    $('manualCategoryChips').innerHTML = chips.join('');
    Array.prototype.forEach.call($('manualCategoryChips').querySelectorAll('[data-manual-scroll]'), function (button) {
      button.addEventListener('click', function () {
        scrollManualTarget(button.getAttribute('data-manual-scroll') || 'manualList');
      });
    });
  }

  function updatedLabel(timestamp) {
    if (!timestamp) return '업데이트 시간 없음';
    var date = new Date(timestamp);
    var parts = kstDateParts(date);
    return String(parts.month).padStart(2, '0') + '.' + String(parts.day).padStart(2, '0') + ' ' + String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0');
  }

  function publicStatusLabel(status) {
    var key = String(status || '').toLowerCase();
    if (!key || /active|visible|published|ready|done/.test(key)) return '표시 중';
    if (/pending|running|review|hold/.test(key)) return '검토 중';
    return String(status || '표시 중');
  }

  function updateManualSearchControls(query, matchCount) {
    var total = state.manualEntries.length;
    var label = total ? ('전체 ' + total + '개 원문 표시') : '표시할 원문 없음';
    if (query) {
      label = '검색 일치 ' + matchCount + '개 / 전체 ' + total + '개';
    }
    setText('manualSearchCount', label);
    if ($('manualSearchNextButton')) {
      $('manualSearchNextButton').disabled = !query || matchCount < 1;
    }
  }

  function focusNextManualSearchMatch() {
    var matches = Array.prototype.slice.call(document.querySelectorAll('.manual-entry[data-manual-match="true"]'));
    if (!matches.length) return;
    state.manualSearchFocusIndex = (state.manualSearchFocusIndex + 1) % matches.length;
    matches.forEach(function (entry) {
      entry.classList.remove('is-search-current');
      entry.removeAttribute('aria-current');
    });
    var target = matches[state.manualSearchFocusIndex];
    target.classList.add('is-search-current');
    target.setAttribute('aria-current', 'true');
    if (typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
    }
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function manualEntryHtml(entry, query, categoryLabel) {
    var matches = manualEntryMatchesQuery(entry, query);
    var matchAttr = query ? ' data-manual-match="' + (matches ? 'true' : 'false') + '"' : '';
    var matchClass = query && matches ? ' is-search-match' : '';
    var details = [
      entry.body ? '<div class="manual-detail"><span class="manual-label">본문</span><span class="manual-value">' + highlightManualText(entry.body, query) + '</span></div>' : '',
      entry.criteria ? '<div class="manual-detail"><span class="manual-label">수행 기준</span><span class="manual-value">' + highlightManualText(entry.criteria, query) + '</span></div>' : '',
      entry.appliesTo ? '<div class="manual-detail"><span class="manual-label">적용 상황</span><span class="manual-value">' + highlightManualText(entry.appliesTo, query) + '</span></div>' : '',
      entry.actions.length ? '<div class="manual-detail"><span class="manual-label">실행</span><ul class="manual-bullets">' + entry.actions.map(function (text) { return '<li>' + highlightManualText(text, query) + '</li>'; }).join('') + '</ul></div>' : '',
      entry.cautions.length ? '<div class="manual-detail"><span class="manual-label">주의</span><ul class="manual-bullets caution">' + entry.cautions.map(function (text) { return '<li>' + highlightManualText(text, query) + '</li>'; }).join('') + '</ul></div>' : ''
    ].join('');
    var metaItems = [
      '분류 ' + categoryLabel,
      '상태 ' + publicStatusLabel(entry.status),
      '변경일 ' + updatedLabel(entry.updated),
      '출처 ' + (entry.source || '운영메뉴얼')
    ];
    var meta = metaItems.concat(entry.tags.map(manualTagLabel)).map(function (text) {
      return '<span>' + escapeHtml(text) + '</span>';
    }).join('');
    return '<article class="manual-entry' + matchClass + '" tabindex="-1"' + matchAttr + '>' +
      '<div><h3>' + highlightManualText(entry.title, query) + '</h3></div>' +
      (entry.summary ? '<p class="manual-summary">' + highlightManualText(entry.summary, query) + '</p>' : '') +
      details +
      '<div class="manual-meta">' + meta + '</div>' +
      '</article>';
  }

  function renderManual() {
    var query = state.manualQuery.trim().toLowerCase();
    var sections = manualCategorySections();
    var categories = ['all'].concat(sections.map(function (section) { return section.category; }));
    var matchCount = manualSearchMatchCount(query);
    setText('manualCount', String(state.manualEntries.length));
    setText('manualCategoryCount', String(Math.max(0, categories.length - 1)));
    setText('manualOverviewNote', state.manualEntries.length ? '운영메뉴얼은 전체 원문을 연속 표시합니다.' : '등록된 운영메뉴얼을 기다립니다.');
    setText('manualStatus', state.manualEntries.length ? ('전체 ' + state.manualEntries.length + '개 원문을 연속 표시 중' + (query ? ' · 검색 일치 ' + matchCount + '개' : '')) : '아직 등록된 운영메뉴얼이 없습니다.');
    updateManualSearchControls(query, matchCount);
    renderManualChips(sections);
    renderKnowledgePreview();

    if (!state.manualEntries.length) {
      $('manualList').innerHTML = '<div class="empty-block"><div class="empty-title">아직 등록된 운영메뉴얼이 없습니다.</div><div class="empty-copy">필요한 기준이 준비되면 이곳에 표시됩니다.</div></div>';
      return;
    }

    $('manualList').innerHTML = sections.map(function (section) {
      var sectionMatchCount = 0;
      if (query) {
        section.entries.forEach(function (entry) {
          if (manualEntryMatchesQuery(entry, query)) sectionMatchCount += 1;
        });
      }
      return '<section class="manual-category-section" id="' + escapeHtml(section.id) + '">' +
        '<div class="manual-category-head">' +
        '<span>분류</span>' +
        '<h3>' + escapeHtml(section.label) + '</h3>' +
        '<p>' + section.entries.length + '개 원문' + (query ? ' · 검색 일치 ' + sectionMatchCount + '개' : '') + '</p>' +
        '</div>' +
        '<div class="manual-category-body">' + section.entries.map(function (entry) {
          return manualEntryHtml(entry, query, section.label);
        }).join('') + '</div>' +
        '</section>';
    }).join('');
  }

  async function loadAll() {
    if (!siteUnlocked()) {
      applySiteLock();
      return;
    }
    var info = operationalInfo();
    renderStaticLabels();
    renderBoundary(info);
    setText('heroPrimaryName', '근무 기준 로딩 중');
    setText('heroPrimaryShift', '근무 기준 로딩 중');
    setText('heroPrimaryMeta', '근무 기준 로딩 중');
    setText('scheduleStatus', '근무표 데이터를 불러오는 중입니다.');
    setText('manualStatus', '운영메뉴얼 데이터를 불러오는 중입니다.');
    loadCalendarPublicConfig();

    await loadKnowledgeContract();
    await loadKnowledgeQueueStatus();

    var scheduleResult = await Promise.all([
      readJson(WORKSCHEDULE_BASE + '/employees'),
      readJson(WORKSCHEDULE_BASE + '/fixed_schedules'),
      readJson(WORKSCHEDULE_BASE + '/overrides'),
      readJson(WORKSCHEDULE_BASE + '/status'),
      readJson(OPS_MANUAL_PATH),
      readJson(ATTENDANCE_PATH + '/' + info.calendarKey),
      readJson(ATTENDANCE_PATH + '/' + info.operationalKey)
    ]);

    state.employees = scheduleResult[0] || {};
    state.fixedSchedules = scheduleResult[1] || {};
    state.overrides = scheduleResult[2] || {};
    state.statuses = scheduleResult[3] || {};
    state.manualEntries = normalizeManualEntries(scheduleResult[4]);
    state.attendanceToday = scheduleResult[5];
    state.attendanceOperational = scheduleResult[6];
    try {
      var briefingRes = await fetch('./briefing_context.json', { cache: 'no-store' });
      state.briefingContext = briefingRes.ok ? await briefingRes.json() : null;
    } catch (e) {
      state.briefingContext = null;
    }

    renderHeroPrimary();
    renderSchedule();
    renderManual();
    renderPortalSections();
  }

  async function refreshPage() {
    if (!siteUnlocked()) {
      applySiteLock();
      renderPortalSections();
      return;
    }
    try {
      await loadAll();
    } catch (error) {
      setText('heroPrimaryName', '근무 기준 확인 필요');
      setText('heroPrimaryShift', '근무 기준 로딩 실패');
      setText('heroPrimaryMeta', '잠시 후 다시 시도하세요.');
      setText('scheduleStatus', '근무표를 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
      setText('manualStatus', '운영메뉴얼을 불러오지 못했습니다.');
      renderKnowledgePreview();
      renderPortalSections();
    }
  }

  function bindEvents() {
    $('refreshPageButton').addEventListener('click', refreshPage);
    if ($('calendarConnectButton')) {
      $('calendarConnectButton').addEventListener('click', startCalendarOAuth);
    }
    $('manualSearchInput').addEventListener('input', function (event) {
      state.manualQuery = event.target.value || '';
      state.manualSearchFocusIndex = -1;
      renderManual();
    });
    if ($('manualSearchNextButton')) {
      $('manualSearchNextButton').addEventListener('click', focusNextManualSearchMatch);
    }
    if ($('authLoginButton')) {
      $('authLoginButton').addEventListener('click', signInPortal);
    }
    if ($('authPasswordInput')) {
      $('authPasswordInput').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') signInPortal();
      });
    }
    if ($('authSignOutButton')) {
      $('authSignOutButton').addEventListener('click', signOutPortal);
    }
    if ($('portalTabs')) {
      $('portalTabs').addEventListener('click', function (event) {
        var button = event.target.closest('[data-portal-target]');
        if (!button || !$('portalTabs').contains(button)) return;
        activatePortal(button.getAttribute('data-portal-target'));
      });
    }
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-roster-add-open]')) {
        openRosterAdd();
        return;
      }
      if (event.target.closest('[data-roster-add-close]')) {
        closeRosterAdd();
        return;
      }
      if (event.target.closest('[data-roster-add-save]')) {
        submitRosterAdd();
        return;
      }
      var sheetPreset = event.target.closest('[data-sheet-preset]');
      if (sheetPreset) {
        applySheetPreset(sheetPreset.getAttribute('data-sheet-preset'));
        return;
      }
      var sheetAction = event.target.closest('[data-sheet-action]');
      if (sheetAction) {
        var action = sheetAction.getAttribute('data-sheet-action');
        if (action === 'copy') copySelectedScheduleCell();
        else if (action === 'paste') pasteScheduleClipboard();
        else if (action === 'prev-day') copyPreviousDayToSelected();
        return;
      }
      var viewButton = event.target.closest('[data-schedule-view]');
      if (viewButton) {
        var nextView = viewButton.getAttribute('data-schedule-view') || 'week';
        var allowed = { week: 1, name: 1, date: 1, calendar: 1, timeline: 1 };
        state.scheduleView = allowed[nextView] ? (nextView === 'timeline' ? 'date' : nextView) : 'week';
        closeScheduleEditor({ rebuild: true });
        return;
      }
      var weekButton = event.target.closest('[data-schedule-weeks]');
      if (weekButton) {
        var weekAction = weekButton.getAttribute('data-schedule-weeks');
        if (weekAction === 'more') {
          state.scheduleVisibleWeeks = scheduleVisibleWeekCount() + 1;
        } else if (weekAction === 'reset') {
          state.scheduleVisibleWeeks = 1;
        }
        renderSchedule();
        return;
      }
      var scheduleFocusButton = event.target.closest('[data-schedule-focus]');
      if (scheduleFocusButton) {
        var focusAction = scheduleFocusButton.getAttribute('data-schedule-focus');
        if (focusAction === 'today') {
          state.scheduleView = 'week';
        } else if (focusAction === 'clear') {
          state.scheduleFocusDate = '';
          state.scheduleFocusEmployee = '';
          state.scheduleView = 'week';
        }
        renderSchedule();
        return;
      }
      var employeeFocus = event.target.closest('[data-schedule-employee-focus]');
      if (employeeFocus) {
        state.scheduleFocusEmployee = employeeFocus.getAttribute('data-schedule-employee-focus') || '';
        closeScheduleEditor({ rebuild: true });
        return;
      }
      var scheduleOpen = event.target.closest('[data-schedule-edit-open]');
      if (event.target.closest('.cell-inline-input')) return;
      if (scheduleOpen && !event.target.closest('.schedule-edit-panel') && !event.target.closest('[data-schedule-editor-overlay]')) {
        if (state.scheduleEditor.open) {
          var nextDateKey = scheduleOpen.getAttribute('data-schedule-edit-open');
          var nextEmpId = scheduleOpen.getAttribute('data-schedule-edit-emp');
          commitOpenCellFromInput(0, 0).then(function () { openScheduleEditor(nextDateKey, nextEmpId); });
          return;
        }
        handleScheduleCellPointer(scheduleOpen.getAttribute('data-schedule-edit-open'), scheduleOpen.getAttribute('data-schedule-edit-emp'));
        return;
      }
      var schedulePreset = event.target.closest('[data-schedule-editor-preset]');
      if (schedulePreset) {
        updateScheduleEditorField('preset', schedulePreset.getAttribute('data-schedule-editor-preset'));
        renderSchedule();
        return;
      }
      var scheduleQuick = event.target.closest('[data-schedule-editor-quick]');
      if (scheduleQuick) {
        runScheduleQuickAction(scheduleQuick.getAttribute('data-schedule-editor-quick'));
        return;
      }
      var scheduleAction = event.target.closest('[data-schedule-editor-action]');
      if (scheduleAction && scheduleAction.getAttribute('data-schedule-editor-action') === 'copy') {
        copySelectedScheduleCell();
        return;
      }
      if (event.target.closest('[data-schedule-editor-close]')) {
        closeScheduleEditor();
        return;
      }
      if (event.target.closest('[data-schedule-editor-save]')) {
        submitScheduleInlineEdit();
        return;
      }
      var editButton = event.target.closest('[data-edit-scope], [data-edit-weekday], [data-edit-preset], [data-edit-role], [data-edit-apply], [data-edit-action]');
      if (editButton && handleEditClick(editButton)) return;
      var knowledgeButton = event.target.closest('[data-knowledge-action]');
      if (knowledgeButton) {
        handleKnowledgeAction(knowledgeButton.getAttribute('data-knowledge-action'));
        return;
      }
      var button = event.target.closest('[data-request-action]');
      if (!button) return;
      markRequestPrepared(button.getAttribute('data-request-action'));
    });
    document.addEventListener('input', function (event) {
      var target = event.target;
      if (!target || target.getAttribute('data-roster-add-field') !== 'draft') return;
      syncRosterDraft(target.value);
    });
    document.addEventListener('paste', function (event) {
      var target = event.target;
      if (!target || target.id !== 'rosterAddInput' || !state.rosterAdd.open) return;
      setTimeout(function () {
        var nextValue = target.value;
        state.rosterAdd.draft = nextValue;
        if (!maybeCommitRosterPaste(nextValue)) syncRosterDraft(nextValue);
      }, 0);
    });
    document.addEventListener('change', function (event) {
      var target = event.target;
      if (!target) return;
      if (target.id === 'scheduleShowEmptyEmployeesToggle') {
        state.scheduleShowEmptyEmployees = Boolean(target.checked);
        closeScheduleEditor({ rebuild: true });
        return;
      }
      if (target && $('scheduleGrid') && $('scheduleGrid').contains(target)) {
        var scheduleField = target.getAttribute('data-schedule-editor-field');
        if (scheduleField) {
          updateScheduleEditorField(scheduleField, target.type === 'checkbox' ? target.checked : target.value);
          renderSchedule();
          return;
        }
      }
      if (!target || !$('editPortalBody') || !$('editPortalBody').contains(target)) return;
      if (target.id === 'editEmployeeSelect') {
        updateSelectedEmployeesFromControl();
        resetEditRequestState();
        renderEditPortal();
        return;
      }
      var field = target.getAttribute('data-edit-field');
      if (!field) return;
      updateEditField(field, target.type === 'checkbox' ? target.checked : target.value);
      resetEditRequestState();
      renderEditPortal();
    });
    document.addEventListener('keydown', function (event) {
      if (handleTablistKeydown(event)) return;
      if (state.rosterAdd.open && event.key === 'Escape') {
        closeRosterAdd();
        return;
      }
      if (state.rosterAdd.open && event.key === 'Enter' && event.target && event.target.id === 'rosterAddInput') {
        if (event.shiftKey) return;
        event.preventDefault();
        state.rosterAdd.draft = event.target.value;
        submitRosterAdd();
        return;
      }
      if (event.target && event.target.matches && event.target.matches('.cell-inline-input')) {
        if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); commitOpenCellFromInput(event.shiftKey ? -1 : 1, 0); return; }
        if (event.key === 'Escape') { event.preventDefault(); closeScheduleEditor(); return; }
        return;
      }
      if (state.scheduleEditor.open && event.key === 'Escape') {
        closeScheduleEditor();
        return;
      }
      if (isTypingTarget(event.target)) return;
      var key = event.key;
      var mod = event.ctrlKey || event.metaKey;
      if (mod && (key === 'c' || key === 'C')) {
        event.preventDefault();
        copySelectedScheduleCell();
        return;
      }
      if (mod && (key === 'v' || key === 'V')) {
        event.preventDefault();
        pasteScheduleClipboard();
        return;
      }
      if ((key === 'Delete' || key === 'Backspace') && hasSelectedCell() && !state.scheduleEditor.open) {
        event.preventDefault();
        clearSelectedScheduleCell();
        return;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
        if (state.scheduleView !== 'week') return;
        event.preventDefault();
        if (key === 'ArrowLeft') moveScheduleSelection(-1, 0);
        if (key === 'ArrowRight') moveScheduleSelection(1, 0);
        if (key === 'ArrowUp') moveScheduleSelection(0, -1);
        if (key === 'ArrowDown') moveScheduleSelection(0, 1);
        return;
      }
      if (key === 'Enter' && hasSelectedCell()) {
        event.preventDefault();
        openScheduleEditor(state.scheduleSelection.dateKey, state.scheduleSelection.empId);
        return;
      }
      if (key !== 'Enter' && key !== ' ') return;
      if (event.target && event.target.id === 'rosterAddInput') return;
      var target = event.target && event.target.closest ? event.target.closest('[data-schedule-edit-open]') : null;
      if (!target) return;
      event.preventDefault();
      selectScheduleCell(target.getAttribute('data-schedule-edit-open'), target.getAttribute('data-schedule-edit-emp'));
      if (key === 'Enter') {
        openScheduleEditor(target.getAttribute('data-schedule-edit-open'), target.getAttribute('data-schedule-edit-emp'));
      }
    });
  }

  bindEvents();
  renderPortalSections();
  applySiteLock();
  initPortalAuth();
  tryGpsUnlock();
})();
