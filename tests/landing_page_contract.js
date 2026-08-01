const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(/^<!DOCTYPE html>/i.test(html), 'missing HTML doctype');
expect(/<html lang="ko">/.test(html), 'missing Korean document language');
expect(/<meta name="viewport"[^>]+viewport-fit=cover/.test(html), 'missing mobile viewport contract');
expect(/<title>BBQ 운영 홈<\/title>/.test(html), 'missing user-facing page title');
expect(/<main class="shell">/.test(html), 'missing semantic main region');
expect(/<nav aria-label="주요 운영 화면">/.test(html), 'missing labeled navigation');
expect(/:focus-visible/.test(html), 'missing keyboard focus style');
expect(/min-height:\s*44px/.test(html), 'missing 44px utility touch target');
expect(/@media \(max-width: 540px\)/.test(html), 'missing bounded mobile layout');

const requiredLinks = [
  'dashboard.html',
  'posdelay.html',
  'banktotal.html',
  'kds.html',
  'updates/',
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

expect(!/<script\b/i.test(html), 'landing must stay script-free');
expect(!/<form\b/i.test(html), 'landing must stay navigation-only');
expect(!/https?:\/\//i.test(html), 'landing must not load external resources');

console.log('landing page contract: PASS');
