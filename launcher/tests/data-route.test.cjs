'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRouter}=require('../src/data-route.cjs');
const primary='https://829504-vds-korolevikh2001vlad.gmhost.pp.ua';
test('fallback probes are anonymous, concurrent callers share routing and mutations are not replayed',async()=>{
 const calls=[];
 const router=createRouter(async(url,o)=>{calls.push({url,o});if(url.endsWith('packs.json')){assert.equal(o.headers,undefined);if(url.startsWith(primary))throw Error('reset');return Response.json({version:1,documents:[]});}throw Error('response lost');});
 const results=await Promise.allSettled([router(primary+'/api/v1/documents:commit',{method:'POST',body:'{}'}),router(primary+'/api/v1/documents/members/me')]);
 assert.equal(results.every(r=>r.status==='rejected'),true);
 assert.equal(calls.filter(c=>c.url.endsWith('packs.json')).length,2);
 assert.equal(calls.filter(c=>c.o.method==='POST').length,1);
 assert.ok(calls.find(c=>c.o.method==='POST').url.startsWith('https://astral-tib9.onrender.com/'));
});
test('relative bundled catalog remains available when remote data is offline',async()=>{
 let seen;const router=createRouter(async url=>{seen=url;return Response.json({version:1,documents:[]});});
 assert.equal((await router('/assets/public-data/cosmetics.json')).status,200);
 assert.equal(seen,'/assets/public-data/cosmetics.json');
});
test('failed profile read switches to reserve and remembers the working route',async()=>{
 const calls=[];const router=createRouter(async(url,o)=>{calls.push(url);if(url.endsWith('packs.json'))return Response.json({version:1,documents:[]});if(url.startsWith(primary))throw Error('reset');return Response.json({fields:{}});});
 await router(primary+'/api/v1/documents/members/me');
 await router(primary+'/api/v1/documents/accountSkins/me');
 assert.equal(calls.filter(u=>u.startsWith(primary)&&!u.endsWith('packs.json')).length,1);
 assert.ok(calls.at(-1).startsWith('https://astral-tib9.onrender.com'));
});
test('permission denial is not retried on another host',async()=>{
 let attempts=0;const router=createRouter(async url=>{if(url.endsWith('packs.json'))return Response.json({version:1,documents:[]});attempts++;return Response.json({}, {status:403});});
 assert.equal((await router(primary+'/api/v1/documents/private')).status,403);assert.equal(attempts,1);
});
test('Firebase credentials never pass through reserve SQL route',async()=>{
 const calls=[];const router=createRouter(async(...args)=>{calls.push(args);return Response.json({});});
 await router('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',{method:'POST',body:'credentials'});
 assert.equal(calls.length,1);assert.match(calls[0][0],/^https:\/\/identitytoolkit/);
});
test('authentication network errors identify the failed service',async()=>{
 const {AuthService}=require('../src/auth.cjs');const a=new AuthService({projectId:'test'}, {},async()=>{throw Error('reset');});
 await assert.rejects(a.request(a.authURL('signInWithPassword')),e=>e.code==='NETWORK'&&e.service==='firebase-auth');
 await assert.rejects(a.request(primary+'/api/v1/documents/members/me'),e=>e.code==='NETWORK'&&e.service==='astral-data'&&!e.message.includes('Firebase'));
});
