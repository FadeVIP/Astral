const {test}=require('node:test');
const assert=require('node:assert/strict');
const {clientAddress,writeFromPatch}=require('../http.cjs');
test('rate limit key only trusts a configured loopback proxy',()=>{
 const req=(peer,ip)=>({socket:{remoteAddress:peer},headers:{'x-real-ip':ip}});
 assert.equal(clientAddress(req('203.0.113.1','203.0.113.2'),true),'203.0.113.1');
 assert.equal(clientAddress(req('127.0.0.1','203.0.113.2')),'127.0.0.1');
 assert.equal(clientAddress(req('127.0.0.1','203.0.113.2'),true),'203.0.113.2');
 assert.equal(clientAddress(req('127.0.0.1','203.0.113.2, 127.0.0.1'),true),'127.0.0.1');
});
test('document preconditions retain delete/edit versions and reject ambiguous checks',()=>{
 const u=new URL('https://example.test/?currentDocument.updateTime=2026-10-24T00%3A00%3A00Z');
 assert.equal(writeFromPatch('launcherPacks/test',u,{fields:{}}).currentDocument.updateTime,'2026-10-24T00:00:00Z');
 u.searchParams.set('currentDocument.exists','false');
 assert.throws(()=>writeFromPatch('launcherPacks/test',u,{fields:{}}),e=>e.status===400);
});
