const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../../minepass-schema.js');
const base=require('../../assets/minepass/default.json');
test('history preserves original rewards, survives deletion and does not duplicate runs',()=>{
 const {archiveRuns}=require('../../minepass-schema.js'),old=structuredClone(base);old.events=[{...old.events[0],id:'test',runId:'first',startsAt:1000,endsAt:61000}];
 const next=structuredClone(old);next.events[0].runId='second';next.events[0].points=123;archiveRuns(next,old,'restarted',2000);validate(next,old);
 assert.equal(next.eventHistory[0].event.runId,'first');assert.equal(next.eventHistory[0].event.points,old.events[0].points);
 const removed=structuredClone(next);removed.events=[];archiveRuns(removed,next,'removed',3000);validate(removed,next);assert.equal(removed.eventHistory.length,2);
 archiveRuns(removed,next,'removed',4000);assert.equal(removed.eventHistory.length,2);assert.equal(old.eventHistory,undefined);
});
test('event editor rejects duplicate runs, invalid rewards, impossible participation and active-run edits',()=>{
 const c=structuredClone(base);c.events=[{id:'hunt',title:'Охота',kind:'kill',target:'minecraft:zombie',goal:10,minimum:2,perPlayerCap:10,points:0,coins:100,key:'',keyCount:0,crateCount:0,rewards:[{item:'minecraft:diamond',label:'Алмаз',count:2,tier:'gold'}],runId:'run1',startsAt:1000,endsAt:61000}];
 validate(c);const previous=structuredClone(c);
 c.events[0].coins=999;assert.throws(()=>validate(c,previous),/остановите/);c.events[0].runId='run2';validate(c,previous);
 c.events[0].minimum=11;assert.throws(()=>validate(c));c.events[0].minimum=2;
 c.events[0].rewards[0].count=65;assert.throws(()=>validate(c));c.events[0].rewards[0].count=2;
 c.events.push({...c.events[0],id:'another'});assert.throws(()=>validate(c),/запуск/);
 c.events=[];validate(c,previous);
});
