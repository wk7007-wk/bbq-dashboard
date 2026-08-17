(function countdownRuntimeV23(global) {
  "use strict";

  const doc = global.document;
  if (!doc || doc.documentElement.dataset.countdownRuntimeV23 === "ready") return;

  const ACTIONS = [
    ["minus10", "▼10"], ["minus60", "▼▼60"], ["delete", "삭제"],
    ["plus10", "▲10"], ["plus60", "▲▲60"], ["add", "추가"],
  ];
  let scheduled = false;
  let generation = 0;
  let fittedGeneration = 0;

  const READOUT = ".timer-readout,.split-timer-readout";
  const STAGE = ".countdown-minutes,.countdown-seconds";

  function box(node) {
    const r = node?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r : null;
  }

  function glyphBox(node) {
    if (!node) return null;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > .25 && r.height > .25);
    if (!rects.length) return null;
    return rects.reduce((u, r) => ({
      left: Math.min(u.left, r.left), top: Math.min(u.top, r.top),
      right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom)
    }), { left: rects[0].left, top: rects[0].top, right: rects[0].right, bottom: rects[0].bottom });
  }

  function glyphUnion(readout) {
    const minute = glyphBox(readout.querySelector(".countdown-minutes"));
    const second = glyphBox(readout.querySelector(".countdown-seconds"));
    if (!minute || !second) return null;
    return {
      left: Math.min(minute.left, second.left), top: Math.min(minute.top, second.top),
      right: Math.max(minute.right, second.right), bottom: Math.max(minute.bottom, second.bottom),
      minute, second
    };
  }

  function contains(readout, union, gap = 1) {
    const cell = box(readout);
    return Boolean(cell && union &&
      union.minute.left >= cell.left + gap && union.minute.right <= cell.right - gap &&
      union.minute.top >= cell.top + gap && union.minute.bottom <= cell.bottom - gap &&
      union.second.left >= cell.left + gap && union.second.right <= cell.right - gap &&
      union.second.top >= cell.top + gap && union.second.bottom <= cell.bottom - gap);
  }

  function setFont(readout, px) {
    readout.style.setProperty("--v23-fitted-font-size", `${Math.max(8, px).toFixed(3)}px`);
    readout.style.setProperty("--v23-glyph-offset-y", "0px");
  }

  function maximumFit(readout) {
    const cell = box(readout);
    if (!cell) return 8;
    let low = 8;
    let high = Math.max(8, Math.min(320, Math.max(cell.width, cell.height) * 2));
    setFont(readout, low);
    // A degenerate cell is still rendered safely at the smallest supported size.
    if (!contains(readout, glyphUnion(readout))) return low;
    for (let i = 0; i < 11; i += 1) {
      const mid = (low + high) / 2;
      setFont(readout, mid);
      if (contains(readout, glyphUnion(readout))) low = mid;
      else high = mid;
    }
    return low;
  }

  function centerAndBack(readout) {
    const cell = box(readout);
    let union = glyphUnion(readout);
    if (!cell || !union) return;
    const desired = ((cell.top + cell.bottom) - (union.top + union.bottom)) / 2;
    const offset = Math.max(-4, Math.min(4, desired));
    readout.style.setProperty("--v23-glyph-offset-y", `${offset.toFixed(3)}px`);
    union = glyphUnion(readout) || union;
    // The backing follows actual glyph ink, not a font-em heuristic.  It is
    // intentionally tight so it protects the numbers without masking water.
    const extra = 2;
    const left = Math.max(cell.left, union.left - extra) - cell.left;
    const top = Math.max(cell.top, union.top - extra) - cell.top;
    const right = Math.min(cell.right, union.right + extra) - cell.left;
    const bottom = Math.min(cell.bottom, union.bottom + extra) - cell.top;
    readout.style.setProperty("--v23-back-x", `${left.toFixed(3)}px`);
    readout.style.setProperty("--v23-back-y", `${top.toFixed(3)}px`);
    readout.style.setProperty("--v23-back-w", `${Math.max(0, right - left).toFixed(3)}px`);
    readout.style.setProperty("--v23-back-h", `${Math.max(0, bottom - top).toFixed(3)}px`);
  }

  function fitCard(card) {
    const readouts = [...card.querySelectorAll(READOUT)].filter((node) => box(node));
    if (!readouts.length) return;
    const shared = card.querySelector(".split-timer-unit") ? Math.min(...readouts.map(maximumFit)) : null;
    readouts.forEach((readout) => {
      setFont(readout, shared ?? maximumFit(readout));
      centerAndBack(readout);
    });
  }

  function selectedUnit(card) {
    const id = card.dataset.v23AuxEntryId || "";
    return [...card.querySelectorAll(".split-timer-unit")]
      .find((unit) => unit.dataset.entryId === id) || null;
  }

  function setTarget(card, requested, entryId) {
    const unit = requested === "auxiliary"
      ? [...card.querySelectorAll(".split-timer-unit")]
          .find((node) => !entryId || node.dataset.entryId === entryId)
      : null;
    card.dataset.v23ActionTarget = unit ? "auxiliary" : "primary";
    card.dataset.v23AuxEntryId = unit ? unit.dataset.entryId : "";
    const primary = card.querySelector(".timer-readout");
    if (primary) primary.setAttribute("aria-pressed", unit ? "false" : "true");
    card.querySelectorAll(".split-timer-readout").forEach((readout) => {
      const owner = readout.closest(".split-timer-unit");
      readout.setAttribute("aria-pressed", owner === unit ? "true" : "false");
    });
    reconcileCard(card);
  }

  function underlying(card, action) {
    const auxiliary = card.dataset.v23ActionTarget === "auxiliary";
    const unit = auxiliary ? selectedUnit(card) : null;
    const root = unit || card;
    const delta = { minus10:"-10", minus60:"-60", plus10:"10", plus60:"60" }[action];
    if (delta) return root.querySelector(`${auxiliary ? ".split-adjust-button" : ".adjust-button"}[data-delta-seconds="${delta}"]`);
    if (action === "delete") return auxiliary
      ? unit?.querySelector(".split-clear-button")
      : card.querySelector('.timer-primary-actions > [data-role="primary"]');
    if (action === "add") return auxiliary ? null
      : card.querySelector('.timer-primary-actions > [data-role="split"]:not([hidden])');
    return null;
  }

  function invoke(card, action) {
    const target = underlying(card, action);
    if (!target || target.disabled || target.hidden) return false;
    target.click();
    schedule();
    return true;
  }

  function prepareReadout(card, readout, target, entryId) {
    if (!readout.dataset.v23TargetBound) {
      readout.dataset.v23TargetBound = "true";
      readout.addEventListener("click", () => setTarget(card, target, entryId));
      readout.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setTarget(card, target, entryId);
      });
    }
    readout.tabIndex = 0;
    readout.setAttribute("role", "button");
  }

  function prepareLegacyControls(card) {
    card.querySelectorAll(
      ".adjust-button,.split-adjust-button,.split-clear-button," +
      ".timer-primary-actions > button"
    ).forEach((button) => {
      button.tabIndex = -1;
      button.dataset.v23LegacyAction = "true";
      button.setAttribute("aria-hidden", "true");
      // Legacy handlers stay mounted as programmatic click endpoints, but
      // their author stylesheet may force height:100%!important.  Inline
      // important geometry is the adapter's final containment boundary.
      const compact = {
        display: "block", position: "absolute", width: "1px", height: "1px",
        "min-width": "0", "min-height": "0", "max-width": "1px", "max-height": "1px",
        top: "0", left: "0", right: "auto", bottom: "auto", inset: "0 auto auto 0",
        overflow: "hidden", clip: "rect(0 0 0 0)", "clip-path": "inset(50%)",
        opacity: "0", "pointer-events": "none", padding: "0", margin: "0", border: "0"
      };
      Object.entries(compact).forEach(([property, value]) => button.style.setProperty(property, value, "important"));
    });
  }

  function reconcileCard(card) {
    const panel = card.querySelector(".timer-panel");
    if (!panel) return;
    let proxy = panel.querySelector(":scope > .v23-action-proxy");
    if (!proxy) {
      proxy = doc.createElement("div");
      proxy.className = "v23-action-proxy";
      proxy.setAttribute("role", "group");
      proxy.setAttribute("aria-label", "선택 타이머 조작");
      ACTIONS.forEach(([action, label]) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = `v23-proxy-action v23-${action}`;
        button.dataset.action = action;
        button.textContent = label;
        button.addEventListener("click", () => invoke(card, action));
        proxy.appendChild(button);
      });
      panel.appendChild(proxy);
    }

    const units = [...card.querySelectorAll(".split-timer-unit")];
    if (card.dataset.v23ActionTarget === "auxiliary" && !selectedUnit(card))
      card.dataset.v23ActionTarget = "primary";
    if (!card.dataset.v23ActionTarget) card.dataset.v23ActionTarget = "primary";
    const primary = card.querySelector(".timer-readout");
    if (primary) prepareReadout(card, primary, "primary", "");
    units.forEach((unit) => {
      const readout = unit.querySelector(".split-timer-readout");
      if (readout) prepareReadout(card, readout, "auxiliary", unit.dataset.entryId);
    });
    prepareLegacyControls(card);

    const active = card.dataset.state === "running" || card.dataset.state === "paused";
    proxy.hidden = !active;
    proxy.dataset.target = card.dataset.v23ActionTarget;
    proxy.querySelectorAll("button").forEach((button) => {
      const target = underlying(card, button.dataset.action);
      button.disabled = !active || !target || target.disabled || target.hidden;
      button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
    });
    if (primary) primary.setAttribute("aria-pressed",
      card.dataset.v23ActionTarget === "primary" ? "true" : "false");
    units.forEach((unit) => unit.querySelector(".split-timer-readout")?.setAttribute(
      "aria-pressed",
      card.dataset.v23ActionTarget === "auxiliary" &&
        card.dataset.v23AuxEntryId === unit.dataset.entryId ? "true" : "false"
    ));
  }

  function reconcile() {
    scheduled = false;
    doc.querySelectorAll(".slot-card").forEach(reconcileCard);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    global.requestAnimationFrame(reconcile);
  }

  doc.documentElement.dataset.countdownRuntimeV23 = "ready";
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList:true, subtree:true });
  schedule();
  global.ChickenTimerCountdownRuntimeV23 = { reconcile, setTarget };
})(window);
