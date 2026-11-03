(function (global) {
  'use strict';
  const key = 'notebook-work:memos:subnote:v1';
  const draftsKey = 'notebook-work:drafts:subnote:v1';
  const temporaryPrefix = 'notebook-work:temporary:subnote:v1:';
  function read(storage, name, fallback) {
    const raw = storage.getItem(name);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((x) => !x || typeof x !== 'object' ||
        typeof x.id !== 'string' || !x.id || !Number.isInteger(x.revision) || x.revision < 0)) {
      throw new Error('저장 자료를 읽을 수 없습니다');
    }
    if (new Set(parsed.map((x) => x.id)).size !== parsed.length) throw new Error('중복된 저장 자료를 확인해 주세요');
    return parsed;
  }
  function store(storage) {
    function temporary(id) {
      const rows = read(storage, temporaryPrefix + encodeURIComponent(id), []);
      if (!rows.length) return null;
      if (rows.length !== 1 || rows[0].id !== id) throw new Error('임시 항목을 확인해 주세요');
      return rows[0];
    }
    const api = {
      list: () => read(storage, key, []),
      drafts: () => read(storage, draftsKey, []),
      saveDraft(draft) {
        const drafts = read(storage, draftsKey, []);
        const next = drafts.filter((x) => x && x.id !== draft.id);
        next.push(draft); storage.setItem(draftsKey, JSON.stringify(next));
      },
      save(draft) {
        const list = read(storage, key, []);
        const old = list.find((x) => x && x.id === draft.id);
        if (old && old.revision !== draft.revision) throw new Error('다른 화면에서 수정됐습니다');
        if (!old && draft.revision !== 0) throw new Error('저장 상태를 확인해 주세요');
        const saved = Object.assign({}, draft, {revision: draft.revision + 1});
        const next = list.filter((x) => x && x.id !== draft.id); next.push(saved);
        storage.setItem(key, JSON.stringify(next));
        return saved;
      },
      remove(id, revision) {
        // 1104 사장님 "삭제는 x표시로 쉽게": 고정 메모 한 줄 지우기(다른 화면에서 바뀌었으면 거절), 그 초안도 함께
        const list = read(storage, key, []);
        const old = list.find((x) => x && x.id === id);
        if (!old || old.revision !== revision) throw new Error('다른 화면에서 수정됐습니다');
        storage.setItem(key, JSON.stringify(list.filter((x) => x && x.id !== id)));
        try {
          const drafts = read(storage, draftsKey, []);
          if (drafts.some((x) => x.id === id)) storage.setItem(draftsKey, JSON.stringify(drafts.filter((x) => x.id !== id)));
        } catch (_) {}
        return old;
      },
      // 1104 공장 SOT 공유: 공장 메모 저장소가 원본, 이 기기 저장소는 캐시 — 통째 읽기·바꾸기(초안은 이 기기에만)
      snapshot() { return {fixed: api.list(), temps: api.temporaries()}; },
      replaceAll(data) {
        const fixed = Array.isArray(data && data.fixed) ? data.fixed : null;
        const temps = Array.isArray(data && data.temps) ? data.temps : null;
        const ok = (x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id && Number.isInteger(x.revision) && x.revision >= 0;
        if (!fixed || !temps || !fixed.every(ok) || !temps.every(ok)) throw new Error('공유 자료를 확인해 주세요');
        storage.setItem(key, JSON.stringify(fixed));
        const old = [];
        for (let i = 0; i < storage.length; i++) { const name = storage.key(i); if (typeof name === 'string' && name.startsWith(temporaryPrefix)) old.push(name); }
        old.forEach((name) => storage.removeItem(name));
        temps.forEach((t) => storage.setItem(temporaryPrefix + encodeURIComponent(t.id), JSON.stringify([t])));
      },
      temporaries() {
        const list = [];
        for (let i = 0; i < storage.length; i++) {
          const name = storage.key(i);
          if (typeof name !== 'string' || !name.startsWith(temporaryPrefix)) continue;
          const entry = temporary(decodeURIComponent(name.slice(temporaryPrefix.length)));
          if (entry) list.push(entry);
        }
        return list.sort((a, b) => (a.created_order || 0) - (b.created_order || 0) || (a.created_at || 0) - (b.created_at || 0) || a.id.localeCompare(b.id));
      },
      temporary,
      saveTemporary(draft) {
        if (!draft || typeof draft.id !== 'string' || !draft.id || !Number.isInteger(draft.revision) || draft.revision < 0) throw new Error('임시 항목을 확인해 주세요');
        const old = temporary(draft.id);
        if ((old && old.revision !== draft.revision) || (!old && draft.revision !== 0)) throw new Error('다른 화면에서 임시 항목이 바뀌었습니다');
        if (old && JSON.stringify(old) === JSON.stringify(draft)) return old;
        const saved = Object.assign({}, draft, {revision: draft.revision + 1});
        storage.setItem(temporaryPrefix + encodeURIComponent(draft.id), JSON.stringify([saved]));
        return saved;
      },
      clearTemporary(id, revision) {
        const old = temporary(id);
        if (!old || old.revision !== revision) throw new Error('다른 화면에서 임시 항목이 바뀌었습니다');
        storage.removeItem(temporaryPrefix + encodeURIComponent(id));
      },
      pinTemporary(id, revision) {
        const entry = temporary(id);
        if (!entry || entry.revision !== revision) throw new Error('다른 화면에서 임시 항목이 바뀌었습니다');
        const list = api.list();
        const existing = list.find((item) => item.temporary_source && item.temporary_source.id === id && item.temporary_source.revision === revision);
        if (existing) return existing;
        const fixedId = 'fixed-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        if (list.some((item) => item.id === fixedId)) throw new Error('저장 식별자를 다시 확인해 주세요');
        // One fixed-store write; the temporary stays intact even if saving fails.
        return api.save(Object.assign({}, entry, {id: fixedId, revision: 0, temporary_source: {id, revision}}));
      }
    };
    return api;
  }
  function translatorCoordinator({read, write, digest, translate, isPublicNote}) {
    const inflight = new Map();
    const source = (item) => JSON.stringify([item.customer_ko || '', (item.staff_notes || {}).ko || '']);
    return {
      async request(id, language) {
        if (!['vi', 'ja'].includes(language)) throw new Error('언어를 확인해 주세요');
        const item = read(id);
        if (!item || item.id !== id) return 'missing';
        const note = (item.staff_notes || {}).ko || '';
        const sourceKey = source(item), revision = item.source_revision || 0;
        const hash = await digest(sourceKey);
        if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return 'hash_unknown';
        const meta = (item.staff_meta || {})[language];
        if (meta && meta.provenance === 'user' && (item.staff_notes || {})[language]) return 'manual_preserved';
        if (meta && meta.source_hash === hash && meta.source_revision === revision &&
            meta.source_key === sourceKey && (item.staff_notes || {})[language]) return 'cached';
        // Translation is not connected to any real provider. Even an injected
        // adapter requires separate proof that its input contains no private data.
        if (!note || typeof isPublicNote !== 'function' || isPublicNote(note) !== true ||
            /\d|계좌|예금주|전화|비번|비밀번호|현관|주소|프린터/i.test(note)) return 'private_or_empty';
        const key = JSON.stringify([id, hash, revision, language]);
        if (inflight.has(key)) return inflight.get(key);
        const initial = (item.staff_notes || {})[language] || '';
        const pending = Promise.resolve().then(async () => {
          try {
            const result = await translate(note, language);
            const latest = read(id);
            if (!latest || latest.id !== id || source(latest) !== sourceKey ||
                (latest.source_revision || 0) !== revision || ((latest.staff_notes || {})[language] || '') !== initial ||
                ((latest.staff_meta || {})[language] || {}).provenance === 'user') return 'stale';
            if (!result || typeof result.text !== 'string' || !result.text.trim() ||
                typeof result.provenance !== 'string' || !result.provenance.trim()) return 'unknown';
            const next = Object.assign({}, latest, {
              staff_notes: Object.assign({}, latest.staff_notes, {[language]: result.text}),
              staff_meta: Object.assign({}, latest.staff_meta, {[language]: {source_key: sourceKey,
                source_hash: hash, source_revision: revision, provenance: result.provenance}})
            });
            write(next);
            return 'translated';
          } catch (_) { return 'unknown'; }
          finally { inflight.delete(key); }
        });
        inflight.set(key, pending);
        return pending;
      }
    };
  }
  global.NotebookWorkMemos = {store, translatorCoordinator};
})(window);
