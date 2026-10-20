const {test}=require('node:test');
const assert=require('node:assert/strict');
const {period,summary,report}=require('../../pack-reports.cjs');
test('Berlin report boundary respects summer and winter time',()=>{
 assert.equal(period('2026-10-17T18:59:59Z'),'2026-10-17');
 assert.equal(period('2026-10-17T19:00:00Z'),'2026-10-18');
 assert.equal(period('2026-10-25T19:59:59Z'),'2026-10-25');
 assert.equal(period('2026-10-25T20:00:00Z'),'2026-10-26');
});
test('weekly visitors are deduplicated and peaks are not summed',()=>{
 const days={'2026-10-16':{visitors:{a:true,b:true},peak:2},'2026-10-17':{visitors:{a:true,c:true},peak:3}};
 assert.deepEqual(summary(days,'2026-10-17',7),{count:3,peak:3});
 assert.deepEqual(summary(days,'2026-10-17',1),{count:2,peak:3});
});
test('incomplete history does not pretend to provide a comparison',()=>{
 assert.equal(report({},'2026-10-17',1,'2026-10-17').embeds[0].fields[2].value,'Недостаточно истории');
 const days={'2026-10-17':{visitors:{a:true}},'2026-10-16':{visitors:{a:true,b:true}}};
 assert.equal(report(days,'2026-10-17',1,'2026-10-14').embeds[0].fields[2].value,'-1');
});
