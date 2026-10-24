'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('browser realtime sends ownership and auth headers, registers server disconnect lease',async()=>{
 const calls=[];
 const source=fs.readFileSync(path.resolve(__dirname,'../../../realtime-api.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
 const context=vm.createContext({URL,URLSearchParams,AbortSignal,structuredClone,crypto,queueMicrotask,setTimeout,clearTimeout,setInterval:()=>1,document:{hidden:false},getAuth:()=>({currentUser:{uid:'alice',getIdToken:async()=>'private-token'}}),__FROSTBORNE_FIREBASE_CONFIG__:{realtimeApiUrl:'https://sql.example/api/v1/realtime'},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,headers:{get:()=>null},json:async()=>options.method==='POST'?{name:'message-1'}:{ok:true}};}});
 vm.runInContext(source+';globalThis.api={getDatabase,ref,push,set,onDisconnect};',context);
 const a=context.api,db=a.getDatabase({}),message=await a.push(a.ref(db,'chat'),{text:'hello',author:'Alice'});
 assert.equal(message.key,'message-1');assert.equal(JSON.parse(calls[0].options.body).uid,'alice');
 assert.equal(calls[0].options.headers.Authorization,'Bearer private-token');assert.ok(!calls[0].url.includes('private-token'));
 const presence=a.ref(db,'presence/tab1');await a.set(presence,{name:'Alice'});await a.onDisconnect(presence).remove();
 const lease=calls.at(-1);assert.match(lease.url,/__leases\/[a-f0-9]{32}\.json$/);assert.equal(JSON.parse(lease.options.body)[0].body,null);
 await a.onDisconnect(presence).cancel();assert.deepEqual(JSON.parse(calls.at(-1).options.body),[]);
});
