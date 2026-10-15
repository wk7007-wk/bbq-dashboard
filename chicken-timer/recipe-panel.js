(function (global) {
  "use strict";

  const document = global.document;
  if (!document || !document.body) return;

  // 타이머 레시피 SOT (0930). 판매 목록 /recipes.json 은 절대 쓰지 않는다.
  // 읽기: 공장2 저장본 /timer_recipes.json 과 보드 파일 timer-recipes.json 중 updated_at 이 큰 쪽.
  // 쓰기: /timer_recipes.json (공통 로그인 PIN). 공장 거울 작업이 sot/timer_recipes.json 과 보드 파일로 옮긴다.
  const TIMER_RECIPE_STORE = "/timer_recipes.json";
  const PIN_STORAGE_KEY = "factory_login_pin";
  const REFRESH_MS = 5 * 60 * 1000;
  let recipeDoc = { schema: "timer_recipe_v1", sot: "factory2", recipes: {} };

  function timerRecipeUrl() {
    try {
      return new URL("timer-recipes.json", global.location.href).href;
    } catch (_) {
      return "timer-recipes.json";
    }
  }

  function fetchJson(url) {
    return global.fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" })
      .then((response) => {
        if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : ""));
        return response.json();
      });
  }

  function isRecipeDoc(doc) {
    return !!(doc && typeof doc === "object" && doc.recipes && typeof doc.recipes === "object" && !Array.isArray(doc.recipes));
  }

  function fetchTimerRecipeDoc() {
    return Promise.all([
      fetchJson(TIMER_RECIPE_STORE).catch(() => null),
      fetchJson(timerRecipeUrl()).catch(() => null),
    ]).then((docs) => {
      const valid = docs.filter(isRecipeDoc);
      if (!valid.length) throw new Error("레시피 없음");
      valid.sort((left, right) => Number(right.updated_at || 0) - Number(left.updated_at || 0));
      return valid[0];
    });
  }

  function readPin() {
    try {
      const saved = global.localStorage && global.localStorage.getItem(PIN_STORAGE_KEY);
      if (saved) return saved;
    } catch (_) {}
    try {
      const posweb = global.sessionStorage && global.sessionStorage.getItem("posweb_admin_token");
      if (posweb) return posweb;
    } catch (_) {}
    return "";
  }

  function savePin(pin) {
    try {
      if (pin) global.localStorage.setItem(PIN_STORAGE_KEY, pin);
      else global.localStorage.removeItem(PIN_STORAGE_KEY);
    } catch (_) {}
  }

  function askPin() {
    const value = typeof global.prompt === "function" ? global.prompt("공장 로그인 PIN") : "";
    return String(value || "").replace(/\D+/g, "");
  }

  function putRecipeDoc(doc) {
    const body = JSON.stringify(doc);
    function attempt(pin, retried) {
      if (!pin) return Promise.reject(new Error("PIN 필요"));
      return global.fetch(TIMER_RECIPE_STORE, {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Posweb-Pin": pin },
        body,
      }).then((response) => {
        if (response && response.status === 401) {
          savePin("");
          if (retried) throw new Error("PIN 틀림");
          return attempt(askPin(), true);
        }
        if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : ""));
        savePin(pin);
        return response;
      });
    }
    const pin = readPin();
    return attempt(pin || askPin(), !pin);
  }

  let recipes = {};
  let selectedKey = "";
  let isOpen = false;
  let loadedAt = 0;
  let sortMode = "name";
  let editMode = false;

  const refs = buildPanel();
  bindEvents();

  global.ChickenTimerRecipePanel = {
    open,
    close,
    toggle,
    refresh: () => loadRecipes(true),
    getRecipes: () => clone(recipes),
  };

  function buildPanel() {
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "recipe-toggle";
    toggleButton.textContent = "레시피";
    toggleButton.setAttribute("aria-label", "레시피 패널 열기/닫기");
    (document.querySelector(".board-utility-rail") || document.body).appendChild(toggleButton);

    const scrim = document.createElement("div");
    scrim.className = "recipe-scrim";
    document.body.appendChild(scrim);

    const drawer = document.createElement("aside");
    drawer.className = "recipe-drawer";
    drawer.setAttribute("aria-label", "레시피 시트");
    drawer.setAttribute("aria-hidden", "true");

    const header = document.createElement("div");
    header.className = "recipe-panel-header";
    drawer.appendChild(header);

    const titleWrap = document.createElement("div");
    header.appendChild(titleWrap);

    const title = document.createElement("div");
    title.className = "recipe-panel-title";
    title.textContent = "레시피";
    titleWrap.appendChild(title);

    const status = document.createElement("div");
    status.className = "recipe-panel-status";
    status.textContent = "메인 데이터";
    titleWrap.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "recipe-header-actions";
    header.appendChild(actions);

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "recipe-panel-action recipe-back-action";
    backButton.textContent = "뒤로";
    backButton.setAttribute("aria-label", "레시피 화면 닫기");
    actions.appendChild(backButton);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "recipe-panel-action";
    editButton.textContent = "새로고침";
    actions.appendChild(editButton);

    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "recipe-panel-action is-primary";
    newButton.textContent = "입력";
    actions.appendChild(newButton);

    const search = document.createElement("input");
    search.className = "recipe-search";
    search.type = "search";
    search.placeholder = "메뉴 검색";
    drawer.appendChild(search);

    const sortBar = document.createElement("div");
    sortBar.className = "recipe-sortbar";
    sortBar.innerHTML = [
      '<button type="button" class="recipe-sort is-active" data-sort="name">이름순 자동</button>'
    ].join("");
    drawer.appendChild(sortBar);

    const content = document.createElement("div");
    content.className = "recipe-panel-content";
    drawer.appendChild(content);

    const list = document.createElement("div");
    list.className = "recipe-panel-list";
    content.appendChild(list);

    document.body.appendChild(drawer);
    return { toggleButton, scrim, drawer, status, backButton, editButton, newButton, search, sortBar, list };
  }

  function bindEvents() {
    refs.toggleButton.addEventListener("click", toggle);
    refs.scrim.addEventListener("click", close);
    refs.backButton.addEventListener("click", close);
    refs.editButton.addEventListener("click", () => loadRecipes(true));
    refs.newButton.addEventListener("click", () => {
      editMode = !editMode;
      renderAll();
      if (editMode) {
        const firstBlank = refs.list.querySelector('[data-new-row="true"] [data-field="menuName"]');
        if (firstBlank) firstBlank.focus();
      }
    });
    refs.search.addEventListener("input", renderAll);
    refs.sortBar.addEventListener("click", (event) => {
      const button = closestSortButton(event.target);
      if (!button) return;
      sortMode = button.dataset.sort || "auto";
      Array.prototype.forEach.call(refs.sortBar.querySelectorAll("[data-sort]"), (item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderAll();
    });
    refs.list.addEventListener("click", (event) => {
      const deleteButton = event.target && event.target.closest ? event.target.closest(".recipe-row-delete") : null;
      if (deleteButton) {
        const row = closestRecipeRow(deleteButton);
        if (row && row.dataset.recipeKey && (typeof global.confirm !== "function" || global.confirm("이 레시피를 지울까요?"))) {
          saveRecipe(rowValues(row), row.dataset.recipeKey, true);
        }
        return;
      }
      const saveButton = closestRowSave(event.target);
      if (saveButton) {
        const row = closestRecipeRow(saveButton);
        if (row) saveGridRow(row);
        return;
      }
      const row = closestRecipeRow(event.target);
      if (!row || !row.dataset || !row.dataset.recipeKey) return;
      selectedKey = row.dataset.recipeKey;
      renderRowSelection();
    });
    refs.list.addEventListener("focusin", (event) => {
      const row = closestRecipeRow(event.target);
      if (!row || !row.dataset || !row.dataset.recipeKey) return;
      selectedKey = row.dataset.recipeKey;
      renderRowSelection();
    });
    refs.list.addEventListener("keydown", (event) => {
      if (!event || event.key !== "Enter" || event.isComposing) return;
      if (!editMode) return;
      const row = closestRecipeRow(event.target);
      if (!row) return;
      event.preventDefault();
      saveGridRow(row);
    });

    if (typeof global.addEventListener === "function") {
      global.addEventListener("keydown", (event) => {
        if (event && event.key === "Escape") close();
      });
    }
  }

  function closestRecipeRow(node) {
    let cur = node;
    while (cur && cur !== refs.list) {
      if (cur.dataset && Object.prototype.hasOwnProperty.call(cur.dataset, "recipeRow")) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  function closestRowSave(node) {
    let cur = node;
    while (cur && cur !== refs.list) {
      if (cur.classList && cur.classList.contains("recipe-row-save")) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  function closestSortButton(node) {
    let cur = node;
    while (cur && cur !== refs.sortBar) {
      if (cur.dataset && cur.dataset.sort) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function open() {
    isOpen = true;
    document.body.dataset.recipePanel = "open";
    refs.drawer.setAttribute("aria-hidden", "false");
    refs.toggleButton.textContent = "닫기";
    if (!loadedAt || Date.now() - loadedAt > REFRESH_MS) {
      loadRecipes(false);
    } else {
      renderAll();
    }
  }

  function close() {
    isOpen = false;
    document.body.dataset.recipePanel = "closed";
    refs.drawer.setAttribute("aria-hidden", "true");
    refs.toggleButton.textContent = "편집";
  }

  document.addEventListener("chickentimer-kitchen-now", () => {
    rememberRecent();
    paintSlotTags();
    if (isOpen && !editMode) renderAll();
    if (recipeDoc) {
      renderRecipeStrip(recipeRowsFromPayload(recipeDoc));
      Array.prototype.forEach.call(document.querySelectorAll("#recipe-strip .recipe-column, #recipe-strip .recipe-columns"), (el) => {
        el.scrollTop = 0;   // 새 주문 메뉴가 맨 위에 보이게
      });
    }
  });
  global.setInterval(() => {   // 남은 분 갱신
    if (!Object.keys(kitchenNow()).length) return;
    if (isOpen && !editMode) renderAll();
  }, 20000);
  global.setInterval(updateStripLive, 5000);   // 띠: 줄 다시 만들지 않고 도는 줄의 남은 분·막대만(화면 표시용)

  function publishRecipes() {
    if (!document || typeof document.dispatchEvent !== "function" || typeof global.CustomEvent !== "function") return;
    try {
      document.dispatchEvent(new global.CustomEvent("chickentimer-recipes"));
    } catch (_) {}
  }

  function loadRecipes(force) {
    if (typeof global.fetch !== "function") {
      refs.status.textContent = "네트워크 미지원";
      renderAll();
      publishRecipes();
      return Promise.resolve();
    }
    if (!force && loadedAt && Date.now() - loadedAt < REFRESH_MS) {
      renderAll();
      publishRecipes();
      return Promise.resolve();
    }
    refs.status.textContent = "불러오는 중";
    return fetchTimerRecipeDoc()
      .then((doc) => {
        recipeDoc = doc;
        recipes = sanitizeRecipes(doc.recipes || {});
        loadedAt = Date.now();
        refs.status.textContent = "공장 SOT" + (doc.updated_at_kst ? " · " + String(doc.updated_at_kst).slice(5, 16).replace("T", " ") : "");
        if (!selectedKey || !recipes[selectedKey]) {
          const first = recipeEntries()[0];
          selectedKey = first ? first[0] : "";
        }
        renderAll();
        publishRecipes();
      })
      .catch((error) => {
        refs.status.textContent = "로드 실패";
        refs.list.innerHTML = '<div class="recipe-empty">레시피를 불러오지 못했다.<br>' + escapeHtml(error && error.message ? error.message : error) + "</div>";
      });
  }

  function saveGridRow(row) {
    const values = rowValues(row);
    if (!values.menuName) {
      refs.status.textContent = "메뉴명 필요";
      const nameInput = row.querySelector('[data-field="menuName"]');
      if (nameInput) nameInput.focus();
      return;
    }
    saveRecipe(values, row.dataset.recipeKey || "");
  }

  function saveRecipe(values, oldKey, deactivate) {
    const allRecipes = (recipeDoc && recipeDoc.recipes) || {};
    const key = recipeKey(values.menuName, values.option);
    const writeKey = oldKey || key;
    if (!oldKey && allRecipes[writeKey] && allRecipes[writeKey].active !== false) {
      refs.status.textContent = "이미 있는 메뉴";
      return;
    }
    const previous = allRecipes[writeKey] || {};
    const now = Date.now();
    const group = values.group === "side" ? "side" : "main";
    const bareName = String(values.menuName || "").replace(/^#+/, "").trim();
    const menuName = group === "main" ? "#" + bareName : bareName;
    const payload = deactivate ? { active: false } : {
      name: menuName,
      menu_name: menuName,
      option: values.option,
      time: values.time,
      description: values.description,
      group,
      active: true,
      recipe_schema: "timer_recipe_v1",
    };
    payload.updated_at = now;
    payload.updated_at_kst = kstTimestamp(now);
    payload.version = Number(previous.version || 0) + 1;

    refs.status.textContent = deactivate ? "삭제 중" : "저장 중";
    const nextAll = Object.assign({}, allRecipes);
    nextAll[writeKey] = Object.assign({}, previous, payload);
    const nextDoc = Object.assign({}, recipeDoc, {
      schema: "timer_recipe_v1",
      sot: "factory2",
      updated_at: now,
      updated_at_kst: kstTimestamp(now),
      recipes: nextAll,
    });
    putRecipeDoc(nextDoc)
      .then(() => {
        recipeDoc = nextDoc;
        const nextRecipes = sanitizeRecipes(nextAll);
        recipes = nextRecipes;
        selectedKey = writeKey;
        loadedAt = Date.now();
        refs.status.textContent = deactivate ? "삭제 완료" : "저장 완료";
        renderAll();
        publishRecipes();
      })
      .catch((error) => {
        refs.status.textContent = "저장 실패";
        refs.list.insertAdjacentHTML("afterbegin", '<div class="recipe-empty">저장 실패<br>' + escapeHtml(error && error.message ? error.message : error) + "</div>");
      });
  }

  function rowValues(row) {
    return {
      menuName: valueOfRowField(row, "menuName"),
      option: valueOfRowField(row, "option"),
      time: valueOfRowField(row, "time"),
      description: valueOfRowField(row, "description"),
      group: valueOfRowField(row, "group"),
    };
  }

  function valueOfRowField(row, field) {
    const input = row.querySelector('[data-field="' + field + '"]');
    return input ? input.value.trim() : "";
  }

  function renderAll() {
    syncModeControls();
    if (editMode) renderEditList();
    else renderOutputList();
  }

  function syncModeControls() {
    refs.drawer.dataset.mode = editMode ? "edit" : "output";
    refs.newButton.textContent = editMode ? "출력" : "입력";
  }

  function sanitizeRecipes(raw) {
    const out = {};
    Object.keys(raw || {}).forEach((key) => {
      const recipe = raw[key];
      if (!recipe || typeof recipe !== "object") return;
      if (recipe.active === false) return;
      out[String(key)] = recipe;
    });
    return out;
  }

  // 1006 주문 즉시 그 메뉴 레시피를 위로·색(kitchen-voice.js 가 공장 kitchen_now.json 을 ChickenTimerKitchenNow 로). 입력(편집) 중엔 안 움직임.
  function kitchenNow() {
    return (global.ChickenTimerKitchenNow && global.ChickenTimerKitchenNow.byKey) || {};
  }

  function nowRank(key) {
    if (editMode) return 0;
    const m = kitchenNow()[key];
    return m ? m.rank : 1e9;
  }

  // 순서 번호 · 도는 것 남은 분(먼저 끝나는 것) · 대기 수. 예) ①3분  ②대기  ③9분+대기1
  function orderBadgeText(kn) {
    const n = "①②③④⑤⑥⑦⑧⑨⑩".charAt(kn.rank) || String(kn.rank + 1) + ".";
    const parts = [];
    if (kn.cook) parts.push(Math.max(0, Math.ceil((Number(kn.end || 0) * 1000 - Date.now()) / 60000)) + "분" + (kn.cook > 1 ? "×" + kn.cook : ""));
    if (kn.wait) parts.push("대기" + (kn.wait > 1 || kn.cook ? kn.wait : ""));
    return n + parts.join("+");
  }

  function orderBadge(kn) {
    if (!kn) return "";
    const n = "①②③④⑤⑥⑦⑧⑨⑩".charAt(kn.rank) || String(kn.rank + 1) + ".";
    const parts = [];
    if (kn.cook) parts.push(Math.max(0, Math.ceil((Number(kn.end || 0) * 1000 - Date.now()) / 60000)) + "분" + (kn.cook > 1 ? "×" + kn.cook : ""));
    if (kn.wait) parts.push("대기" + (kn.wait > 1 || kn.cook ? kn.wait : ""));
    return '<span class="recipe-order-badge">' + n + " " + escapeHtml(parts.join("+")) + "</span>";
  }

  function recipeEntries() {
    const query = refs.search.value.trim().toLowerCase();
    return Object.keys(recipes)
      .map((key) => [key, recipes[key]])
      .filter(([key, recipe]) => {
        if (!query) return true;
        return (key + " " + recipeName(recipe, key) + " " + String(recipe.option || "") + " " + String(recipe.time || "") + " " + String(recipe.description || "")).toLowerCase().indexOf(query) >= 0;
      })
      .sort((a, b) => (nowRank(a[0]) - nowRank(b[0])) || compareRecipes(a, b));
  }

  function compareRecipes(a, b) {
    const left = recipeSortParts(a[0], a[1]);
    const right = recipeSortParts(b[0], b[1]);
    const order = sortMode === "menu"
      ? ["menu", "option", "time", "key"]
      : sortMode === "option"
        ? ["option", "menu", "time", "key"]
        : sortMode === "time"
          ? ["time", "menu", "option", "key"]
          : ["menu", "option", "time", "key"];
    for (let i = 0; i < order.length; i += 1) {
      const field = order[i];
      const result = String(left[field] || "").localeCompare(String(right[field] || ""), "ko", {
        numeric: true,
        sensitivity: "base",
      });
      if (result !== 0) return result;
    }
    return 0;
  }

  function recipeSortParts(key, recipe) {
    return {
      key,
      menu: normalizeSortText(recipeName(recipe, key)),
      option: normalizeSortText(recipe && recipe.option),
      time: normalizeTimeSortText(recipe && (recipe.time || recipe.cook_time)),
    };
  }

  function normalizeSortText(value) {
    return String(value || "").trim();
  }

  function normalizeTimeSortText(value) {
    const raw = String(value || "").trim();
    const minMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:분|min|minute)/i);
    if (minMatch) return String(Math.round(Number(minMatch[1]) * 60)).padStart(8, "0") + " " + raw;
    const secMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:초|sec|second)/i);
    if (secMatch) return String(Math.round(Number(secMatch[1]))).padStart(8, "0") + " " + raw;
    const firstNumber = raw.match(/\d+(?:\.\d+)?/);
    if (firstNumber) return String(Math.round(Number(firstNumber[0]) * 60)).padStart(8, "0") + " " + raw;
    return raw;
  }

  function renderEditList() {
    const entries = recipeEntries();
    const bodyRows = entries.map(([key, recipe]) => {
      const active = key === selectedKey ? " is-active" : "";
      return '<tr class="recipe-grid-row' + active + '" data-recipe-row data-recipe-key="' + escapeAttr(key) + '">' +
        groupCell(recipeGroup(recipe)) +
        gridCell("menuName", recipeName(recipe, key).replace(/^#+/, ""), "메뉴명") +
        gridCell("option", recipe && recipe.option, "옵션") +
        gridCell("time", recipe && (recipe.time || recipe.cook_time), "시간") +
        gridCell("description", recipe && (recipe.description || recipe.notes), "설명") +
        '<td class="recipe-grid-actions"><button type="button" class="recipe-row-save">저장</button><button type="button" class="recipe-row-delete">삭제</button></td>' +
        "</tr>";
    }).join("");
    refs.list.innerHTML = '<table class="recipe-grid"><colgroup><col class="recipe-col-group"><col class="recipe-col-menu"><col class="recipe-col-option"><col class="recipe-col-time"><col class="recipe-col-desc"><col class="recipe-col-save"></colgroup><thead><tr><th>구분</th><th>메뉴명</th><th>옵션</th><th>시간</th><th>설명</th><th>저장</th></tr></thead><tbody>' +
      '<tr class="recipe-grid-row is-new" data-recipe-row data-recipe-key="" data-new-row="true">' +
      groupCell("main") +
      gridCell("menuName", "", "새 메뉴") +
      gridCell("option", "", "옵션") +
      gridCell("time", "", "시간") +
      gridCell("description", "", "설명") +
      '<td class="recipe-grid-actions"><button type="button" class="recipe-row-save is-primary">추가</button></td>' +
      "</tr>" +
      (bodyRows || '<tr><td colspan="6" class="recipe-grid-empty">레시피 없음</td></tr>') +
      "</tbody></table>";
  }

  function renderOutputList() {
    const entries = recipeEntries();
    const bodyRows = entries.map(([key, recipe]) => {
      const active = key === selectedKey ? " is-active" : "";
      const kn = kitchenNow()[key];
      const order = kn ? " is-order-" + (kn.cook ? "cook" : "wait") : "";
      return '<tr class="recipe-grid-row' + active + order + '" data-recipe-row data-recipe-key="' + escapeAttr(key) + '">' +
        outputCell("menuName", recipeName(recipe, key)).replace("</td>", orderBadge(kn) + "</td>") +
        outputCell("option", recipe && recipe.option) +
        outputCell("time", recipe && (recipe.time || recipe.cook_time)) +
        outputCell("description", recipe && (recipe.description || recipe.notes)) +
        "</tr>";
    }).join("");
    refs.list.innerHTML = '<table class="recipe-grid recipe-output-grid"><colgroup><col class="recipe-col-menu"><col class="recipe-col-option"><col class="recipe-col-time"><col class="recipe-col-desc"></colgroup><thead><tr><th>메뉴명</th><th>옵션</th><th>시간</th><th>설명</th></tr></thead><tbody>' +
      (bodyRows || '<tr><td colspan="4" class="recipe-grid-empty">레시피 없음</td></tr>') +
      "</tbody></table>";
  }

  function renderRowSelection() {
    Array.prototype.forEach.call(refs.list.querySelectorAll("[data-recipe-row]"), (row) => {
      row.classList.toggle("is-active", !!row.dataset.recipeKey && row.dataset.recipeKey === selectedKey);
    });
  }

  function gridCell(field, value, placeholder) {
    const safeValue = escapeAttr(value || "");
    const safePlaceholder = escapeAttr(placeholder || "");
    return '<td class="recipe-grid-cell is-' + escapeAttr(field) + '"><input data-field="' + escapeAttr(field) + '" type="text" value="' + safeValue + '" placeholder="' + safePlaceholder + '"></td>';
  }

  function groupCell(group) {
    const side = group === "side";
    return '<td class="recipe-grid-cell is-group"><select data-field="group">' +
      '<option value="main"' + (side ? "" : " selected") + '>치킨</option>' +
      '<option value="side"' + (side ? " selected" : "") + '>사이드</option></select></td>';
  }

  function outputCell(field, value) {
    return '<td class="recipe-output-cell is-' + escapeAttr(field) + '">' + escapeHtml(value || "") + "</td>";
  }

  function recipeName(recipe, key) {
    return String((recipe && (recipe.menu_name || recipe.name)) || key || "레시피");
  }

  function recipeKey(menuName, option) {
    const base = option ? menuName + "__" + option : menuName;
    const sanitized = String(base || "")
      .trim()
      .replace(/[.#$\[\]\/?\s]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return sanitized || "recipe";
  }

  function kstTimestamp(ms) {
    try {
      return new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T");
    } catch (_) {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch (_) {
      return {};
    }
  }

  // 레시피 칸. 두 열 세로 목록: 왼쪽 치킨(#), 오른쪽 사이드. 한 줄 = 메뉴 이름 · 시간.
  function mountRecipeStrip() {
    const board = document.getElementById("board");
    if (!board) return false;
    if (document.getElementById("recipe-strip")) return true;
    const section = document.createElement("section");
    section.id = "recipe-strip";
    section.className = "board-cell recipe-strip";
    section.setAttribute("aria-label", "레시피");
    const head = document.createElement("div");
    head.className = "board-cell-head";
    const heading = document.createElement("h2");
    heading.textContent = "레시피";
    head.appendChild(heading);
    const toggle = document.querySelector(".recipe-toggle");
    if (toggle) {
      toggle.textContent = "편집";
      head.appendChild(toggle);
    }
    const columns = document.createElement("div");
    columns.className = "recipe-columns";
    [["main", "치킨"], ["side", "사이드"]].forEach((pair) => {
      const column = document.createElement("div");
      column.className = "recipe-column";
      column.dataset.group = pair[0];
      column.setAttribute("aria-label", pair[1]);
      const list = document.createElement("ul");
      list.className = "recipe-strip-list";
      column.appendChild(list);
      columns.appendChild(column);
    });
    section.append(head, columns);
    board.appendChild(section);
    return true;
  }

  // 1010 사장님: 세트는 풀네임(구성 포함 — 단품 타이머는 따로 있고 구성 보려고 있는 줄), 맵소디·갈비·크래커·자메·타르타르, 모듬볼10개는 구성 황금알3·크림3·더블3
  const STRIP_SHORT = {
    "극한왕갈비": "갈비",   // 1010 맵소디와 별개 메뉴(레시피만 비슷) — 칸도 따로
    "순살크래커, 크런치순살크래커": "크래커",
    "파더's, 파더스": "파더스",
    "핫윙, 비비윙스": "핫윙",
    "자메이카 통다리구이": "자메",
    "타르타르 새우튀김": "타르타르",
    "모듬볼(10개)": "모듬볼10개(황금알3·크림3·더블4)",
    "모듬볼(6개)": "모듬볼 6개",
  };
  const STRIP_SHORT_OPTION = { "다리=날개=콤보": "다리·날개·콤보" };

  function recipeStripName(recipe) {
    // 1010 사장님 "황금올리브치킨은 황올로 함축해도 돼"·"또 줄여야 되는 것?" — 레시피 칸 띠 표시만 줄임(레시피 이름·편집 표는 그대로)
    const base = String((recipe && (recipe.menu_name || recipe.name)) || "레시피").replace(/^#/, "").trim();
    const raw = STRIP_SHORT[base] || base.replace(/^황금올리브(치킨)?/, "황올");
    const opt = recipe && recipe.option ? String(recipe.option).trim() : "";
    const option = STRIP_SHORT_OPTION[opt] || opt;
    return [raw, option].filter(Boolean).join(" ");
  }

  // 1010 양념·반반 표기 — 조리 레시피는 황올 그대로, 주방엔 "황올 양념"·"황올 반반"·"황올 순살 양념"
  function labeledName(recipe, label) {
    if (String(label || "").trim() === "콤보") return recipeStripName(Object.assign({}, recipe, { option: "콤보" }));
    const base = recipeStripName(recipe);
    const lab = String(label || "").trim();
    if (!lab) return base;
    if (recipe && String(recipe.option || "").trim() === "한마리") return base.replace(/ 한마리$/, "") + " " + lab;
    return base + " " + lab;
  }

  function recipeStripLabel(recipe) {
    const time = recipe && recipe.time ? String(recipe.time).trim() : "";
    return [recipeStripName(recipe), time].filter(Boolean).join(" ");
  }

  function recipeGroup(recipe) {
    if (recipe && recipe.group === "side") return "side";
    if (recipe && recipe.group === "main") return "main";
    const name = String((recipe && (recipe.menu_name || recipe.name)) || "").trim();
    return name.charAt(0) === "#" ? "main" : "side";
  }

  // 1010 최근 기억 — 끝난 메뉴가 원래 자리로 돌아가지 않고 '최근' 묶음에 남게(기기 안 localStorage, 14일).
  const RECENT_KEY = "ct_recipe_recent_v1";
  const RECENT_KEEP_S = 14 * 86400;

  function readRecent() {
    try {
      const v = JSON.parse(global.localStorage.getItem(RECENT_KEY) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (_) {
      return {};
    }
  }

  function recentMap() {
    return readRecent();
  }

  function rememberRecent() {
    try {
      const nowS = Date.now() / 1000;
      const cur = global.ChickenTimerKitchenNow || {};
      const server = cur.recent || {};
      const map = readRecent();
      const out = {};
      const put = (key, val) => {
        val = Number(val);
        if (!key || !isFinite(val) || val <= 0 || nowS - val > RECENT_KEEP_S) return;
        if (!(out[key] >= val)) out[key] = val;
      };
      Object.keys(map).forEach((k) => put(k, map[k]));
      Object.keys(server).forEach((k) => put(k, server[k]));
      Object.keys(cur.byKey || {}).forEach((k) => put(k, nowS));
      global.localStorage.setItem(RECENT_KEY, JSON.stringify(out));
    } catch (_) { /* 저장 못 해도 띠는 동작 */ }
  }

  function totalSecOf(timeText) {
    const m = String(timeText || "").match(/^\s*(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) * 60 : 0;
  }

  // 남은 비율 0~1 — 공장이 준 시작·끝이 1순위, 없으면 레시피 시간 앞 숫자(분), 그것도 없으면 1.
  function remainRatio(kn, totalSec) {
    const end = Number(kn.end || 0);
    if (!end) return 1;
    const nowS = Date.now() / 1000;
    const start = Number(kn.start || 0);
    const total = start && end > start ? end - start : totalSec;
    if (!(total > 0)) return 1;
    return Math.max(0, Math.min(1, (end - nowS) / total));
  }

  function paintCook(item, kn, totalSec) {
    item.style.setProperty("--p", (remainRatio(kn, totalSec) * 100).toFixed(1) + "%");
    const left = Number(kn.end || 0) - Date.now() / 1000;
    if (kn.end && left <= 60) item.dataset.soon = "true";
    else delete item.dataset.soon;
  }

  function paintSlotTags() {
    // 1010 칸 안에 지금 도는 타이머가 맞을 메뉴 이름·확률(%) — 레시피 칸과 별개
    const slots = (global.ChickenTimerKitchenNow && global.ChickenTimerKitchenNow.slots) || {};
    let byKey = null;
    Array.prototype.forEach.call(document.querySelectorAll("#board .slot-card[data-slot-id]"), (card) => {
      const id = card.dataset.slotId;
      if (!/^slot-[1-7]$/.test(id)) return;
      let tag = card.querySelector(":scope > .slot-menu-tag");
      if (!tag) {
        tag = document.createElement("div");
        tag.className = "slot-menu-tag";
        tag.setAttribute("aria-hidden", "true");
        tag.hidden = true;
        card.appendChild(tag);
      }
      const d = slots[id];
      if (!d || !(Number(d.end) * 1000 > Date.now())) {
        if (!tag.hidden) tag.hidden = true;
        return;
      }
      let name = d.menu || "";
      if (d.key) {
        if (!byKey) {
          byKey = {};
          recipeRowsFromPayload(recipeDoc).forEach((r) => { byKey[r._key] = r; });
        }
        if (byKey[d.key]) name = d.label ? labeledName(byKey[d.key], d.label) : recipeStripName(byKey[d.key]);
      }
      // 1011 타이머 분이 메뉴 레시피와 안 맞는 후보(match false)는 확률 대신 '?' — 공장이 p 0 으로 보냄
      const guess = d.match === false;
      const p = guess ? 0 : Number(d.p) || 0;
      const text = guess ? name + " ?" : name + " " + p + "%";
      const conf = guess ? "lo" : p >= 80 ? "hi" : p >= 50 ? "mid" : "lo";
      if (tag.textContent !== text) tag.textContent = text;
      if (tag.dataset.conf !== conf) tag.dataset.conf = conf;
      if (tag.hidden) tag.hidden = false;
    });
  }

  function updateStripLive() {
    paintSlotTags();
    const kn = kitchenNow();
    Array.prototype.forEach.call(document.querySelectorAll('#recipe-strip .recipe-strip-list li[data-order="cook"]'), (item) => {
      const m = kn[item.dataset.key];
      if (!m) return;
      const badge = item.querySelector(".recipe-order-badge");
      if (badge) badge.textContent = orderBadgeText(m);
      paintCook(item, m, Number(item.dataset.total || 0));
    });
  }

  const HEAD_TEXT = { now: "지금", recent: "최근", rest: "그 외" };

  function fillRecipeRow(group, rows) {
    const list = document.querySelector('#recipe-strip .recipe-column[data-group="' + group + '"] .recipe-strip-list');
    if (!list) return;
    list.replaceChildren();
    rows.forEach((recipe) => {
      const item = document.createElement("li");
      if (recipe._head) {
        item.className = "recipe-group-head";
        item.dataset.head = recipe._head;
        const label = document.createElement("span");
        label.textContent = HEAD_TEXT[recipe._head] || "";
        item.appendChild(label);
        list.appendChild(item);
        return;
      }
      const name = document.createElement("span");
      name.className = "recipe-name";
      name.textContent = recipeStripName(recipe);
      const badge = document.createElement("span");
      badge.className = "recipe-order-badge";
      const time = document.createElement("span");
      time.className = "recipe-time";
      time.textContent = String(recipe.time || "").trim();
      item.dataset.group = recipeGroup(recipe);
      item.dataset.key = recipe._key;
      const kn = kitchenNow()[recipe._key];
      let labEl = null;
      if (kn) {
        if (kn.labels && kn.labels.length) {   // 1010 양념·반반·후라이드 표기
          labEl = document.createElement("span");
          labEl.className = "recipe-label";
          labEl.textContent = " " + kn.labels.join("·");
        }
        item.dataset.order = kn.cook ? "cook" : "wait";
        badge.textContent = orderBadgeText(kn);
        if (kn.cook) {
          const totalSec = totalSecOf(recipe.time);
          item.dataset.total = String(totalSec);
          paintCook(item, kn, totalSec);
        }
      } else if (recipe._recent) {
        item.dataset.order = "recent";
      }
      item.append(name, badge, time);
      if (labEl) name.after(labEl);
      if (recipe.description) item.title = String(recipe.description);
      list.appendChild(item);
    });
  }

  // 1010 한 칸 정렬: 지금(도는 것 끝 빠른 순 → 대기 주문 순) → 최근(최근이 위) → 그 외(치킨 이름순 → 사이드 이름순).
  function stripRank(row) {
    const m = kitchenNow()[row && row._key];
    return m ? m.rank : 1e9;
  }

  function renderRecipeStrip(rows) {
    if (!mountRecipeStrip()) return;
    const sideRank = (recipe) => (recipeGroup(recipe) === "side" ? 1 : 0);
    const recent = recentMap();
    const now = [];
    const rec = [];
    const rest = [];
    rows.forEach((row) => {
      if (kitchenNow()[row._key]) now.push(row);
      else if (recent[row._key]) rec.push(Object.assign({ _recent: true }, row));
      else rest.push(row);
    });
    now.sort((a, b) => stripRank(a) - stripRank(b));
    rec.sort((a, b) => Number(recent[b._key]) - Number(recent[a._key]));
    rest.sort((a, b) => sideRank(a) - sideRank(b));   // 안정 정렬 — 이름순 유지
    const out = [];
    [["now", now], ["recent", rec], ["rest", rest]].forEach(([head, list]) => {
      if (!list.length) return;
      out.push({ _head: head });
      list.forEach((r) => out.push(r));
    });
    fillRecipeRow("main", out);
    fillRecipeRow("side", []);
  }

  // 1010 "100프로 매칭시 시간음성이 아니라 메뉴명 음성" — 시간 버튼 초에 맞을 레시피가 하나뿐이면(공장 predict) 그 띠 이름. 아니면 "".
  global.ChickenTimerVoiceName = function (seconds, zone) {
    try {
      const cur = global.ChickenTimerKitchenNow || {};
      const table = zone === "ov" ? (cur.predict_ov || {}) : (cur.predict || {});
      const hit = table[(Math.round(Number(seconds) / 6) / 10).toFixed(1)];
      if (!hit) return "";
      const row = recipeRowsFromPayload(recipeDoc).find((r) => r._key === hit.key);
      const name = String((row ? (hit.label ? labeledName(row, hit.label) : recipeStripName(row)) : hit.menu) || "").trim();
      return hit.near == null ? name : `${name} ${hit.near}분 아닌가요`;
    } catch (_) {
      return "";
    }
  };

  function recipeRowsFromPayload(data) {
    const source = data && data.recipes && typeof data.recipes === "object" && !Array.isArray(data.recipes)
      ? data.recipes
      : data;
    const rows = [];
    Object.keys(source || {}).forEach((key) => {
      const recipe = source[key];
      if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return;
      if (recipe.active === false) return;
      if (!(recipe.menu_name || recipe.name)) return;
      rows.push(Object.assign({ _key: key }, recipe));   // 1006 주문 표시용 레시피 키
    });
    rows.sort((left, right) => recipeStripLabel(left).localeCompare(recipeStripLabel(right), "ko"));
    return rows;
  }

  function loadTimerRecipeStrip() {
    if (!mountRecipeStrip() || typeof global.fetch !== "function") return;
    fetchTimerRecipeDoc()
      .then((doc) => {
        recipeDoc = doc;
        renderRecipeStrip(recipeRowsFromPayload(doc));
      })
      .catch(() => renderRecipeStrip([]));
  }

  // 편집 저장 뒤 바로, 다른 기기의 편집은 5분마다 반영.
  document.addEventListener("chickentimer-recipes", () => renderRecipeStrip(recipeRowsFromPayload(recipeDoc)));
  global.setInterval(loadTimerRecipeStrip, REFRESH_MS);

  function bootRecipeStrip(tries) {
    if (mountRecipeStrip()) {
      loadTimerRecipeStrip();
      return;
    }
    if (tries > 20) return;
    global.setTimeout(() => bootRecipeStrip(tries + 1), 50);
  }

  loadRecipes(false);
  bootRecipeStrip(0);
})(window);
