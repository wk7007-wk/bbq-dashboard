// 카운트다운 숫자 색: 물에 잠긴 부분은 짙은 색, 물 위(검정 바탕)는 밝은 색.
// 실제 물(.hourglass-sand) 윗면 위치를 재서, 분·콜론·초마다 아래에서부터 잠긴 비율을 숫자 칸에 넣는다.
// 색·그라데이션은 board-theme.css. 이 파일은 위치만 잰다(타이머 동작과 무관).
(function (global) {
  const board = document.getElementById("board");
  if (!board) return;

  function waterTop(gauge) {
    if (!gauge || gauge.hidden) return Infinity;
    const sand = gauge.querySelector(".hourglass-sand");
    if (!sand) return Infinity;
    const rect = sand.getBoundingClientRect();
    return rect.height > 0.5 ? rect.top : Infinity;
  }

  // 앱이 매초 숫자 글자(span)를 새로 만들므로, 값은 바뀌지 않는 숫자 칸(readout)에
  // 분·콜론·초별로 --wl-m / --wl-c / --wl-s 로 둔다. 새 글자는 CSS 로 이 값을 물려받는다.
  const PARTS = [["countdown-minutes", "--wl-m"], ["countdown-separator", "--wl-c"], ["countdown-seconds", "--wl-s"]];

  function apply(readout, lineY) {
    if (!readout) return;
    PARTS.forEach((part) => {
      const span = readout.querySelector("." + part[0]);
      if (!span) return;
      const rect = span.getBoundingClientRect();
      if (!rect.height) return;
      const ratio = Math.max(0, Math.min(1, (rect.bottom - lineY) / rect.height));
      const value = (ratio * 100).toFixed(1) + "%";
      if (readout.style.getPropertyValue(part[1]) !== value) readout.style.setProperty(part[1], value);
      // 절반 넘게 잠기면 밝은 테두리(halo), 아니면 어두운 그림자. (웹 조사: 반대 밝기 얇은 halo)
      const key = "sub" + part[1].slice(-1).toUpperCase();
      const sub = ratio >= 0.5 ? "1" : "0";
      if (readout.dataset[key] !== sub) readout.dataset[key] = sub;
    });
  }

  function update() {
    board.querySelectorAll(".slot-card").forEach((card) => {
      // 일시정지는 숫자 뒤가 어두운 판이라 물 높이와 상관없이 밝은 색.
      const cardLine = card.dataset.state === "paused"
        ? Infinity
        : waterTop(card.querySelector(":scope > .card-water-gauge"));
      apply(card.querySelector(".readout-cluster > .timer-readout"), cardLine);
      card.querySelectorAll(".split-timer-unit").forEach((unit) => {
        apply(unit.querySelector(".split-timer-readout"), waterTop(unit.querySelector(".split-hourglass")));
      });
    });
  }

  update();
  global.setInterval(update, 500);
  global.addEventListener("resize", update);
})(window);
