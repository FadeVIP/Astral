const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {syncMinePass}=require('../src/minepass-sync.cjs');
const {validate}=require('../../minepass-schema.js');
const baseline=require('../../assets/minepass/default.json');
test('MinePass config rejects invalid weights, duplicate FTB bindings and changed quest conditions',()=>{
 validate(baseline);let c=structuredClone(baseline);c.chests.common[0].weight=0;assert.throws(()=>validate(c));
 c=structuredClone(baseline);c.quests[0].target='minecraft:pig';assert.throws(()=>validate(c,baseline),/условия/);
 c=structuredClone(baseline);for(const id of ['external_a','external_b'])c.quests.push({id,title:id,kind:'external',target:'ftbquests:0123456789abcdef',goal:1,points:100,key:'common'});assert.throws(()=>validate(c),/уникальное/);
});
test('MinePass sync saves increasing publications and preserves valid settings on failures',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-pass-'));const file=path.join(dir,'config/astral-minepass/published.json');
 const response=(revision,config=baseline)=>async()=>new Response(JSON.stringify({fields:{revision:{integerValue:String(revision)},config:{stringValue:JSON.stringify(config)}}}));
 try{assert.equal(await syncMinePass(dir,response(2)),true);const before=await fs.readFile(file,'utf8');assert.equal(await syncMinePass(dir,response(1)),false);await assert.rejects(syncMinePass(dir,response(3,{})));await assert.rejects(syncMinePass(dir,async()=>{throw Error('offline');}));assert.equal(await fs.readFile(file,'utf8'),before);assert.equal(await syncMinePass(dir,response(3)),true);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
