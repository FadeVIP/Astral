const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AuthService}=require('../src/auth.cjs');
const {offlineProfile}=require('../src/game.cjs');
test('guest identity never grants account access or needs network',async()=>{
 let requests=0;
 const auth=new AuthService({}, {clear:async()=>{}},async()=>{requests++;throw Error('offline');});
 assert.throws(()=>auth.setGuest('../bad'));
 auth.setGuest('Local_Player');
 assert.equal((await auth.gameUser()).nickname,'Local_Player');
 assert.equal(auth.session,null);
 await assert.rejects(auth.requireAccess(),/аккаунт/);
 assert.equal(requests,0);
 assert.equal(offlineProfile((await auth.gameUser()).nickname).uuid,offlineProfile('Local_Player').uuid);
 await auth.logout();assert.equal(auth.publicUser(),null);
});
test('successful account login replaces guest identity',()=>{
 const auth=new AuthService({},{});
 auth.setGuest('Guest');auth.acceptSession({localId:'uid',email:'test@example.invalid',displayName:'Account',expiresIn:3600});
 assert.equal(auth.publicUser().nickname,'Account');assert.equal(auth.guest,null);
});
