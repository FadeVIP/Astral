'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {PGlite} = require('@electric-sql/pglite');
const {DocumentStore,ROOT} = require('../store.cjs');
const {authorize,canRead,unpack} = require('../policy.cjs');
const stamp='2026-10-24T09:36:44.123456789Z';
const alice={uid:'u1',email:'alice@example.test',firebase:{sign_in_provider:'password'}};
function fields(obj) {return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:{stringValue:v}]));}
function doc(p,obj) { return {name:ROOT+p,fields:fields(obj),createTime:stamp,updateTime:stamp}; }
const initial=[doc('members/u1',{email:alice.email,nickname:'Alice',status:'active'}),doc('accountWallets/u1',{balance:100}),doc('accountWallets/u2',{balance:999}),doc('cosmeticCatalog/cape-1',{name:'Cape',price:70,enabled:true,kind:'cape'})];
async function setup(t,rows=initial) {const db=await PGlite.create();t.after(()=>db.close());const store=new DocumentStore(db);await store.initialize();await store.importSnapshot({project:'astral-524a1',documents:rows},'a'.repeat(64));return {db,store};}
function buy(version=stamp,price=70,item='cape-1') { return [{update:{name:ROOT+'accountWallets/u1',fields:fields({balance:100-price,purchase:item})},currentDocument:{updateTime:version}},{update:{name:ROOT+'cosmeticOwners/u1/items/'+item,fields:fields({item})},currentDocument:{exists:false}}]; }
test('import preserves nanosecond versions, every field and refuses overwriting',async t=>{const {store}=await setup(t);assert.deepEqual(await store.get('accountWallets/u1'),initial[1]);await assert.rejects(store.importSnapshot({project:'astral-524a1',documents:initial},'b'.repeat(64)),/empty database/);});
test('default authority blocks writes before cutover',async t=>{const {store}=await setup(t);await assert.rejects(store.commit(buy(),b=>authorize(alice,b)),e=>e.status===503);assert.equal(unpack(await store.get('accountWallets/u1')).balance,100);});

test('admin configuration enforces schema, revision and protected pack deletion',async t=>{
 const {store}=await setup(t,[...initial,doc('launcherAdmins/u1',{enabled:true}),doc('launcherContent/astral-0123456789abcdef',{revision:1,manifest:'{}',updatedAt:'old'}),doc('launcherPacks/astral',{published:true})]);
 const commit=w=>store.commit([w],b=>authorize(alice,b),{requireAuthority:false});
 await assert.rejects(commit({update:{name:ROOT+'launcherAppearance/astral',fields:fields({name:'broken'})}}),e=>e.status===403);
 await assert.rejects(commit({delete:ROOT+'launcherPacks/astral'}),e=>e.status===403);
 await assert.rejects(commit({update:{name:ROOT+'launcherContent/astral-0123456789abcdef',fields:fields({revision:4,manifest:'{}',updatedAt:'now'})}}),e=>e.status===403);
 await commit({update:{name:ROOT+'launcherContent/astral-0123456789abcdef',fields:fields({revision:2,manifest:'{}',updatedAt:'now'})}});
 assert.equal(unpack(await store.get('launcherContent/astral-0123456789abcdef')).revision,2);
});
test('purchase atomically debits and grants; duplicate, stale and forged prices fail',async t=>{
 const {db,store}=await setup(t);await db.query(`UPDATE astral_control SET value='"sql"' WHERE key='authority'`);
 await assert.rejects(store.commit(buy(stamp,1),b=>authorize(alice,b)),e=>e.status===403);
 assert.equal(unpack(await store.get('accountWallets/u1')).balance,100);
 await store.commit(buy(),b=>authorize(alice,b));
 assert.equal(unpack(await store.get('accountWallets/u1')).balance,30);
 assert.equal(unpack(await store.get('cosmeticOwners/u1/items/cape-1')).item,'cape-1');
 await assert.rejects(store.commit(buy(),b=>authorize(alice,b)),e=>e.status===409);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM astral_outbox')).rows[0].n,2);
});
test('failed authorization rolls back all writes and outbox',async t=>{
 const {db,store}=await setup(t);await assert.rejects(store.commit(buy(),()=>{throw Error('denied')},{requireAuthority:false}),/denied/);
 assert.equal(await store.get('cosmeticOwners/u1/items/cape-1'),null);assert.equal(unpack(await store.get('accountWallets/u1')).balance,100);assert.equal((await db.query('SELECT count(*)::int AS n FROM astral_outbox')).rows[0].n,0);
});
test('balances are private; suspended or anonymous accounts cannot purchase',async t=>{
 const {store}=await setup(t);const docs=new Map((await store.all()).map(d=>[d.name.slice(ROOT.length),d]));
 assert.equal(canRead('accountWallets/u1',alice,docs),true);assert.equal(canRead('accountWallets/u2',alice,docs),false);assert.equal(canRead('accountWallets/u1',null,docs),false);
 await assert.rejects(store.commit(buy(),b=>authorize({...alice,firebase:{sign_in_provider:'anonymous'}},b),{requireAuthority:false}),e=>e.status===403);
 docs.set('members/u1',doc('members/u1',{nickname:'Alice',status:'banned'}));assert.equal(canRead('accountWallets/u1',alice,docs),false);
});
test('rejects foreign project, duplicate paths and role escalation',async t=>{
 const {store}=await setup(t);
 await assert.rejects(store.get('../members/u1'),e=>e.status===400);
 await assert.rejects(store.commit([{update:{name:ROOT.replace('astral-524a1','other')+'members/u1',fields:{}}}],()=>{}, {requireAuthority:false}),e=>e.status===400);
 await assert.rejects(store.commit([{update:{name:ROOT+'launcherAdmins/u1',fields:fields({enabled:true})}}],b=>authorize(alice,b),{requireAuthority:false}),e=>e.status===403);
});
test('registration must reserve nickname in the same transaction',async t=>{
 const {store}=await setup(t);const user={...alice,uid:'u3',email:'new@example.test'};
 const writes=[{update:{name:ROOT+'members/u3',fields:fields({email:user.email,nickname:'Charlie',status:'active'})},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}];
 await assert.rejects(store.commit(writes,b=>authorize(user,b),{requireAuthority:false}),e=>e.status===403);
 writes.push({update:{name:ROOT+'nicknames/charlie',fields:fields({uid:'u3'})},currentDocument:{exists:false}});
 await store.commit(writes,b=>authorize(user,b),{requireAuthority:false});assert.equal(unpack(await store.get('members/u3')).nickname,'Charlie');
});
