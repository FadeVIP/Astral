const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('../../pack-online.cjs');
test('public online excludes stale and future entries and updates without Discord',async()=>{
 let written;const now=Date.now();
 const query={orderByChild(){return this},startAt(){return this},limitToLast(){return this},async once(){return {val:()=>({live:{seen:now},old:{seen:now-120000},future:{seen:now+60000}})}}};
 const db={ref:p=>p==='packPresence'?query:{set:async v=>{written=v},transaction:async fn=>({committed:true,snapshot:{val:()=>fn(null)}})}};
 const state=start(db,{isReady:()=>false});
 await new Promise(r=>setImmediate(r));
 assert.equal(written.count,1);assert.equal(state.count,1);assert.equal(state.dailyCount,1);assert(state.updatedAt>0);
});
const {mergeDaily,dayKey}=require('../../pack-online.cjs');
test('daily visits are idempotent across reconnects and worker restarts',()=>{
 const first=mergeDaily(null,'2026-10-09',['a','a','b']);
 const restarted=mergeDaily(JSON.parse(JSON.stringify(first)),'2026-10-09',['a','c']);
 assert.equal(first.count,2);assert.equal(restarted.count,3);
});
test('daily visits reset at Berlin midnight including daylight saving dates',()=>{
 assert.equal(dayKey(Date.parse('2026-10-09T21:59:59Z')),'2026-10-09');
 assert.equal(dayKey(Date.parse('2026-10-09T22:00:00Z')),'2026-10-10');
 assert.equal(dayKey(Date.parse('2026-12-01T23:00:00Z')),'2026-12-02');
 const next=mergeDaily({day:'2026-10-09',visitors:{old:true}},'2026-10-10',['new']);
 assert.equal(next.count,1);assert.equal(next.visitors.old,undefined);
});

