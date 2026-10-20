'use strict';
// Features are selected by runtime compatibility, never by catalogue ID.
// A new compatible catalogue entry participates without a launcher change.
function supported(pack){return pack?.minecraft==='1.20.1'&&/^47\.\d+\.\d+$/.test(pack.forge||'');}
function themed(pack){return supported(pack)&&(!pack.id||pack.id==='astral');}
module.exports={supported,themed};
