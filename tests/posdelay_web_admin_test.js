const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'posweb.html'), 'utf8');
assert(html.includes('posweb_admin.js'), 'web admin script must be included');
assert(html.includes('id="webAdminBtn"'), 'admin button missing');
assert(html.includes('function toggleWebAdmin('), 'toggleWebAdmin handler missing');
assert(html.includes("typeof isWebAdmin==='function'&&isWebAdmin()"), 'requireAppControl must allow web admin');
assert(html.includes('saveWebAdSettings'), 'ad autosave must write factory settings');
assert(html.includes('saveWebPolicy'), 'policy save must write runtime_config_v2');

const js = fs.readFileSync(path.join(__dirname, '..', 'posweb_admin.js'), 'utf8');
const sandbox = { window: {}, globalThis: {}, Date, JSON, Number, Array, Object };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(js, sandbox);

const ranges = sandbox.countsToRanges([0, 2, 4], [20, 25, 30]);
assert.strictEqual(JSON.stringify(ranges), JSON.stringify([
  { min: 0, max: 1, target: 20 },
  { min: 2, max: 3, target: 25 },
  { min: 4, max: 999, target: 30 }
]));

const next = {
  enabled: true,
  auto_accept_enabled: true,
  time_mode_enabled: false,
  baemin_auto_source: 'PRINTER',
  baemin_auto_min_1: 20, baemin_auto_count_1: 0,
  baemin_auto_min_2: 25, baemin_auto_count_2: 2,
  baemin_auto_min_3: 30, baemin_auto_count_3: 4,
  baemin_auto_one_count_1: 0, baemin_auto_one_count_2: 2, baemin_auto_one_count_3: 4,
  store_auto_source: 'KDS',
  store_auto_min_1: 20, store_auto_count_1: 0,
  store_auto_min_2: 25, store_auto_count_2: 2,
  store_auto_min_3: 30, store_auto_count_3: 4,
  store_auto_one_count_1: 0, store_auto_one_count_2: 2, store_auto_one_count_3: 4,
  baemin1_pause_at: 10, baemin1_resume_at: 2,
  baemin1_one_pause_at: 6, baemin1_one_resume_at: 1,
  coupang_pause_at: 12, coupang_resume_at: 3,
  coupang_one_pause_at: 8, coupang_one_resume_at: 2
};
const v2 = sandbox.buildRuntimeV2(next);
assert.strictEqual(v2.version, 2);
assert.strictEqual(v2.auto_accept.per_channel.baemin.source, 'PRINTER');
assert.strictEqual(v2.shop_pause.per_channel.baemin_one.pause_at, 10);
assert.strictEqual(v2.auto_accept.per_channel.baemin.printer_to_minutes[2].target, 30);

const payload = sandbox.buildAdSettingsPayload(
  { ad_enabled: true, baemin_amount: 800, baemin_auto_enabled: true },
  { enabled: false, threshold: 1, fee: 2000, base: 0, valid: 30 }
);
assert.strictEqual(payload.baemin_amount, 800);
assert.strictEqual(payload.defense.fee_threshold, 1);
assert.strictEqual(payload._source, 'web_admin');

console.log('PASS posweb_admin');
