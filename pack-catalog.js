(function (scope) {
  'use strict';
  function normalize(doc) {
    if (!doc || typeof doc !== 'object') return null;
    const id = String(doc.name || '').split('/').pop(), f = doc.fields || {};
    const str = key => f[key]?.stringValue;
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id) || f.published?.booleanValue !== true) return null;
    const pack = { id, name:str('name'), description:str('description'), version:str('version'), minecraft:str('minecraft'), forge:str('forge'), driveFileId:str('driveFileId'), cover:str('cover'), serverAddress:str('serverAddress') || '', bytes:Number(f.archiveBytes?.integerValue), mods:Number(f.modCount?.integerValue) };
    if (typeof pack.name !== 'string' || !pack.name.trim() || pack.name.length > 64 || typeof pack.description !== 'string' || pack.description.length > 600 || typeof pack.version !== 'string' || !pack.version || pack.version.length > 40) return null;
    if (!/^1\.\d{1,2}(?:\.\d{1,2})?$/.test(pack.minecraft) || !/^\d{1,3}(?:\.\d{1,4}){2,3}$/.test(pack.forge) || !/^[\w-]{10,150}$/.test(pack.driveFileId) || !['citadel','forest'].includes(pack.cover)) return null;
    if (!Number.isSafeInteger(pack.bytes) || pack.bytes <= 0 || pack.bytes > 12 * 1024 ** 3 || !Number.isInteger(pack.mods) || pack.mods < 1 || pack.mods > 5000 || !/^[a-f0-9]{64}$/.test(str('sha256') || '') || typeof pack.serverAddress !== 'string' || pack.serverAddress.length > 253) return null;
    pack.url = 'https://drive.google.com/file/d/' + pack.driveFileId + '/view';
    const image=str('coverImage');
    if(typeof image==='string' && image.length<=180000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image))pack.coverImage=image;
    return pack;
  }
  async function load(project, fetcher = fetch) {
    if (!/^[a-z][a-z0-9-]{4,60}$/.test(project || '')) throw Error('Catalog configuration unavailable');
    if(project==='astral-524a1'&&fetcher===fetch){const {publicSnapshot}=await import('./public-data.js');const value=await publicSnapshot('packs');return value.documents.map(normalize).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'ru'));}
    let token = '', pages = 0; const packs = new Map();
    do {
      const url = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/launcherPacks?pageSize=100' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
      const response = await fetcher(url, {signal:AbortSignal.timeout(15000), redirect:'error', cache:'no-store'});
      if (!response.ok) throw Error('Catalog unavailable');
      const result = await response.json();
      if (result.documents && !Array.isArray(result.documents)) throw Error('Invalid catalog');
      for (const doc of result.documents || []) { const pack = normalize(doc); if (pack) packs.set(pack.id, pack); }
      token = result.nextPageToken || '';
      if (typeof token !== 'string' || ++pages > 20) throw Error('Invalid pagination');
    } while (token);
    return [...packs.values()].sort((a,b) => a.name.localeCompare(b.name,'ru'));
  }
  async function loadAppearance(project, fetcher=fetch) {
    if (!/^[a-z][a-z0-9-]{4,60}$/.test(project || ''))throw Error('Catalog configuration unavailable');
    if(project==='astral-524a1'&&fetcher===fetch){const {publicSnapshot}=await import('./public-data.js');const value=await publicSnapshot('appearance');const f=value.documents[0]?.fields;if(!f)return null;return {name:f.name?.stringValue,description:f.description?.stringValue,cover:f.cover?.stringValue,coverImage:f.coverImage?.stringValue};}
    const response=await fetcher('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/launcherAppearance/astral',{signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
    if(response.status===404)return null;if(!response.ok)throw Error('Appearance unavailable');
    const f=(await response.json()).fields || {},name=f.name?.stringValue,description=f.description?.stringValue,cover=f.cover?.stringValue,image=f.coverImage?.stringValue;
    if(typeof name!=='string'||!name.trim()||name.length>64||typeof description!=='string'||description.length>600||!['citadel','forest'].includes(cover))throw Error('Invalid appearance');
    if(image!==undefined && !(typeof image==='string'&&image.length<=180000&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image)))throw Error('Invalid cover');
    return {name,description,cover,coverImage:image};
  }
  function mount() {
    const grid = document.getElementById('pack-catalog-grid'); if (!grid) return;
    const status = document.getElementById('pack-catalog-status'), refresh = document.getElementById('pack-catalog-refresh');
    let working = false, last = [];
    async function updateAppearance(){
      try{
        const style=await loadAppearance(scope.__FROSTBORNE_FIREBASE_CONFIG__?.projectId);
        const main=grid.querySelector('[data-builtin=astral]');if(!style||!main)return;
        main.querySelector('h3').textContent=style.name;
        main.querySelector('.pack-card-description').textContent=style.description;
        const image=main.querySelector('.pack-card-cover');image.src=style.coverImage||'assets/catalog/'+style.cover+'.png';
      }catch{/* Keep the visible main pack during connection failures. */}
    }
    function element(tag, className, text) { const node=document.createElement(tag);node.className=className;if(text !== undefined)node.textContent=text;return node; }
    function card(pack) {
      const item=element('article','pack-card');item.dataset.packId=pack.id;
      const cover=element('img','pack-card-cover');const fallback='assets/catalog/'+pack.cover+'.png';cover.src=pack.coverImage || fallback;cover.addEventListener('error',()=>{if(cover.getAttribute('src')!==fallback)cover.src=fallback;},{once:true});cover.alt='';cover.loading='lazy';cover.width=1536;cover.height=1024;
      const body=element('div','pack-card-body');
      body.append(element('p','pack-card-kicker','Minecraft '+pack.minecraft+' · Forge '+pack.forge),element('h3','',pack.name),element('p','pack-card-description',pack.description || 'Выберите эту сборку в Astral Launcher или установите архив в свой лаунчер.'));
      const size = pack.bytes >= 1024 ** 3 ? (pack.bytes / 1024 ** 3).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ГБ' : Math.ceil(pack.bytes / 1024 ** 2)+' МБ';
      body.append(element('p','pack-card-meta','Версия '+pack.version+' · '+pack.mods+' модов · '+size));
      const download=element('a','btn-pill astral-dl-trigger','Скачать ZIP ↗');download.href=pack.url;download.target='_blank';download.rel='noopener noreferrer';
      const launcher=element('a','btn-pill','Скачать лаунчер');launcher.href='#download-options';
      const actions=element('div','pack-card-actions');actions.append(download,launcher);body.append(actions);
      const details=element('details','pack-card-install');details.append(element('summary','','Как установить'));
      details.append(element('p','','В Astral Launcher выберите «'+pack.name+'». Для другого лаунчера создайте профиль Minecraft '+pack.minecraft+' с Forge '+pack.forge+' и перенесите содержимое архива в его папку игры.'));
      body.append(details);item.append(cover,body);return item;
    }
    async function update() {
      if (working) return;working=true;refresh.disabled=true;status.textContent='Обновляем список сборок…';
      try {
        const packs=await load(scope.__FROSTBORNE_FIREBASE_CONFIG__?.projectId);
        const main=packs.find(p=>p.id==='astral'),fallback=grid.querySelector('[data-builtin=astral]');
        if(fallback)fallback.hidden=!!main;
        if(main){const link=document.querySelector('.archive-btn');if(link){link.href=main.url;link.closest('article').querySelector('.option-note').textContent=main.name+' · Minecraft '+main.minecraft+' · Forge '+main.forge+' · '+main.mods+' модов';}}
        else await updateAppearance();
        for(const item of grid.querySelectorAll('[data-pack-id]'))item.remove();
        const fragment=document.createDocumentFragment();packs.sort((a,b)=>(b.id==='astral')-(a.id==='astral')).forEach(pack=>fragment.append(card(pack)));grid.append(fragment);last=packs;
        status.textContent='Доступно сборок: '+(packs.length+(main?0:1))+'.';
      } catch {
        status.textContent=last.length ? 'Не удалось обновить каталог. Показан предыдущий список — попробуйте ещё раз.' : 'Дополнительные сборки временно недоступны. Основную Astral можно скачать ниже.';
      } finally {working=false;refresh.disabled=false;}
    }
    refresh.addEventListener('click',update);update();
    setInterval(()=>{if(!document.hidden)update();},60000);
  }
  if (typeof module === 'object' && module.exports) module.exports={normalize,load,loadAppearance};
  else mount();
})(typeof window === 'object' ? window : globalThis);
