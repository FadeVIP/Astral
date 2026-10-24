'use strict';
const crypto=require('node:crypto');
const AUDIENCE='astral-sql-realtime';
function signer(account){
 const key=crypto.createPrivateKey(account.private_key);let cached='',until=0;
 return ()=>{const now=Math.floor(Date.now()/1000);if(until>now)return cached;
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({iss:account.client_email,aud:AUDIENCE,iat:now,exp:now+60})).toString('base64url');
  const data=header+'.'+payload;cached=data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),key).toString('base64url');until=now+30;return cached;
 };
}
function verifier(account){
 const key=crypto.createPublicKey(account.private_key);
 return token=>{try{
  if(typeof token!=='string'||token.length>8192)return false;
  const [h,p,s,...extra]=token.split('.');if(extra.length||!h||!p||!s)return false;
  const header=JSON.parse(Buffer.from(h,'base64url')),claims=JSON.parse(Buffer.from(p,'base64url')),now=Math.floor(Date.now()/1000);
  return header.alg==='RS256'&&header.typ==='JWT'&&claims.iss===account.client_email&&claims.aud===AUDIENCE&&Number.isInteger(claims.iat)&&Number.isInteger(claims.exp)&&claims.exp>now&&claims.iat<=now+5&&claims.exp-claims.iat<=60&&claims.exp>claims.iat&&crypto.verify('RSA-SHA256',Buffer.from(h+'.'+p),key,Buffer.from(s,'base64url'));
 }catch{return false;}};
}
module.exports={signer,verifier};
