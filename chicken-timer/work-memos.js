(function (global) {
  'use strict';
  const key = 'notebook-work:memos:subnote:v1';
  const draftsKey = 'notebook-work:drafts:subnote:v1';
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
    return {
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
      }
    };
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
