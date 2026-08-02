const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'posdelay.html'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} not found`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} is incomplete`);
}

assert(source.includes('const isApp=hasNativeBridge();'), 'app mode must require the actual JavaScript bridge capability');
assert(!/navigator\.|location\.search|userAgent/i.test(source.slice(source.indexOf('function hasNativeBridge'), source.indexOf('function g('))), 'bridge detection must not trust browser-identifying input');
assert(source.includes('공개 웹은 읽기 전용입니다. 제어는 PosDelay 앱에서만 할 수 있습니다.'), 'standalone must explain the Korean read-only boundary');
assert(source.includes("document.querySelectorAll('[data-native-control]')"), 'standalone controls must be disabled');
for (const name of [
  'tapGauge', 'adjS', 'adjCoupangDelayMin', 'saveS', 'togS', 'togKdsOpen',
  'pickTime', 'updDiscDt', 'adjGate', 'adjStop', 'setGateFee', 'setGateBase',
  'togGateClub', 'togGate', 'togStop', 'togAutoAccept', 'setFeeSource',
  'setStopSource', 'manualDefense', 'setButtonValue', 'ckTapDel'
]) {
  const body = extractFunction(name);
  assert(body.indexOf('requireAppControl()') >= 0, `${name} must fail closed outside the app`);
}

for (const [name, endpoint] of [
  ['sendCmd', '/posdelay/command.json'],
  ['pcOnClickWake', '/packhelper/wol_cmd/main_pc.json'],
  ['pcSendShutdown', '/packhelper/shutdown_cmd/main_pc.json']
]) {
  const body = extractFunction(name);
  assert(body.includes(endpoint), `${name} write endpoint missing`);
  assert(body.indexOf('if(!isApp)') < body.indexOf(endpoint), `${name} must fail closed before its write`);
}

const requests = [];
const context = {
  isApp: false,
  FB: 'https://example.invalid',
  Date,
  JSON,
  toast() {},
  fetch(...args) { requests.push(args); return Promise.resolve({ json: () => Promise.resolve({}) }); },
  document: { getElementById() { return null; } },
  console,
  pcState: {},
  pcRand6() { return 'abcdef'; }
};
context.requireAppControl = () => false;
context.g = (obj, key, fallback) => obj[key] ?? fallback;
context.S = {};
vm.createContext(context);
for (const name of ['sendCmd', 'exDiscount', 'exAd', 'pcOnClickWake', 'pcSendShutdown']) {
  vm.runInContext(extractFunction(name), context);
}
context.sendCmd('BAEMIN_SET_AMOUNT', 100);
context.exDiscount(1000);
context.exAd('baemin', 'max');
context.exAd('coupang', 'on');
context.pcOnClickWake();
context.pcSendShutdown();
assert.deepStrictEqual(requests, [], 'standalone calls must not issue any request to a control endpoint');

console.log('PASS PosDelay standalone control boundary');
