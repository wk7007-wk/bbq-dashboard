(function (root) {
  'use strict';
  var URL = 'http://218.147.118.71:2421/workschedule.json';
  var GIST = '';
  var AUTH = 'token grok-ops';
  var cache = null;
  var cacheAt = 0;
  var lastSource = '';

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
    var httpsPage = typeof location !== 'undefined' && String(location.protocol || '') === 'https:';
    var sources = httpsPage
      ? [
          { name: 'pages', url: './workschedule.json', timeout: 2500 },
          { name: 'factory', url: URL, timeout: 1200 }
        ]
      : [
          { name: 'factory', url: URL, timeout: 1500 },
          { name: 'pages', url: './workschedule.json', timeout: 2500 }
        ];
    var empty = {};
    for (var i = 0; i < sources.length; i++) {
      try {
        var tree = await fetchJson(sources[i].url, sources[i].timeout);
        lastSource = sources[i].name;
        if (planning(tree)) {
          cache = tree;
          cacheAt = Date.now();
          return cache;
        }
        if (!planning(empty)) empty = tree || {};
      } catch (e) {
        lastSource = sources[i].name + '_down';
      }
    }
    cache = empty;
    cacheAt = Date.now();
    if (!planning(cache) && lastSource.indexOf('_down') < 0) lastSource = 'empty';
    return cache;
  }

  async function save(tree) {
    cache = tree && typeof tree === 'object' ? tree : {};
    cacheAt = Date.now();
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
    URL: URL,
    GIST: GIST,
    load: load,
    save: save,
    dig: dig,
    setPath: setPath,
    planning: planning,
    restFrom: restFrom,
    lastSource: function () { return lastSource; }
  };
})(typeof window !== 'undefined' ? window : this);
