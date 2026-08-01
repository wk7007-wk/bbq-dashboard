#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const start = source.indexOf('function esc(str)');
const end = source.indexOf('// 주문 현황', start);
assert.ok(start >= 0 && end > start, 'dashboard helper section not found');

const scheduleBody = { innerHTML: '' };
const calls = [];
let responder = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const context = {
  FB: 'https://fixture.invalid',
  Intl,
  Date,
  Promise,
  Object,
  encodeURIComponent,
  document: {
    createElement() {
      return {
        innerHTML: '',
        appendChild(node) { this.innerHTML = escapeHtml(node.textContent); }
      };
    },
    createTextNode(value) { return { textContent: String(value) }; },
    getElementById(id) {
      assert.equal(id, 'schedule-body');
      return scheduleBody;
    }
  },
  fetch(url, init) {
    calls.push({ url, init: init || null });
    return responder(url, init).then((payload) => ({ json: async () => payload }));
  }
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context, { filename: 'dashboard-attendance.js' });

async function run() {
  assert.equal(context.kstDateKey(new Date('2026-08-01T14:59:59.999Z')), '2026-08-01');
  assert.equal(context.kstDateKey(new Date('2026-08-01T15:00:00.000Z')), '2026-08-02');

  responder = async (url) => {
    if (url.endsWith('/workschedule_v2/attendance/2026-08-02.json')) {
      return {
        emp1: { actual_start: '17:00', actual_end: '02:00' },
        emp2: { actual_start: '09:30', display_name: '안전 & 표시' },
        'emp<3>': { actual_end: '12:05' },
        ignored: 'not-an-attendance-row'
      };
    }
    if (url.endsWith('/workschedule_v2/employees/emp1/name.json')) return '직원 <A>';
    if (url.endsWith('/workschedule_v2/employees/emp%3C3%3E/name.json')) return null;
    throw new Error('unexpected URL: ' + url);
  };
  scheduleBody.innerHTML = '';
  await context.updateSchedule(new Date('2026-08-01T15:00:00.000Z'));

  assert.match(scheduleBody.innerHTML, /직원 &lt;A&gt;/);
  assert.match(scheduleBody.innerHTML, /안전 &amp; 표시/);
  assert.match(scheduleBody.innerHTML, /emp&lt;3&gt;/);
  assert.match(scheduleBody.innerHTML, /출근 17:00 · 퇴근 02:00/);
  assert.match(scheduleBody.innerHTML, /출근 09:30 · 퇴근 --/);
  assert.match(scheduleBody.innerHTML, /출근 -- · 퇴근 12:05/);
  assert.equal(calls.filter((call) => call.url.includes('/employees/')).length, 2,
    'safe row display name must avoid an employee lookup');
  assert.equal(calls.filter((call) => call.url.endsWith('/workschedule_v2/employees.json')).length, 0,
    'must not fetch the full employee object');

  responder = async (url) => {
    assert.ok(url.endsWith('/workschedule_v2/attendance/2026-08-01.json'));
    return null;
  };
  scheduleBody.innerHTML = '';
  await context.updateSchedule(new Date('2026-08-01T14:59:59.999Z'));
  assert.match(scheduleBody.innerHTML, /오늘 출근 기록 없음/);

  responder = async () => { throw new Error('fixture network error'); };
  scheduleBody.innerHTML = '';
  await context.updateSchedule(new Date('2026-08-01T14:59:59.999Z'));
  assert.match(scheduleBody.innerHTML, /오늘 출근 기록 없음/);

  assert.equal(calls.filter((call) => call.url.includes('/packhelper/storebot_attendance/')).length, 0);
  assert.equal(calls.filter((call) => call.init && !['GET', 'HEAD'].includes(call.init.method || 'GET')).length, 0);
  assert.ok(!source.includes('/packhelper/storebot_attendance/'), 'legacy attendance path remains');
  assert.ok(source.includes("info.actual_start"));
  assert.ok(source.includes("info.actual_end"));
  assert.ok(source.includes("/workschedule_v2/employees/"));
  assert.ok(source.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)'));
  assert.match(source, /\.column\s*\{[^}]*min-width:\s*0/s);
  assert.match(source, /\.bottom-wide\s*\{[^}]*min-width:\s*0/s);
  assert.match(source, /\.card\s*\{[^}]*min-width:\s*0/s);

  console.log('dashboard attendance canonical fixture: PASS');
  console.log('calls=' + calls.length + ' legacy_calls=0 writes=0');
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
