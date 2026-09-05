const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'posweb.html'), 'utf8');
const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert(scripts.length > 0, 'dashboard script block missing');
for (const script of scripts) {
  assert.doesNotThrow(() => new Function(script), 'dashboard JavaScript must parse');
}

const ids = [...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepStrictEqual(duplicateIds, [], `duplicate element ids: ${duplicateIds.join(', ')}`);

const clickHandlers = [...source.matchAll(/onclick="([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
const missingClickHandlers = [...new Set(clickHandlers)].filter((name) =>
  !source.includes(`function ${name}(`) &&
  !source.includes(`const ${name}=`) &&
  !source.includes(`let ${name}=`) &&
  !source.includes(`var ${name}=`)
);
assert.deepStrictEqual(missingClickHandlers, [], `missing click handlers: ${missingClickHandlers.join(', ')}`);

const removedIds = [
  'pullInd', 'gaugeCard', 'mBd', 'mBv', 'mCd', 'mCv',
  'stop_kds_count', 'stopLiveCountHint', 'stop_threshold',
  'stop_kds_bar', 'stop_status',
  'tog_pause_own', 'tog_pause_agency', 'tog_pause_visit', 'tog_pause_coupang',
  'tog_pause_yogiyo'
];
for (const id of removedIds) {
  assert(!source.includes(`id="${id}"`), `dead hidden node returned: ${id}`);
  assert(!source.includes(`getElementById('${id}')`), `dead node lookup returned: ${id}`);
}

const removedFunctions = [
  'hSet', 'doCheck', 'saveAll', 'addOpsRow', 'togChannel', 'togAdOffOnPause'
];
for (const name of removedFunctions) {
  assert(!source.includes(`function ${name}(`), `dead function returned: ${name}`);
}

const nativeCallbacks = [
  'onGateSettingsUpdate', 'onGateStatusUpdate', 'onCaptureStatusUpdate',
  'renderEngineTasks', 'updateSubphoneStatus'
];
for (const name of nativeCallbacks) {
  assert(source.includes(`function ${name}(`), `Native callback must remain: ${name}`);
}

const navTargets = [...source.matchAll(/<button type="button" onclick="jumpToCard\('([^']+)'\)">/g)]
  .map((match) => match[1]);
assert.deepStrictEqual(
  navTargets,
  ['monitorCard', 'pcPowerCard', 'adSettingCard', 'gatePanel', 'baeminDelayCard'],
  'top navigation must contain the five daily operation destinations in order'
);
for (const id of navTargets) assert(ids.includes(id), `navigation target missing: ${id}`);
const jumpStart = source.indexOf('function jumpToCard(');
const jumpEnd = source.indexOf('\n}', jumpStart);
const jumpSource = source.slice(jumpStart, jumpEnd + 2);
assert(jumpSource.includes("document.querySelector('.page-sticky')"), 'navigation must account for the sticky header height');
assert(jumpSource.includes('getBoundingClientRect().height'), 'navigation offset must adapt to desktop/mobile header height');
assert(jumpSource.includes('window.scrollTo({top:top'), 'navigation must land below the sticky header');

assert(source.includes('<span class="section-heading">플랫폼 지연 설정</span>'));
assert(!/<span class="section-heading">[^<]*진단/.test(source), 'diagnostics must not be a top-level section');
assert(source.includes('원문 진단 (운영 설정의 접힌 보조 카드)'));
assert(source.includes("on:policySettings.enabled"), 'stop summary must use the visible policy settings source');
assert(!source.includes('legacy dead UI'), 'legacy compatibility shell must stay removed');
assert(source.includes("Object.prototype.hasOwnProperty.call(aS,'baemin_club_tip_active')"), 'server club state must override stale local state');
for (const id of ['stop_src_printer', 'stop_src_kds', 'stop_src_label', 'stop_threshold_disp', 'stopLiveThreshold', 'stopLiveState', 'stopLiveHint', 'gate_stop_label', 'gate_stop_count', 'gate_stop_bar']) {
  assert(ids.includes(id), `live DefenseEngine control/state node missing: ${id}`);
}
assert(source.includes('function adjStop('), 'threshold_stop is a live NativeBridge field and must remain connected');
assert(source.includes('function setStopSource('), 'stopSource is a live NativeBridge field and must remain connected');
assert(source.includes("NativeBridge.updateGateSettings(JSON.stringify({threshold_stop:gateSettings.threshold_stop}))"));
assert(source.includes("NativeBridge.updateGateSettings(JSON.stringify({stopSource:gateSettings._stopSource}))"));
assert(source.includes("if(s.defenseMode)gateSettings._defenseMode=s.defenseMode;"), 'runtime defense mode must be rendered');
assert(source.includes("gateSettings._stopCount = gateSettings._stopSource==='PRINTER'"), 'runtime stop count must follow selected source');
const adStateHandlerStart = source.indexOf('function hASt(');
const adStateHandlerEnd = source.indexOf('function hStatus(', adStateHandlerStart);
assert(adStateHandlerStart >= 0 && adStateHandlerEnd > adStateHandlerStart, 'ad state callback block missing');
assert(source.slice(adStateHandlerStart, adStateHandlerEnd).includes('syncGateClubToggle();'), 'ad state callback must refresh club readback status immediately');

const activeStart = source.indexOf('function getActiveCount(');
const activeEnd = source.indexOf('\nfunction ', activeStart + 1);
assert(activeStart >= 0 && activeEnd > activeStart, 'getActiveCount missing');
assert(!source.slice(activeStart, activeEnd).includes('kS.count'), 'getActiveCount must not put kds.count on hero');
const weightedStart = source.indexOf('function getKdsWeightedCount(');
const weightedEnd = source.indexOf('\nfunction ', weightedStart + 1);
assert(weightedStart >= 0 && weightedEnd > weightedStart, 'getKdsWeightedCount missing');
const weightedBody = source.slice(weightedStart, weightedEnd);
assert(weightedBody.includes('snapshotWeighted()'), 'hero count must use snapshot.weighted');
assert(weightedBody.includes('order_count_weighted'), 'hero count must use status.order_count_weighted');
assert(!weightedBody.includes('kS.count'), 'getKdsWeightedCount must not fall back to kds.count');
assert(!weightedBody.includes('kds.count'), 'getKdsWeightedCount must not fall back to kds.count');

console.log('PASS posdelay UI cleanup/navigation/native-callback contract');
