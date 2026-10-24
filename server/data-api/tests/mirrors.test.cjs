'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {snapshotAdapter}=require('../mirrors.cjs');
const {ROOT}=require('../store.cjs');
test('SQL snapshots deliver current collection and nested paths without Firestore',()=>{
 const source=snapshotAdapter(),seen=[];
 const stop=source.admin.firestore().collection('accountSkins').onSnapshot(s=>seen.push(s.docs.map(d=>[d.id,d.data()])));
 source.publish([{name:ROOT+'accountSkins/alice',fields:{model:{stringValue:'slim'}}},{name:ROOT+'accountSkins/alice/history/one',fields:{}}]);
 assert.deepEqual(seen,[[['alice',{model:'slim'}]]]);
 source.publish([],['members/u1']);assert.equal(seen.length,1);
 source.publish([],['accountSkins/alice']);assert.deepEqual(seen[1],[]);
 stop();source.publish([]);assert.equal(seen.length,2);
});
