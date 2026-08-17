(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ScheduleMergeLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  var EN_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var CANONICAL_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

  function sanitizeKey(value) {
    return String(value || "").replace(/[.#$\[\]\/?\s]/g, "_") || "_";
  }

  function dateObj(key) {
    var text = String(key || "");
    if (!CANONICAL_DATE_RE.test(text)) return null;
    var parts = text.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) {
      return null;
    }
    return date;
  }

  function normalizeStatusValue(value) {
    if (value && typeof value === "object") {
      return String(value.status || value.state || value.type || "").trim().toLowerCase();
    }
    return String(value || "").trim().toLowerCase();
  }

  function statusMarksOff(value) {
    var normalized = normalizeStatusValue(value);
    return normalized === "off" || normalized === "dayoff";
  }

  function statusSuppressesSchedule(value) {
    return normalizeStatusValue(value) === "none";
  }

  function statusMarksLastShift(value) {
    var normalized = normalizeStatusValue(value);
    if (normalized === "last_shift") return true;
    return !!(value && typeof value === "object" && (value.last_shift === true || value.is_last_shift === true));
  }

  function employeeName(empId, emp) {
    return String((emp && (emp.name || emp.short_name || emp.nickname)) || empId).trim();
  }

  function makeEntry(override, start, end, role) {
    var nextStart = String((override && override.start) || start || "").trim();
    var nextEnd = String((override && override.end) || end || "").trim();
    if (!nextStart && !nextEnd) return null;
    return { start: nextStart, end: nextEnd, role: String((override && override.role) || role || "주방").trim() || "주방" };
  }

  function fixedScheduleFor(empId, emp, dateKey, fixedSchedules) {
    if (!fixedSchedules || typeof fixedSchedules !== "object") return null;
    var fullName = String((emp && emp.name) || "").trim();
    var fixed = fixedSchedules[empId] || fixedSchedules[sanitizeKey(fullName)] || fixedSchedules[fullName];
    if (!fixed || typeof fixed !== "object") return null;
    var date = dateObj(dateKey);
    if (!date) return null;
    var webDay = date.getUTCDay();
    var en = EN_DAYS[webDay];
    var defaultStart = String(fixed.start || "").trim();
    var defaultEnd = String(fixed.end || "").trim();
    var role = String(fixed.role || (emp && emp.role) || "주방").trim() || "주방";
    var override = fixed.dayTimes && fixed.dayTimes[en] ? fixed.dayTimes[en] : null;
    var fixedKind = String(fixed.kind || fixed.type || "").trim();
    if (fixedKind === "none") return null;
    if (fixedKind === "fixed") {
      var off = Array.isArray(fixed.off) ? fixed.off.map(Number) : [];
      if (off.indexOf(webDay) >= 0) return null;
      return makeEntry(override, defaultStart, defaultEnd, role);
    }
    if (fixedKind === "weekly") {
      var days = Array.isArray(fixed.days) ? fixed.days : [];
      if (days.indexOf(en) < 0 && !override) return null;
      return makeEntry(override, defaultStart, defaultEnd, role);
    }
    return makeEntry(override, defaultStart, defaultEnd, role);
  }

  function resolveScheduleEntry(input) {
    input = input || {};
    var empId = String(input.empId || "");
    var emp = input.emp || {};
    var dateKey = String(input.dateKey || "");
    if (!dateObj(dateKey)) return null;
    var fixedSchedules = input.fixedSchedules || {};
    var overridesByDate = input.overridesByDate || {};
    var statusesByDate = input.statusesByDate || {};
    var overrideDay = overridesByDate[dateKey] || {};
    var statusDay = statusesByDate[dateKey] || {};
    var override = overrideDay[empId];
    var statusEntry = statusDay[empId];
    var statusValue = normalizeStatusValue(statusEntry);
    var name = employeeName(empId, emp);

    if (override && typeof override === "object") {
      var overrideState = normalizeStatusValue(override);
      if (overrideState === "off" || override.off === true || override.dayoff === true) {
        return { employee_id: empId, employee: name, off: true, source: "overrides", status: statusValue || "off" };
      }
      if (!(overrideState === "clear" || override.clear === true)) {
        var sourceShift = override.shift && typeof override.shift === "object" ? override.shift : override;
        if (sourceShift && (sourceShift.start || sourceShift.end || sourceShift.role)) {
          return {
            employee_id: empId,
            employee: name,
            start: String(sourceShift.start || sourceShift.start_time || "").trim(),
            end: String(sourceShift.end || sourceShift.end_time || "").trim(),
            role: String(sourceShift.role || override.role || emp.role || "주방").trim() || "주방",
            status: statusValue || normalizeStatusValue(sourceShift) || "",
            source: "overrides",
            last_shift: statusMarksLastShift(statusEntry) || sourceShift.last_shift === true || override.last_shift === true,
          };
        }
      }
    }

    if (statusMarksOff(statusEntry)) {
      return { employee_id: empId, employee: name, off: true, source: "status", status: statusValue };
    }
    if (statusSuppressesSchedule(statusEntry)) return null;

    var fixed = fixedScheduleFor(empId, emp, dateKey, fixedSchedules);
    if (!fixed) return null;
    return {
      employee_id: empId,
      employee: name,
      start: String(fixed.start || "").trim(),
      end: String(fixed.end || "").trim(),
      role: String(fixed.role || emp.role || "주방").trim() || "주방",
      status: statusValue || "",
      source: "fixed_schedules",
      last_shift: statusMarksLastShift(statusEntry),
    };
  }

  return {
    fixedScheduleFor: fixedScheduleFor,
    normalizeStatusValue: normalizeStatusValue,
    resolveScheduleEntry: resolveScheduleEntry,
  };
});
