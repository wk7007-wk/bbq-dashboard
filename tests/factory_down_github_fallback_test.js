const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const go = fs.readFileSync(path.join(root, 'go.html'), 'utf8');
const order = fs.readFileSync(path.join(root, '..', 'OrderHelper', 'index.html'), 'utf8');
const hynix = fs.readFileSync(path.join(root, 'hynix', 'factory_schedule.js'), 'utf8');
const timer = fs.readFileSync(path.join(root, 'chicken-timer', 'timer-sync.js'), 'utf8');
const posweb = fs.readFileSync(path.join(root, 'posweb_admin.js'), 'utf8');

assert(!go.includes('mode: "no-cors"'), 'go.html must not treat opaque health as factory up');
assert(go.includes('healthOk'), 'go.html must require factory health JSON');
assert(!/to === "orderhelper"[\s\S]{0,80}location\.replace\(join\(wan/.test(go), 'go.html must not force OrderHelper onto dead WAN');
assert(go.includes('goGithub'), 'factory down must land on GitHub stay=1');

assert(!order.includes("wan0 = 'http://125.176.112.214:2421'"), 'OrderHelper must not hardcode factory IP jump');
assert(!order.includes("jump.set('via', 'wan')"), 'OrderHelper must not force via=wan when factory is down');
assert(order.includes("FACTORY_ORDER_URL = GIST_DESK_URL"), 'OrderHelper factory down must read gist 2nd');
assert(order.includes('github_fallback'), 'OrderHelper must label GitHub fallback');
assert(order.includes("httpsBase.indexOf('https://') === 0"), 'OrderHelper may jump only to live HTTPS factory');

assert(hynix.includes("lastSource = 'github_fallback'"), 'hynix factory down must use Pages/gist copy');
assert(hynix.includes('githubFallback'), 'hynix must have github fallback helper');

assert(timer.includes('fallbackStateUrls'), 'timer must have 2nd JSON list');
assert(timer.includes('isGistOrPagesJson'), 'timer must not race gist with live factory');
assert(timer.includes('first(live).catch'), 'timer gist GET only after factory miss');

assert(posweb.includes('fallbackJsonUrls'), 'posweb factory down must read 2nd live_base');
assert(posweb.includes('githubusercontent.com'), 'posweb JSON 2nd must be gist copies not github.io HTML');
assert(posweb.includes('factoryOrigin = ""'), 'dead factory must not keep Magic as origin');
assert(posweb.includes('if (factoryLive)'), 'factory down GET must skip hanging factory origins');
assert(order.includes('AbortController'), 'OrderHelper factory probe must time out');
assert(hynix.includes('AbortController'), 'hynix factory probe must time out');

console.log('factory down github fallback: PASS');
