const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'posweb.html'), 'utf8');

for (const key of ['baemin_amount', 'baemin_mid_amount', 'baemin_reduced_amount']) {
  assert(source.includes(`adjS('${key}',-50)`), `${key} minus button must use 50 won`);
  assert(source.includes(`adjS('${key}',50)`), `${key} plus button must use 50 won`);
}

assert(source.includes("const step=isBid?50:1,max=isBid?1000:9999;"));
assert(source.includes('const min=0;'), 'all Baemin CPC fields must allow the separate 0-won value');
assert(source.includes('50원 단위 · 0~1,000원'));
assert(source.includes('0원=현재값 유지'), '0-won setting must disclose that no server bid mutation occurs');
assert(source.includes("if(v===0)return '0원(유지)';"), 'minimum bid label must not imply that 0 won was applied');
assert(source.includes('const FEE_MIN=0, FEE_MAX=4000, FEE_STEP=500;'), 'delivery fee must remain a separate 500 won contract');
assert(!source.includes('function isBaeminClubMode('), 'obsolete ad-club helper must stay removed');

const ids = [...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepStrictEqual(duplicates, [], `duplicate element ids: ${duplicates.join(', ')}`);

const handlers = [...source.matchAll(/onclick="([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
const missingHandlers = [...new Set(handlers)].filter((name) =>
  !source.includes(`function ${name}(`) &&
  !source.includes(`const ${name}=`) &&
  !source.includes(`let ${name}=`) &&
  !source.includes(`var ${name}=`)
);
assert.deepStrictEqual(missingHandlers, [], `missing click handlers: ${missingHandlers.join(', ')}`);

console.log('PASS posdelay bid unit/club/dead-helper contract');
