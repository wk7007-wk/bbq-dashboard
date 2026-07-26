const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require('path').join(__dirname, '..', 'posdelay.html'), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} not found`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} is incomplete`);
}

function element() {
  return {
    textContent: '',
    style: {},
    classList: { toggle() {} }
  };
}

const elements = new Map();
const calls = [];
const gateWrites = [];
const context = {
  console,
  JSON,
  Math,
  Number,
  Object,
  gateSettings: { threshold: 1, threshold_stop: 11, fee: 3000, base: 2000, enabled: true },
  stopChannels: {},
  lastCaptureSnapshot: { orders: [], thresholdFee: 1 },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  },
  clampFeeValue(value) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(4000, Math.round(n / 500) * 500)) : 0;
  },
  clampFeeThreshold(value) { return Math.max(1, Math.min(50, Number.parseInt(value, 10) || 8)); },
  syncGatePriceDisplay() {},
  updateKdsUnitHints() {},
  renderCaptureSnapshot() {},
  syncGateDashboardState() {},
  isGateClubMode() { return false; },
  NativeBridge: {
    manualDefense(action, fee) { calls.push([action, fee]); },
    updateGateSettings(json) { gateWrites.push(JSON.parse(json)); }
  }
};
vm.createContext(context);
vm.runInContext(extractFunction('onGateStatusUpdate'), context);
vm.runInContext(extractFunction('manualDefense'), context);
vm.runInContext(extractFunction('adjStop'), context);
vm.runInContext(extractFunction('setStopSource'), context);

const baseStatus = {
  thresholdFee: 1,
  thresholdStop: 11,
  currentFee: 3000,
  baseFee: 2000,
  gateEnabled: true,
  activeTab: 'PRINTER',
  stopSource: 'KDS',
  defenseMode: 'BA',
  validCount: 4,
  totalCount: 1,
  isFeeDefending: true,
  isStopDefending: false,
  captureOrders: []
};

context.onGateStatusUpdate(JSON.stringify({ ...baseStatus, lastAppliedFee: 3000 }));
assert.strictEqual(elements.get('fee_current_value').textContent, '3,000원');
assert.strictEqual(elements.get('gateSummary').textContent, '3,000원  임계1건');
assert.strictEqual(context.gateSettings.threshold_stop, 11);
assert.strictEqual(context.gateSettings._stopSource, 'KDS');
assert.strictEqual(context.gateSettings._defenseMode, 'BA');
assert.strictEqual(context.gateSettings._stopCount, 1);

context.onGateStatusUpdate(JSON.stringify({ ...baseStatus, lastAppliedFee: null }));
assert.strictEqual(elements.get('fee_current_value').textContent, '확인 중');
assert.strictEqual(elements.get('gateSummary').textContent, '확인 중  임계1건');

context.manualDefense('fee_up', 0);
assert.deepStrictEqual(calls.pop(), ['fee_up', '0']);

context.adjStop('threshold', 1);
assert.deepStrictEqual(gateWrites.pop(), { threshold_stop: 12 });
context.setStopSource('PRINTER');
assert.deepStrictEqual(gateWrites.pop(), { stopSource: 'PRINTER' });

console.log('PASS posdelay fee/stop UI native readback and write contract');
