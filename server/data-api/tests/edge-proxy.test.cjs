'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createProxy}=require('../edge-proxy.cjs');
test('reserve proxy preserves user identity and CORS, rejects service tokens and unrelated routes',async t=>{
 const calls=[];const proxy=createProxy(async(url,o)=>{calls.push({url,o});return Response.json({ok:true},{headers:{'Access-Control-Allow-Origin':'https://astral-mine-mirror.onrender.com'}});});
 const server=http.createServer(async(req,res)=>{if(!await proxy(req,res)){res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base+'/api/v1/documents:commit',{method:'POST',headers:{Authorization:'Bearer user-token'},body:'{}'});
 assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'https://astral-mine-mirror.onrender.com');
 assert.equal(calls[0].o.headers.authorization,'Bearer user-token');assert.equal(calls[0].o.redirect,'error');
 assert.match(calls[0].url,/^https:\/\/829504-vds-korolevikh2001vlad.gmhost.pp.ua\/api/);
 assert.equal((await fetch(base+'/api/v1/documents/x',{headers:{Authorization:'Astral-Service secret'}})).status,403);
 assert.equal((await fetch(base+'/outside')).status,404);assert.equal(calls.length,1);
});
