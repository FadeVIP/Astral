'use strict';
const $ = id => document.getElementById(id);
let state;
let busy = false;
let noticeTimer;
let authMode = 'login';
let authWorking = false;
let statusLoading = false;
let launcherUpdate;
let adminPacks = [], editingPack = null, analysisId = null, verifiedIdentity = '', adminWorking = false;
let customCoverImage = '';
function renderLauncherUpdate(value = launcherUpdate) {
  if (!value) return;
  launcherUpdate = value;
  const busyUpdate = ['checking', 'downloading', 'installing'].includes(value.status);
  $('launcherUpdateBanner').hidden = !['downloading', 'ready', 'installing'].includes(value.status);
  const message = value.message + (value.status === 'downloading' ? ` · ${value.percent}%` : '');
  $('launcherUpdateMessage').textContent = message;
  $('launcherUpdateStatus').textContent = message;
  $('checkLauncherUpdate').disabled = busyUpdate || value.status === 'unsupported';
  $('installLauncherUpdate').hidden = value.status !== 'ready' || !!state?.busy;
  $('installLauncherUpdate').disabled = !!(busy || state?.gameOpen || authWorking);
}
window.astral.onLauncherUpdate(value => { if (state) state.launcherUpdate = value; renderLauncherUpdate(value); });
$('checkLauncherUpdate').onclick = () => action(async () => renderLauncherUpdate(await call('checkLauncherUpdate')));
$('installLauncherUpdate').onclick = () => action(async () => {
  $('installLauncherUpdate').disabled = true;
  try { await call('installLauncherUpdate'); } finally { await refresh(); }
});
function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 9000);
}
async function call(action, ...args) {
  const result = await window.astral[action](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function bytes(value) { return value >= 1024 ** 3 ? (value / 1024 ** 3).toFixed(2) + ' ГБ' : (value / 1024 ** 2).toFixed(1) + ' МБ'; }
function modLabel(n){return n+' '+(n%100>=11&&n%100<=14?'модов':n%10===1?'мод':n%10>=2&&n%10<=4?'мода':'модов');}
function showView(settings) {
  document.body.dataset.view = settings ? 'settings' : 'home';
  $('adminView').hidden = true;
  $('adminNav').classList.remove('selected');
  $('adminNav').removeAttribute('aria-current');
  $('homeView').hidden = settings;
  $('settingsView').hidden = !settings;
  $('homeNav').classList.toggle('selected', !settings);
  $('settingsNav').classList.toggle('selected', settings);
  if (settings) { $('homeNav').removeAttribute('aria-current'); $('settingsNav').setAttribute('aria-current', 'page'); }
  else { $('settingsNav').removeAttribute('aria-current'); $('homeNav').setAttribute('aria-current', 'page'); }
  if (state) render();
}
function render() {
  if (!state) return;
  window.dispatchEvent(new Event('astral-account-render'));
  document.body.dataset.theme=state.settings.theme||'star';
  $('lanPanel').hidden=!state.pack.supportsFriends;
  $('lanLocalProfiles').checked=state.settings.lanLocalProfiles?.[state.pack.id||'astral']!==false;
  $('lanLocalProfiles').disabled=busy||state.gameOpen;
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.setAttribute('aria-pressed',String(b.dataset.themeChoice===document.body.dataset.theme));
  if (!state) return;
  renderLauncherUpdate(state.launcherUpdate);
  renderCatalog();
  $('minecraft').textContent = state.pack.minecraft;
  $('forge').textContent = 'Forge ' + state.pack.forge;
  $('mods').textContent = modLabel(state.pack.modCount);
  $('appVersion').textContent = state.appVersion;
  $('folderPath').textContent = state.settings.directory;
  $('ramRange').max = state.maxGB;
  $('ramRange').value = state.settings.ramMB / 1024;
  $('ramMax').textContent = state.maxGB + ' ГБ';
  $('ramHelp').textContent = `На компьютере ${state.totalGB} ГБ. Для сборки рекомендуем 6–8 ГБ; часть памяти оставлена системе.`;
  $('ramLabel').textContent = state.settings.ramMB / 1024 + ' ГБ';
  $('ramOutput').textContent = state.settings.ramMB / 1024 + ' ГБ';
  $('releaseLabel').textContent = 'ASTRAL · ' + state.pack.version.toUpperCase();
  $('primaryText').textContent = busy ? 'Подготовка…' : state.gameOpen ? 'Игра запущена' : !state.user ? 'Выбрать вход' : state.user.status === 'unavailable' ? 'Ожидаем профиль…' : state.user.status === 'pending' ? 'Завершить вход' : state.installed ? 'Играть' : 'Установить';
  $('primaryIcon').textContent = '';
  $('primaryIcon').dataset.icon = state.installed ? 'play' : 'download';
  $('primaryIcon').setAttribute('aria-hidden', 'true');
  $('primaryButton').disabled = busy || state.gameOpen || state.user?.status === 'unavailable';
  $('cancelButton').hidden = !busy || !state.canCancel;
  $('ramRange').disabled = busy || state.gameOpen;
  $('chooseFolder').disabled = busy || state.gameOpen;
  $('accountButton').disabled = busy || state.gameOpen;
  $('settingsAccount').disabled = busy || state.gameOpen;
  $('repairButton').disabled = busy || state.gameOpen || !state.installed;
  $('uninstallPack').disabled = busy || state.gameOpen || !state.installed;
  $('accountName').textContent = state.user?.nickname || 'Аккаунт Astral';
  $('accountStatus').textContent = !state.user ? 'Войдите, чтобы играть' : state.user.guest ? 'Гость · локальный ник' : state.user.status === 'active' ? 'Участник Astral' : state.user.status === 'unavailable' ? 'Вход сохранён · профиль недоступен' : 'Доступ не подтверждён';
  $('accountButton').textContent = state.user?.status === 'active' ? 'Мой аккаунт ↗' : 'Вход / Регистрация ↗';
  $('rememberInput').disabled = !state.canRemember;
  if (!state.canRemember) $('rememberInput').checked = false;
  if (!busy && !['error', 'running'].includes(state.progress?.phase)) {
    $('statusTitle').textContent = state.installed ? 'Всё готово к приключению' : 'Этот мир ждёт тебя';
    $('statusIcon').textContent = state.installed ? '✓' : '↓';
    $('statusMessage').textContent = !state.user ? 'Войди в Astral — и отправляйся в свой мир.' : state.installed ? (state.pack.hasCommunityServer?'Сервер «Наследие земли» появится в разделе «Совместная игра».':'Проверим обновления и откроем Minecraft.') : 'Установить сборку · ' + bytes(state.pack.archiveBytes);
    $('progress').hidden = true;
  }
  if (!busy && !$('adminView').hidden) { $('statusTitle').textContent='Студия сборок'; $('statusMessage').textContent='Проверка архива → публикация → сборка в библиотеке игроков'; $('releaseLabel').textContent='ASTRAL · УПРАВЛЕНИЕ КАТАЛОГОМ'; }
}
function updateProgress(value) {
  if (state) state.progress = value;
  $('statusMessage').textContent = value.message;
  const titles = { download: 'Загрузка файлов', extract: 'Установка сборки', verify: 'Проверка архива', ready: 'Сборка установлена', error: 'Не удалось завершить операцию', idle: 'Установка остановлена', prepare: 'Подготовка Minecraft', running: 'Игра запущена' };
  $('statusTitle').textContent = titles[value.phase] || 'Подготовка';
  $('statusIcon').textContent = value.phase === 'error' ? '!' : ['ready', 'running'].includes(value.phase) ? '✓' : '↓';
  const bar = $('progress');
  bar.hidden = !['download', 'extract', 'verify', 'prepare'].includes(value.phase);
  if (value.total > 0) {
    bar.value = Math.min(100, value.received / value.total * 100);
    $('progressDetails').textContent = `${bytes(value.received)} / ${bytes(value.total)}${value.speed ? ' · ' + bytes(value.speed) + '/с · осталось ~' + Math.ceil((value.total-value.received)/value.speed/60) + ' мин' : ''}`;
  } else if (value.totalFiles) {
    bar.value = value.count / value.totalFiles * 100;
    $('progressDetails').textContent = `${value.count} / ${value.totalFiles} файлов`;
  } else { bar.removeAttribute('value'); $('progressDetails').textContent = 'Для первого запуска нужен интернет'; }
}
async function refresh() { state = await call('state'); busy = state.busy; render(); }
async function action(fn) { try { await fn(); } catch (error) { notice(error.message); } }
$('homeNav').onclick = () => showView(false);
$('settingsNav').onclick = $('adjustMemory').onclick = () => showView(true);
$('siteButton').onclick = () => action(() => call('openSite'));
$('driveButton').onclick = () => action(() => call('openDrive'));
$('folderButton').onclick = () => action(() => call('openFolder'));
$('repairButton').onclick = () => action(async () => {
  if (busy) return;
  busy = true; state.canCancel = true; $('cancelButton').disabled = false; render();
  try { const result = await call('repair'); notice(`Проверено: ${result.checked}. Восстановлено: ${result.repaired}. ${result.online ? 'Установлена актуальная версия.' : 'Сервер обновлений недоступен, проверена сохранённая версия.'}`); }
  finally { await refresh(); }
});
$('chooseFolder').onclick = () => action(async () => { state = await call('chooseFolder'); render(); });
$('ramRange').oninput = () => { $('ramOutput').textContent = $('ramRange').value + ' ГБ'; };
$('ramRange').onchange = () => action(async () => {
  $('ramRange').disabled = true;
  try { state = await call('saveMemory', Number($('ramRange').value) * 1024); }
  finally { await refresh(); }
});
$('accountButton').onclick = $('settingsAccount').onclick = () => openAuth();
$('cancelButton').onclick = () => action(async () => { $('cancelButton').disabled = true; await call('cancel'); });
$('primaryButton').onclick = () => action(async () => {
  if (busy) return;
  if (!state.user || state.user.status === 'pending') { openAuth(); return; }
  busy = true; state.canCancel = !state.installed; $('cancelButton').disabled = false; render();
  try { await call(state.installed ? 'launch' : 'install'); }
  finally { await refresh(); }
});
window.astral.onProgress(value => {
  updateProgress(value);
  if (['ready', 'error'].includes(value.phase) && !busy) refresh().catch(error => notice(error.message));
});
function setAuthMode(mode) {
  authMode = mode;
  $('authTitle').textContent = mode === 'register' ? 'Начни свою историю' : 'С возвращением';
  $('authSubmit').textContent = mode === 'register' ? 'Создать аккаунт Astral →' : 'Войти в Astral →';
  const guest=mode==='guest',completion=mode==='completeProfile',needsNickname=mode==='register'||completion||guest;
  $('guestHint').hidden=!guest;
  if(guest){$('authTitle').textContent='Играть без аккаунта';$('authSubmit').textContent='Продолжить с этим ником →';$('nicknameInput').value=state.settings.guestNickname||'';}
  $('nicknameField').hidden=!needsNickname;
  $('nicknameInput').disabled=!needsNickname;
  $('nicknameInput').required=needsNickname;
  $('nicknameHint').textContent='3–16 символов: A–Z, 0–9, _';
  for(const id of ['emailInput','passwordInput','rememberInput']) {$(id).closest('label').hidden=completion||guest;$(id).disabled=completion||guest;}
  $('resetPassword').hidden=completion||guest;
  document.querySelector('.auth-tabs').hidden=completion;
  if(completion){$('authTitle').textContent='Заверши игровой профиль';$('authSubmit').textContent='Сохранить ник и продолжить';}
  $('passwordInput').minLength = mode === 'register' ? 8 : 1;
  $('passwordInput').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('loginTab').classList.toggle('active', mode === 'login');
  $('registerTab').classList.toggle('active', mode === 'register');
  $('authError').hidden = true;
}
function openAuth() {
  const signed = !state?.user?.guest && (state?.user?.status === 'active' || (state?.user && !['pending', 'active'].includes(state.user.status)));
  $('authForm').hidden = !!signed;
  $('signedInPanel').hidden = !signed;
  document.querySelector('.auth-tabs').hidden = !!signed;
  setAuthMode(state?.user?.status==='pending'?'completeProfile':'login');
  if(signed)document.querySelector('.auth-tabs').hidden=true;
  if (signed) {
    $('authTitle').textContent = 'Твой аккаунт';
    $('signedInDetails').textContent = `${state.user.nickname} · ${state.user.guest?'Гостевой режим':state.user.email} · ${state.user.guest?'Без аккаунта':state.user.status === 'active' ? 'Доступ открыт' : state.user.status === 'unavailable' ? 'Вход подтверждён. Ждём восстановления базы; повторять вход не нужно.' : 'Доступ приостановлен'}`;
  } else if (state?.user?.email) $('emailInput').value = state.user.email;
  $('authDialog').showModal();
}
function authBusyUI(value) {
  authWorking = value;
  renderLauncherUpdate();
  for (const id of ['guestTab', 'authSubmit', 'loginTab', 'registerTab', 'authClose', 'resetPassword', 'logoutButton']) $(id).disabled = value;
}
$('guestTab').onclick=()=>{$('authForm').hidden=false;$('signedInPanel').hidden=true;setAuthMode('guest');};
$('loginTab').onclick = () => setAuthMode('login');
$('registerTab').onclick = () => setAuthMode('register');
$('authClose').onclick = () => $('authDialog').close();
$('authDialog').addEventListener('cancel', event => { if (authWorking) event.preventDefault(); });
$('authDialog').addEventListener('close', () => { $('passwordInput').value = ''; });
$('authForm').onsubmit = async event => {
  event.preventDefault();
  if (authWorking) return;
  $('authError').hidden = true;
  authBusyUI(true);
  try {
    const credentials=['completeProfile','guest'].includes(authMode)?{nickname:$('nicknameInput').value}:{email:$('emailInput').value,password:$('passwordInput').value,remember:$('rememberInput').checked,...(authMode==='register'?{nickname:$('nicknameInput').value}:{})};
    state = await call(authMode, credentials);
    $('passwordInput').value = '';
    render(); $('authDialog').close(); notice(authMode==='guest'?'Гостевой режим включён. Можно запускать игру.':'Вход выполнен. Добро пожаловать в Astral!');
  } catch (error) {
    $('passwordInput').value = '';
    $('authError').textContent = error.message; $('authError').hidden = false;
    await refresh().catch(() => {});
    if(state?.user?.status==='pending'){setAuthMode('completeProfile');$('authError').textContent='Вход подтверждён. Выбери ник, чтобы завершить игровой профиль.';$('authError').hidden=false;}
  } finally { authBusyUI(false); }
};
$('logoutButton').onclick = () => action(async () => {
  authBusyUI(true);
  try { state = await call('logout'); render(); $('authDialog').close(); }
  finally { authBusyUI(false); }
});
$('resetPassword').onclick = async () => {
  authBusyUI(true);
  try { await call('resetPassword', $('emailInput').value); $('authError').textContent = 'Если аккаунт существует, письмо для сброса пароля отправлено.'; }
  catch (error) { $('authError').textContent = error.message; }
  finally { $('authError').hidden = false; authBusyUI(false); }
};
refresh().then(() => { if (state.authNotice) notice(state.authNotice); }).catch(error => notice('Не удалось загрузить настройки: ' + error.message));


function renderCatalog() {
  $('adminNav').hidden = !state.admin;
  $('adminNav').disabled = busy || state.gameOpen;
  if (!state.admin && !$('adminView').hidden) showView(false);
  $('breadcrumbPack').textContent = state.pack.name;
  $('packHero').dataset.cover = state.pack.cover || 'citadel';
  $('packHero').dataset.packId = state.pack.id;
  $('heroCustomCover').hidden=!state.pack.coverImage;
  if(state.pack.coverImage)$('heroCustomCover').src=state.pack.coverImage;else $('heroCustomCover').removeAttribute('src');
  $('heroTitle').textContent = state.pack.id === 'astral' && state.pack.name === 'Astral RPG' ? 'Твоя история.\nТвоя вселенная.' : state.pack.name;
  $('heroDescription').textContent = state.pack.description || 'Выбери свой путь. Начни новое приключение.';
  const tags = state.pack.id === 'astral' ? ['Сюжетное RPG','Исследование','Магия и механизмы'] : ['Forge '+state.pack.forge,'Версия '+state.pack.version,'Локальная игра и LAN'];
  document.querySelectorAll('.hero-tags span').forEach((el,i)=>el.textContent=tags[i]);
  document.querySelector('.hero-edition small').textContent=state.pack.id==='astral'?'CLIENT OPTIMIZED':state.pack.version;
  $('refreshCatalog').disabled = busy || state.gameOpen || authWorking;
  $('refreshCatalog').title = state.catalogMessage || '';
  const key = JSON.stringify([state.packs,state.pack.id,busy,state.gameOpen,state.settings.favorites]);
  if ($('packCards').dataset.key === key) return;
  $('packCards').dataset.key = key;
  $('packCards').replaceChildren();
  for (const pack of [...(state.packs || [])].sort((a,b)=>Number(state.settings.favorites?.includes(b.id))-Number(state.settings.favorites?.includes(a.id)))) {
    const button = document.createElement('button'); button.className = 'pack-card'; button.dataset.cover = pack.cover;
    button.classList.toggle('active',pack.id === state.pack.id); button.setAttribute('aria-pressed',String(pack.id === state.pack.id));
    button.disabled = busy || state.gameOpen;
    const icon = document.createElement('span'); icon.className='pack-card-art';
    if(pack.coverImage)icon.style.backgroundImage='url("'+pack.coverImage+'")';
    const copy = document.createElement('span'); const name=document.createElement('strong'); name.textContent=pack.name;
    const meta = document.createElement('small');meta.textContent=`${pack.minecraft} · Forge · ${modLabel(pack.modCount)}`;copy.append(name,meta);
    button.append(icon,copy);button.onclick=()=>action(async()=>{state=await call('selectPack',pack.id);render();});
    $('packCards').append(button);
  }
}
window.astral.onCatalogChanged(()=>refresh().catch(()=>{}));
$('refreshCatalog').onclick=()=>action(async()=>{ $('refreshCatalog').disabled=true; try{state=await call('refreshCatalog');render();notice(state.catalogMessage);}finally{$('refreshCatalog').disabled=false;} });
const catalogTimer = setInterval(()=>{if(!busy&&!authWorking&&!state?.gameOpen&&$('adminView').hidden)call('refreshCatalog').then(value=>{state=value;render();}).catch(()=>{});},120000);
window.addEventListener('beforeunload',()=>clearInterval(catalogTimer));
function readDraft() {
  return {id:editingPack?.id,updatedAt:editingPack?.updatedAt,analysisId,name:$('packName').value,version:$('packVersion').value,
    description:$('packDescription').value,driveUrl:$('packDrive').value,minecraft:$('packMinecraft').value.trim(),forge:$('packForge').value.trim(),
    showServer:false,serverAddress:'',cover:document.querySelector('input[name=packCover]:checked').value,coverImage:customCoverImage,published:$('packPublished').checked};
}
function formIdentity() {return [$('packDrive').value.trim(),$('packMinecraft').value.trim(),$('packForge').value.trim()].join('|');}
function editPack(pack) {
  contentDraft=null;$('contentBody').hidden=true;$('contentStudio').hidden=!pack;
  editingPack = pack || null; analysisId=null;
  customCoverImage=pack?.coverImage || '';
  $('editorTitle').textContent=pack?.id==='astral' ? 'Редактировать основную Astral' : pack ? 'Редактировать сборку' : 'Новая сборка';
  for (const [id,key] of [['packName','name'],['packVersion','version'],['packDescription','description'],['packMinecraft','minecraft'],['packForge','forge']]) $(id).value=pack?.[key] || '';
  $('packDrive').value=pack ? `https://drive.google.com/file/d/${pack.driveFileId}/view` : '';
  document.querySelector(`input[name=packCover][value="${pack?.cover || 'citadel'}"]`).checked=true;
  $('packPublished').checked=pack?.published !== false;
  $('deletePack').hidden=!pack || pack.id==='astral';
  verifiedIdentity=pack ? formIdentity() : '';
  $('analysisResult').textContent=pack?.id==='astral' ? 'Все настройки доступны. При смене ZIP, Minecraft или Forge сначала проверь архив. Новая базовая сборка установится отдельно от прежних миров.' : pack ? `${pack.modCount} модов · ${bytes(pack.archiveBytes)} · Java ${pack.java.major || 17}. Изменение ссылки или версий потребует проверки.` : 'Сначала проверь ZIP: проверка скачает архив на этот компьютер.';
  updateEditor();
}
function updateEditor(){
  const isBuiltin=editingPack?.id==='astral';
  $('packForm').classList.remove('builtin-editor');
  $('publishPack').disabled=adminWorking || !verifiedIdentity || formIdentity()!==verifiedIdentity;
  $('publishPack').textContent=$('packPublished').checked ? editingPack ? 'Сохранить изменения' : '2. Опубликовать' : 'Сохранить скрытой';
  $('analyzePack').disabled=adminWorking;
  $('newPack').disabled=adminWorking;
  $('deletePack').disabled=adminWorking;
  $('choosePackCover').disabled=adminWorking;
  $('removePackCover').disabled=adminWorking || !customCoverImage;
  $('customCoverPreview').hidden=!customCoverImage;
  if(customCoverImage)$('customCoverPreview').src=customCoverImage;else $('customCoverPreview').removeAttribute('src');
  $('coverChoices').dataset.custom=String(!!customCoverImage);
  $('customCoverStatus').textContent=customCoverImage?'Используется свой фон. После сохранения он появится в лаунчере и на сайте.':'PNG, JPG или WebP до 10 МБ. Лучше всего подойдёт горизонтальное изображение.';
  for (const input of $('packForm').querySelectorAll('input,textarea')) input.disabled=adminWorking;

  $('analyzePack').hidden=false;
}
async function loadAdmin(){
  adminPacks=await call('adminPacks');$('adminPackList').replaceChildren();
  for(const pack of adminPacks){const b=document.createElement('button');b.className='admin-pack-item';b.dataset.packId=pack.id;const title=document.createElement('strong');title.textContent=pack.name;const small=document.createElement('small');small.textContent=pack.id==='astral'?'Основная сборка · полное редактирование':`${pack.minecraft} · ${pack.published?'Опубликована':'Скрыта'}`;b.append(title,small);b.onclick=()=>{if(!adminWorking)editPack(pack);};$('adminPackList').append(b);}
  if(!adminPacks.length)$('adminPackList').textContent='Дополнительных сборок пока нет.';
}
$('adminNav').onclick=()=>action(async()=>{await loadAdmin();showView(false);document.body.dataset.view='admin';$('homeView').hidden=true;$('adminView').hidden=false;$('homeNav').classList.remove('selected');$('homeNav').removeAttribute('aria-current');$('adminNav').classList.add('selected');$('adminNav').setAttribute('aria-current','page');editPack(null);render();});
$('newPack').onclick=()=>editPack(null);
$('choosePackCover').onclick=()=>action(async()=>{
  adminWorking=true;updateEditor();
  try{const selected=await call('selectPackCover');if(selected)customCoverImage=selected.image;}
  finally{adminWorking=false;updateEditor();}
});
$('removePackCover').onclick=()=>{customCoverImage='';updateEditor();};
document.querySelectorAll('input[name=packCover]').forEach(input=>input.addEventListener('change',()=>{customCoverImage='';updateEditor();}));
$('packForm').oninput=()=>updateEditor();
$('analyzePack').onclick=()=>action(async()=>{
  if(!$('packForm').reportValidity())return;
  const input=readDraft();adminWorking=true;busy=true;state.canCancel=true;$('cancelButton').disabled=false;render();updateEditor();
  $('analysisResult').textContent='Проверяем архив и компоненты. Прогресс — внизу окна; проверку можно отменить.';
  try{const result=await call('analyzePack',input);analysisId=result.analysisId;$('packForge').value=result.pack.forge;verifiedIdentity=formIdentity();$('analysisResult').textContent=`✓ ${result.pack.modCount} модов · ${bytes(result.pack.archiveBytes)} · Java ${result.pack.java.major || 17}. Архив готов к публикации.`;}
  catch(e){analysisId=null;verifiedIdentity='';$('analysisResult').textContent=e.message;throw e;}
  finally{adminWorking=false;await refresh();updateEditor();}
});
$('packForm').onsubmit=event=>{event.preventDefault();action(async()=>{
  const input=readDraft();adminWorking=true;busy=true;state.canCancel=false;render();updateEditor();
  try{const pack=await call('publishPack',input);await loadAdmin();editPack(pack);notice(pack.published?'Сборка опубликована. Она появится у игроков автоматически в течение двух минут.':'Сборка скрыта из каталога. Установленные файлы игроков сохраняются.');}
  finally{adminWorking=false;await refresh();updateEditor();}
});};

let contentDraft=null,contentBase=[],contentRestorable=new Set(),contentKnown=new Map(),contentMetadata={};
function contentInput(){if(!editingPack||!contentDraft)throw Error('Откройте редактор файлов.');contentDraft.version=$('contentVersion').value.trim();contentDraft.archivedFiles=[...contentKnown.values()].filter(f=>contentDraft.remove.includes(f.path));return {id:editingPack.id,draft:contentDraft};}
let contentCategory='mods',contentSelection=new Set();
function contentNames(){const q=$('contentSearch').value.toLowerCase();return [...new Set([...contentBase,...contentDraft.files.map(f=>f.path),...contentDraft.remove])].sort().filter(p=>p.toLowerCase().includes(q)&&(!contentCategory||p.startsWith(contentCategory+'/'))&&($('contentStateFilter').value==='all'||contentDraft.remove.includes(p)===($('contentStateFilter').value==='removed')));}
function toggleContent(name,remove){
 if(adminWorking||name==='options.txt')return false;
 if(!remove){if(!contentKnown.has(name)&&!contentRestorable.has(name)){$('contentFilePath').value=name;notice('Для возврата нужен источник файла. Добавьте ссылку Drive.');return false;}contentDraft.remove=contentDraft.remove.filter(p=>p!==name);if(contentKnown.has(name)&&!contentDraft.files.some(f=>f.path===name))contentDraft.files.push(contentKnown.get(name));}
 else{const item=contentDraft.files.find(f=>f.path===name);if(item)contentKnown.set(name,item);contentDraft.files=contentDraft.files.filter(f=>f.path!==name);if(!contentDraft.remove.includes(name))contentDraft.remove.push(name);}
 return true;
}
function renderContent(){
 if(!contentDraft)return;
 const removed=new Set(contentDraft.remove),add=new Map(contentDraft.files.map(f=>[f.path,f])),found=contentNames();
 $('contentFiles').replaceChildren();
 for(const name of found){const row=document.createElement('div');row.className='content-file manager-row'+(removed.has(name)?' is-removed':'');
 const select=document.createElement('input');select.type='checkbox';select.checked=contentSelection.has(name);select.setAttribute('aria-label','Выбрать '+name);select.onchange=()=>{select.checked?contentSelection.add(name):contentSelection.delete(name);updateContentSelection();};
 const text=document.createElement('span');text.className='manager-filename';text.textContent=(add.get(name)||contentKnown.get(name)||contentMetadata[name])?.title||name.split('/').pop();text.title=name;const folder=document.createElement('small');const version=(add.get(name)||contentKnown.get(name)||contentMetadata[name])?.version;folder.textContent=name+(version&&!version.includes('${')?' · '+version:''); text.append(folder);
 const info=add.get(name)||contentKnown.get(name)||contentMetadata[name],size=document.createElement('small');size.textContent=info?.bytes!==undefined?(info.bytes/1024**2).toFixed(2)+' МБ':'—';size.title=info?'Размер проверенного файла':'Размер станет доступен после проверки файла Drive';
 const status=document.createElement('small');status.className='manager-state';status.textContent=removed.has(name)?'Убрать у игроков':add.has(name)?contentBase.includes(name)?'Обновлять':'Добавить':'В сборке';
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=name==='options.txt'?'Заменить':removed.has(name)?'Вернуть':'Убрать';button.disabled=adminWorking;
 button.onclick=()=>{if(name==='options.txt'){$('contentFilePath').value=name;$('contentAddPanel').open=true;$('contentFileUrl').focus();return;}toggleContent(name,!removed.has(name));renderContent();};
 const art=document.createElement('span');art.className='manager-art';if(info?.icon&&(/^(data:image\/png;base64,|https:\/\/cdn\.modrinth\.com\/data\/)/.test(info.icon))){const img=document.createElement('img');img.src=info.icon;img.alt='';img.loading='lazy';img.onerror=()=>{art.textContent=name.slice(name.lastIndexOf('/')+1,name.lastIndexOf('/')+2).toUpperCase();};art.append(img);}else art.textContent=name.slice(name.lastIndexOf('/')+1,name.lastIndexOf('/')+2).toUpperCase();text.prepend(art);row.append(select,text,size,status,button);$('contentFiles').append(row);}
 $('contentStatus').textContent=`Ревизия ${contentDraft.remoteRevision||0} · Файлов в разделе: ${found.length} · Управляемых файлов: ${contentDraft.files.length} · Удалений: ${contentDraft.remove.length}`;
 updateContentSelection();
}
function updateContentSelection(){$('contentSelectionCount').textContent='Выбрано: '+contentSelection.size;for(const id of ['contentRemoveSelected','contentRestoreSelected'])$(id).disabled=adminWorking||!contentSelection.size;}
async function contentAction(fn){if(adminWorking)return;adminWorking=true;busy=true;updateEditor();for(const b of $('contentStudio').querySelectorAll('button,input,select'))b.disabled=true;
 try{await fn();}finally{adminWorking=false;busy=false;for(const b of $('contentStudio').querySelectorAll('button,input,select'))b.disabled=false;await refresh();updateEditor();}}
function mergeContent(rows){for(const row of rows){contentDraft.files=contentDraft.files.filter(f=>f.path.toLowerCase()!==row.path.toLowerCase());contentDraft.remove=contentDraft.remove.filter(p=>p.toLowerCase()!==row.path.toLowerCase());contentDraft.files.push(row);contentKnown.set(row.path,row);}renderContent();}
$('contentOpen').onclick=()=>action(()=>contentAction(async()=>{const result=await call('contentOpen',{id:editingPack.id});contentSelection.clear();contentMetadata=result.metadata||{};contentDraft=result.draft;contentBase=result.files;contentRestorable=new Set(result.restorable||[]);contentKnown=new Map([...(contentDraft.archivedFiles||[]),...contentDraft.files].map(f=>[f.path,f]));$('contentVersion').value=contentDraft.version;$('contentBody').hidden=false;renderContent();if(!result.installed&&editingPack.id!=='astral')notice('Для списка исходных файлов сначала установи сборку. Дополнения из Drive можно подготовить уже сейчас.');}));
$('contentReset').onclick=()=>action(()=>contentAction(async()=>{const result=await call('contentOpen',{id:editingPack.id,fresh:true});contentSelection.clear();contentMetadata=result.metadata||{};contentDraft=result.draft;contentBase=result.files;contentRestorable=new Set(result.restorable||[]);contentKnown=new Map([...(contentDraft.archivedFiles||[]),...contentDraft.files].map(f=>[f.path,f]));$('contentVersion').value=contentDraft.version;renderContent();notice('Загружена опубликованная версия. Предыдущий сохранённый черновик оставлен в резервной копии.');}));
$('contentAdd').onclick=()=>action(()=>contentAction(async()=>{contentInput();mergeContent([await call('contentImport',{url:$('contentFileUrl').value.trim(),target:$('contentFilePath').value.trim()})]);notice('Файл проверен и добавлен в черновик. Игроки ещё не получили изменение.');}));
$('contentImportFolder').onclick=()=>action(()=>contentAction(async()=>{contentInput();mergeContent(await call('contentFolder',{url:$('contentFolderUrl').value.trim(),target:$('contentTarget').value}));notice('Файлы папки проверены и добавлены в черновик.');}));
$('contentSaveDriveKey').onclick=()=>action(()=>contentAction(async()=>{await call('contentDriveKey',{apiKey:$('contentDriveKey').value.trim()});$('contentDriveKey').value='';notice('Ключ сохранён на этом компьютере.');}));
$('contentSearch').oninput=renderContent;
$('contentStateFilter').onchange=renderContent;
$('contentExport').onclick=()=>action(async()=>{if(!contentDraft)return;const rows=[...new Set([...contentBase,...contentDraft.files.map(f=>f.path),...contentDraft.remove])].sort().map(path=>({path,removed:contentDraft.remove.includes(path)}));await call('contentExport',{id:editingPack.id,rows});});
for(const b of document.querySelectorAll('[data-content-folder]'))b.onclick=()=>action(()=>call('contentFolderOpen',{id:editingPack.id,folder:b.dataset.contentFolder}));

$('contentSelectVisible').onclick=()=>{for(const p of contentNames())contentSelection.add(p);renderContent();};
$('contentClearSelection').onclick=()=>{contentSelection.clear();renderContent();};
for(const [id,remove] of [['contentRemoveSelected',true],['contentRestoreSelected',false]])$(id).onclick=()=>{if(adminWorking)return;let n=0;for(const name of contentSelection)if(toggleContent(name,remove))n++;contentSelection.clear();renderContent();notice(`Изменено файлов в черновике: ${n}. Игроки получат изменения только после публикации.`);};
for(const b of document.querySelectorAll('[data-content-category]'))b.onclick=()=>{contentCategory=b.dataset.contentCategory;for(const x of document.querySelectorAll('[data-content-category]'))x.setAttribute('aria-pressed',String(x===b));renderContent();};
$('contentQuickAdd').onclick=()=>{$('contentAddPanel').open=true;$('contentFilePath').value=contentCategory?contentCategory+'/':'';$('contentFileUrl').focus();};
$('contentSave').onclick=()=>action(()=>contentAction(async()=>{contentDraft=await call('contentSave',contentInput());renderContent();notice('Черновик сохранён на этом ПК. У игроков ничего не изменилось.');}));
$('contentPublish').onclick=()=>action(()=>contentAction(async()=>{contentDraft=await call('contentPublish',contentInput());renderContent();notice('Обновление опубликовано. Игроки с новым лаунчером получат его перед запуском Minecraft.');}));

$('deletePack').onclick=()=>action(async()=>{if(!editingPack)return;adminWorking=true;updateEditor();try{if(await call('deletePack',{id:editingPack.id,updatedAt:editingPack.updatedAt})){await loadAdmin();editPack(null);notice('Сборка удалена из общего каталога. Файлы игроков сохранены.');}}finally{adminWorking=false;await refresh();updateEditor();}});
$('uninstallPack').onclick=()=>action(async()=>{try{if(await call('uninstallPack'))notice('Сборка перемещена в корзину Windows.');}finally{await refresh();}});

for(const b of document.querySelectorAll('[data-theme-choice]'))b.onclick=()=>action(async()=>{state=await call('setTheme',b.dataset.themeChoice);render();});
$('lanLocalProfiles').onchange=()=>action(async()=>{try{state=await call('setLanLocalProfiles',$('lanLocalProfiles').checked);}finally{render();}});

const contentDrop=document.createElement('div');contentDrop.className='content-drop';contentDrop.tabIndex=0;contentDrop.textContent='Перетащите файл или ссылку Drive сюда. Файл загружается в Google Drive отдельно; здесь подставится путь.';$('contentFileUrl').closest('.content-import').prepend(contentDrop);
contentDrop.ondragover=e=>{e.preventDefault();contentDrop.dataset.active='true';};contentDrop.ondragleave=()=>delete contentDrop.dataset.active;
contentDrop.ondrop=e=>{e.preventDefault();delete contentDrop.dataset.active;if(adminWorking)return;const file=e.dataTransfer.files[0];if(file){const name=file.name;if(/[\\/]/.test(name))return;const root=name==='options.txt'?'':name.endsWith('.jar')?'mods/':$('contentTarget').value?$('contentTarget').value+'/':'resourcepacks/';$('contentFilePath').value=root+name;notice('Путь выбран. Загрузите этот файл в Drive и вставьте публичную ссылку.');}else{const url=e.dataTransfer.getData('text/uri-list').split('\n').find(x=>x&&!x.startsWith('#'))||e.dataTransfer.getData('text/plain');if(/^https:\/\/drive\.google\.com\//.test(url)){$('contentFileUrl').value=url.trim();notice('Ссылка вставлена. Проверьте путь и добавьте файл в черновик.');}}};
