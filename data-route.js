// Select a healthy route before sending user data. Mutations are never replayed.
(function (root) {
  const PRIMARY = 'https://829504-vds-korolevikh2001vlad.gmhost.pp.ua';
  const BACKUP = 'https://astral-tib9.onrender.com';
  function createRouter(fetcher) {
    let selected = '', until = 0, pending;
    async function probe(origin, timeout) {
      try {
        const r = await fetcher(origin + '/api/v1/realtime/publicLauncherData/packs.json', {signal: AbortSignal.timeout(timeout), redirect: 'error'});
        if (!r.ok) return false;
        const value = await r.json();
        return value?.version === 1 && (Array.isArray(value.documents) || value.count === 0);
      } catch { return false; }
    }
    async function choose() {
      if (selected && until > Date.now()) return selected;
      if (!pending) pending = (async () => {
        if (await probe(PRIMARY, 2500)) selected = PRIMARY;
        else if (await probe(BACKUP, 15000)) selected = BACKUP;
        else throw Error('Сервер профиля Astral недоступен по основному и резервному адресу. Попробуйте позже или используйте гостевой режим.');
        until = Date.now() + 60000;
        return selected;
      })().finally(() => { pending = null; });
      return pending;
    }
    return async function routedFetch(url, options = {}) {
      const u = new URL(url);
      if (u.origin !== PRIMARY || !u.pathname.startsWith('/api/v1/')) return fetcher(url, options);
      // The caller's timeout starts with the operation, not the route probes.
      const origin = await choose();
      if (options.signal?.aborted) throw options.signal.reason;
      try {
        const r = await fetcher(origin + u.pathname + u.search, options);
        if (r.status >= 500) until = 0;
        return r;
      } catch (error) { until = 0; throw error; }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {createRouter};
  else root.astralDataFetch = createRouter(root.fetch.bind(root));
})(globalThis);
