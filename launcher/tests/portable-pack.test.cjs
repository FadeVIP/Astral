const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {args,inspectPortable,validPortable}=require('../src/portable-pack.cjs');
const {PackAnalyzer}=require('../src/catalog-analyze.cjs');const {Installer}=require('../src/install.cjs');const {normalize}=require('../src/catalog.cjs');const {zipFixture}=require('./zip-fixture.cjs');
test('portable launch has fixed entry point and rejects command-like nicknames and invalid memory',()=>{assert.throws(()=>args('a;bad',4096));assert.throws(()=>args('Tester',1));const a=args('Tester',6144);assert(a.includes('AstraBootstrap'));assert(a.includes('-Xmx6144m'));assert(!a.some(x=>x.includes('powershell')));});
test('portable archives import and install bundled runtime without requesting vanilla Java or Forge',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astra-portable-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const zip=path.join(dir,'source.zip');await fs.writeFile(zip,zipFixture(Object.entries({'astra-portable.json':JSON.stringify({schema:1,minecraft:'1.7.10',forge:'10.13.4.1614'}),'mods/example.jar':'test','AstraBootstrap.class':'bootstrap','client.jar':'client','runtime/bin/java.exe':'runtime','assets/indexes/1.7.10.json':'{}'})));
 const hash=await require('../src/install.cjs').hashFile(zip),size=(await fs.stat(zip)).size;
 let downloads=0;const download=async o=>{assert(o.driveFileId);downloads++;await fs.mkdir(path.dirname(o.destination),{recursive:true});await fs.copyFile(zip,o.destination);return {sha256:hash,bytes:size};};
 const analyzer=new PackAnalyzer(path.join(dir,'analysis'),()=>{},require('../pack.json'),{download,json:()=>{throw Error('Unexpected version network request');}});
 const input={name:'ASTRA',version:'1',minecraft:'1.7.10',forge:'10.13.4.1614',driveUrl:'https://drive.google.com/file/d/abcdefghijklm/view'};
 const result=await analyzer.analyze(input,new AbortController().signal);assert(validPortable(result.pack));
 const installer=new Installer(path.join(dir,'games'),{...result.pack,id:'pack-portable'},()=>{},{download});await installer.install(4096,new AbortController().signal);assert(await installer.installed());assert.equal(downloads,2);assert.equal(installer.javaPath,path.join(installer.gameDirectory,'runtime/bin/java.exe'));
 assert.throws(()=>normalize('pack-bad',{...result.pack,java:{...result.pack.java,url:'https://evil.invalid/java.exe'}}));
 await assert.rejects(inspectPortable(installer.gameDirectory,{minecraft:'1.20.1',forge:''}));
});

