#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const start = source.indexOf('var FB');
const end = source.indexOf('// 뉴스/SNS 갱신', start);
assert.ok(start >= 0 && end > start, 'news helper section not found');

const bodies = { 'news-body': { innerHTML: '' }, 'sns-body': { innerHTML: '' } };
const listeners = {};
const calls = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function(char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

const context = {
  Date,
  Promise,
  encodeURIComponent,
  fetch(url, init) {
    calls.push({ url, init: init || null });
    return Promise.reject(new Error('AllOrigins rejected'));
  },
  DOMParser: function DOMParser() {},
  document: {
    createElement() { return { innerHTML: '', appendChild(node) { this.innerHTML = escapeHtml(node.textContent); } }; },
    createTextNode(text) { return { textContent: String(text) }; },
    getElementById(id) { return bodies[id]; },
    addEventListener(type, handler) { listeners[type] = handler; }
  }
};

vm.createContext(context);
vm.runInContext(source.slice(start, end), context, { filename: 'dashboard-news-fallback.js' });

async function flush() {
  await new Promise(function(resolve) { setImmediate(resolve); });
}

async function run() {
  context.updateNews();
  context.updateSNS();
  await flush();

  assert.match(bodies['news-body'].innerHTML, /뉴스를 가져오지 못했습니다/);
  assert.match(bodies['sns-body'].innerHTML, /트렌드를 가져오지 못했습니다/);
  assert.match(bodies['news-body'].innerHTML, /https:\/\/news\.google\.com\/search\?q=/);
  assert.match(bodies['sns-body'].innerHTML, /https:\/\/trends\.google\.com\/trending\?geo=KR/);
  for (const body of Object.values(bodies)) {
    assert.match(body.innerHTML, /target="_blank" rel="noopener"/);
    assert.match(body.innerHTML, /data-source-retry=/);
  }

  let prevented = false;
  const retry = { getAttribute: () => 'news' };
  listeners.click({ target: { closest: () => retry }, preventDefault() { prevented = true; } });
  await flush();
  assert.equal(prevented, true, 'retry click must not navigate the dashboard');
  assert.equal(calls.length, 3, 'news retry must fetch only the news source once');
  listeners.click({ target: { closest: () => ({ getAttribute: () => 'sns' }) }, preventDefault() {} });
  await flush();
  assert.equal(calls.length, 4, 'SNS retry must fetch only the trend source once');
  assert.ok(calls.every(function(call) { return call.url.startsWith('https://api.allorigins.win/get?url='); }));
  assert.equal(calls.filter(function(call) { return /firebaseio|\.json/.test(call.url); }).length, 0,
    'fallback and retry must not access Firebase');
  assert.equal(calls.filter(function(call) { return call.init && !['GET', 'HEAD'].includes(call.init.method || 'GET'); }).length, 0,
    'fallback and retry must not issue writes');

  assert.match(source, /min-height:\s*44px/);
  assert.match(source, /grid-template-columns:\s*1fr/);
  assert.match(source, /min-width:\s*0/);
  assert.match(source, /source-fallback-link:focus-visible/);
  assert.match(source, /OFFICIAL_FALLBACK_DESTINATIONS/);
  console.log('dashboard news fallback fixture: PASS');
  console.log('proxy_reject=2 retry=1 firebase_writes=0');
}

run().catch(function(error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
