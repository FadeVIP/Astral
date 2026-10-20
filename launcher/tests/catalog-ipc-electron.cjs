'use strict';
const {app}=require('electron');app.disableHardwareAcceleration();
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const assert=require('node:assert/strict');
const root=path.resolve(process.env.ASTRAL_SMOKE_APP || path.join(__dirname,'..'));
const {encode}=require(path.join(root,'src/catalog.cjs'));const builtin=require(path.join(root,'pack.json'));builtin.firebase.publicData=false;const {zipFixture}=require('./zip-fixture.cjs');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'Astral catalog UI '));app.setPath('userData',profile);
const coverPath=path.join(profile,'custom.webp');fs.writeFileSync(coverPath,fs.readFileSync(path.join(root,'assets/hero-bg.webp')));
let cancelCover=false,confirmDelete=false,trashed=null;
require("electron").dialog.showMessageBox=async()=>({response:confirmDelete?1:0});
require("electron").shell.trashItem=async target=>{trashed=target;};
require('electron').dialog.showOpenDialog=async()=>({canceled:cancelCover,filePaths:cancelCover?[]:[coverPath]});
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({directory:path.join(profile,'game'),ramMB:4096}));
let admin=true,signed=true,writeCount=0,appearanceDoc=null,themeDoc=null;const documents=new Map();
const fakeFirebase=async(url,options={})=>{
 if(url.includes('/launcherAdmins/'))return Response.json({fields:encode({enabled:admin}).mapValue.fields});
 if(url.includes('/launcherThemes/')){
  if(options.method==='PATCH'){if(!admin)return Response.json({},{status:403});themeDoc={fields:JSON.parse(options.body).fields,updateTime:new Date().toISOString()};return Response.json(themeDoc);}
  return themeDoc?Response.json(themeDoc):Response.json({},{status:404});
 }
 if(url.includes('/launcherAppearance/')){
  if(options.method==='PATCH'){appearanceDoc={fields:JSON.parse(options.body).fields,updateTime:new Date().toISOString()};return Response.json(appearanceDoc);}
  return appearanceDoc?Response.json(appearanceDoc):Response.json({},{status:404});
 }
 if(url.includes('pageSize='))return Response.json({documents:[...documents.values()]});
 const id=new URL(url).pathname.split('/').pop();
 if(options.method==='DELETE'){if(!admin)return Response.json({},{status:403});documents.delete(id);return Response.json({});}
 if(options.method==='PATCH') {if(!admin)return Response.json({},{status:403});const doc={name:'projects/p/databases/(default)/documents/launcherPacks/'+id,fields:JSON.parse(options.body).fields,updateTime:new Date().toISOString()};documents.set(id,doc);writeCount++;return Response.json(doc);}
 return documents.has(id)?Response.json(documents.get(id)):Response.json({},{status:404});
};
require(path.join(root,'src/auth.cjs')).AuthService=class {
 constructor(){this.fetcher=fakeFirebase;this.session={uid:'ui-admin',idToken:'isolated-test-token'};}
 async restore(){} async refresh(){} async requireAccess(){if(!signed)throw Error('signed out');return this.publicUser();}
 publicUser(){return signed?{uid:'ui-admin',nickname:'Lacost',status:'active',email:'test@example.invalid'}:null;}
 async logout(){signed=false;this.session=null;}
};
const moduleAnalyzer=require(path.join(root,'src/catalog-analyze.cjs'));const RealAnalyzer=moduleAnalyzer.PackAnalyzer;
moduleAnalyzer.PackAnalyzer=class extends RealAnalyzer {
 constructor(dir,report,pack){super(dir,report,pack,{download:async options=>{const b=options.driveFileId?zipFixture([['mods/test.jar','mod']]):zipFixture([['install_profile.json',JSON.stringify({minecraft:'1.20.1'})],['version.json','{}']]);await fs.promises.writeFile(options.destination,b);return {bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};},json:async url=>url.includes('version_manifest')?{versions:[{id:'1.20.1',type:'release',url:'https://piston-meta.mojang.com/test.json'}]}:{javaVersion:{majorVersion:17}}});}
};
require(path.join(root,'src/server-connection.cjs')).serverConnection=()=>({status:async()=>({state:'online',online:12,max:100,latency:45,checkedAt:Date.now()})});
const deadline=setTimeout(()=>{console.error('CATALOG_IPC_TIMEOUT');app.exit(1);},45000);
const catalogModule=require(path.join(root,'src/modrinth.cjs'));
catalogModule.Modrinth=class{async search(){return {total:1,hits:[{id:'project1',title:'Тестовый мод',description:'Каталог с совместимыми версиями и зависимостями.',author:'Astral QA',downloads:12345}]};}async versions(){return {project:{id:'project1',title:'Тестовый мод',kind:'mod'},versions:[{id:'version1',name:'1.0',channel:'release',date:'2026-10-08'}]};}async plan(){return {id:'plan',files:[{title:'Тестовый мод',version:'1.0',bytes:123}],warnings:[]};}async import(){return [{source:'modrinth',path:'mods/Catalog-test.jar',url:'https://cdn.modrinth.com/data/project1/versions/version1/Catalog-test.jar',projectId:'project1',versionId:'version1',bytes:123,sha256:'b'.repeat(64),title:'Тестовый мод',version:'1.0'}];}};
app.on('browser-window-created',(_,win)=>{
 win.show=()=>{};win.webContents.setBackgroundThrottling(false);win.webContents.once('did-finish-load',async()=>{
 if(win.webContents.getURL().includes('/startup.html'))return;
  const js=code=>win.webContents.executeJavaScript(code);
  const call=(name,value)=>js(`window.astral[${JSON.stringify(name)}](${JSON.stringify(value)})`);
  const waitFor=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('UI did not reach: '+code);};
  const screenshot=async name=>{win.showInactive();await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await new Promise(r=>setTimeout(r,600));const dir=path.resolve(__dirname,'../artifacts');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),(await win.webContents.capturePage()).toPNG());};
  try{
   assert.equal((await call('refreshCatalog')).value.admin,true);await js('refresh()');
   await js("document.getElementById('adminNav').click()");await waitFor("!document.getElementById('adminView').hidden");
   await js("document.getElementById('atmoOpen').click()");await waitFor("!document.getElementById('atmoEditor').hidden");
   assert.equal(await js("document.querySelectorAll('#atmoPreviewButtons button').length"),8);
   await js("document.getElementById('atmoLabel').value='Начать игру';document.getElementById('atmoLabel').dispatchEvent(new Event('input'));document.getElementById('atmoSave').click()");await waitFor("document.getElementById('atmoStatus').textContent.includes('Черновик сохранён')");
   await js("document.getElementById('atmoImage').click()");await waitFor("!document.getElementById('atmoImage').disabled");
   await js("document.getElementById('atmoPublish').click()");await waitFor("document.getElementById('atmoStatus').textContent.includes('Опубликована версия 1')");
   assert.equal(JSON.parse(themeDoc.fields.config.stringValue).buttons[0].label,'Начать игру');
   assert.match(JSON.parse(themeDoc.fields.config.stringValue).backgroundImage,/^data:image\/jpeg/);
   await screenshot('atmosphere-editor.png');
   await js("document.getElementById('atmoOpen').click();document.getElementById('homeNav').click()");
   assert.equal(await js("document.getElementById('adminNav').hidden"),false);
   const initialState=(await call('state')).value;
   const agentArgs=require(path.join(root,'src/lan.cjs')).args({root:path.join(profile,'game'),pack:{minecraft:'1.20.1',forge:'47.4.20'}});
   const extractedAgent=agentArgs.find(a=>a.startsWith('-javaagent:')).slice(11);
   assert.ok(!extractedAgent.includes('app.asar'));
   assert.ok(fs.readFileSync(extractedAgent).equals(fs.readFileSync(path.join(root,'assets/astral-lan-agent.jar'))));
   assert.equal(await js("document.getElementById('lanLocalProfiles').checked"),true);
   assert.equal((await call('setLanLocalProfiles',false)).value.settings.lanLocalProfiles.astral,false);
   await js('refresh()');assert.equal(await js("document.getElementById('lanLocalProfiles').checked"),false);
   assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).lanLocalProfiles.astral,false);
   assert.equal((await call('setLanLocalProfiles','false')).ok,false);
   assert.equal((await call('setLanLocalProfiles',true)).value.settings.lanLocalProfiles.astral,true);
   for(const theme of ['light','dark','star']){assert.equal((await call('setTheme',theme)).value.settings.theme,theme);await js('refresh()');await js("document.getElementById('settingsNav').click()");assert.equal(await js('document.body.dataset.theme'),theme);await screenshot('theme-'+theme+'.png');}
   assert.equal((await call('setTheme','invalid')).ok,false);
   assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).theme,'star');
   await js('showView(false)');
   assert.ok(initialState.pack.coverImage.startsWith('data:image/jpeg;base64,'));
   await js("document.getElementById('adminNav').click()");await waitFor("!document.getElementById('adminView').hidden");
   await js("document.querySelector('.admin-pack-item[data-pack-id=astral]').click()");
   assert.equal(await js("document.getElementById('packDrive').disabled"),false);
   assert.equal(await js("document.getElementById('analyzePack').hidden"),false);
   assert.equal(await js("document.getElementById('publishPack').disabled"),false);
   await screenshot('builtin-appearance-editor.png');
   await js("document.getElementById('contentOpen').click()");await waitFor("!adminWorking && !document.getElementById('contentBody').hidden");
   assert.ok(await js('contentBase.length>0'));
   await js("document.getElementById('contentSearch').value='mods/';document.getElementById('contentSearch').dispatchEvent(new Event('input'))");
   await js("document.querySelector('#contentFiles button').click();document.getElementById('contentVersion').value='QA 1';document.getElementById('contentSave').click()");await waitFor('!adminWorking');
   assert.equal(await js('contentDraft.remove.length'),1);
   await js("document.getElementById('contentStudio').scrollIntoView({block:'start'})");await screenshot('content-editor.png');
   await js("document.getElementById('contentReset').click()");await waitFor('!adminWorking');assert.equal(await js('contentDraft.remove.length'),0);
   await js("document.getElementById('packName').value='Astral · Новый облик';document.getElementById('packDescription').value='Новый фон основного мира';document.getElementById('packForm').requestSubmit()");
   await waitFor('!adminWorking');
   const styledState=(await call('state')).value;
   assert.equal(styledState.pack.name,'Astral · Новый облик');assert.equal(styledState.pack.showServer,false);await js('refresh()');assert.equal(await js("document.getElementById('serverCard')===null"),true);assert.equal((await call('serverStatus')).value.state,'hidden');
   for(const field of ['id','version','minecraft','forge','archiveBytes','serverAddress'])assert.equal(styledState.pack[field],initialState.pack[field]);
   assert.equal(writeCount,1,'main pack is editable through the catalogue');
   await js("document.getElementById('newPack').click()");
   const values={packName:'Astral · Забытый мир',packVersion:'1.0',packDescription:'Древние руины, магия и приключения. Выбери свой путь в новом мире.',packDrive:`https://drive.google.com/file/d/${builtin.driveFileId}/view`,packMinecraft:'1.20.1',packForge:'47.4.20'};
   await js(`for(const [id,value] of Object.entries(${JSON.stringify(values)})){document.getElementById(id).value=value;}document.querySelector('input[name=packCover][value=forest]').checked=true;document.getElementById('packForm').dispatchEvent(new Event('input'));`);
   await js("document.getElementById('choosePackCover').click()");await waitFor("!adminWorking && customCoverImage.startsWith('data:image/jpeg;base64,')");
   await waitFor("document.getElementById('customCoverPreview').naturalWidth>0");
   const cover=await js('customCoverImage');assert.ok(cover.length<=180000);
   const coverSize=require('electron').nativeImage.createFromDataURL(cover).getSize();assert.ok(coverSize.width<=1280 && coverSize.height<=720);
   fs.mkdirSync(path.resolve(__dirname,'../.test-data'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../.test-data/custom-cover-fixture.json'),JSON.stringify({image:cover}));
   cancelCover=true;await js("document.getElementById('choosePackCover').click()");await waitFor('!adminWorking');assert.equal(await js('customCoverImage'),cover);cancelCover=false;
   assert.equal(await js("document.getElementById('publishPack').disabled"),true);
   await js("document.getElementById('analyzePack').click()");await waitFor("!document.getElementById('publishPack').disabled");
   await screenshot('catalog-admin.png');
   await js("document.getElementById('packForm').requestSubmit()");await waitFor("!adminWorking && editingPack !== null");assert.equal(writeCount,2);
   const catalogState=(await call('state')).value;assert.equal(catalogState.packs.length,2);assert.equal(JSON.stringify(catalogState).includes('isolated-test-token'),false);
   assert.equal(catalogState.packs[1].coverImage,cover);
   const id=catalogState.packs[1].id;assert.equal((await call('selectPack',id)).value.pack.id,id);
   await js('refresh().then(()=>showView(false))');await js("document.getElementById('notice').hidden=true");await screenshot('catalog-library.png');
   await waitFor("!document.getElementById('heroCustomCover').hidden && document.getElementById('heroCustomCover').naturalWidth>0");
   await win.setSize(920,700);await new Promise(r=>setTimeout(r,100));assert.equal(await js('document.documentElement.scrollWidth > innerWidth'),false);
   await screenshot('catalog-library-compact.png');
   assert.equal(await js("document.getElementById('packCards').getBoundingClientRect().bottom <= document.getElementById('packHero').getBoundingClientRect().top"),true,'library must not overlap cover');
   await js("document.getElementById('launcherUpdateBanner').hidden=false;document.getElementById('launcherUpdateMessage').textContent='Новая версия готова к установке';document.getElementById('homeView').scrollTop=0");
   assert.equal(await js("document.getElementById('launcherUpdateBanner').getBoundingClientRect().bottom <= document.querySelector('#homeView .library-heading').getBoundingClientRect().top"),true,'update banner must precede library');
   await screenshot('atlas-update-compact.png');
   await js("document.getElementById('settingsNav').click();document.getElementById('notice').hidden=true");await screenshot('atlas-settings-compact.png');
   assert.equal(await js('document.documentElement.scrollWidth > innerWidth'),false);
   await win.setSize(1180,790);await js("document.getElementById('settingsView').scrollTop=0");await screenshot('atlas-settings.png');
   await js("document.getElementById('adminNav').click()");await waitFor("!document.getElementById('adminView').hidden");await js("document.querySelector('.admin-pack-item:not([data-pack-id=astral])').click();document.getElementById('removePackCover').click()");
   assert.equal(await js("document.getElementById('publishPack').disabled"),false);await js("document.getElementById('packForm').requestSubmit()");await waitFor('!adminWorking');assert.equal(writeCount,3);
   assert.equal((await call('state')).value.pack.coverImage,'');
   const victim=(await call('adminPacks')).value.find(p=>p.id===id);
   assert.equal((await call('deletePack',{id,updatedAt:victim.updatedAt})).value,false);assert.equal(documents.has(id),true);
   const instance=new (require(path.join(root,'src/install.cjs')).Installer)(path.join(profile,'game'),victim).instance;fs.mkdirSync(instance,{recursive:true});
   assert.equal((await call('uninstallPack')).value,false);assert.equal(trashed,null);confirmDelete=true;
   assert.equal((await call('uninstallPack')).value,true);assert.equal(trashed,instance);
   assert.equal((await call('deletePack',{id,updatedAt:victim.updatedAt})).value,true);assert.equal(documents.has(id),false);assert.equal((await call('state')).value.pack.id,'astral');
   const builtinPack=(await call('adminPacks')).value.find(p=>p.id==='astral');await js('editPack('+JSON.stringify(builtinPack)+')');await js("document.getElementById('contentOpen').click()");await waitFor("!adminWorking&&!document.getElementById('contentBody').hidden");await js("document.getElementById('contentBrowse').click()");await waitFor("document.querySelectorAll('.catalog-card').length===1");
   for(const theme of ['light','dark','star']){await js(`document.body.dataset.theme='${theme}'`);await screenshot('modrinth-'+theme+'.png');}
   await js("document.querySelector('.catalog-card button').click()");await waitFor("document.querySelector('.catalog-detail select')!==null");await js("document.querySelector('.catalog-detail button').click()");await waitFor("document.querySelector('.catalog-detail li')!==null");await js("document.querySelector('.catalog-detail button').click()");await waitFor("!document.querySelector('.mod-catalog').open");assert.ok(await js("contentDraft.files.some(f=>f.source==='modrinth'&&f.path==='mods/Catalog-test.jar')"));
   admin=false;assert.equal((await call('refreshCatalog')).value.admin,false);assert.equal((await call('adminPacks')).ok,false);assert.equal((await call('publishPack',{})).ok,false);assert.equal((await call('state')).value.busy,false);
   assert.equal((await call('selectPackCover')).ok,false);assert.equal((await call('deletePack',{id,updatedAt: victim.updatedAt})).ok,false);
   for(const method of ['contentOpen','contentSave','contentImport','contentFolder','contentPublish','contentDriveKey','contentFolderOpen','contentExport','modCatalogSearch','modCatalogVersions','modCatalogPlan','modCatalogImport','atmosphereOpen','atmosphereSave','atmospherePublish','atmosphereImage','atmosphereExport','atmosphereImport'])assert.equal((await call(method,{id:'astral'})).ok,false,method+' must require admin');
   await call('logout');assert.equal((await call('state')).value.admin,false);
   await js("refresh().then(()=>{document.getElementById('accountButton').click();document.getElementById('notice').hidden=true;})");await waitFor("document.getElementById('authDialog').open");await screenshot('atlas-login.png');
   await js("document.getElementById('registerTab').click()");await screenshot('atlas-register.png');
   assert.equal((await call('selectPack','../other')).ok,false);
   clearTimeout(deadline);console.log('CATALOG_IPC_PASS');app.exit(0);
  }catch(error){clearTimeout(deadline);console.error(error);app.exit(1);}
 });
});
require(path.join(root,'src/main.cjs'));




