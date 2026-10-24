'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const ROOT='https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/realtime/publicLauncherData/';
async function snapshot(kind,fetcher=fetch){
 if(!['packs','appearance','cosmetics'].includes(kind))throw Error('Unknown public catalog');
 try{const r=await fetcher(ROOT+kind+'.json',{signal:AbortSignal.timeout(6000),redirect:'error'});if(!r.ok)throw Error('Public catalog unavailable');const value=await r.json();if(value?.count===0&&!value.documents)value.documents=[];if(value?.version!==1||!Array.isArray(value.documents)||value.documents.length>2000)throw Error('Invalid public catalog');return value;}
 catch{const value=JSON.parse(await fs.readFile(path.join(__dirname,'../assets/public-data',kind+'.json'),'utf8'));if(value?.version!==1||!Array.isArray(value.documents))throw Error('No public catalog');return value;}
}
module.exports={snapshot};
