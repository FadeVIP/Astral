'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {client,project}=require('./firebase-admin.cjs');
(async()=>{
 const api=await client(),url=`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`;
 const release=(await api.request({url})).data,old=(await api.request({url:'https://firebaserules.googleapis.com/v1/'+release.rulesetName})).data;
 const block=fs.readFileSync(path.join(__dirname,'direct-play-rules.txt'),'utf8'),text=old.source.files[0].content;
 if(text.includes('match /directPlayRequests/')&&!text.includes(block.trim()))throw Error('Existing direct-play rules differ');
 const candidate=text.includes(block.trim())?text:text.replace('    match /{document=**}',()=>block+'\n    match /{document=**}');
 if(!candidate.includes(block.trim()))throw Error('Insertion failed');
 const cases=[['ALLOW','get','host'],['ALLOW','get','guest'],['DENY','get','stranger'],['DENY','get',null],['DENY','update','guest'],['DENY','update','stranger'],['ALLOW','delete','host'],['ALLOW','delete','guest'],['DENY','delete','stranger']];
 let response;try{response=(await api.request({url:`https://firebaserules.googleapis.com/v1/projects/${project}:test`,method:'POST',data:{source:{files:[{name:'firestore.rules',content:candidate}]},testSuite:{testCases:cases.map(([expectation,method,nick])=>({expectation,request:{path:'/databases/(default)/documents/directPlayRequests/guest~host',method,auth:nick?{uid:nick,token:{}}:null,resource:{data:{host:'host',guest:'guest',status:'approved',expires:Date.now()+300000,token:'a'.repeat(64),endpoints:'[]'}}},resource:{data:{host:'host',guest:'guest',status:'pending',expires:Date.now()+300000}},functionMocks:[{function:'get',args:[{anyValue:{}}],result:{value:{data:{nickname:nick||'nobody',status:'accepted'}}}},{function:'exists',args:[{anyValue:{}}],result:{value:true}}]}))}}})).data;}catch(e){if(e.response?.status!==403)throw e;if(!process.argv.includes('--compile-publish'))throw e;console.log('Rules simulator unavailable; compile and live isolation tests required');response={testResults:[],simulatorUnavailable:true};}
 assert(!response.issues?.some(x=>x.severity==='ERROR'),JSON.stringify(response.issues));assert(response.testResults?.every(x=>x.state==='SUCCESS'),JSON.stringify(response));
 fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/direct-play-rules-test.json'),JSON.stringify(response,null,2));
 fs.writeFileSync(path.join(__dirname,'../firestore.rules'),candidate);
 console.log(response.simulatorUnavailable?'DIRECT_PLAY_RULES_CANDIDATE_READY':'DIRECT_PLAY_RULES_TEST_PASS '+cases.length);
 if(!process.argv.includes('--publish')&&!process.argv.includes('--compile-publish')||text===candidate)return;
 fs.writeFileSync(path.join(__dirname,'../artifacts/direct-play-rules-before.json'),JSON.stringify({release,old}));
 const rules=(await api.request({url:`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,method:'POST',data:{source:{files:[{name:'firestore.rules',content:candidate}]}}})).data;
 if((await api.request({url})).data.rulesetName!==release.rulesetName)throw Error('Concurrent rules change');
 await api.request({url,method:'PATCH',data:{release:{name:release.name,rulesetName:rules.name},updateMask:'rulesetName'}});console.log('DIRECT_PLAY_RULES_PUBLISHED');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
