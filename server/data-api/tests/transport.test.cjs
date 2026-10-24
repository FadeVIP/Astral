'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {AuthService}=require('../../../launcher/src/auth.cjs');
const {CatalogService}=require('../../../launcher/src/catalog.cjs');
test('SQL routing preserves document names and Firebase Auth endpoints',async()=>{
 const calls=[],config={projectId:'astral-524a1',apiKey:'test',dataApiUrl:'https://api.example.test/api/v1/documents'};
 const fetcher=async(url)=>{calls.push(url);return {ok:true,json:async()=>({})};};
 const auth=new AuthService(config,{},fetcher);
 await auth.request('https://firestore.googleapis.com/v1/projects/astral-524a1/databases/(default)/documents/members/u1',{method:'GET'});
 await auth.request(auth.authURL('signInWithPassword'),{body:{email:'test@example.test'}});
 assert.equal(calls[0],config.dataApiUrl+'/members/u1');assert.match(calls[1],/^https:\/\/identitytoolkit.googleapis.com/);
 const catalog=new CatalogService(config,auth,'.',fetcher);await catalog.request(':commit',{method:'POST',body:{writes:[]}});
 assert.equal(calls[2],config.dataApiUrl+':commit');assert.match(catalog.base,/firestore.googleapis.com/);
});
test('insecure API configuration fails closed instead of leaking a token',async()=>{
 let called=false;const auth=new AuthService({projectId:'astral-524a1',dataApiUrl:'http://insecure.test'}, {},async()=>{called=true;});
 await assert.rejects(auth.request('https://firestore.googleapis.com/v1/projects/astral-524a1/databases/(default)/documents/members/u1',{token:'private'}));assert.equal(called,false);
});
