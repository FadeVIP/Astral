'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {GoogleAuth}=require('../../node_modules/google-auth-library');
const client=()=>new GoogleAuth({keyFile:path.resolve(__dirname,'../../serviceAccountKey.json'),scopes:['https://www.googleapis.com/auth/firebase.database','https://www.googleapis.com/auth/userinfo.email']}).getClient();
const url='https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app/.settings/rules.json';
(async()=>{
 const api=await client(),{data}=await api.request({url});
 await fs.mkdir(path.join(__dirname,'../.test-data'),{recursive:true});
 await fs.writeFile(path.join(__dirname,'../.test-data/rtdb-before-game-mirror.json'),JSON.stringify(data,null,2));
 if(data.rules['.read']===true||data.rules['.write']===true)throw Error('Inherited root permissions must be reviewed first');
 data.rules.publicGameData={'.read':true,'.write':false};
 data.rules.socialDirectory={'.read':false,'.write':false};
 for(const key of ['lists','sessions'])data.rules.socialDirectory[key]={'$uid':{'.read':"auth != null && auth.uid == $uid && root.child('socialDirectory/active').child($uid).val() == true"}};
 data.rules.socialPresence={
  '$nick':{
   '.read':"auth != null && (root.child('socialDirectory/names').child($nick).child('uid').val() == auth.uid || root.child('socialDirectory/access').child(auth.uid).child($nick).val() == true)",
   '.write':"auth != null && root.child('socialDirectory/names').child($nick).child('uid').val() == auth.uid && root.child('socialDirectory/names').child($nick).child('active').val() == true",
   '.validate':"newData.hasChildren(['pack','playing','updatedAt'])",
   pack:{'.validate':'newData.isString() && newData.val().length <= 64'},
   playing:{'.validate':'newData.isBoolean()'},
   updatedAt:{'.validate':'newData.isNumber() && newData.val() == now'},
   '$other':{'.validate':false}
  }
 };
 if(!process.argv.includes('--apply')){console.log('RULES_PREPARED existing='+Object.keys(data.rules).length);return;}
 await api.request({url,method:'PUT',data});console.log('GAME_MIRROR_RULES_DEPLOYED');
})().catch(e=>{console.error(e.response?.data?.error?.message||e.message);process.exitCode=1;});
