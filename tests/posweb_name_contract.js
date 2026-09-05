const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const hub = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const live = fs.readFileSync(path.join(root, 'posweb.html'), 'utf8');
const legacy = fs.readFileSync(path.join(root, 'posdelay.html'), 'utf8');

assert(hub.includes('href="posweb.html"'), 'hub must link posweb.html');
assert(hub.includes('app-title">posweb'), 'hub title must be posweb');
assert(!hub.includes('app-title">PosDelay'), 'hub must not keep PosDelay as the live ops name');
assert(!hub.includes('href="posdelay.html"'), 'hub must not send people to the leftover filename');

assert(live.includes('<title>posweb</title>'), 'live page title must be posweb');
assert(live.includes('posweb_admin.js'), 'live page must load posweb_admin.js');
assert(!live.includes('PosDelay Dashboard'), 'live page must not keep old dashboard title');

assert(legacy.includes('posweb.html'), 'old posdelay.html must redirect to posweb');
assert(!legacy.includes('PosDelay Dashboard'), 'old posdelay.html must not keep dashboard body');

assert(fs.existsSync(path.join(root, 'posweb_admin.js')), 'posweb_admin.js missing');
const admin = fs.readFileSync(path.join(root, 'posweb_admin.js'), 'utf8');
assert(admin.includes('onGithubPages'), 'github pages must talk to factory, not same-origin JSON');
assert(admin.includes('wsl-ubuntu.tail785e65.ts.net'), 'factory magic HTTPS required from github.io');
assert(live.includes('poswebFactory'), 'posweb.html must use factory origin helper');
assert(live.includes('window.S=S'), 'page S must be visible to posweb_admin');
assert(admin.includes('settingsReady'), 'empty web save must not wipe kitchen settings');
assert(live.includes('id="pinOverlay"'), 'site must require a password overlay');
assert(live.includes('class="auth-locked"'), 'site must start locked');
assert(admin.includes('checkPoswebPin'), 'password is checked against factory');
assert(!/TRACK3_WRITE_TOKEN\s*=/.test(admin), 'password must not be in github js');

console.log('PASS posweb_name');
