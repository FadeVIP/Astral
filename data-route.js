// Select a healthy route before sending user data. Mutations are never replayed.
(function (root) {
  const PRIMARY = 'https://829504-vds-korolevikh2001vlad.gmhost.pp.ua';
  const BACKUP = 'https://astral-tib9.onrender.com';
  function createRouter(fetcher) {
    let selected = '', until = 0, pending;
    async function probe(origin, timeout) {
      try {
        const r = await fetcher(origin + '/health', {signal: AbortSignal.timeout(timeout), redirect: 'error'});
        if (!r.ok) return false;
        const value = await r.json();
        return value?.ok === true || value?.status === 'ok';
      } catch { return false; }
    }
    async function choose() {
      if (selected && until > Date.now()) return selected;
      if (!pending) pending = (async () => {
        if (await probe(PRIMARY, 3000)) selected = PRIMARY;
        else if (await probe(BACKUP, 5000)) selected = BACKUP;
        else selected = selected || PRIMARY; // A short probe is only a hint, never proof that a slow connection is offline.
        until = Date.now() + 60000;
        return selected;
      })().finally(() => { pending = null; });
      return pending;
    }
    return async function routedFetch(url, options = {}) {
      let u;
      try { u = new URL(url); } catch { return fetcher(url, options); }
      if (u.origin !== PRIMARY || !u.pathname.startsWith('/api/v1/')) return fetcher(url, options);
      // Respect the caller's deadline, including route selection.
      const origin = await choose();
      if (options.signal?.aborted) throw options.signal.reason;
      const readOnly=['GET','HEAD'].includes((options.method||'GET').toUpperCase());
      const attempt=target=>fetcher(target+u.pathname+u.search,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
      let first;
      try {
        first = await (readOnly?attempt(origin):fetcher(origin+u.pathname+u.search,{...options,redirect:'error'}));
        if(first.status<500)return first;
        until=0;
        if(!readOnly)return first;
      } catch(error) { until=0;if(!readOnly||options.signal?.aborted)throw error; }
      // GET/HEAD have no side effects. A failed mutation is never resent.
      const alternate=origin===PRIMARY?BACKUP:PRIMARY;
      if(options.signal?.aborted)throw options.signal.reason;
      try {
        const response=await attempt(alternate);
        if(response.status<500){selected=alternate;until=Date.now()+60000;}
        return response;
      }catch(error){if(first)return first;throw error;}
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {createRouter};
  else root.astralDataFetch = createRouter(root.fetch.bind(root));
})(globalThis);
