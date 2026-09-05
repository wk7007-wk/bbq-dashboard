(function (root) {
  'use strict';
  var TABLE_CANDIDATES = [
    'https://wk7007-wk.github.io/bbq-dashboard/updates/endpoints.json',
    'https://gist.githubusercontent.com/wk7007-wk/a67e5de3271d6d0716b276dc6a8391cb/raw/endpoints.json'
  ];
  var AUTH = 'token grok-ops';
  var cache = null, cacheAt = 0, lastSource = '', URL = '', rw = false, ready = null;
  function isGithubPagesHost() {
    try { return String(location.hostname || '').indexOf('github.io') >= 0; } catch (e) { return false; }
  }
  function originJson() {
    try { return String(location.origin || '').replace(/\/$/, '') + '/workschedule.json'; }
    catch (e) { return '/workschedule.json'; }
  }
  function probe(url) {
    if (!url) return Promise.resolve(false);
    if (isGithubPagesHost() && String(url).indexOf('https://') !== 0) return Promise.resolve(false);
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) return false;
      return r.json().then(function (j) { return !!(j && (j.ok === true || j.status === 'ok')); });
    }).catch(function () { return false; });
  }
  function loadTable() {
    var i = 0;
    var cands = isGithubPagesHost()
      ? TABLE_CANDIDATES.filter(function (u) { return u.indexOf('https://') === 0; })
      : TABLE_CANDIDATES;
    function next() {
      if (i >= cands.length) return Promise.resolve(null);
      var u = cands[i++];
      return fetch(u, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) return next();
        return r.json().then(function (ep) { return ep && typeof ep === 'object' ? ep : next(); });
      }).catch(function () { return next(); });
    }
    return next();
  }
  function httpsBase(ep) {
    var f = (ep && ep.factory) || (ep && ep.sets && ep.sets.factory) || {};
    var wanHttps = String(f.wan_https || '').replace(/\/$/, '');
    if (wanHttps.indexOf('https://') === 0) return wanHttps;
    var magic = String(f.magic_base || (ep && ep.magic_base) || '').replace(/\/$/, '');
    if (magic.indexOf('https://') === 0) return magic;
    return '';
  }
  function boot(force) {
    if (ready && !force) return ready;
    if (force) ready = null;
    if (!isGithubPagesHost()) {
      URL = originJson();
      rw = true;
      lastSource = 'factory_origin';
      ready = Promise.resolve('factory_origin');
      return ready;
    }
    ready = loadTable().then(function (ep) {
      var base = httpsBase(ep);
      var health = (ep && ep.health && (ep.health.magic_https || ep.health.factory_magic)) || (base ? base + '/health' : '');
      return probe(health).then(function (ok) {
        if (ok && base) {
          URL = base + '/workschedule.json';
          rw = true;
          lastSource = 'factory';
          return 'magic';
        }
        URL = '';
        rw = false;
        lastSource = 'blocked';
        return 'blocked';
      });
    });
    return ready;
  }
  if (root.setInterval) {
    root.setInterval(function () { boot(true); }, 5 * 60 * 1000);
  }
  function dig(tree, path) {
    if (!path) return tree;
    var cur = tree;
    String(path).split('/').filter(Boolean).forEach(function (part) {
      cur = cur && typeof cur === 'object' ? cur[part] : undefined;
    });
    return cur === undefined ? null : cur;
  }
  function setPath(tree, path, value) {
    var parts = String(path || '').split('/').filter(Boolean);
    if (!parts.length) {
      return value && typeof value === 'object' ? value : tree;
    }
    var cur = tree;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return tree;
  }
  function planning(tree) {
    if (!tree || typeof tree !== 'object') return false;
    var employees = tree.employees, fixed = tree.fixed_schedules;
    return (employees && typeof employees === 'object' && Object.keys(employees).length > 0)
      || (fixed && typeof fixed === 'object' && Object.keys(fixed).length > 0);
  }
  function fetchJson(url, timeoutMs) {
    if (!url) return Promise.reject(new Error('no_url'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 4000);
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (res) {
      if (!res.ok) throw res.status;
      return res.json();
    }).then(function (tree) { return tree && typeof tree === 'object' ? tree : {}; }).finally(function () { clearTimeout(timer); });
  }
  async function load(force) {
    await boot();
    if (!force && cache && planning(cache) && (Date.now() - cacheAt) < 2000) return cache;
    if (!URL) {
      lastSource = 'blocked';
      cache = cache || {};
      cacheAt = Date.now();
      return cache;
    }
    try {
      var tree = await fetchJson(URL, 4000);
      lastSource = rw ? 'factory' : 'blocked';
      cache = tree || {};
      cacheAt = Date.now();
      if (!planning(cache)) lastSource = 'empty';
      return cache;
    } catch (e) {
      lastSource = rw ? 'factory_down' : 'blocked_down';
      cacheAt = Date.now();
      if (!(cache && planning(cache))) cache = {};
      return cache;
    }
  }
  async function save(tree) {
    cache = tree && typeof tree === 'object' ? tree : {};
    cacheAt = Date.now();
    await boot();
    if (!rw || !URL) {
      lastSource = 'blocked_readonly';
      return false;
    }
    try {
      var res = await fetch(URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify(cache)
      });
      if (res.ok) lastSource = 'factory';
      return res.ok;
    } catch (e) {
      return false;
    }
  }
  function restFrom(url, prefixes) {
    var text = String(url || '');
    for (var i = 0; i < prefixes.length; i++) {
      var prefix = prefixes[i];
      if (text === prefix) return '';
      if (text.indexOf(prefix + '/') === 0) return text.slice(prefix.length).replace(/^\//, '');
    }
    return null;
  }
  root.FactorySchedule = {
    get URL() { return URL; },
    load: load,
    save: save,
    dig: dig,
    setPath: setPath,
    planning: planning,
    restFrom: restFrom,
    lastSource: function () { return lastSource; },
    isRw: function () { return rw; }
  };
  boot();
})(typeof window !== 'undefined' ? window : this);
