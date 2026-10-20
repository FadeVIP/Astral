const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const lan=require('../src/lan.cjs');
const pack={id:'astral',minecraft:'1.20.1',forge:'47.4.20'};
test('LAN defaults on per supported pack and respects explicit opt-out',()=>{
 assert.equal(lan.enabled({},pack),true);
 assert.equal(lan.enabled({lanLocalProfiles:{astral:false}},pack),false);
 assert.equal(lan.enabled({lanLocalProfiles:{astral:false}},{...pack,id:'other'}),true);
 assert.equal(lan.enabled({},{...pack,minecraft:'1.7.10'}),false);
});
test('LAN agent is present, outside mods, and never injected for unsupported or disabled launches',()=>{
 const root=fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'astral-lan-'));const args=lan.args({pack,root});assert.equal(args.length,2);
 const file=args[1].slice('-javaagent:'.length);assert.ok(fs.existsSync(file));assert.ok(!file.includes('/mods/'));fs.writeFileSync(file,'damaged');lan.args({pack,root});assert.ok(fs.readFileSync(file).equals(fs.readFileSync(require('node:path').join(__dirname,'../assets/astral-lan-agent.jar'))));fs.rmSync(root,{recursive:true,force:true});
 assert.deepEqual(lan.args({pack,allowLanLocalProfiles:false}),[]);
 assert.equal(lan.supported({...pack,forge:'47.4.23',id:'new-pack'}),true);
 assert.deepEqual(lan.args({pack:{...pack,minecraft:'1.21.1',forge:'52.0.0'}}),[]);
});
