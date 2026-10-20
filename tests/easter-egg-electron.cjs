const {app,BrowserWindow,session}=require('electron');const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'astral-star-test-')));
const root=path.resolve(__dirname,'..');let server,window;
const mock=`window.store??={};const auth=window.auth??={currentUser:null,authStateReady:async()=>{}};export const initializeApp=()=>({}),getApps=()=>[],getAuth=()=>auth,getFirestore=()=>({}),doc=(db,c,id)=>c+'/'+id,serverTimestamp=()=>123;
export async function signInAnonymously(){window.logins=(window.logins||0)+1;auth.currentUser={uid:'guest'};return {user:auth.currentUser};}
export async function getDoc(ref){const d=window.store[ref];return {exists:()=>!!d,data:()=>d};}
export async function setDoc(ref,data){window.commits=(window.commits||0)+1;if(window.fail)throw Error('offline');window.store[ref]=data;}`;
app.whenReady().then(async()=>{try{
 await session.defaultSession.protocol.handle('https',()=>new Response(mock,{headers:{'Content-Type':'text/javascript','Access-Control-Allow-Origin':'*'}}));
 server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="stylesheet" href="/easter-egg.css"></head><body style="background:#100d21;color:white"><section id="top" style="position:relative;height:700px"><h1>Astral</h1></section><script>window.__FROSTBORNE_FIREBASE_CONFIG__={}</script><script type="module" src="/easter-egg.js"></script></body></html>');}else if(['/easter-egg.css','/easter-egg.js'].includes(name)){res.setHeader('Content-Type',name.endsWith('js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(root,name)));}else{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 window=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{contextIsolation:true,nodeIntegration:false}});await window.loadURL('http://127.0.0.1:'+server.address().port);const js=s=>window.webContents.executeJavaScript(s);const wait=async s=>{for(let i=0;i<100;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout '+s)};


 await js("document.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:150,clientY:180,bubbles:true}))");
 assert.equal(await js("document.querySelectorAll('.astral-click-star').length"),12);assert.equal(await js("document.querySelectorAll('.astral-nova-ring').length"),0);
 await new Promise(r=>setTimeout(r,1050));assert.equal(await js("document.querySelectorAll('.astral-click-burst').length"),0);
 await wait("!!document.querySelector('.astral-secret-star')");await js("document.querySelector('.astral-secret-star').click()");
 await js("document.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:250,clientY:180,bubbles:true}))");
 assert.equal(await js("document.querySelectorAll('.astral-click-burst--nova .astral-click-star').length"),16);
 assert.equal(await js("document.querySelectorAll('.astral-nova-ring').length"),1);
 await new Promise(r=>setTimeout(r,1150));assert.equal(await js("document.querySelectorAll('.astral-click-burst').length"),0);
 assert.equal(await js("document.querySelector('form').hidden"),true);assert.equal(await js('window.logins||0'),0);
 fs.writeFileSync(path.join(root,'launcher/artifacts/secret-reveal.png'),(await window.webContents.capturePage()).toPNG());
 await js("document.querySelector('.secret-reveal .secret-claim').click()");
 await js("document.querySelector('[name=nickname]').value='StarFinder';window.fail=true;document.querySelector('form').requestSubmit()");await wait("document.querySelector('.secret-status').textContent.includes('Не удалось записать')");
 await js("window.fail=false;document.querySelector('form').requestSubmit()");await wait("document.querySelector('.secret-again').hidden===false");assert.equal(await js("window.store['siteStarFinders/guest_starfinder'].nickname"),'StarFinder');
 await js("document.querySelector('.secret-again').click();document.querySelector('[name=nickname]').value='AnotherStar';document.querySelector('form').requestSubmit()");await wait("document.querySelector('.secret-again').hidden===false");assert.equal(await js('Object.keys(window.store).length'),2);
 await js("document.querySelector('.secret-again').click();document.querySelector('[name=nickname]').value='StarFinder';document.querySelector('form').requestSubmit()");await wait("document.querySelector('.secret-again').hidden===false");assert.equal(await js('Object.keys(window.store).length'),2);
 await js("document.querySelector('dialog').close();document.querySelector('.astral-secret-star').click()");assert.equal(await js("document.querySelector('form').hidden"),true);
 await window.setSize(390,740);assert(await js("document.querySelector('dialog').getBoundingClientRect().width<=innerWidth"));
 assert.equal(await js("document.documentElement.classList.contains('secret-rose')"),true);
 await window.reload();await wait("!!document.querySelector('.astral-secret-star')");assert.equal(await js("document.documentElement.classList.contains('secret-rose')"),true);
 await js("document.querySelector('.astral-secret-star').click();document.querySelector('.secret-theme-toggle').click()");assert.equal(await js("document.documentElement.classList.contains('secret-rose')"),false);
 await window.reload();await wait("!!document.querySelector('.astral-secret-star')");assert.equal(await js("document.documentElement.classList.contains('secret-rose')"),false);
 console.log('PASS theme persistence and opt-out; intro before nickname, offline retry, multiple nicknames, duplicate retry, mobile layout');
 }catch(e){console.error(e);process.exitCode=1;}finally{window?.destroy();server?.close();app.quit();}});
