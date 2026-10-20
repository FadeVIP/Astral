// Public data is deliberately separate from accounts, balances and purchases.
export async function publicSnapshot(kind){
 if(!['packs','appearance','cosmetics'].includes(kind))throw Error('Unknown public catalog');
 const urls=['https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app/publicLauncherData/'+kind+'.json','/assets/public-data/'+kind+'.json'];
 for(const url of urls)try{const r=await fetch(url,{signal:AbortSignal.timeout(6000)});if(!r.ok)continue;const value=await r.json();if(value?.count===0&&!value.documents)value.documents=[];if(value?.version===1&&Array.isArray(value.documents)&&value.documents.length<=2000)return value;}catch{}
 throw Error('Публичный каталог временно недоступен.');
}
