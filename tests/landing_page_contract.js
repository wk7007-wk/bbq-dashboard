const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(/^<!DOCTYPE html>/i.test(html), 'missing HTML doctype');
expect(/<html lang="ko"/.test(html), 'missing Korean document language');
expect(html.includes('href="posweb.html"'), 'hub must link posweb.html');
expect(html.includes('app-title">posweb'), 'hub title must be posweb');
expect(!html.includes('href="posdelay.html"'), 'hub must not link leftover posdelay.html');

const requiredLinks = [
  'dashboard.html',
  'posweb.html',
  'banktotal.html',
  'kds.html',
  'evidence.html',
  'hikorea-guide.html',
  'saaya.html',
];

for (const href of requiredLinks) {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (html.match(new RegExp(`href="${escaped}"`, 'g')) || []).length;
  expect(count === 1, `${href} must appear exactly once, got ${count}`);
  expect(fs.existsSync(path.join(root, href)), `${href} target does not exist`);
}

const oldDash = fs.readFileSync(path.join(root, 'posdelay.html'), 'utf8');
expect(/posweb\.html/.test(oldDash), 'legacy posdelay.html must redirect to posweb.html');
expect(!/PosDelay Dashboard/.test(oldDash), 'legacy posdelay.html must not keep the old dashboard body');

console.log('landing page contract: PASS');
