(function (root) {
  'use strict';
  var EP_CANDIDATES = [
    '/endpoints.json',
    '/factory_bridge.json',
    'https://wsl-ubuntu.tail785e65.ts.net/endpoints.json',
    'https://wsl-ubuntu.tail785e65.ts.net/factory_bridge.json',
    'https://wk7007-wk.github.io/bbq-dashboard/updates/endpoints.json'
  ];
  var AUTH = 'token grok-ops';
  var cache = null;
  var cacheAt = 0;
  var lastSource = '';
  var URL = '';
  var rw = false;
  var recoverStarted = false;

  function isGithubPagesHost() {
    try { return String(location.hostname || '').indexOf('github.io') >= 0; } catch (e) { return false; }
  }
  function probe(url) {
    if (!url) return Promise.resolve(false);
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) return false;
      return r.json().then(function (j) {
        return !!(j && (j.ok === true || j.status === 'ok'));
      });
    }).catch(function () { return false; });
  }
  function loadEp() {
    var cands = isGithubPagesHost()
      ? EP_CANDIDATES.filter(function (u) { return u.indexOf('https://') === 0; })
      : EP_CANDIDATES;
    var i = 0;
    function next() {
      if (i >= cands.length) return Promise.resolve(null);
      var u = cands[i++];
      return fetch(u, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) return next();
        return r.json().then(function (ep) {
          return ep && typeof ep === 'object' ? ep : next();
        });
      }).catch(function () { return next(); });
    }
    return next();
  }
  function setRw(base) {
    if (!base) return;
    var b = String(base).replace(/\/$/, '');
    if (isGithubPagesHost() && b.indexOf('https://') !== 0) return;
    rw = true;
    URL = b + '/workschedule.json';
    if (root && typeof window !== 'undefined') window.__factoryRw = true;
  }
  function setBlocked() {
    rw = false;
    URL = '';
    if (root && typeof window !== 'undefined') window.__factoryRw = false;
  }
  function pick(ep) {
    var f = ep && ep.sets && ep.sets.factory;
    var h = ep && ep.health;
    var ip = String((ep && ep.public_ip) || '').trim();
    var magicHealth = h && h.factory_magic;
    var tsHealth = h && h.factory;
    var magicBase = f && f.magic_base;
    var tsBase = f && f.ts_base;
    var wanHttps = ip ? ('https://' + ip) : '';
    var wanHealth = wanHttps ? (wanHttps + '/health') : '';
    return probe(magicHealth).then(function (ok) {
      if (ok) { setRw(magicBase); return 'magic'; }
      if (isGithubPagesHost()) {
        return probe(wanHealth).then(function (okw) {
          if (okw) { setRw(wanHttps); return 'wan_https'; }
          setBlocked();
          return 'blocked';
        });
      }
      return probe(tsHealth).then(function (ok2) {
        if (ok2) { setRw(tsBase); return 'ts2421'; }
        return probe(wanHealth).then(function (okw) {
          if (okw) { setRw(wanHttps); return 'wan_https'; }
          setBlocked();
          return 'blocked';
        });
      });
    });
  }
  function startRecover() {
    if (recoverStarted) return;
    recoverStarted = true;
    setInterval(function () {
      if (rw) return;
      loadEp().then(pick);
    }, 30000);
  }
  function boot() {
    loadEp().then(pick).then(function (mode) {
      lastSource = mode === 'blocked' ? 'blocked' : 'factory';
    });
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
    var employees = tree.employees;
    var fixed = tree.fixed_schedules;
    return (employees && typeof employees === 'object' && Object.keys(employees).length > 0)
      || (fixed && typeof fixed === 'object' && Object.keys(fixed).length > 0);
  }

  function fetchJson(url, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 2500);
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (res) {
      if (!res.ok) throw res.status;
      return res.json();
    }).then(function (tree) {
      return tree && typeof tree === 'object' ? tree : {};
    }).finally(function () { clearTimeout(timer); });
  }

  async function load(force) {
    if (!force && cache && planning(cache) && (Date.now() - cacheAt) < 2000) return cache;
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
    if (!rw) {
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
