const {test}=require('node:test'),assert=require('node:assert/strict');
const {project}=require('../../public-game-data.cjs');
const {directory}=require('../../social-directory.cjs');
test('game mirror excludes credentials, ownership and private account data',()=>{
 assert.deepEqual(project('skins',{png:'data',model:'classic',uid:'secret',email:'private',balance:5}),{fields:{png:{stringValue:'data'},model:{stringValue:'classic'}}});
 assert.deepEqual(project('outfits',{uid:'secret',cape:'cape-1',token:'secret'}),{fields:{cape:{stringValue:'cape-1'}}});
});
test('presence access is granted only to accepted active friends and revoked on removal',()=>{
 const members={a:{nickname:'Alpha',status:'active',email:'private'},b:{nickname:'Bravo',status:'active'},c:{nickname:'Charlie',status:'blocked'}};
 const result=directory(members,{one:{from:'alpha',to:'bravo',status:'accepted'},two:{from:'alpha',to:'charlie',status:'accepted'}});
 assert.deepEqual(result.access,{a:{bravo:true},b:{alpha:true}});assert.equal(JSON.stringify(result).includes('private'),false);
 assert.deepEqual(directory(members,{}).access,{});
});
test('presence heartbeat avoids all Firestore and identity refresh while token is valid',async()=>{
 const {Social}=require('../src/social.cjs');let calls=0;
 const auth={publicUser:()=>({nickname:'Alpha',status:'active'}),refresh:async()=>{},session:{idToken:'test'},fetcher:async(url,options)=>{calls++;assert.match(url,/socialPresence\/alpha.json/);assert.equal(JSON.parse(options.body).playing,true);return Response.json({});}};
 const social=new Social({auth});await social.presence({name:'Astral'},true);assert.equal(calls,1);
});
