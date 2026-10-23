'use strict';
function directory(members,friends,requests={}){
 const names={},access={},lists={},sessions={},active={};
 for(const [uid,m] of Object.entries(members)){if(/^[a-zA-Z0-9_]{3,16}$/.test(m.nickname||'')){names[m.nickname.toLowerCase()]={uid,active:m.status==='active'};active[uid]=m.status==='active';}}
 for(const [id,f] of Object.entries(friends)){for(const n of [f.from,f.to]){const u=names[n]?.uid;if(u)(lists[u]??={})[id]={id,from:f.from,to:f.to,status:f.status};}if(f.status!=='accepted')continue;const a=names[f.from],b=names[f.to];if(!a?.active||!b?.active)continue;(access[a.uid]??={})[f.to]=true;(access[b.uid]??={})[f.from]=true;}
 for(const [id,r] of Object.entries(requests)){const safe={id};for(const key of ['host','guest','status','expires','token','endpoints'])if(r[key]!==undefined)safe[key]=r[key];for(const n of [r.host,r.guest]){const u=names[n]?.uid;if(u)(sessions[u]??={})[id]=safe;}}
 return {names,access,active,lists,sessions};
}
function start(admin,db){
 if(!db)return;const data={};const write=require('./mirror-writer.cjs').writer(db.ref('socialDirectory'));
 for(const [key,source] of [['members','members'],['friends','playerFriends'],['requests','directPlayRequests']]){
  let stop,timer;
  function watch(){stop=admin.firestore().collection(source).onSnapshot(s=>{
   data[key]=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));if(!data.members||!data.friends||!data.requests)return;
   const next=directory(data.members,data.friends,data.requests);
   write(next);
  },()=>{stop?.();clearTimeout(timer);timer=setTimeout(watch,1800000);timer.unref();});}watch();
 }
}
module.exports={directory,start};
