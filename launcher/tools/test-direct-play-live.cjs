'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {AuthService}=require('../src/auth.cjs'),{CatalogService,encode}=require('../src/catalog.cjs'),{Social}=require('../src/social.cjs'),{DirectPlay}=require('../src/direct-play.cjs'),{client}=require('./firebase-admin.cjs');
const cfg=require('../pack.json').firebase,users=[];
(async()=>{const admin=await client();try{
 for(let i=0;i<3;i++){const auth=new AuthService(cfg,{save:async()=>{},clear:async()=>{}}),nickname='QA'+crypto.randomBytes(6).toString('hex');await auth.register({email:nickname.toLowerCase()+'@example.invalid',password:crypto.randomBytes(24).toString('hex'),nickname,remember:false});const catalog=new CatalogService(cfg,auth,'.'),social=new Social(catalog),direct=new DirectPlay(social,'.');users.push({auth,catalog,social,direct,nick:nickname.toLowerCase()});}
 const [host,guest,stranger]=users;await host.social.invite(guest.nick);await guest.social.change({id:host.nick+'~'+guest.nick,accept:true});
 await guest.direct.request(host.nick);const id=guest.nick+'~'+host.nick,route='/directPlayRequests/'+id;
 const row=(await host.social.query('directPlayRequests','host',host.nick,host.auth.session.idToken))[0];assert.equal(row.status,'pending');
 await assert.rejects(stranger.catalog.request(route,{token:stranger.auth.session.idToken}));
 await assert.rejects(guest.catalog.request(route,{method:'PATCH',token:guest.auth.session.idToken,body:{fields:encode({host:host.nick,guest:guest.nick,status:'approved',expires:row.expires,token:'a'.repeat(64),endpoints:'[]'}).mapValue.fields}}));
 await assert.rejects(stranger.direct.request(host.nick));
 host.direct.gamePort=25565;host.direct.endpoints=[{host:'192.168.1.2',port:25566}];await host.direct.approve(id,true);
 const approved=(await guest.social.query('directPlayRequests','guest',guest.nick,guest.auth.session.idToken))[0];assert.equal(approved.status,'approved');assert.match(approved.token,/^[a-f0-9]{64}$/);
 await guest.direct.request(host.nick);await host.direct.approve(id,false);assert.equal((await guest.social.query('directPlayRequests','guest',guest.nick,guest.auth.session.idToken))[0].status,'declined');
 console.log('DIRECT_PLAY_LIVE_PASS: private request, host approval, guest cannot self-approve, stranger denied, decline');
 }finally{for(const u of users){await u.direct.close();for(const p of ['playerPresence/'+u.nick,'members/'+u.auth.session.uid,'nicknames/'+u.nick,...users.filter(v=>v!==u).flatMap(v=>['playerFriends/'+u.nick+'~'+v.nick,'directPlayRequests/'+u.nick+'~'+v.nick])])await admin.request({url:u.catalog.base+'/'+p,method:'DELETE'}).catch(e=>{if(e.response?.status!==404)throw e;});await u.auth.request(u.auth.authURL('delete'),{body:{idToken:u.auth.session.idToken}});}console.log('QA_ACCOUNTS_REMOVED');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
