// 기록. 레시피 칸 아래 최근 3~5줄. 더보기는 지난 24시간 전체를 내부 스크롤로 보여준다.
// 한 줄 = 제목 · 상태 · 시간. 상태: 앞으로 끝날 것은 "예정", 지난 일은 완료·시작·정지·삭제·추가. 정렬은 시간 숫자(후가 위, 전이 아래).
// 화면 글자를 긁지 않고 ChickenTimerBoardApp 상태를 읽는다. 동기화·복구 동작은 그대로다.
(function (global) {
  const root = document.getElementById("board");
  const app = global.ChickenTimerBoardApp;
  if (!root || !app || document.getElementById("board-log")) return;

  // 더보기를 열고 1분 동안 목록을 만지지 않으면 다시 접는다.
  const MORE_HOLD_MS = 60 * 1000;
  const PAST_WINDOW_MS = 24 * 60 * 60 * 1000;
  let extraUntil = 0;
  const NEAR_SECONDS = 60;
  const ACTION_LABEL = { start: "시작", completed: "완료", pause: "정지", clear: "삭제" };

  const panel = document.createElement("aside");
  panel.id = "board-log";
  panel.className = "board-log";
  panel.setAttribute("aria-label", "기록");
  const head = document.createElement("div");
  head.className = "board-cell-head log-bar";
  const title = document.createElement("h2");
  title.textContent = "기록";
  const fold = document.createElement("button");
  fold.type = "button";
  fold.className = "log-fold";
  fold.hidden = true;
  fold.setAttribute("aria-expanded", "false");
  head.append(title, fold);
  const list = document.createElement("ol");
  panel.append(head, list);
  fold.addEventListener("click", () => {
    const open = panel.dataset.open !== "true";
    if (open) {
      panel.dataset.open = "true";
      extraUntil = Date.now() + MORE_HOLD_MS;
    } else {
      delete panel.dataset.open;
    }
    fold.setAttribute("aria-expanded", open ? "true" : "false");
    list.scrollTop = 0;
    render();
  });
  function holdOpen() {
    if (panel.dataset.open === "true") extraUntil = Date.now() + MORE_HOLD_MS;
  }
  list.addEventListener("scroll", holdOpen);
  list.addEventListener("pointerdown", holdOpen);
  list.addEventListener("wheel", holdOpen, { passive: true });
  list.addEventListener("keydown", holdOpen);
  list.tabIndex = 0;

  // 레시피 칸이 생긴 뒤에만 붙인다. 보드 격자의 별도 칸으로 두지 않는다.
  function mountLog() {
    const strip = document.getElementById("recipe-strip");
    if (!strip) return false;
    if (panel.parentElement !== strip) strip.appendChild(panel);
    return true;
  }

  // 동기화 상태는 기록 한 줄 안, 복구 비상버튼은 더보기 앞.
  function placeRecoveryButton() {
    const status = document.querySelector(".board .sync-status");
    if (status && status.parentElement !== head) head.insertBefore(status, fold);
    const button = document.querySelector(".board .recovery-button");
    if (!button) return;
    if (button.parentElement !== head) head.insertBefore(button, fold);
    button.title = "동기화 충돌이나 서버 오류로 지워지면 최근 기록대로 다시 진행";
    button.setAttribute("aria-label", "동기화 충돌이나 서버 오류로 리셋되면 최근 기록대로 다시 진행");
  }

  function slotTitle(slotId) {
    const n = String(slotId || "").replace("slot-", "");
    if (n === "6") return "ov상";
    if (n === "7") return "ov하";
    if (n === "8") return "사이드";
    return n;
  }

  function slotGroup(slotId) {
    const n = String(slotId || "").replace("slot-", "");
    if (n === "1" || n === "2" || n === "3") return "yellow";
    if (n === "4" || n === "5") return "blue";
    if (n === "8") return "temp";
    return "oven";
  }

  // 1001: 시작은 몇 분을 눌렀는지, 조정은 무엇을 눌렀는지(+10초 · -1분 …).
  function span(sec) {
    const a = Math.abs(Math.round(Number(sec) || 0));
    const m = Math.floor(a / 60), s = a % 60;
    return (m ? m + "분" : "") + (s || !m ? s + "초" : "");
  }
  function actionLabel(entry) {
    if (entry.action === "adjust") {
      const d = Math.round(Number(entry.deltaSeconds) || 0);
      return d ? (d > 0 ? "+" : "-") + span(d) : "";
    }
    if (entry.action === "start") {
      const sec = entry.baseDurationSeconds || entry.durationSeconds;
      return sec ? "시작 " + span(sec) : "시작";
    }
    if (entry.action === "resume") return "재개";
    return ACTION_LABEL[entry.action] || "";
  }

  function timeText(seconds) {
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const body = (m ? m + "분" : "") + s + "초";
    if (seconds > 0) return body + "후";
    if (seconds < 0) return "-" + body + "전";
    return body;
  }

  function collect(now) {
    const snapshot = app.getSnapshot() || {};
    const slots = Array.isArray(snapshot.slots) ? snapshot.slots : [];
    const future = [];
    const past = [];
    slots.forEach((slot) => {
      if (!slot || !slot.id) return;
      if (slot.status === "running" && slot.endAt > now) {
        future.push({ key: slot.id + ":run", slotId: slot.id, status: "예정", at: slot.endAt });
      }
      (app.getSplitEntries(slot.id) || []).forEach((entry, index) => {
        if (!entry || entry.status !== "running" || !(entry.endAt > now)) return;
        future.push({ key: slot.id + ":split:" + (entry.id || index), slotId: slot.id, status: "예정", at: entry.endAt });
      });
      (Array.isArray(slot.activityLog) ? slot.activityLog : []).forEach((entry) => {
        const label = actionLabel(entry);
        if (!label || !(entry.at <= now) || now - entry.at > PAST_WINDOW_MS) return;
        past.push({ key: slot.id + ":" + entry.action + ":" + entry.at, slotId: slot.id, status: label, at: entry.at });
      });
    });
    // 1006 주방 알림(공장 kitchen_voice.json → kitchen-voice.js): '알림' 줄로 같이 보인다.
    (global.ChickenTimerKitchenNotes || []).forEach((note) => {
      if (!note || !(note.at <= now) || now - note.at > PAST_WINDOW_MS) return;
      past.push({ key: "note:" + note.id, note: note.text, status: "알림", at: note.at });
    });
    past.sort((left, right) => right.at - left.at);
    // 시간 숫자 큰 것이 위. 예정 표시와 지난 24시간 범위는 그대로.
    return future.sort((left, right) => right.at - left.at).concat(past);
  }

  const rowsByKey = new Map();
  let orderKey = "";

  function buildRow(item) {
    const row = document.createElement("li");
    row.dataset.group = item.note ? "note" : slotGroup(item.slotId);
    const name = document.createElement("span");
    name.className = "log-title";
    name.textContent = item.note || slotTitle(item.slotId);
    if (item.note) name.title = item.note;
    const status = document.createElement("span");
    status.className = "log-status";
    status.textContent = item.status;
    const time = document.createElement("span");
    time.className = "log-time";
    row.append(name, status, time);
    return row;
  }

  function paintPeek(items) {
    const strip = panel.parentElement;
    const sample = list.firstElementChild;
    const rowHeight = sample ? sample.getBoundingClientRect().height : 20;
    const style = global.getComputedStyle(strip);
    const innerHeight = strip.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const recipeHead = strip.querySelector(".board-cell-head");
    const headHeight = recipeHead ? recipeHead.getBoundingClientRect().height +
      parseFloat(global.getComputedStyle(recipeHead).marginBottom) : 0;
    // 레시피 제목/버튼과 목록 공간을 먼저 남긴다. 기록은 그 아래에서만 스크롤한다.
    const reserve = Math.max(40, (innerHeight - headHeight) * 0.4);
    const budget = Math.max(rowHeight * 3, innerHeight - headHeight - reserve - head.getBoundingClientRect().height - 4);
    const lines = Math.max(3, Math.min(5, Math.floor(budget / rowHeight)));
    const open = panel.dataset.open === "true";
    list.style.height = Math.min(items.length, open ? Math.floor(budget / rowHeight) : lines) * rowHeight + "px";
    panel.dataset.lines = String(lines);
    fold.setAttribute("aria-expanded", open ? "true" : "false");
    fold.textContent = open ? "접기" : "더보기 +" + Math.max(0, items.length - lines);
    fold.hidden = items.length <= lines && !open;
  }

  function render() {
    if (!mountLog()) return;
    placeRecoveryButton();
    const now = typeof app.getNow === "function" ? app.getNow() : Date.now();
    if (panel.dataset.open === "true" && Date.now() > extraUntil) {
      delete panel.dataset.open;
      list.scrollTop = 0;
    }
    let items;
    try {
      items = collect(now);
    } catch (_) {
      return;
    }
    const nextOrder = items.map((item) => item.key).join("|");
    if (nextOrder !== orderKey) {
      const nextRows = new Map();
      const savedScroll = list.scrollTop;
      list.replaceChildren();
      items.forEach((item) => {
        const row = rowsByKey.get(item.key) || buildRow(item);
        nextRows.set(item.key, row);
        list.appendChild(row);
      });
      rowsByKey.clear();
      nextRows.forEach((row, key) => rowsByKey.set(key, row));
      list.scrollTop = panel.dataset.open === "true" ? savedScroll : 0;
      orderKey = nextOrder;
    }
    items.forEach((item) => {
      const row = rowsByKey.get(item.key);
      if (!row) return;
      const seconds = Math.round((item.at - now) / 1000);
      const text = timeText(seconds);
      const time = row.lastChild;
      if (time.textContent !== text) time.textContent = text;
      const when = seconds > 0 ? "future" : "past";
      if (row.dataset.when !== when) row.dataset.when = when;
      const near = Math.abs(seconds) < NEAR_SECONDS ? "true" : "false";
      if (row.dataset.near !== near) row.dataset.near = near;
    });
    paintPeek(items);
  }

  render();
  global.setInterval(render, 1000);
})(window);
