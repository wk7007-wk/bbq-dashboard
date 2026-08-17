(function (global) {
  "use strict";

  const document = global.document;
  if (!document) return;

  const FIREBASE_URL = "https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app";
  const WORKSCHEDULE_V2_PATH = "/workschedule_v2";
  const DAY_START_HOUR = 3;
  const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const EN_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const AUTO_REFRESH_MS = 60 * 1000;
  const scheduleMerge = global.ScheduleMergeLogic || {};

  const state = {
    view: "overview",
    selectedDate: businessDateKey(),
    monthKey: businessDateKey().slice(0, 7),
    filter: "all",
    employees: {},
    schedules: {},
    fixed: {},
    statuses: {},
    attendance: {},
    loading: false,
    lastLoadedAt: 0,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function dateObj(key) {
    const parts = String(key || "").split("-").map(Number);
    return new Date(Date.UTC(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1));
  }

  function keyOf(date) {
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  function addDays(key, days) {
    const date = dateObj(key);
    date.setUTCDate(date.getUTCDate() + days);
    return keyOf(date);
  }

  function businessDateKey() {
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const base = new Date(Date.UTC(kst.getFullYear(), kst.getMonth(), kst.getDate()));
    if (kst.getHours() < DAY_START_HOUR) base.setUTCDate(base.getUTCDate() - 1);
    return keyOf(base);
  }

  function monthBounds(monthKey) {
    const parts = String(monthKey).split("-").map(Number);
    const first = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
    const last = new Date(Date.UTC(parts[0], parts[1], 0));
    return { first: keyOf(first), last: keyOf(last) };
  }

  function datesBetween(start, end) {
    const out = [];
    let cur = start;
    while (cur <= end) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }

  function monthGridDates(monthKey) {
    const bounds = monthBounds(monthKey);
    const first = dateObj(bounds.first);
    const startOffset = (first.getUTCDay() + 6) % 7;
    const last = dateObj(bounds.last);
    const endOffset = 6 - ((last.getUTCDay() + 6) % 7);
    return datesBetween(addDays(bounds.first, -startOffset), addDays(bounds.last, endOffset));
  }

  function displayDate(key) {
    const date = dateObj(key);
    const dow = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
    return Number(key.slice(5, 7)) + "/" + Number(key.slice(8, 10)) + "(" + dow + ")";
  }

  function displayMonth(key) {
    const parts = String(key).split("-");
    return parts[0] + "년 " + Number(parts[1]) + "월";
  }

  function setStatus(text) {
    byId("dashStatus").textContent = text;
  }

  function toast(text) {
    const node = byId("dashToast");
    node.textContent = text;
    node.classList.add("is-visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      node.classList.remove("is-visible");
    }, 2600);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function fbGet(path) {
    return fetch(FIREBASE_URL + path + ".json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error(path + " HTTP " + response.status);
        return response.json();
      });
  }

  function loadAll() {
    if (state.loading) return Promise.resolve();
    state.loading = true;
    setStatus("불러오는 중");
    const gridDates = monthGridDates(state.monthKey);
    const attendanceDates = unique(gridDates.concat([state.selectedDate]));
    return Promise.all([
      fbGet(WORKSCHEDULE_V2_PATH + "/meta"),
      fbGet(WORKSCHEDULE_V2_PATH + "/employees"),
      fbGet(WORKSCHEDULE_V2_PATH + "/overrides"),
      fbGet(WORKSCHEDULE_V2_PATH + "/fixed_schedules"),
      fbGet(WORKSCHEDULE_V2_PATH + "/status"),
      Promise.all(attendanceDates.map(function (date) {
        return fbGet(WORKSCHEDULE_V2_PATH + "/attendance/" + date)
          .then(function (data) { return [date, data || {}]; })
          .catch(function () { return [date, {}]; });
      })),
    ]).then(function (result) {
      if (!result[0] || result[0].write_ready !== true) {
        throw new Error("/workschedule_v2/meta.write_ready=true 대기 중");
      }
      state.employees = result[1] || {};
      state.schedules = result[2] || {};
      state.fixed = result[3] || {};
      state.statuses = result[4] || {};
      state.attendance = {};
      result[5].forEach(function (pair) {
        state.attendance[pair[0]] = pair[1] || {};
      });
      state.lastLoadedAt = Date.now();
      renderAll();
      setStatus("갱신 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    }).catch(function (error) {
      setStatus("오류");
      toast("대시보드 로드 실패: " + (error && error.message ? error.message : error));
    }).finally(function () {
      state.loading = false;
    });
  }

  function unique(values) {
    const seen = {};
    const out = [];
    values.forEach(function (value) {
      if (!seen[value]) {
        seen[value] = true;
        out.push(value);
      }
    });
    return out;
  }

  function activeEmployees() {
    return Object.keys(state.employees)
      .map(function (id) { return [id, state.employees[id]]; })
      .filter(function (pair) {
        const emp = pair[1];
        return emp && emp.active !== false && emp.disabled !== true;
      })
      .sort(function (a, b) {
        const sa = Number(a[1].sort || a[1].order || 999);
        const sb = Number(b[1].sort || b[1].order || 999);
        if (sa !== sb) return sa - sb;
        return displayName(a[1]).localeCompare(displayName(b[1]), "ko");
      });
  }

  function displayName(emp) {
    return String((emp && (emp.short_name || emp.nickname || emp.name)) || "").trim();
  }

  function sanitizeKey(value) {
    return String(value || "").replace(/[.#$\[\]\/?\s]/g, "_") || "_";
  }

  function getFixedSchedule(empId, emp, dateKey) {
    const fullName = String((emp && emp.name) || "");
    const fixed = state.fixed[empId] || state.fixed[sanitizeKey(fullName)] || state.fixed[fullName];
    if (!fixed) return null;
    const date = dateObj(dateKey);
    const webDay = date.getUTCDay();
    const en = EN_DAYS[webDay];
    const defaultStart = String(fixed.start || "");
    const defaultEnd = String(fixed.end || "");
    const role = String(fixed.role || "주방");
    const override = fixed.dayTimes && fixed.dayTimes[en] ? fixed.dayTimes[en] : null;

    const fixedKind = String(fixed.kind || fixed.type || "");
    if (fixedKind === "none") return null;
    if (fixedKind === "fixed") {
      const off = Array.isArray(fixed.off) ? fixed.off.map(Number) : [];
      if (off.indexOf(webDay) >= 0) return null;
      return makeEntry(override, defaultStart, defaultEnd, role);
    }
    if (fixedKind === "weekly") {
      const days = Array.isArray(fixed.days) ? fixed.days : [];
      if (days.indexOf(en) < 0 && !override) return null;
      return makeEntry(override, defaultStart, defaultEnd, role);
    }
    return null;
  }

  function makeEntry(override, start, end, role) {
    const nextStart = String((override && override.start) || start || "");
    const nextEnd = String((override && override.end) || end || "");
    if (!nextStart && !nextEnd) return null;
    return { start: nextStart, end: nextEnd, role: role || "주방" };
  }

  function statusEntryFor(dateKey, empId) {
    const day = state.statuses[dateKey] || {};
    return day[empId] || null;
  }

  function resolvedScheduleEntry(dateKey, empId) {
    const emp = state.employees[empId];
    if (!emp) return null;
    if (scheduleMerge && typeof scheduleMerge.resolveScheduleEntry === "function") {
      return scheduleMerge.resolveScheduleEntry({
        empId: empId,
        emp: emp,
        dateKey: dateKey,
        fixedSchedules: state.fixed,
        overridesByDate: state.schedules,
        statusesByDate: state.statuses,
      });
    }
    const day = state.schedules[dateKey] || {};
    const cell = day[empId];
    if (cell && typeof cell === "object") {
      const stateValue = String(cell.state || cell.type || "").toLowerCase();
      if (stateValue === "off" || cell.off === true || cell.dayoff === true) return null;
      if (stateValue === "clear" || cell.clear === true) return null;
      const shift = cell.shift && typeof cell.shift === "object" ? cell.shift : cell;
      return {
        start: String(shift.start || shift.start_time || ""),
        end: String(shift.end || shift.end_time || ""),
        role: String(shift.role || cell.role || "주방"),
      };
    }
    const statusEntry = statusEntryFor(dateKey, empId);
    const normalizedStatus = scheduleMerge && typeof scheduleMerge.normalizeStatusValue === "function"
      ? scheduleMerge.normalizeStatusValue(statusEntry)
      : String((statusEntry && (statusEntry.status || statusEntry.state || statusEntry.type)) || "").toLowerCase();
    if (normalizedStatus === "off" || normalizedStatus === "dayoff" || normalizedStatus === "none") return null;
    return getFixedSchedule(empId, emp, dateKey);
  }

  function getScheduleFor(dateKey, empId) {
    const resolved = resolvedScheduleEntry(dateKey, empId);
    if (!resolved || resolved.off === true) return null;
    return {
      start: String(resolved.start || resolved.start_time || ""),
      end: String(resolved.end || resolved.end_time || ""),
      role: String(resolved.role || "주방"),
    };
  }

  function attendanceFor(dateKey, empId) {
    return ((state.attendance[dateKey] || {})[empId]) || null;
  }

  function timeLabel(entry) {
    if (!entry) return "";
    if (!entry.start) return "일단출근";
    return entry.end ? entry.start + "~" + entry.end : entry.start;
  }

  function statusFor(entry, attendance) {
    if (!entry) return { key: "none", label: "예정없음", cls: "" };
    const hasStart = attendance && attendance.actual_start;
    const hasEnd = attendance && attendance.actual_end;
    const late = attendance && Number(attendance.diff_start || 0) > 0;
    if (!hasStart) return { key: "missing", label: "미출근", cls: "warn" };
    if (late) return { key: "late", label: "지각", cls: "bad" };
    if (hasStart && !hasEnd) return { key: "open", label: "출근", cls: "info" };
    return { key: "done", label: "완료", cls: "ok" };
  }

  function workRows(dateKey) {
    return activeEmployees().map(function (pair) {
      const empId = pair[0];
      const emp = pair[1];
      const entry = getScheduleFor(dateKey, empId);
      const att = attendanceFor(dateKey, empId);
      if (!entry && !att) return null;
      return {
        date: dateKey,
        empId: empId,
        emp: emp,
        name: displayName(emp),
        entry: entry,
        att: att,
        status: statusFor(entry, att),
      };
    }).filter(Boolean);
  }

  function monthRows() {
    const bounds = monthBounds(state.monthKey);
    return datesBetween(bounds.first, bounds.last).reduce(function (acc, date) {
      return acc.concat(workRows(date));
    }, []);
  }

  function renderAll() {
    byId("monthInput").value = state.monthKey;
    byId("overviewTitle").textContent = displayMonth(state.monthKey) + " 근무달력";
    byId("calendarTitle").textContent = displayMonth(state.monthKey) + " 근무달력";
    byId("attendanceTitle").textContent = displayMonth(state.monthKey) + " 출근기록";
    byId("selectedDateTitle").textContent = displayDate(state.selectedDate) + " 근무";
    renderMetrics();
    renderCalendar("monthCalendar", false);
    renderCalendar("fullCalendar", true);
    renderRoster();
    renderIssues();
    renderRecords();
  }

  function renderMetrics() {
    const rows = workRows(state.selectedDate).filter(function (row) { return row.entry; });
    const done = rows.filter(function (row) { return row.att && row.att.actual_start; }).length;
    const missing = rows.filter(function (row) { return row.status.key === "missing"; }).length;
    const late = rows.filter(function (row) { return row.status.key === "late"; }).length;
    const open = rows.filter(function (row) { return row.status.key === "open"; }).length;
    const items = [
      ["예정", rows.length, displayDate(state.selectedDate)],
      ["출근", done, "미출근 " + missing],
      ["지각", late, "퇴근미기록 " + open],
      ["월 주의", issueRows().length, displayMonth(state.monthKey)],
    ];
    byId("metricGrid").innerHTML = items.map(function (item) {
      return '<div class="metric-card"><div class="metric-label">' + escapeHtml(item[0]) + '</div><div class="metric-value">' + escapeHtml(item[1]) + '</div><div class="metric-sub">' + escapeHtml(item[2]) + '</div></div>';
    }).join("");
  }

  function renderCalendar(id, large) {
    const dates = monthGridDates(state.monthKey);
    const header = WEEKDAYS.map(function (day) {
      return '<div class="weekday">' + day + '</div>';
    }).join("");
    const cells = dates.map(function (date) {
      const rows = workRows(date).filter(function (row) { return row.entry; });
      const visible = rows.slice(0, large ? 7 : 5);
      const hasLate = rows.some(function (row) { return row.status.key === "late"; });
      const hasMissing = rows.some(function (row) { return row.status.key === "missing"; });
      const classes = [
        "day-cell",
        date.slice(0, 7) !== state.monthKey ? "is-outside" : "",
        date === state.selectedDate ? "is-selected" : "",
        hasLate ? "has-late" : hasMissing ? "has-missing" : "",
      ].filter(Boolean).join(" ");
      return '<div class="' + classes + '" data-date="' + date + '">' +
        '<div class="day-head"><span class="day-number">' + Number(date.slice(8, 10)) + '</span><span class="day-count">' + (rows.length ? rows.length + "명" : "") + '</span></div>' +
        visible.map(shiftLine).join("") +
        (rows.length > visible.length ? '<div class="more-line">+' + (rows.length - visible.length) + '명</div>' : "") +
        '</div>';
    }).join("");
    byId(id).innerHTML = header + cells;
  }

  function shiftLine(row) {
    return '<div class="shift-line"><span class="shift-name">' + escapeHtml(row.name) + '</span><span class="shift-time">' + escapeHtml(timeLabel(row.entry)) + '</span><span class="state-pill ' + row.status.cls + '">' + escapeHtml(row.status.label) + '</span></div>';
  }

  function renderRoster() {
    const rows = workRows(state.selectedDate).filter(function (row) { return row.entry; });
    if (!rows.length) {
      byId("selectedRoster").innerHTML = '<div class="empty">근무자 없음</div>';
      return;
    }
    byId("selectedRoster").innerHTML = rows.map(function (row) {
      return '<div class="roster-row"><div class="row-name">' + escapeHtml(row.name) + '</div><div><div class="row-time">' + escapeHtml(timeLabel(row.entry)) + '</div><div class="row-sub">' + escapeHtml(attendanceText(row) || "기록 없음") + '</div></div><span class="state-pill ' + row.status.cls + '">' + escapeHtml(row.status.label) + '</span></div>';
    }).join("");
  }

  function attendanceText(row) {
    const att = row.att || {};
    const parts = [];
    if (att.actual_start) parts.push("출근 " + att.actual_start);
    if (att.actual_end) parts.push("퇴근 " + att.actual_end);
    if (att.diff_start != null && att.diff_start !== "") {
      const diff = Number(att.diff_start || 0);
      if (diff > 0) parts.push("+" + diff + "분");
      else if (diff < 0) parts.push(diff + "분");
      else parts.push("정시");
    }
    return parts.join(" / ");
  }

  function issueRows() {
    return monthRows()
      .filter(function (row) { return row.status.key === "missing" || row.status.key === "late" || row.status.key === "open"; })
      .sort(function (a, b) { return a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ko"); });
  }

  function renderIssues() {
    const rows = issueRows();
    byId("issueCount").textContent = String(rows.length);
    if (!rows.length) {
      byId("issueList").innerHTML = '<div class="empty">주의 항목 없음</div>';
      return;
    }
    byId("issueList").innerHTML = rows.slice(0, 12).map(function (row) {
      return '<div class="issue-row" data-date="' + row.date + '"><div class="issue-date">' + escapeHtml(displayDate(row.date)) + '</div><div><div class="issue-title">' + escapeHtml(row.name + " " + timeLabel(row.entry)) + '</div><div class="row-sub">' + escapeHtml(attendanceText(row) || "기록 없음") + '</div></div><span class="state-pill ' + row.status.cls + '">' + escapeHtml(row.status.label) + '</span></div>';
    }).join("");
  }

  function renderRecords() {
    const rows = monthRows()
      .filter(function (row) { return state.filter === "all" || row.status.key === state.filter; })
      .sort(function (a, b) { return a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ko"); });
    if (!rows.length) {
      byId("recordRows").innerHTML = '<tr><td colspan="7" class="empty">조건에 맞는 기록 없음</td></tr>';
      return;
    }
    byId("recordRows").innerHTML = rows.map(function (row) {
      const att = row.att || {};
      const source = [att.actual_start_source, att.actual_end_source].filter(Boolean).join(" / ");
      return '<tr data-date="' + row.date + '"><td>' + escapeHtml(displayDate(row.date)) + '</td><td><strong>' + escapeHtml(row.name) + '</strong></td><td>' + escapeHtml(timeLabel(row.entry)) + '</td><td>' + escapeHtml(att.actual_start || "-") + '</td><td>' + escapeHtml(att.actual_end || "-") + '</td><td><span class="state-pill ' + row.status.cls + '">' + escapeHtml(row.status.label) + '</span></td><td>' + escapeHtml(source || "-") + '</td></tr>';
    }).join("");
  }

  function setMonth(monthKey) {
    state.monthKey = monthKey;
    if (state.selectedDate.slice(0, 7) !== monthKey) state.selectedDate = monthKey + "-01";
    loadAll();
  }

  function shiftMonth(delta) {
    const parts = state.monthKey.split("-").map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
    setMonth(keyOf(date).slice(0, 7));
  }

  function bindEvents() {
    document.querySelectorAll(".dash-tab").forEach(function (button) {
      button.addEventListener("click", function () {
        state.view = button.dataset.view;
        document.querySelectorAll(".dash-tab").forEach(function (item) {
          item.classList.toggle("is-active", item === button);
        });
        document.querySelectorAll(".dash-view").forEach(function (view) {
          view.classList.toggle("is-active", view.id === "view-" + state.view);
        });
      });
    });

    byId("prevMonth").addEventListener("click", function () { shiftMonth(-1); });
    byId("nextMonth").addEventListener("click", function () { shiftMonth(1); });
    byId("monthInput").addEventListener("change", function (event) {
      if (event.target.value) setMonth(event.target.value);
    });
    byId("todayButton").addEventListener("click", function () {
      const today = businessDateKey();
      state.selectedDate = today;
      state.monthKey = today.slice(0, 7);
      loadAll();
    });
    byId("refreshButton").addEventListener("click", loadAll);
    byId("filterTabs").addEventListener("click", function (event) {
      const button = closestWithData(event.target, "filter", byId("filterTabs"));
      if (!button) return;
      state.filter = button.dataset.filter || "all";
      document.querySelectorAll(".filter-tab").forEach(function (item) {
        item.classList.toggle("is-active", item === button);
      });
      renderRecords();
    });
    document.addEventListener("click", function (event) {
      const dateNode = closestWithData(event.target, "date", document.body);
      if (!dateNode) return;
      state.selectedDate = dateNode.dataset.date;
      if (state.selectedDate.slice(0, 7) !== state.monthKey) {
        state.monthKey = state.selectedDate.slice(0, 7);
        loadAll();
      } else {
        renderAll();
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && Date.now() - state.lastLoadedAt > AUTO_REFRESH_MS) loadAll();
    });
  }

  function closestWithData(node, key, stop) {
    let cur = node;
    while (cur && cur !== stop) {
      if (cur.dataset && cur.dataset[key]) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  bindEvents();
  loadAll();
  setInterval(loadAll, AUTO_REFRESH_MS);
})(window);
