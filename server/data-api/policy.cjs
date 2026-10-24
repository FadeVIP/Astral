'use strict';
const {DataError} = require('./store.cjs');
const kinds = ['cape','wings','hat','halo','aura'];
const nick = v => typeof v === 'string' && /^[a-z0-9_]{3,16}$/.test(v);
const string = (v,max,min=0) => typeof v === 'string' && v.length >= min && v.length <= max;
const integer = (v,max=1000000000) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const only = (v,keys) => !!v && Object.keys(v).every(k => keys.includes(k));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function validAppearance(d){return !!d && string(d.name,64,1)&&string(d.description,600)&&['citadel','forest'].includes(d.cover)&&string(d.updatedAt,40)&&(!('showServer'in d)||typeof d.showServer==='boolean')&&(!('coverImage'in d)||(string(d.coverImage,180000)&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(d.coverImage)));}
function validPack(d){
 const keys=['name','version','description','minecraft','forge','driveFileId','cover','coverImage','showServer','published','serverAddress','sha256','archiveBytes','modCount','archivePrefix','java','forgeInstaller','updatedAt'];
 return only(d,keys)&&validAppearance(d)&&string(d.version,40,1)&&/^1\.[0-9]{1,2}(\.[0-9]{1,2})?$/.test(d.minecraft||'')&&/^[0-9]{1,3}(\.[0-9]{1,4}){2,3}$/.test(d.forge||'')&&/^[A-Za-z0-9_-]{10,150}$/.test(d.driveFileId||'')&&typeof d.published==='boolean'&&string(d.serverAddress,253)&&hash(d.sha256)&&integer(d.archiveBytes,12884901888)&&d.archiveBytes>0&&integer(d.modCount,5000)&&d.modCount>0&&string(d.archivePrefix,200)&&only(d.java,['version','url','sha256','expectedBytes','folder','major'])&&['version','url','sha256','expectedBytes','folder'].every(k=>k in d.java)&&string(d.java.url,599)&&hash(d.java.sha256)&&only(d.forgeInstaller,['url','sha256','expectedBytes'])&&'expectedBytes'in d.forgeInstaller&&string(d.forgeInstaller.url,599)&&hash(d.forgeInstaller.sha256);
}
function unpack(doc) {
  function value(v) { if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x])=>[k,value(x)])); if ('arrayValue' in v) return (v.arrayValue.values || []).map(value); if ('integerValue' in v) return Number(v.integerValue); return Object.values(v)[0]; }
  return doc ? Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v])=>[k,value(v)])) : null;
}
function denied() { throw new DataError(403,'Permission denied'); }
function context(user, docs) {
  const uid = user?.uid, member = unpack(docs.get('members/'+uid));
  const owner = !!uid && typeof user.email === 'string' && user.firebase?.sign_in_provider !== 'anonymous';
  const active = owner && member?.status === 'active';
  return {uid,member,owner,active,nickname:member?.nickname?.toLowerCase(),admin:active && unpack(docs.get('launcherAdmins/'+uid))?.enabled === true};
}
function canRead(relative, user, docs) {
  const c = context(user,docs), parts = relative.split('/'), [collection,id,sub] = parts, d = unpack(docs.get(relative));
  if (parts.length === 2) {
    if (['cosmeticCatalog','launcherAppearance','launcherThemes','accountSkins','accountCosmetics','minepassConfig'].includes(collection)) return true;
    if (collection === 'launcherPacks') return true;
    if (['members','launcherAdmins'].includes(collection)) return c.owner && id === c.uid;
    if (collection === 'nicknames') return c.admin || (c.owner && d?.uid === c.uid);
    if (collection === 'accountWallets') return c.admin || (c.active && id === c.uid);
    if (collection === 'launcherContent') return true;
    if (collection === 'siteStarFinders') return c.admin || (!!c.uid && id.startsWith(c.uid+'_'));
    if (collection === 'siteSecrets') return id === 'first-star';
    if (collection === 'siteSecretWinners') return c.admin || (!!c.uid && d?.uid === c.uid);
    if (collection === 'supportTickets') return c.admin || (c.active && d?.uid === c.uid);
    if (collection === 'playerFriends') return c.active && [d?.from,d?.to].includes(c.nickname);
    if (collection === 'directPlayRequests') return c.active && [d?.host,d?.guest].includes(c.nickname);
    if (collection === 'playerPresence') return c.active && (id === c.nickname || friends(docs,c.nickname,id));
  }
  if (parts.length === 4) {
    if ((collection === 'accountWallets' && sub === 'history') || (collection === 'cosmeticOwners' && sub === 'items') || (collection === 'playerInbox' && sub === 'messages')) return c.admin || (c.active && id === c.uid);
    if (collection === 'supportTickets' && sub === 'messages') return c.admin || (c.active && unpack(docs.get('supportTickets/'+id))?.uid === c.uid);
  }
  return false;
}
function friends(docs,a,b) { return [a+'~'+b,b+'~'+a].some(id=>unpack(docs.get('playerFriends/'+id))?.status === 'accepted'); }
function sameExcept(a,b,keys) { return JSON.stringify(Object.entries(a || {}).filter(([k])=>!keys.includes(k)).sort()) === JSON.stringify(Object.entries(b || {}).filter(([k])=>!keys.includes(k)).sort()); }
function authorize(user, batch) {
  const {before,after,changes,time} = batch, c = context(user,before);
  const get = (p,view=after) => unpack(view.get(p));
  function purchase(uid,d) {
    const item = get('cosmeticCatalog/'+d?.purchase,before), old = get('accountWallets/'+uid,before);
    return c.active && uid === c.uid && only(d,['balance','purchase']) && integer(d.balance) && item?.enabled === true && integer(item.price,1000000)
      && d.balance === (old?.balance || 0)-item.price && !before.has('cosmeticOwners/'+uid+'/items/'+d.purchase)
      && get('cosmeticOwners/'+uid+'/items/'+d.purchase)?.item === d.purchase
      && changes.some(x=>x.path === 'accountWallets/'+uid) && changes.some(x=>x.path === 'cosmeticOwners/'+uid+'/items/'+d.purchase);
  }
  for (const change of changes) {
    const [collection,id,sub,subid] = change.path.split('/'), parts = change.path.split('/').length;
    const d = unpack(change.after), old = unpack(change.before);
    let ok = false;
    if (parts === 2 && collection === 'members') ok = c.owner && id === c.uid && !old && only(d,['email','nickname','status','createdAt']) && d.email === user.email && /^[A-Za-z0-9_]{3,16}$/.test(d.nickname || '') && d.status === 'active' && d.createdAt === time && get('nicknames/'+d.nickname.toLowerCase())?.uid === c.uid;
    if (parts === 2 && collection === 'nicknames') ok = c.owner && !old && only(d,['uid']) && d.uid === c.uid && get('members/'+c.uid)?.nickname?.toLowerCase() === id;
    if (parts === 2 && collection === 'accountWallets') {
      ok = purchase(id,d);
      if (c.admin && only(d,['balance']) && integer(d.balance)) {
        // Administrative changes must always have an immutable audit entry.
        ok = changes.some(x=>x.path.startsWith('accountWallets/'+id+'/history/') && !x.before && get(x.path)?.before === (old?.balance || 0) && get(x.path)?.after === d.balance && get(x.path)?.admin === c.uid);
      }
    }
    if (parts === 4 && collection === 'accountWallets' && sub === 'history') ok = c.admin && !old && only(d,['before','after','reason','admin','createdAt']) && integer(d.before) && integer(d.after) && string(d.reason,200,1) && d.admin === c.uid && d.createdAt === time && d.before === (get('accountWallets/'+id,before)?.balance || 0) && d.after === get('accountWallets/'+id)?.balance && changes.some(x=>x.path === 'accountWallets/'+id);
    if (parts === 4 && collection === 'cosmeticOwners' && sub === 'items') ok = !d ? c.admin : !old && only(d,['item']) && d.item === subid && !!get('cosmeticCatalog/'+subid,before) && (c.admin || purchase(id,get('accountWallets/'+id)));
    if (parts === 2 && collection === 'cosmeticCatalog') ok = c.admin && only(d,['name','kind','price','enabled','design','color','rarity']) && string(d.name,80,1) && kinds.includes(d.kind) && integer(d.price,1000000) && typeof d.enabled === 'boolean' && integer(d.design,3) && /^#[0-9a-fA-F]{6}$/.test(d.color || '') && ['common','rare','epic','legendary'].includes(d.rarity);
    if (parts === 2 && collection === 'accountSkins') ok = c.active && c.nickname === id && only(d,['uid','png','model']) && d.uid === c.uid && ['classic','slim'].includes(d.model) && string(d.png,100000) && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(d.png);
    if (parts === 2 && collection === 'accountCosmetics') ok = c.active && c.nickname === id && only(d,['uid',...kinds]) && d.uid === c.uid && kinds.every(k=>d[k] === undefined || d[k] === '' || (old&&(d[k]||'')===(old[k]||'')) || (get('cosmeticOwners/'+c.uid+'/items/'+d[k],before)?.item === d[k] && get('cosmeticCatalog/'+d[k],before)?.kind === k));
    if (parts === 2 && collection === 'supportTickets') ok = !old ? c.active && only(d,['uid','nickname','subject','status']) && d.uid === c.uid && d.nickname === c.member.nickname && string(d.subject,100,1) && d.status === 'open' : c.admin && !!d && sameExcept(old,d,['status']) && ['open','closed'].includes(d.status);
    if (parts === 4 && collection === 'supportTickets' && sub === 'messages') { const t = get('supportTickets/'+id); ok = c.active && !old && only(d,['uid','admin','text','createdAt']) && d.uid === c.uid && string(d.text,3000,1) && d.createdAt === time && ((c.admin && d.admin === true) || (t?.uid === c.uid && t.status === 'open' && d.admin === false)); }
    if (parts === 4 && collection === 'playerInbox' && sub === 'messages') ok = c.admin && !old && only(d,['text','createdAt']) && string(d.text,1000,1) && d.createdAt === time;
    if (parts === 2 && collection === 'playerFriends') {
      if (!old) ok = c.active && only(d,['from','to','status']) && d.from === c.nickname && nick(d.to) && d.to !== c.nickname && id === d.from+'~'+d.to && d.status === 'pending';
      else if (!d) ok = c.active && [old.from,old.to].includes(c.nickname);
      else ok = c.active && old.to === c.nickname && old.status === 'pending' && d.status === 'accepted' && sameExcept(old,d,['status']);
    }
    if(parts===2&&collection==='playerPresence')ok=c.active&&id===c.nickname&&only(d,['uid','pack','playing','updatedAt'])&&d.uid===c.uid&&string(d.pack,100)&&typeof d.playing==='boolean'&&d.updatedAt===time;
    if (parts === 2 && collection === 'directPlayRequests') {
      const now = Date.parse(time);
      if (!old) ok = c.active && only(d,['host','guest','status','expires']) && d.guest === c.nickname && nick(d.host) && d.host !== c.nickname && id === d.guest+'~'+d.host && friends(before,d.host,d.guest) && d.status === 'pending' && Number.isSafeInteger(d.expires) && d.expires > now && d.expires <= now+360000;
      else if (!d) ok = c.active && [old.host,old.guest].includes(c.nickname);
      else ok = c.active && old.host === c.nickname && friends(before,old.host,old.guest) && old.status === 'pending' && old.expires > now && sameExcept(old,d,['status','token','endpoints']) && (d.status === 'declined' ? only(d,['host','guest','status','expires']) : d.status === 'approved' && only(d,['host','guest','status','expires','token','endpoints']) && /^[a-f0-9]{64}$/.test(d.token || '') && string(d.endpoints,1024));
    }
    if (parts === 2 && collection === 'siteStarFinders') ok = !!c.uid && !old && only(d,['uid','nickname','contact','foundAt']) && d.uid === c.uid && /^[A-Za-z0-9_]{3,16}$/.test(d.nickname || '') && id === c.uid+'_'+d.nickname.toLowerCase() && string(d.contact,80) && d.foundAt === time;
    if (parts === 2 && ['minepassConfig','launcherThemes'].includes(collection)) ok = c.admin && id === (collection === 'minepassConfig' ? 'astral-local' : 'astral') && only(d,['config','revision','updatedAt']) && string(d.config,collection==='minepassConfig'?600000:220000) && Number.isSafeInteger(d.revision) && d.revision === (old?.revision || 0)+1 && string(d.updatedAt,40);
    if(parts===2&&collection==='launcherContent')ok=c.admin&&/^[a-z0-9][a-z0-9-]{2,63}-[a-f0-9]{16}$/.test(id)&&only(d,['manifest','revision','updatedAt'])&&string(d.manifest,650000)&&Number.isSafeInteger(d.revision)&&d.revision===(old?.revision||0)+1&&string(d.updatedAt,40);
    if(parts===2&&collection==='launcherAppearance')ok=c.admin&&id==='astral'&&only(d,['name','description','cover','coverImage','showServer','updatedAt'])&&validAppearance(d);
    if(parts===2&&collection==='launcherPacks')ok=c.admin&&(!d?id!=='astral':/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)&&validPack(d));
    if (!ok) denied();
  }
}
module.exports = {authorize,canRead,context,unpack};
