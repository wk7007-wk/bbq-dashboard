#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const htmlTag = html.match(/<html\b([^>]*)>/i);

assert.ok(htmlTag, 'index.html must contain an html root element');
assert.match(
  htmlTag[1],
  /\blang\s*=\s*["']ko["']/i,
  'the Korean dashboard landing page must declare lang="ko" for assistive technology'
);

console.log('index language accessibility contract: PASS');
