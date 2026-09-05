(function (global) {
  "use strict";

  const document = global.document;
  if (!document || !document.body) return;

  let RECIPE_URLS = [];
  let sotReady = null;
  const REFRESH_MS = 5 * 60 * 1000;

  function factorySotCandidates() {
    return [
      "https://wk7007-wk.github.io/bbq-dashboard/updates/endpoints.json",
      "https://gist.githubusercontent.com/wk7007-wk/a67e5de3271d6d0716b276dc6a8391cb/raw/endpoints.json",
    ];
  }

  function tableBases(ep) {
    const f = (ep && ep.sets && ep.sets.factory) || (ep && ep.factory) || {};
    const magic = String((f && f.magic_base) || (ep && ep.magic_base) || "").replace(/\/$/, "");
    const ts = String((f && f.ts_base) || (ep && ep.ts_base) || "").replace(/\/$/, "");
    return { magic: magic, ts: ts };
  }

  function sameOriginJson(name) {
    try {
      const host = String((global.location || {}).hostname || "");
      if (host && host.indexOf("github.io") < 0) return "/" + String(name || "").replace(/^\//, "");
    } catch (_) {}
    return "";
  }

  function loadFactorySot() {
    if (sotReady) return sotReady;
    sotReady = (async function () {
      const local = sameOriginJson("recipes.json");
      if (local) {
        RECIPE_URLS = [local];
        return { same_origin: true };
      }
      const cands = factorySotCandidates();
      for (let i = 0; i < cands.length; i++) {
        try {
          const r = await global.fetch(cands[i], { cache: "no-cache" });
          if (!r || !r.ok) continue;
          const ep = await r.json();
          if (!ep || typeof ep !== "object") continue;
          const t = tableBases(ep);
          let live = t.magic || t.ts;
          RECIPE_URLS = live ? [live.replace(/\/$/, "") + "/recipes.json"] : [];
          if (!RECIPE_URLS.length) continue;
          return ep;
        } catch (_) {}
      }
      RECIPE_URLS = [];
      return null;
    })();
    return sotReady;
  }

  function fetchFirstRecipeJson() {
    return loadFactorySot().then(function () {
      let chain = Promise.reject(new Error("empty"));
      RECIPE_URLS.forEach((url) => {
        chain = chain.catch(() => global.fetch(url, { cache: "no-store" }).then((response) => {
          if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : ""));
          return response.json();
        }));
      });
      return chain;
    });
  }

  function putRecipes(nextRecipes) {
    return loadFactorySot().then(function () {
      if (!RECIPE_URLS[0]) return Promise.reject(new Error("no recipe url"));
      return global.fetch(RECIPE_URLS[0], {
        method: "PUT",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: "token chicken-timer",
        },
        body: JSON.stringify(nextRecipes || {}),
      });
    });
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
    refs.toggleButton.textContent = "레시피";
  }

  function loadRecipes(force) {
    if (typeof global.fetch !== "function") {
      refs.status.textContent = "네트워크 미지원";
      renderAll();
      return Promise.resolve();
    }
    if (!force && loadedAt && Date.now() - loadedAt < REFRESH_MS) {
      renderAll();
      return Promise.resolve();
    }
    refs.status.textContent = "불러오는 중";
    return fetchFirstRecipeJson()
      .then((data) => data)
      .then((data) => {
        recipes = sanitizeRecipes(data || {});
        loadedAt = Date.now();
        refs.status.textContent = "메인 데이터";
        if (!selectedKey || !recipes[selectedKey]) {
          const first = recipeEntries()[0];
          selectedKey = first ? first[0] : "";
        }
        renderAll();
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

  function saveRecipe(values, oldKey) {
    const key = recipeKey(values.menuName, values.option);
    const writeKey = oldKey || key;
    const previous = recipes[writeKey] || {};
    const now = Date.now();
    const payload = {
      name: values.menuName,
      menu_name: values.menuName,
      option: values.option,
      time: values.time,
      description: values.description,
      active: true,
      recipe_schema: "timer_recipe_v1",
      source: "chicken_timer",
      updated_at: now,
      updated_at_kst: kstTimestamp(now),
      version: Number(previous.version || 0) + 1,
    };

    refs.status.textContent = "저장 중";
    const nextRecipes = Object.assign({}, recipes);
    nextRecipes[writeKey] = Object.assign({}, previous, payload);
    putRecipes(nextRecipes)
      .then((response) => {
        if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : ""));
        recipes = nextRecipes;
        selectedKey = writeKey;
        loadedAt = Date.now();
        refs.status.textContent = "저장 완료";
        renderAll();
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

  function recipeEntries() {
    const query = refs.search.value.trim().toLowerCase();
    return Object.keys(recipes)
      .map((key) => [key, recipes[key]])
      .filter(([key, recipe]) => {
        if (!query) return true;
        return (key + " " + recipeName(recipe, key) + " " + String(recipe.option || "") + " " + String(recipe.time || "") + " " + String(recipe.description || "")).toLowerCase().indexOf(query) >= 0;
      })
      .sort(compareRecipes);
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
        gridCell("menuName", recipeName(recipe, key), "메뉴명") +
        gridCell("option", recipe && recipe.option, "옵션") +
        gridCell("time", recipe && (recipe.time || recipe.cook_time), "시간") +
        gridCell("description", recipe && (recipe.description || recipe.notes), "설명") +
        '<td class="recipe-grid-actions"><button type="button" class="recipe-row-save">저장</button></td>' +
        "</tr>";
    }).join("");
    refs.list.innerHTML = '<table class="recipe-grid"><colgroup><col class="recipe-col-menu"><col class="recipe-col-option"><col class="recipe-col-time"><col class="recipe-col-desc"><col class="recipe-col-save"></colgroup><thead><tr><th>메뉴명</th><th>옵션</th><th>시간</th><th>설명</th><th>저장</th></tr></thead><tbody>' +
      '<tr class="recipe-grid-row is-new" data-recipe-row data-recipe-key="" data-new-row="true">' +
      gridCell("menuName", "", "새 메뉴") +
      gridCell("option", "", "옵션") +
      gridCell("time", "", "시간") +
      gridCell("description", "", "설명") +
      '<td class="recipe-grid-actions"><button type="button" class="recipe-row-save is-primary">추가</button></td>' +
      "</tr>" +
      (bodyRows || '<tr><td colspan="5" class="recipe-grid-empty">레시피 없음</td></tr>') +
      "</tbody></table>";
  }

  function renderOutputList() {
    const entries = recipeEntries();
    const bodyRows = entries.map(([key, recipe]) => {
      const active = key === selectedKey ? " is-active" : "";
      return '<tr class="recipe-grid-row' + active + '" data-recipe-row data-recipe-key="' + escapeAttr(key) + '">' +
        outputCell("menuName", recipeName(recipe, key)) +
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
})(window);
