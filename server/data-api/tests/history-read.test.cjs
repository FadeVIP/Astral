'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RealtimeStore}=require('../realtime-store.cjs');
test('large chat history reconstructs every message in one SQL read',async()=>{
 const rows=Array.from({length:2000},(_,i)=>({namespace:'chat',node_key:'m'+String(i).padStart(5,'0'),data:{text:'Message '+i,uid:'test-user',timestamp:i}}));
 let reads=0;const store=new RealtimeStore({query:async()=>{reads++;return {rows};}});
 const start=performance.now(),result=await store.get('chat');
 assert.equal(reads,1);assert.equal(Object.keys(result).length,2000);
 for(const row of rows)assert.deepEqual(result[row.node_key],row.data);
 assert.ok(performance.now()-start<2000,'history reconstruction must not block the server for seconds');
});
test('root snapshots keep scalar namespaces and separate object namespaces',async()=>{
 const store=new RealtimeStore({query:async()=>({rows:[{namespace:'counter',node_key:'',data:3},{namespace:'chat',node_key:'m1',data:{text:'one'}},{namespace:'chat',node_key:'m2',data:{text:'two'}}]})});
 assert.deepEqual(await store.get(''),{counter:3,chat:{m1:{text:'one'},m2:{text:'two'}}});
});
