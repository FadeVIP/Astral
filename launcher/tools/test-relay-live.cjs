'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),net=require('node:net'),os=require('node:os'),fs=require('node:fs/promises'),path=require('node:path');
const {AuthService}=require('../src/auth.cjs'),{CatalogService}=require('../src/catalog.cjs'),{Social}=require('../src/social.cjs'),{DirectPlay}=require('../src/direct-play.cjs'),{client}=require('./firebase-admin.cjs'),relay=require('../src/relay-client.cjs'),router=require('../src/direct-router.cjs');
const cfg=require('../pack.json').firebase,users=[];
(async()=>{const admin=await client(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-relay-qa-')),map=router.map;let game;router.map=async()=>{throw Error('QA: direct route disabled');};
try{
 for(let i=0;i<3;i++){const auth=new AuthService(cfg,{save:async()=>{},clear:async()=>{}}),nickname='QA'+crypto.randomBytes(6).toString('hex');await auth.register({email:nickname.toLowerCase()+'@example.invalid',password:crypto.randomBytes(24).toString('hex'),nickname,remember:false});const catalog=new CatalogService(cfg,auth,'.'),social=new Social(catalog),direct=new DirectPlay(social,dir);users.push({auth,catalog,social,direct,nick:nickname.toLowerCase()});}
 const [host,guest,stranger]=users;await host.social.invite(guest.nick);await guest.social.change({id:host.nick+'~'+guest.nick,accept:true});
 game=net.createServer(s=>{s.on('error',()=>{});s.pipe(s);});await new Promise(r=>game.listen(0,'127.0.0.1',r));await host.direct.host(game.address().port);
 // No usable endpoint: must use the deployed VPS, never a local direct route.
 host.direct.endpoints=[];await guest.direct.request(host.nick);const id=guest.nick+'~'+host.nick;await host.direct.approve(id,true);
 const row=(await guest.social.query('directPlayRequests','guest',guest.nick,guest.auth.session.idToken))[0];
 await assert.rejects(relay.connect({role:'guest',request:id,auth:stranger.auth.session.idToken,grant:row.token}));
 await assert.rejects(relay.connect({role:'host',request:id,auth:guest.auth.session.idToken,grant:row.token}));
 await assert.rejects(relay.connect({role:'guest',request:id,auth:guest.auth.session.idToken,grant:'0'.repeat(64)}));
 await assert.rejects(relay.connect({role:'guest',request:id,auth:guest.auth.session.idToken,grant:row.token},{...require('../src/relay-config.json'),fingerprint:'0'.repeat(64)}));
 const result=await guest.direct.join(id);assert.match(guest.direct.status,/посредник/);
 const socket=net.connect(Number(result.address.split(':')[1]),'127.0.0.1'),payload=crypto.randomBytes(1024*1024);let data=Buffer.alloc(0);
 await new Promise((resolve,reject)=>{socket.setTimeout(20000,()=>reject(Error('Payload timeout')));socket.on('error',reject);socket.on('data',b=>{data=Buffer.concat([data,b]);if(data.length===payload.length){assert.deepEqual(data,payload);resolve();}});socket.on('connect',()=>socket.write(payload));});
 const closed=new Promise(r=>socket.once('close',r));await host.direct.stopHosting();await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Stop did not disconnect guest')),5000).unref())]);
 console.log('RELAY_LIVE_PASS: VPS fallback, 1MiB binary, stranger/wrong role/wrong grant/wrong certificate rejected, stop disconnects guest');
}finally{router.map=map;for(const u of users)await u.direct.close();if(game)await new Promise(r=>game.close(r));for(const u of users){for(const p of ['playerPresence/'+u.nick,'members/'+u.auth.session.uid,'nicknames/'+u.nick,...users.filter(v=>v!==u).flatMap(v=>['playerFriends/'+u.nick+'~'+v.nick,'directPlayRequests/'+u.nick+'~'+v.nick])])await admin.request({url:u.catalog.base+'/'+p,method:'DELETE'}).catch(e=>{if(e.response?.status!==404)throw e;});await u.auth.request(u.auth.authURL('delete'),{body:{idToken:u.auth.session.idToken}});}await fs.rm(dir,{recursive:true,force:true});console.log('QA_ACCOUNTS_REMOVED');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
