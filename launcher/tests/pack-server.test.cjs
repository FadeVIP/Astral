const test=require('node:test'),assert=require('node:assert/strict');
const {prepare,supported,PACK_ID,config}=require('../src/pack-server.cjs');
const pack={id:PACK_ID,minecraft:'1.20.1',forge:'47.4.23'};
test('Only Nasledie uses its authenticated endpoint',()=>{assert(supported(pack));assert(!supported({...pack,id:'astral'}));assert(!supported({...pack,minecraft:'1.7.10'}));assert.match(config.fingerprint,/^[a-f0-9]{64}$/);});
test('Unaffected packs do not open a bridge',async()=>{assert.equal(await prepare({pack:{id:'astral'}},{}),null);});
test('Pin failure closes bridge and propagates error',async()=>{let closed=false;await assert.rejects(prepare({pack,gameDirectory:'test'},{},{startBridge:async()=>({port:25563,close(){closed=true;}}),ensurePinnedServer:async()=>{throw Error('disk unavailable');}}),/disk unavailable/);assert(closed);});
test('Only loopback endpoint is written to Minecraft',async()=>{let pinned;const bridge={port:25563,close(){}};assert.equal(await prepare({pack,gameDirectory:'test'},{},{startBridge:async()=>bridge,ensurePinnedServer:async(...args)=>{pinned=args;}}),bridge);assert.equal(pinned[2].address,'127.0.0.1:25563');assert.match(pinned[2].name,/Наследие/);});
