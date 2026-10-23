'use strict';
const http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const admission=require('./direct-auth.cjs'),relay=require('./relay-client.cjs');
const {encode}=require('./catalog.cjs'),router=require('./direct-router.cjs');
const listen=(server,host)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,host,()=>{server.removeListener('error',reject);resolve(server.address().port);});});
const nickname=s=>typeof s==='string'&&/^[a-z0-9_]{3,16}$/.test(s);
class DirectPlay{
 constructor(social,directory){this.social=social;this.directory=directory;this.secret=crypto.randomBytes(32).toString('hex');this.grants=new Map();this.connecting=new Map();this.sockets=new Set();this.status='Мир закрыт для подключения';this.gamePort=0;this.lastSeen=Date.now();this.busy=false;this.generation=0;this.relayControllers=new Set();}
 async start(){
  const stale=await fs.readFile(path.join(this.directory,'router-mapping.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(stale)await router.unmap(stale).then(()=>fs.rm(path.join(this.directory,'router-mapping.json'),{force:true})).catch(()=>{});
  this.identity=(await this.social.access()).uid;
  this.api=http.createServer(async(req,res)=>{
   res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
   if(req.method!=='POST'||req.headers.authorization!=='Bearer '+this.secret||req.headers.origin){res.writeHead(403);res.end('{}');return;}
   try{let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('Request too large');}const input=JSON.parse(body||'{}');
    // Local progress must not wait for Firebase or the operation it describes.
    if(req.url==='/progress'){res.end(JSON.stringify({busy:this.busy,message:this.status,hosting:!!this.gamePort&&!this.busy}));return;}
    if((await this.social.access(req.url!=='/state')).uid!==this.identity)throw Error('Аккаунт изменился. Перезапустите игру.');this.lastSeen=Date.now();
    if(req.url==='/state'){if(!input.world&&this.gamePort)await this.stopHosting();res.end(JSON.stringify(await this.state(input)));return;}
    if(this.busy)throw Error('Дождитесь завершения операции.');this.busy=true;
    try{let value;switch(req.url){case '/host':value=await this.host(input.port);break;case '/stop':value=await this.stopHosting();break;case '/request':value=await this.request(input.nickname);break;case '/approve':value=await this.approve(input.id,input.accept);break;case '/join':value=await this.join(input.id);break;default:throw Error('Unknown operation');}res.end(JSON.stringify(value||{}));}finally{this.busy=false;}
   }catch(e){res.statusCode=400;res.end(JSON.stringify({error:String(e.message).slice(0,250)}));}
  });
  this.api.requestTimeout=15000;this.api.headersTimeout=10000;const port=await listen(this.api,'127.0.0.1');
  this.timer=setInterval(()=>{if(Date.now()-this.lastSeen>45000&&this.gamePort)this.stopHosting().catch(()=>{});else if(this.mapping?.protocol&&!this.renewing&&Date.now()-(this.renewed||0)>Math.max(5000,Math.min(45000,(this.mapping.lifetime||120)*400))){this.renewing=true;const mapping=this.mapping;require('./direct-gateway.cjs').renew(mapping).then(next=>{if(this.mapping===mapping&&next.port!==mapping.port)throw Error('Port changed');this.renewed=Date.now();}).catch(()=>{if(this.mapping===mapping)this.stopHosting().catch(()=>{});}).finally(()=>{this.renewing=false;});}},10000);this.timer.unref();
  return {port,token:this.secret};
 }
 track(socket){this.sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>this.sockets.delete(socket));return socket;}
 async state(input={}){
  const s=await this.social.access();if(!this.identity)this.identity=s.uid;if(this.identity!==s.uid)throw Error('Аккаунт изменился. Перезапустите Minecraft.');
  const friends=(await this.social.friends()).filter(f=>f.status==='accepted').map(f=>({nickname:f.nickname,online:!!f.presence,playing:!!f.presence?.playing}));
  const incoming=await this.social.query('directPlayRequests','host',s.nick,s.token),outgoing=await this.social.query('directPlayRequests','guest',s.nick,s.token);
  const current=row=>row.expires>Date.now()&&friends.some(f=>f.nickname===(row.host===s.nick?row.guest:row.host));
  const peers=new Set(input.inWorld&&Array.isArray(input.players)?input.players.slice(0,256).filter(x=>typeof x==='string').map(x=>x.toLowerCase()).filter(nickname):[]);
  for(const friend of friends){
   const sent=outgoing.find(r=>current(r)&&r.host===friend.nickname),received=incoming.find(r=>current(r)&&r.guest===friend.nickname);
   friend.session=peers.has(friend.nickname)?'together':this.connecting.has(friend.nickname)?'connecting':received?.status==='pending'?'incoming':this.gamePort&&received?.status==='approved'?'waiting_guest':sent?.status==='approved'?'approved':sent?.status==='pending'?'pending':sent?.status==='declined'?'declined':'idle';
  }
  return {friends,incoming:incoming.filter(r=>current(r)&&r.status==='pending'),outgoing:outgoing.filter(current).map(r=>({id:r.id,nickname:r.host,status:r.status})),hosting:!!this.gamePort,status:this.status};
 }
 async write(id,data,create=false){const s=await this.social.access();return this.social.c.request('/directPlayRequests/'+id+(create?'?currentDocument.exists=false':''),{method:'PATCH',token:s.token,body:{fields:encode(data).mapValue.fields}});}
 async friend(name){if(!nickname(name)||(await this.social.friends()).every(f=>f.nickname!==name||f.status!=='accepted'))throw Error('Игрок не находится в списке друзей.');}
 async request(name){await this.friend(name);const s=await this.social.access();const id=s.nick+'~'+name;const old=(await this.social.query('directPlayRequests','guest',s.nick,s.token)).find(r=>r.id===id);if(old&&old.expires>Date.now()&&['pending','approved'].includes(old.status))return {message:old.status==='approved'?'Запрос уже принят. Нажмите «Подключиться».':'Запрос уже отправлен. Ждём ответа хозяина.'};if(old)await this.social.c.request('/directPlayRequests/'+id,{method:'DELETE',token:s.token});await this.write(id,{host:name,guest:s.nick,status:'pending',expires:Date.now()+300000},true);return {message:'Запрос отправлен. Дождитесь разрешения хозяина.'};}
 async host(port){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Сначала откройте мир для сети.');
  await this.stopHosting();const generation=this.generation;this.gamePort=port;this.status='Открываем защищённый доступ к миру…';
  this.proxy=net.createServer(socket=>{
   if(this.sockets.size>=32){socket.destroy();return;}this.track(socket);const challenge=crypto.randomBytes(32).toString('hex');socket.write(challenge+'\n');socket.setTimeout(5000,()=>socket.destroy());let buffer=Buffer.alloc(0);
   const first=chunk=>{buffer=Buffer.concat([buffer,chunk]);const end=buffer.indexOf(10);if(end<0){if(buffer.length>160)socket.destroy();return;}socket.pause();socket.removeListener('data',first);const answer=buffer.subarray(0,end).toString();const [key,proof]=answer.split(':');const grant=[...this.grants.entries()].find(([token])=>admission.id(token)===key);const token=grant?.[0];const entry=grant?.[1];
    if(!entry||entry.expires<Date.now()||!proof||!/^[a-f0-9]{64}$/.test(proof)||!crypto.timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(admission.proof(token,challenge),'hex'))){socket.destroy();return;}socket.write('ASTRAL-OK\n');let announced=false;const announce=()=>{if(generation===this.generation&&!announced&&entry.guest){announced=true;this.connecting.set(entry.guest,(this.connecting.get(entry.guest)||0)+1);}};socket.on('data',announce);if(buffer.length>end+1)announce();socket.once('close',()=>{if(generation===this.generation&&announced){const n=(this.connecting.get(entry.guest)||0)-1;if(n>0)this.connecting.set(entry.guest,n);else this.connecting.delete(entry.guest);}});socket.setTimeout(0);const upstream=this.track(net.connect({host:'127.0.0.1',port:this.gamePort}));
    upstream.once('connect',()=>{upstream.write(buffer.subarray(end+1));socket.pipe(upstream);upstream.pipe(socket);socket.resume();});socket.once('close',()=>upstream.destroy());upstream.once('close',()=>socket.destroy());
   };socket.on('data',first);
  });
  const proxyPort=await listen(this.proxy,'0.0.0.0');this.endpoints=[];
  for(const list of Object.values(os.networkInterfaces()))for(const ip of list||[])if(ip.family==='IPv4'&&!ip.internal&&!ip.address.startsWith('169.254.'))this.endpoints.push({host:ip.address,port:proxyPort});
  this.status='Проверяем возможность открыть порт на роутере…';
  try{const mapping=await router.map(proxyPort,'Astral-'+crypto.randomBytes(8).toString('hex'));if(generation!==this.generation){await router.unmap(mapping);return {};}
   this.mapping=mapping;this.renewed=Date.now();await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(path.join(this.directory,'router-mapping.json'),JSON.stringify(mapping));
   if(mapping.public){this.endpoints.unshift({host:mapping.external,port:mapping.port});this.status='Порт открыт ('+(mapping.protocol||'UPnP')+'). Доступность проверит друг при подключении.';}else this.status='Роутер открыл порт, но внешний адрес закрытый. Через интернет соединение может не пройти.';
  }catch{this.status='Роутер не открыл порт. Доступна попытка подключения в общей локальной сети.';}
  this.status='Мир готов. '+this.status+' Если напрямую не получится, попробуем посредник Astral.';
  return {message:this.status};
 }
 async approve(id,accept){const s=await this.social.access();const row=(await this.social.query('directPlayRequests','host',s.nick,s.token)).find(r=>r.id===id&&r.status==='pending'&&r.expires>Date.now());if(!row)throw Error('Запрос истёк.');await this.friend(row.guest);
  const {id:ignored,...data}=row;if(!accept){await this.write(id,{...data,status:'declined'});return {message:'Запрос '+row.guest+' отклонён.'};}
  if(!this.gamePort)throw Error('Сначала откройте свой мир для друзей.');const token=crypto.randomBytes(32).toString('hex');this.grants.set(token,{expires:row.expires,guest:row.guest});await this.write(id,{...data,status:'approved',token,endpoints:JSON.stringify(this.endpoints.slice(0,4))});this.prepareRelay(id,token,row.expires);return {message:'Вы приняли '+row.guest+'. Ждём, пока он нажмёт «Подключиться» и войдёт в мир.'};
 }
 async join(id){this.status='Проверяем разрешение на вход…';const s=await this.social.access();const row=(await this.social.query('directPlayRequests','guest',s.nick,s.token)).find(r=>r.id===id&&r.status==='approved'&&r.expires>Date.now());if(!row)throw Error('Разрешение истекло. Отправьте новый запрос.');await this.friend(row.host);
  if(!/^[a-f0-9]{64}$/.test(row.token))throw Error('Неверное разрешение.');let selected;
  const endpoints=JSON.parse(row.endpoints||'[]').slice(0,4);let attempt=0;
  for(const endpoint of endpoints){
   this.status='Проверяем прямое подключение: '+(++attempt)+' из '+endpoints.length+'…';
   if(net.isIP(endpoint.host)!==4||endpoint.host.startsWith('127.')||endpoint.host==='0.0.0.0'||!Number.isInteger(endpoint.port)||endpoint.port<1024||endpoint.port>65535)continue;
   try{const socket=net.connect(endpoint.port,endpoint.host);await admission.authenticate(socket,row.token,2000);socket.destroy();selected=endpoint;break;}catch{}
  }
  const open=async()=>{
   if(selected){const remote=net.connect(selected.port,selected.host);try{await admission.authenticate(remote,row.token);return remote;}catch{remote.destroy();}}
   this.status='Прямое соединение недоступно. Подключаемся через посредник Astral…';
   const auth=await this.social.access();const remote=await relay.connect({role:'guest',request:id,auth:auth.token,grant:row.token});
   try{remote.resume();await admission.authenticate(remote,row.token);this.status='Подключение через посредник Astral';return remote;}catch(e){remote.destroy();throw e;}
  };
  // Verify the fallback before handing Minecraft a loopback address.
  if(!selected){let probe;try{probe=await open();}catch{throw Error('Не удалось подключиться напрямую или через посредник Astral. Хозяин должен открыть мир и принять новый запрос.');}finally{probe?.destroy();}}
  else this.status='Прямое подключение к другу';
  this.clientProxy?.close();this.clientProxy=net.createServer(local=>{this.track(local);local.pause();open().then(remote=>{if(local.destroyed){remote.destroy();return;}this.track(remote);local.pipe(remote);remote.pipe(local);local.resume();remote.resume();local.once('close',()=>remote.destroy());remote.once('close',()=>local.destroy());}).catch(()=>local.destroy());});
  return {address:'127.0.0.1:'+await listen(this.clientProxy,'127.0.0.1')};
 }
 prepareRelay(id,token,expires){
  const generation=this.generation,controller=new AbortController();this.relayControllers.add(controller);
  const arm=async()=>{
   while(!controller.signal.aborted&&generation===this.generation&&Date.now()<expires){
    try{const auth=await this.social.access();if(controller.signal.aborted)return;
     const remote=await relay.connect({role:'host',request:id,auth:auth.token,grant:token,signal:controller.signal});
     if(generation!==this.generation||!this.proxy){remote.destroy();return;}this.track(remote);
     const local=this.track(net.connect(this.proxy.address().port,'127.0.0.1'));
     local.once('connect',()=>{remote.pipe(local);local.pipe(remote);remote.resume();});
     local.once('close',()=>remote.destroy());remote.once('close',()=>local.destroy());
    }catch{if(controller.signal.aborted)return;await new Promise(r=>{const timer=setTimeout(done,3000);function done(){clearTimeout(timer);controller.signal.removeEventListener('abort',done);r();}controller.signal.addEventListener('abort',done,{once:true});});}
   }
  };
  Promise.all([arm(),arm()]).finally(()=>this.relayControllers.delete(controller));
 }

 async stopHosting(){this.generation++;for(const c of this.relayControllers)c.abort();this.relayControllers.clear();this.gamePort=0;this.grants.clear();this.connecting.clear();this.proxy?.close();this.proxy=null;for(const socket of this.sockets)socket.destroy();this.status='Мир закрыт для подключения';const mapping=this.mapping;this.mapping=null;if(mapping)await router.unmap(mapping).then(()=>fs.rm(path.join(this.directory,'router-mapping.json'),{force:true})).catch(()=>{this.status='Мир закрыт; роутер не подтвердил удаление порта. Повторим при запуске.';});return {};}
 async close(){clearInterval(this.timer);await this.stopHosting();this.clientProxy?.close();this.api?.close();}
}
module.exports={DirectPlay};
