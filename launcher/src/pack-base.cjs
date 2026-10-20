'use strict';
const base=require('../pack.json');
function isOriginal(pack){return (!pack.id||pack.id==='astral')&&pack.sha256===base.sha256&&pack.driveFileId===base.driveFileId&&pack.minecraft===base.minecraft&&pack.forge===base.forge&&!(pack.archivePrefix||'');}
function identity(pack){return isOriginal(pack)?base.driveFileId+base.version:[pack.id||'astral',pack.sha256,pack.minecraft,pack.forge].join('|');}
module.exports={isOriginal,identity};
