const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../..'),java=path.join(root,'local-packs/ASTRA-TechnoMagic-1.7.10/runtime/bin'),cache=path.join(__dirname,'.build-cache'),stage=path.join(cache,'package');
const args=fs.readFileSync(path.join(cache,'javac.args'),'utf8').split('\n');
const out=path.join(cache,'early-classes');fs.mkdirSync(out,{recursive:true});
args[args.indexOf('"-d"')+1]=JSON.stringify(out.replaceAll('\\','/'));
args.splice(args.findIndex(a=>a.endsWith('.java"')),args.length,...['early/ColourScheme.java','early/RenderElement.java','EarlyAgent.java'].map(n=>JSON.stringify(path.join(__dirname,n).replaceAll('\\','/'))));
fs.writeFileSync(path.join(cache,'early.args'),args.join('\n'));
const r=spawnSync(path.join(java,'javac.exe'),['@'+path.join(cache,'early.args')],{stdio:'inherit'});if(r.status!==0)process.exit(1);
const yauzl=require(path.join(root,'launcher/node_modules/yauzl'));
const library='C:/Users/korol/Games/Astral/minecraft-runtimes/1.20.1-47.4.20/libraries/net/minecraftforge/fmlearlydisplay/1.20.1-47.4.20/fmlearlydisplay-1.20.1-47.4.20.jar';
const names=['net/minecraftforge/fml/earlydisplay/ColourScheme','net/minecraftforge/fml/earlydisplay/RenderElement'];
let hashes='';yauzl.open(library,{lazyEntries:true},(err,zip)=>{
 if(err)throw err;zip.readEntry();zip.on('entry',e=>{const name=e.fileName.replace(/\.class$/,'');if(!names.includes(name)){zip.readEntry();return;}
 zip.openReadStream(e,(err,s)=>{if(err)throw err;const chunks=[];s.on('data',c=>chunks.push(c));s.on('end',()=>{hashes+=name+'='+crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex')+'\n';zip.readEntry();});});});
 zip.on('end',()=>{for(const name of names){if(!hashes.includes(name+'='))throw Error('Missing original class');const dest=path.join(stage,'astral-early',name+'.bin');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(out,name+'.class'),dest);}
 fs.writeFileSync(path.join(stage,'astral-early/hashes.properties'),hashes);
 fs.cpSync(path.join(out,'astral/early'),path.join(stage,'astral/early'),{recursive:true});
 fs.cpSync(path.join(__dirname,'early'),path.join(stage,'astral-early/source'),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'EarlyAgent.java'),path.join(stage,'astral-early/source/EarlyAgent.java'));
 fs.writeFileSync(path.join(cache,'agent.mf'),'Manifest-Version: 1.0\nPremain-Class: astral.early.EarlyAgent\n\n');
 console.log('ASTRAL_EARLY_THEME_BUILT');});
});
