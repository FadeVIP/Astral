'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function uninstallTarget(installer){
 const parent=path.resolve(installer.root,'instances'),target=path.resolve(installer.instance);
 if(path.dirname(target)!==parent||!/^astral-[a-f0-9]{12}$/.test(path.basename(target)))throw Error('Небезопасный путь сборки.');
 const stat=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!stat)return null;
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Нельзя удалять сборку по ссылке.');
 const realParent=await fs.realpath(parent),realTarget=await fs.realpath(target);
 if(path.dirname(realTarget)!==realParent)throw Error('Сборка находится вне папки instances.');
 return target;
}
module.exports={uninstallTarget};
