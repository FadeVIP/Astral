const fs=require('fs'),path=require('path');const {client,project}=require('./firebase-admin.cjs');
(async()=>{const api=await client(),url=`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`;
 const {data:release}=await api.request({url});const {data:previous}=await api.request({url:'https://firebaserules.googleapis.com/v1/'+release.rulesetName});
 const file=previous.source.files.find(f=>f.name==='firestore.rules')||previous.source.files[0],source=file.content,addition=fs.readFileSync(path.join(__dirname,'star-finders.rules.txt'),'utf8').replace(/^\uFEFF/,'');
 if(source.includes('match /siteStarFinders/'))throw Error('Already contains findings rules; inspect before changing');
 const anchor='    match /siteSecrets/{secretId} {';if(!source.includes(anchor)||!source.includes('function launcherAdmin()'))throw Error('Unexpected live rules structure');
 const content=source.replace(anchor,()=>addition+'\n'+anchor);fs.writeFileSync(path.join(__dirname,'../.test-data/star-rules-backup.json'),JSON.stringify({release,previous},null,2));
 const {data:created}=await api.request({url:`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,method:'POST',data:{source:{files:previous.source.files.map(f=>f===file?{...f,content}:f)}}});
 const {data:check}=await api.request({url});if(check.rulesetName!==release.rulesetName)throw Error('Live rules changed concurrently; not released');
 await api.request({url,method:'PATCH',data:{release:{name:release.name,rulesetName:created.name}}});
 fs.writeFileSync(path.join(__dirname,'../firestore.rules'),content);console.log('STAR_FINDERS_RULES_RELEASED');
})().catch(e=>{console.error(JSON.stringify(e.response?.data||{message:e.message}));process.exitCode=1});



