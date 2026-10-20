// Isolated Firestore emulator; no production credentials, endpoints, or accounts.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),{encode}=require('../src/catalog.cjs');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'launcher/.test-data/emulator'),port=18793,project='demo-astral-cosmetics',origin='http://127.0.0.1:'+port,base=origin+'/v1/projects/'+project+'/databases/(default)/documents',name='projects/'+project+'/databases/(default)/documents';
const block=fs.readFileSync(path.join(root,'launcher/tools/cosmetics-rules.txt'),'utf8'),source=fs.readFileSync(path.join(root,'launcher/firestore.rules'),'utf8'),rules=source.includes('function cosmeticPurchase')?source:source.replace('    match /{document=**}',()=>block+'\n    match /{document=**}');fs.writeFileSync(path.join(dir,'firestore.rules'),rules);
const log=fs.openSync(path.join(dir,'test.log'),'w'),java=path.join(root,'local-packs/ASTRA-TechnoMagic-1.7.10/runtime/bin/java.exe'),child=spawn(java,['-Duser.language=en','-Duser.country=US','-jar',path.join(dir,'firestore.jar'),'--host','127.0.0.1','--port',String(port),'--project_id',project,'--rules',path.join(dir,'firestore.rules')],{windowsHide:true,stdio:['ignore',log,log]});
const jwt=uid=>Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,user_id:uid,aud:project,iss:'https://securetoken.google.com/'+project,email:uid+'@example.invalid',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'password'}})).toString('base64url')+'.';
const req=(route,method='GET',data,token=jwt('alice'))=>fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
const put=(route,data,token='owner')=>req(route,'PATCH',{fields:encode(data).mapValue.fields},token);
async function status(r,code,label){const response=await r,text=await response.text();assert.equal(response.status,code,label+' '+text.slice(0,160));console.log('PASS '+label);}
function buy(id,balance,token=jwt('alice'),extra=[]){return req(':commit','POST',{writes:[{update:{name:name+'/accountWallets/alice',fields:encode({balance,purchase:id}).mapValue.fields}},{update:{name:name+'/cosmeticOwners/alice/items/'+id,fields:encode({item:id}).mapValue.fields},currentDocument:{exists:false}},...extra]},token);}
(async()=>{try{let ready=false;for(let i=0;i<90;i++){try{const r=await fetch(origin);if(r.status){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready,'emulator start');
 await status(put('/members/alice',{nickname:'Alice',status:'active'}),200,'seed isolated member');await put('/members/admin',{nickname:'Admin',status:'active'});await put('/launcherAdmins/admin',{enabled:true});await put('/accountWallets/alice',{balance:200});
 for(const [id,kind,price] of [['cape','cape',100],['hat','hat',0],['halo','halo',10],['wings','wings',10],['aura','aura',10],['expensive','cape',1000]])await put('/cosmeticCatalog/'+id,{kind,name:id,price,enabled:true,design:0,color:'#ba8dff',rarity:'common'});
 await status(put('/accountWallets/alice',{balance:999},jwt('alice')),403,'cannot mint Acoin');
 await status(put('/cosmeticCatalog/forged',{price:0},jwt('alice')),403,'cannot edit catalog');
 await status(put('/cosmeticOwners/alice/items/cape',{item:'cape'},jwt('alice')),403,'cannot grant own items');
 await status(buy('cape',200),403,'cannot buy without paying');
 await status(buy('expensive',-800),403,'cannot overdraw');
 await status(buy('cape',100),200,'atomic purchase');
 await status(buy('cape',0),403,'duplicate purchase blocked');
 await status(buy('hat',100),200,'free item');
 await status(buy('halo',90),200,'second category');await status(buy('wings',80),200,'wings');await status(buy('aura',70),200,'aura');
 let equipped={uid:'alice'};for(const kind of ['cape','hat','halo','wings','aura']){equipped[kind]=kind;await status(put('/accountCosmetics/alice',equipped,jwt('alice')),200,'equip '+kind);}
 await status(put('/accountCosmetics/alice',{...equipped,cape:'expensive'},jwt('alice')),403,'cannot equip unowned');
 await status(put('/accountCosmetics/bob',equipped,jwt('alice')),403,'cannot change another player');
 await status(req('/accountWallets/alice','GET',undefined,jwt('bob')),403,'wallet private');
 await status(req('/accountCosmetics/alice','GET',undefined,''),200,'equipped public for LAN');
 await status(put('/supportTickets/test',{uid:'alice',nickname:'Alice',subject:'Test',status:'open'},jwt('alice')),200,'create private ticket');
 await status(req('/supportTickets/test','GET',undefined,jwt('bob')),403,'ticket private');
 const message=(admin,uid)=>req(':commit','POST',{writes:[{update:{name:name+'/supportTickets/test/messages/'+uid+admin,fields:encode({uid,text:'Hello',admin}).mapValue.fields},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]},jwt(uid));
 await status(message(false,'alice'),200,'player message');await status(message(true,'alice'),403,'cannot impersonate support');await status(message(true,'admin'),200,'administrator answer');
 await status(put('/accountWallets/alice',{balance:500},jwt('admin')),200,'administrator can issue Acoin');

 await put('/members/bob',{nickname:'Bob',status:'active'});
 await status(put('/playerFriends/alice~bob',{from:'alice',to:'bob',status:'pending'},jwt('alice')),200,'send friend invite');
 for(const field of ['from','to'])await status(req(':runQuery','POST',{structuredQuery:{from:[{collectionId:'playerFriends'}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:'bob'}}},limit:100}},jwt('bob')),200,'query friends '+field);
 await status(put('/playerFriends/alice~bob',{from:'alice',to:'bob',status:'accepted'},jwt('alice')),403,'sender cannot accept own invitation');
 await status(put('/playerFriends/alice~bob',{from:'alice',to:'bob',status:'accepted'},jwt('bob')),200,'recipient accepts');
 const presence=(as,nick)=>req(':commit','POST',{writes:[{update:{name:name+'/playerPresence/'+nick,fields:encode({uid:as,pack:'Astral',playing:true}).mapValue.fields},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]},jwt(as));
 await status(presence('bob','bob'),200,'own presence');await status(presence('alice','bob'),403,'cannot impersonate presence');
 await status(req('/playerPresence/bob','GET',undefined,jwt('alice')),200,'accepted friend sees presence');
 await status(req('/playerPresence/bob','GET',undefined,jwt('admin')),403,'unrelated account cannot see presence');
 const gift=as=>req(':commit','POST',{writes:[{update:{name:name+'/playerInbox/alice/messages/test',fields:encode({text:'Gift'}).mapValue.fields},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]},jwt(as));
 await status(gift('alice'),403,'player cannot forge gift');await status(gift('admin'),200,'admin gift message');
 await status(req('/playerInbox/alice/messages/test','GET',undefined,jwt('bob')),403,'inbox private');
 await status(req('/playerInbox/alice/messages/test','GET'),200,'owner sees gift');
 fs.writeFileSync(path.join(root,'launcher/artifacts/player-rules-tested.json'),JSON.stringify({passed:true,sha256:require('crypto').createHash('sha256').update(rules).digest('hex')}));
 const report={rulesSha256:require('crypto').createHash('sha256').update(block).digest('hex'),passed:true,at:new Date().toISOString()};fs.writeFileSync(path.join(root,'launcher/artifacts/cosmetics-emulator-result.json'),JSON.stringify(report,null,2));console.log('COSMETICS_EMULATOR_PASS');
 }finally{child.kill();fs.closeSync(log);}})().catch(e=>{console.error(e.message);process.exitCode=1});
