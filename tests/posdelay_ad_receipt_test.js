const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createReceiptController, parseKstTimestamp } = require('../posdelay_ad_receipt.js');

const START = Date.parse('2026-08-01T16:30:00+09:00');

function harness({ bridge = true } = {}) {
  let now = START;
  let timer = null;
  const writes = [];
  const storageData = new Map();
  const storage = {
    getItem(key) { return storageData.get(key) || null; },
    setItem(key, value) { storageData.set(key, value); writes.push([key, JSON.parse(value)]); }
  };
  const states = [];
  const controller = createReceiptController({
    now: () => now,
    hasBridge: () => bridge,
    storage,
    timeoutMs: 50_000,
    setTimer(fn, ms) { timer = { fn, ms }; return timer; },
    clearTimer(handle) { if (timer === handle) timer = null; },
    onChange(state) { states.push(state); }
  });
  return {
    controller,
    states,
    writes,
    setNow(value) { now = value; },
    fireTimer() { assert(timer, 'timeout must be armed'); const fn = timer.fn; timer = null; fn(); },
    timer() { return timer; }
  };
}

const baseline = {
  baemin_current_bid: 100,
  last_ad_action: '16:20 배민 광고 금액 100원 변경',
  time: '2026-08-01 16:20:05'
};

assert.strictEqual(parseKstTimestamp('2026-08-01 16:30:05'), Date.parse('2026-08-01T16:30:05+09:00'));

{
  const h = harness();
  const calls = [];
  h.controller.observe(baseline);
  assert.strictEqual(h.controller.request('max', 200, (action, amount) => calls.push([action, amount])), true);
  assert.strictEqual(h.controller.getState().state, 'pending');
  assert.match(h.controller.getState().label, /요청 중/);
  assert.deepStrictEqual(calls, [['BAEMIN_SET_AMOUNT', 200]]);
  assert.strictEqual(h.timer().ms, 50_000);

  // Duplicate/different clicks cannot enqueue a second live action while pending.
  assert.strictEqual(h.controller.request('max', 200, () => calls.push(['duplicate'])), false);
  assert.strictEqual(h.controller.request('min', 50, () => calls.push(['different'])), false);
  assert.deepStrictEqual(calls, [['BAEMIN_SET_AMOUNT', 200]]);

  // Stale or out-of-order evidence must not complete the request.
  h.controller.observe({ ...baseline, baemin_current_bid: 200 });
  assert.strictEqual(h.controller.getState().state, 'pending');
  h.controller.observe({
    baemin_current_bid: 200,
    last_ad_action: '16:30 배민 광고 금액 200원 변경',
    time: '2026-08-01 16:30:05'
  });
  assert.strictEqual(h.controller.getState().state, 'applied');
  assert.match(h.controller.getState().label, /적용됨/);
  assert.strictEqual(h.timer(), null);
}

{
  const h = harness();
  h.controller.observe({ ...baseline, baemin_current_bid: 0 });
  h.controller.request('min', 0, () => {});
  h.controller.observe({
    baemin_current_bid: 1000,
    last_ad_action: '16:30 배민 광고 금액 1000원 변경',
    time: '2026-08-01 16:30:08'
  });
  assert.strictEqual(h.controller.getState().state, 'needs_check', '0 won must not substring-match 1000 won');
}

{
  const h = harness();
  h.controller.observe(baseline);
  h.controller.request('mid', 150, () => {});
  h.controller.observe({
    baemin_current_bid: 50,
    last_ad_action: '16:30 배민 광고 금액 50원 변경',
    time: '2026-08-01 16:30:06'
  });
  assert.strictEqual(h.controller.getState().state, 'needs_check');
  assert.match(h.controller.getState().label, /확인 필요/);
  assert.doesNotMatch(h.controller.getState().label, /적용됨/);
}

{
  const h = harness();
  h.controller.observe(baseline);
  h.controller.request('min', 50, () => {});
  h.controller.observe({
    baemin_current_bid: 100,
    last_ad_action: '16:30 실패[ERR_TIMEOUT]: 시간 초과',
    time: '2026-08-01 16:30:07'
  });
  assert.strictEqual(h.controller.getState().state, 'needs_check');
  assert.match(h.controller.getState().detail, /실패 응답/);
}

{
  const h = harness();
  h.controller.observe(baseline);
  h.controller.request('max', 200, () => {});
  h.fireTimer();
  assert.strictEqual(h.controller.getState().state, 'needs_check');
  assert.match(h.controller.getState().detail, /시간 안에 확인되지 않음/);
  h.controller.observe({
    baemin_current_bid: 200,
    last_ad_action: '16:31 배민 광고 금액 200원 변경',
    time: '2026-08-01 16:31:05'
  });
  assert.strictEqual(h.controller.getState().state, 'needs_check', 'late acknowledgement must not rewrite timeout result');
}

{
  const h = harness();
  h.controller.observe(baseline);
  assert.strictEqual(h.controller.request('max', 200, () => { throw new Error('bridge down'); }), false);
  assert.strictEqual(h.controller.getState().state, 'needs_check');
  assert.match(h.controller.getState().detail, /앱 전달 실패/);
}

{
  const h = harness({ bridge: false });
  let invoked = false;
  assert.strictEqual(h.controller.getState().state, 'app_only');
  assert.strictEqual(h.controller.request('max', 200, () => { invoked = true; }), false);
  assert.strictEqual(invoked, false);
  assert.match(h.controller.getState().label, /앱에서만 실행/);
  assert.strictEqual(h.timer(), null);
  for (let i = 0; i < 8; i += 1) h.controller.request('max', 200, () => {});
  assert.strictEqual(h.controller.getLog().length, 6, 'local receipt history must stay bounded');
}

const pageSource = fs.readFileSync(path.join(__dirname, '..', 'posdelay.html'), 'utf8');
assert(pageSource.includes('<script src="posdelay_ad_receipt.js"></script>'));
for (const token of ['baeminAdControls', 'baeminAdReceiptStatus', 'baeminAdReceiptDetail', 'baeminAdReceiptLog']) {
  assert(pageSource.includes(`id="${token}"`), `receipt UI node missing: ${token}`);
}
const exAdStart = pageSource.indexOf('function exAd(');
const exAdEnd = pageSource.indexOf('\n}', exAdStart);
const exAdSource = pageSource.slice(exAdStart, exAdEnd + 2);
assert(exAdSource.includes("if(platform==='baemin')"));
assert(exAdSource.includes('window.NativeBridge.executeAd(nativeAction,nativeAmount)'));
assert(!exAdSource.slice(exAdSource.indexOf("if(platform==='baemin')"), exAdSource.indexOf("if(isApp)")).includes('sendCmd('),
  'Baemin browser fallback must never create a Firebase command');
const adStateStart = pageSource.indexOf('function hASt(');
const adStateEnd = pageSource.indexOf('function hStatus(', adStateStart);
assert(pageSource.slice(adStateStart, adStateEnd).includes('baeminAdReceipt.observe(aS)'));
const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'posdelay_ad_receipt.js'), 'utf8');
for (const secretKey of ['baemin_id', 'baemin_pw', 'password', 'credential']) {
  assert(!moduleSource.toLowerCase().includes(secretKey), `receipt log must not reference ${secretKey}`);
}

console.log('PASS PosDelay Baemin ad receipt state machine');
