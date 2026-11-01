'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {AuthService}=require('../src/auth.cjs');
const {CatalogService}=require('../src/catalog.cjs');
const {AccountExtras}=require('../src/account-extras.cjs');
const {Cosmetics}=require('../src/cosmetics.cjs');
const config={projectId:'test',apiKey:'test',dataApiUrl:'https://sql.test/api/v1/documents'};
const storage={save:async()=>{},clear:async()=>{}};
test('skin, cosmetics and wallet use a valid session even if Google is temporarily unavailable',async()=>{
 let google=0;
 const fetcher=async url=>{
  if(url.includes('googleapis.com')){google++;throw Error('Google temporarily unreachable');}
  if(url.endsWith('/members/me'))return Response.json({fields:{nickname:{stringValue:'Player'},status:{stringValue:'active'}}});
  if(url.includes('cosmeticCatalog')||url.includes('/items?'))return Response.json({documents:[]});
  return Response.json({}, {status:404});
 };
 const auth=new AuthService(config,storage,fetcher);
 auth.acceptSession({localId:'me',email:'test@example.invalid',idToken:'valid-token',refreshToken:'refresh',expiresIn:3600});
 const catalog=new CatalogService(config,auth,'unused',fetcher),extras=new AccountExtras(catalog),cosmetics=new Cosmetics(catalog);
 const [skin,wallet,items]=await Promise.all([extras.skin(),extras.wallet(),cosmetics.list()]);
 assert.equal(skin,null);assert.equal(wallet.balance,0);assert.deepEqual(items.items,[]);assert.equal(google,0);
});
test('concurrent expired-session refreshes share one request and cannot resurrect a signed-out user',async()=>{
 let release,requests=0;
 const auth=new AuthService(config,storage,async url=>{
  if(url.includes('securetoken')){requests++;await new Promise(r=>release=r);return Response.json({id_token:'new',refresh_token:'new-refresh',user_id:'me',expires_in:3600});}
  return Response.json({users:[{email:'me@example.invalid',displayName:'Player'}]});
 });
 auth.acceptSession({localId:'me',email:'me@example.invalid',idToken:'old',refreshToken:'old',expiresIn:-1});
 const first=auth.refresh(),second=auth.refresh();assert.equal(requests,1);
 await auth.logout();release();
 const results=await Promise.allSettled([first,second]);assert.ok(results.every(r=>r.status==='rejected'));assert.equal(auth.publicUser(),null);
});
