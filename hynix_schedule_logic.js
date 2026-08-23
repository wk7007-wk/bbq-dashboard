(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HynixScheduleLogic = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function cleanLabel(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function employeeLabels(empId, emp) {
    const aliases = Array.isArray(emp && emp.aliases) ? emp.aliases : [];
    const labels = [empId, emp && emp.short_name, emp && emp.nickname, emp && emp.nick, emp && emp.name];
    aliases.forEach(alias => labels.push(alias));
    return labels.map(cleanLabel).filter(Boolean);
  }

  function canonicalFixedScheduleEntry(empId, emp, fixed) {
    if (!fixed || typeof fixed !== 'object') return null;
    var entry = Object.assign({}, fixed);
    if (!entry.kind && !entry.type) {
      entry.kind = 'fixed';
      entry.type = 'fixed';
    } else if (!entry.kind && entry.type) {
      entry.kind = entry.type;
    } else if (!entry.type && entry.kind) {
      entry.type = entry.kind;
    }
    return entry;
  }

  function shiftDateKey(key, deltaDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return '';
    var base = new Date(String(key) + 'T00:00:00+09:00');
    if (!Number.isFinite(base.getTime())) return '';
    base.setUTCDate(base.getUTCDate() + Number(deltaDays || 0));
    var formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    var map = {};
    formatter.formatToParts(base).forEach(function (part) {
      map[part.type] = part.value;
    });
    return map.year + '-' + map.month + '-' + map.day;
  }

  function safeDateKey(value) {
    var text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function weekdayIndexFromDateKey(dateKey) {
    var safe = safeDateKey(dateKey);
    if (!safe) return -1;
    var parts = safe.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return Number.isFinite(date.getTime()) ? date.getUTCDay() : -1;
  }

  function mondayWeekStartKey(dateKey) {
    var safe = safeDateKey(dateKey);
    var weekday = weekdayIndexFromDateKey(safe);
    if (!safe || weekday < 0) return '';
    return shiftDateKey(safe, weekday === 0 ? -6 : 1 - weekday);
  }

  function clampDateKeyToFuture(dateKey, minDateKey) {
    if (!dateKey) return minDateKey;
    if (!minDateKey) return dateKey;
    return dateKey < minDateKey ? minDateKey : dateKey;
  }

  function sanitizeScheduleFocusDate(dateKey, minDateKey, showPast) {
    var selected = safeDateKey(dateKey);
    return selected ? clampDateKeyToFuture(selected, minDateKey) : '';
  }

  function buildScheduleRangeKeys(todayKey, options) {
    var safeToday = safeDateKey(todayKey);
    var config = options && typeof options === 'object' ? options : {};
    var windowDays = Number(config.windowDays);
    var minDateKey = safeDateKey(config.minDateKey) || safeToday;
    if (!safeToday) return [];
    if (!Number.isFinite(windowDays) || windowDays <= 0) {
      windowDays = 7;
    }
    windowDays = Math.floor(windowDays);
    var startKey = mondayWeekStartKey(safeToday) || safeToday;
    var candidateDays = Math.max(7, windowDays);
    var keys = [];
    for (var offset = 0; offset < candidateDays; offset += 1) {
      var key = shiftDateKey(startKey, offset);
      if (key && key >= minDateKey) keys.push(key);
    }
    return keys.slice(0, windowDays);
  }

  return {
    canonicalFixedScheduleEntry: canonicalFixedScheduleEntry,
    employeeLabels: employeeLabels,
    weekdayIndexFromDateKey: weekdayIndexFromDateKey,
    mondayWeekStartKey: mondayWeekStartKey,
    buildScheduleRangeKeys: buildScheduleRangeKeys,
    sanitizeScheduleFocusDate: sanitizeScheduleFocusDate
  };
});
