'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../src/auth.cjs');
const config = { projectId: 'test-project', apiKey: 'test-key' };
const storage = () => ({ saved: null, async load() { return this.saved; }, async save(value) { this.saved = value; }, async clear() { this.saved = null; } });
function fixture(status = 'active') {
  const requests = []; let memberExists = false;
  const fetcher = async (url, options) => {
    requests.push({ url, body: options.body, headers: options.headers });
    if (/accounts:signUp|accounts:signInWithPassword/.test(url)) return Response.json({ localId: 'uid-one', email: 'one@example.invalid', idToken: 'id-token', refreshToken: 'refresh-token', expiresIn: '3600', displayName: 'PlayerOne' });
    if (url.includes('securetoken.')) return Response.json({ user_id: 'uid-one', id_token: 'fresh-token', refresh_token: 'rotated-refresh', expires_in: '3600' });
    if (url.includes('accounts:lookup')) return Response.json({ users: [{ localId: 'uid-one', email: 'one@example.invalid', displayName: 'PlayerOne' }] });
    if (url.includes('accounts:update')) return Response.json({});
    if (url.endsWith('documents:commit')) { memberExists = true; return Response.json({ writeResults: [] }); }
    if (!memberExists) return Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
    return Response.json({ fields: { nickname: { stringValue: 'PlayerOne' }, status: { stringValue: status } } });
  };
  const store = storage();
  return { auth: new AuthService(config, store, fetcher), requests, store };
}
test('Registration creates profile and nickname atomically, never persists a password', async () => {
  const { auth, requests, store } = fixture();
  await auth.register({ email: 'one@example.invalid', password: 'ExampleOnly123!', nickname: 'PlayerOne', remember: true });
  const commit = JSON.parse(requests.find(r => r.url.endsWith('documents:commit')).body);
  assert.equal(commit.writes.length, 2);
  assert.equal(commit.writes[0].update.fields.status.stringValue, 'active');
  assert.ok(commit.writes[1].update.name.endsWith('/nicknames/playerone'));
  assert.deepEqual(store.saved, { refreshToken: 'refresh-token' });
  assert.equal(JSON.stringify(auth.publicUser()).includes('token'), false);
  assert.equal(JSON.stringify(store.saved).includes('ExampleOnly'), false);
});
test('Launch access is denied while signed out, blocked, or unable to reach Firebase', async () => {
  const { auth } = fixture('blocked');
  await assert.rejects(auth.requireAccess(), /Войдите/);
  await auth.login({ email: 'one@example.invalid', password: 'ExampleOnly123!' });
  await assert.rejects(auth.requireAccess(), /приостановлен/);
  auth.fetcher = async () => { throw new Error('offline'); };
  await assert.rejects(auth.requireAccess(), /интернет/);
});
test('Every launch refreshes server identity and reads current member status', async () => {
  const { auth, requests, store } = fixture();
  await auth.login({ email: 'one@example.invalid', password: 'ExampleOnly123!', remember: true });
  requests.length = 0;
  assert.equal((await auth.requireAccess()).nickname, 'PlayerOne');
  assert.ok(requests.some(r => r.url.includes('securetoken.')));
  assert.ok(requests.some(r => r.url.includes('accounts:lookup')));
  assert.ok(requests.some(r => r.url.endsWith('/members/uid-one')));
  assert.equal(store.saved.refreshToken, 'rotated-refresh');
  await auth.logout();
  assert.equal(auth.publicUser(), null); assert.equal(store.saved, null);
});
test('Invalid Minecraft nick and short password are rejected before any network call', async () => {
  const { auth, requests } = fixture();
  await assert.rejects(auth.register({ email: 'one@example.invalid', password: 'ExampleOnly123!', nickname: 'bad name' }));
  await assert.rejects(auth.register({ email: 'one@example.invalid', password: 'short', nickname: 'PlayerOne' }));
  assert.equal(requests.length, 0);
});

test('quota failure preserves saved login and stops repeated requests to the same service',async()=>{
 const store=storage();store.saved={refreshToken:'saved'};let requests=0;
 const auth=new AuthService(config,store,async()=>{requests++;return Response.json({error:{status:'RESOURCE_EXHAUSTED',message:'Quota exceeded.'}},{status:429});});
 await assert.rejects(auth.restore(),/429/);assert.equal(auth.restorePending,true);assert.equal(store.saved.refreshToken,'saved');
 await assert.rejects(auth.restore(),/429/);assert.equal(requests,1);
 await auth.logout();assert.equal(auth.restorePending,false);assert.equal(store.saved,null);
});
test('unrelated HTTP 400 does not erase saved credentials',async()=>{
 const store=storage();store.saved={refreshToken:'saved'};
 const auth=new AuthService(config,store,async()=>Response.json({error:{message:'SOME_SERVICE_ERROR'}},{status:400}));
 await assert.rejects(auth.restore());assert.equal(store.saved.refreshToken,'saved');assert.equal(auth.restorePending,false);
});
test('expired refresh token is cleared and never retried automatically',async()=>{
 const store=storage();store.saved={refreshToken:'expired'};
 const auth=new AuthService(config,store,async()=>Response.json({error:{message:'INVALID_REFRESH_TOKEN'}},{status:400}));
 await assert.rejects(auth.restore());assert.equal(store.saved,null);assert.equal(auth.restorePending,false);
});
test('saved login recovers after quota cooldown without entering password',async t=>{
 const {auth,store}=fixture();await auth.login({email:'one@example.invalid',password:'ExampleOnly123!',remember:true});
 const original=auth.fetcher;let limited=true;
 const recovered=new AuthService(config,store,async(url,options)=>limited&&url.includes('firestore.googleapis.com')?Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429}):original(url,options));
 await assert.rejects(recovered.restore(),/429/);assert.equal(recovered.publicUser(),null);assert.equal(recovered.restorePending,true);
 limited=false;const now=Date.now();t.mock.method(Date,'now',()=>now+300001);
 await recovered.restore();assert.equal(recovered.publicUser().nickname,'PlayerOne');assert.equal(recovered.restorePending,false);
});
