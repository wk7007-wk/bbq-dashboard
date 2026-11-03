(function (global) {
  'use strict';
  function potentiallyPrivate(value) {
    return /계좌|예금주|전화|비번|비밀번호|현관|프린터|password/i.test(value) ||
      /(?:\d[\s().-]*){8,}/.test(value) || /(?:010|050\d)[\s().-]*[\d*•xX]/.test(value);
  }
  function create({cacheSearch, externalSearch, safeExternal, onChange}) {
    const requests = new Map();
    let current = '', currentKey = null;
    function invalidate(query) { current = String(query || '').trim(); currentKey = null; }
    function publish(record, lane) {
      if (currentKey === record.key && current === record.query) onChange({query: record.query, lane, state: record[lane].state, result: record[lane].result});
    }
    function search(query, generation) {
      query = String(query || '').trim();
      if (!query) { invalidate(''); return; }
      if (query !== current) invalidate(query);
      const key = JSON.stringify([query, generation || null]);
      currentKey = key;
      let record = requests.get(key);
      if (!record) {
        record = {key, query, cache:{state:'new'}, external:{state:'new'}};
        requests.set(key, record);
      }
      function start(lane, fn) {
        if (!['new', 'error'].includes(record[lane].state)) return;
        record[lane] = {state:'pending'};
        Promise.resolve().then(fn).then(result => {
          record[lane] = {state:'ready', result}; publish(record, lane);
        }, () => { record[lane] = {state:'error'}; publish(record, lane); });
      }
      // A repeated request reuses successful/in-flight lanes and retries only
      // failed lanes; neither lane waits for the other's result.
      start('cache', () => cacheSearch(query, generation));
      start('external', () => {
        const safe = typeof safeExternal === 'function' ? safeExternal(query) : null;
        if (typeof safe !== 'string' || !safe.trim() || potentiallyPrivate(query) || potentiallyPrivate(safe) ||
            typeof externalSearch !== 'function') throw new Error('external unavailable');
        return externalSearch(safe, generation);
      });
      publish(record, 'cache'); publish(record, 'external');
    }
    function refreshCache(query, generation) {
      query = String(query || '').trim();
      const record = requests.get(JSON.stringify([query, generation || null]));
      if (record) record.cache = {state:'new'};
      search(query, generation);
    }
    return {search, invalidate, refreshCache};
  }
  global.NotebookWorkSearch = {create};
})(window);
