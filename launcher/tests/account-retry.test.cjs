const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('website quota cooldown stops reads and writes without clearing authentication',async()=>{
 let calls=0;const auth={currentUser:{getIdToken:async()=>'token'}};
 const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../account-api.js'),'utf8').replace(/^import .*;\r?\n/,'').replaceAll('export ','');
 const ctx=vm.createContext({AbortSignal,fetch:async()=>{calls++;return Response.json({}, {status:429});}});vm.runInContext(source+';globalThis.make=apiFor;',ctx);
 const request=ctx.make(auth);await assert.rejects(request('/members/test'),e=>e.status===429);await assert.rejects(request('/members/test'),e=>e.status===429);await assert.rejects(request('/accountWallets/test','PATCH',{}),e=>e.status===429);assert.equal(calls,1);assert.ok(auth.currentUser);
});
test('website retains signed-in state while profile is unavailable and retries without a password',async()=>{
 const nodes=new Map(),node=()=>({hidden:false,value:'',textContent:'',after(){},append(){},replaceChildren(){},addEventListener(){}}),get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};let authListener,attempt=0;const timers=[];
 const auth={currentUser:{uid:'user'}};
 const ctx=vm.createContext({document:{getElementById:get,createElement:node},initializeApp:()=>({}),getAuth:()=>auth,onAuthStateChanged:(_,cb)=>{authListener=cb;},apiFor:()=>async route=>{if(route.startsWith('/members')){attempt++;if(attempt===1){const e=Error('Quota exceeded');e.status=429;throw e;}return {nickname:'Tester',status:'active'};}return null;},decode:x=>x,encode:x=>x,Image:class{},CosmeticArt:{draw(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},signOut:async()=>{},window:{},fetch:async()=>Response.json({})});
 ctx.window=ctx;ctx.__FROSTBORNE_FIREBASE_CONFIG__={databaseURL:'https://example.invalid'};
 let source=fs.readFileSync(require('node:path').resolve(__dirname,'../../account.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace("await import('/cosmetics-shop.js');",'');vm.runInContext(source,ctx);
 authListener(auth.currentUser);await new Promise(r=>setImmediate(r));assert.equal(get('account-login').hidden,true);assert.equal(get('account-content').hidden,true);assert.match(get('account-status').textContent,/Вход подтверждён/);assert.equal(timers[0].ms,300000);
 timers[0].fn();await new Promise(r=>setImmediate(r));assert.equal(get('account-content').hidden,false);assert.equal(ctx.state.user.nickname,'Tester');
});
