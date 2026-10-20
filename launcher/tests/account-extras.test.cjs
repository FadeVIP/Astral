const test=require('node:test'),assert=require('node:assert/strict');
const {AccountExtras,amount,nickname}=require('../src/account-extras.cjs');
test('Acoin validates integer bounds and never assumes zero after a failed request',async()=>{
 for(const bad of [-1,0.1,NaN,Infinity,1000000001,'200'])assert.throws(()=>amount(bad));
 assert.equal(amount(200),200);assert.equal(nickname('StarWalker'),'starwalker');assert.throws(()=>nickname('../secret'));
 const c={auth:{session:{uid:'test',idToken:'token'},requireAccess:async()=>{}},request:async()=>{throw Error('offline');}};
 await assert.rejects(()=>new AccountExtras(c).wallet(),/offline/);
 c.request=async()=>null;assert.equal((await new AccountExtras(c).wallet()).balance,0);
 c.request=async()=>({fields:{balance:{integerValue:'200'}}});assert.equal((await new AccountExtras(c).wallet()).balance,200);
});
test('skin changes require active account and validate data before writes',async()=>{
 let requests=0;const c={auth:{session:{uid:'u',idToken:'token'},requireAccess:async()=>{},publicUser:()=>({nickname:'Player'})},request:async()=>{requests++;return {};}};
 const service=new AccountExtras(c);
 await assert.rejects(()=>service.saveSkin('https://untrusted.invalid/a.png','classic'));
 await assert.rejects(()=>service.saveSkin('data:image/png;base64,YQ==','invalid'));
 assert.equal(requests,0);
 c.auth.requireAccess=async()=>{throw Error('blocked')};await assert.rejects(()=>service.saveSkin('data:image/png;base64,YQ==','classic'),/blocked/);assert.equal(requests,0);
});
