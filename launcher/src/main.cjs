'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage, nativeTheme, nativeImage } = require('electron');
const { prepareCover } = require('./cover-image.cjs');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { removePinnedServer } = require('./server-bridge.cjs');
const packServer = require('./pack-server.cjs');
let activeServerBridge=null, directPlay=null;
async function closeDirectPlay(){const active=directPlay;directPlay=null;await active?.close();}
function closeServerBridge(){activeServerBridge?.close();activeServerBridge=null;}
const { followMinePass } = require('./minepass-sync.cjs');
let stopMinePass=()=>{};
const { launchGame } = require('./game.cjs');
const { repairPack } = require('./pack-update.cjs');
const { isTrustedSender } = require('./ipc-source.cjs');
const { LauncherUpdater } = require('./launcher-update.cjs');
const { Installer, readJSON, atomicJSON } = require('./install.cjs');
const { AuthService, secureTokenStorage } = require('./auth.cjs');
const { CatalogService } = require('./catalog.cjs');
const { PackAnalyzer } = require('./catalog-analyze.cjs');
const { repairCatalog } = require('./catalog-repair.cjs');
const { ContentService, applyContent, recoverContent, ROOTS } = require('./content-update.cjs');
const builtin = { ...require('../pack.json'), id:'astral', cover:'citadel', description:'От первого костра до битвы с титанами. Открой мир Astral — и найди в нём свой путь.', published:true };
let pack = builtin, catalog, analyzer, content, atmosphereEditor, accountExtras;
const {isOriginal}=require('./pack-base.cjs');
function mainPack(){return catalog?.packs.find(p=>p.id==='astral')||builtin;}
if (!app.isPackaged && process.env.ASTRAL_TEST_PROFILE && path.isAbsolute(process.env.ASTRAL_TEST_PROFILE)) {
  fs.mkdirSync(process.env.ASTRAL_TEST_PROFILE, { recursive: true });
  app.setPath('userData', process.env.ASTRAL_TEST_PROFILE);
}
let window, settings, installer, operation, gameProcess, auth;
let gamePreparing = false, selectingPack = false;
let authBusy = false;
let authNotice = '';
let launcherUpdater, startupScreen, updatingLauncher = false;
const uiPath = path.join(__dirname, '..', 'ui', 'index.html');
const playerTools=require('./player-tools.cjs');
const totalGB = Math.floor(os.totalmem() / 1024 ** 3);
const maxGB = Math.max(4, Math.min(32, totalGB - 2));
let progress = { phase: 'idle', message: 'Всё начинается с одного приключения.' };
function sendProgress(event) {
  progress = event;
  if (window && !window.isDestroyed()) window.webContents.send('astral:progress', event);
}
function setupInstaller() { installer = new Installer(settings.directory, pack, sendProgress); installer.allowLanLocalProfiles=require('./lan.cjs').enabled(settings,pack); }
function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
async function getState() {
  const visible = [mainPack(),...(catalog?.packs || []).filter(p => p.id!=='astral'&&p.published)].filter(p=>p.published);
  return { pack: publicPack(pack), packs:visible.map(publicPack), admin:catalog?.admin || false, catalogMessage:catalog?.message || 'Загружаем каталог…', settings, installed: await installer.installed(), busy: !!operation || gamePreparing || updatingLauncher, canCancel: !!operation, gameOpen: !!gameProcess, maxGB, totalGB, progress, appVersion: app.getVersion(), user: auth.publicUser(), authNotice, canRemember: safeStorage.isEncryptionAvailable(), launcherUpdate: launcherUpdater?.state };
}
function publicPack(p) {
  const style=p.id==='astral'&&!catalog?.packs.some(p=>p.id==='astral') ? catalog?.builtinAppearance || {...builtin,coverImage:require('../assets/astral-default-cover.json').image} : p;
  return {id:p.id,name:style.name,version:p.version,minecraft:p.minecraft,forge:p.forge,modCount:p.modCount,archiveBytes:p.archiveBytes,description:style.description,cover:style.cover,coverImage:style.coverImage || '',showServer:false,serverAddress:'',hasCommunityServer:packServer.supported(p),supportsFriends:require('./client-features.cjs').supported(p)};
}
function builtinEditor() { const p=mainPack();return {...p,...publicPack(p),builtin:true,published:p.published,updatedAt:catalog.packs.find(p=>p.id==='astral')?.updatedAt || ''}; }
async function repairSelected(options={}) {
  await playerTools.backup(installer,'automatic');
  await recoverContent(installer);
  const paused=path.join(installer.instance,'.updates-paused.json');if(options.resume)await fsp.rm(paused,{force:true});else if(await readJSON(paused)){const system=await require('./atmosphere.cjs').repair(installer);return {...system,removed:0,paused:true};}
  const manifest=await content.latest(pack);
  const installedContent=await readJSON(path.join(installer.instance,'.content-installed.json'),{});
  if(manifest&&manifest.revision!==installedContent.revision&&await installer.installed()){const answer=await dialog.showMessageBox(window,{type:'info',title:'Обновление сборки',message:'Доступно обновление '+manifest.version,detail:'Будут проверены и при необходимости заменены '+manifest.files.length+' файлов; удалены '+manifest.remove.length+'.\n'+manifest.files.slice(0,12).map(f=>'+ '+f.path).concat(manifest.remove.slice(0,12).map(f=>'− '+f)).join('\n')+'\nПеред установкой сохранена копия миров.',buttons:['Установить обновление','Отмена'],cancelId:1,defaultId:0});if(answer.response!==0)throw Error('Обновление отложено.');}
  const exclude=new Set([...(manifest?.files||[]).map(f=>f.path),...(manifest?.remove||[])].map(p=>p.toLowerCase()));
  const atmosphere=require('./atmosphere.cjs'),manageTheme=atmosphere.supported(pack);
  const minepass=require('./minepass-mods.cjs'),manageMinepass=minepass.supported(pack);
  if(manageTheme)exclude.add(atmosphere.FILE);
  const managed=p=>(manageTheme&&(p.toLowerCase()===atmosphere.FILE||p.toLowerCase().startsWith('config/astral-atmosphere/')))||(manageMinepass&&minepass.owns(p));
  const exclusions={has:p=>exclude.has(p)||managed(p)};
  const base=await (isOriginal(pack)?repairPack(installer,{...options,exclude:exclusions}):repairCatalog(installer,{...options,exclude:exclusions}));
  const effective=manifest?{...manifest,files:manifest.files.filter(f=>!managed(f.path)),remove:manifest.remove.filter(p=>!managed(p))}:manifest;
  const applied=await applyContent(installer,effective,options);
  const theme=await atmosphere.repair(installer);
  const pass=await minepass.repair(installer);
  const design=await atmosphereEditor.apply(installer);
  return {...base,checked:base.checked+applied.checked+theme.checked+pass.checked+design.checked,repaired:base.repaired+applied.repaired+theme.repaired+pass.repaired+design.repaired,removed:(base.removed||0)+applied.removed+pass.removed};
}
function contentPack(id){const p=id==='astral'?mainPack():catalog.packs.find(p=>p.id===id);if(!p)throw Error('Сначала сохраните сборку в каталоге.');return p;}
async function selectPack(id) {
  requireIdle();
  if (gameProcess || authBusy) throw Error('Закройте Minecraft и дождитесь завершения входа перед сменой сборки.');
  const selected = id === 'astral' ? mainPack() : catalog.packs.find(p => p.id === id && p.published);
  if (!selected) throw Error('Сборка больше не опубликована. Обновите каталог.');
  selectingPack = true;
  try {
    await atomicJSON(settingsFile(),{...settings,selectedPack:id});
    pack = selected; settings.selectedPack = id; setupInstaller();
    progress = {phase:'idle',message:'Выбрана сборка '+pack.name};
    return await getState();
  } finally { selectingPack = false; }
}
function handle(name, fn) {
  ipcMain.handle('astral:' + name, async (event, ...args) => {
    try {
      if (!isTrustedSender(event, window, uiPath)) throw new Error('Не удалось подтвердить окно лаунчера. Закройте его и откройте снова.');
      return { ok: true, value: await fn(...args) };
    }
    catch (error) {
      const cancelled = error.name === 'AbortError';
      const message = cancelled ? 'Установка отменена. Можно начать снова.' : playerTools.explain(error.message);
      if (name === 'install') sendProgress({ phase: cancelled ? 'idle' : 'error', message });
      return { ok: false, error: message };
    }
  });
}
function requireIdle() {
  if (operation || gamePreparing || updatingLauncher || selectingPack) throw new Error('Дождитесь завершения текущей операции.');
}
async function startGame() {
  requireIdle();
  if (authBusy) throw new Error('Дождитесь завершения входа.');
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Эта версия подготовлена для Windows x64.');
  if (gameProcess) throw new Error('Minecraft уже запущен.');
  gamePreparing = true;
  try {
    if (!await installer.installed()) throw new Error('Сначала установите сборку.');
    const user = await auth.requireAccess();
    const checks=await playerTools.readiness(installer,settings.ramMB);if(checks.some(c=>!c.ok&&['Память','Свободное место'].includes(c.name)))throw Error(checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' '));
    await repairSelected();
    if(pack.id==='astral')await removePinnedServer(installer.gameDirectory,message=>console.warn(message));
    closeServerBridge();
    activeServerBridge=await packServer.prepare(installer,auth,undefined,message=>sendProgress({phase:'error',message}));
    sendProgress({ phase: 'prepare', message: 'Доступ подтверждён. Подготавливаем запуск…' });
    stopMinePass();
    // MinePass polls its public mirror in-game; no duplicate launcher polling.
    settings.lastPlayed={id:pack.id,at:new Date().toISOString()};await atomicJSON(settingsFile(),settings);
    await closeDirectPlay();
    if(require('./atmosphere.cjs').supported(pack)){
      directPlay=new (require('./direct-play.cjs').DirectPlay)(new (require('./social.cjs').Social)(catalog),path.join(app.getPath('userData'),'direct-play'));
      const bridge=await directPlay.start();
      await atomicJSON(path.join(installer.gameDirectory,'config','astral-atmosphere','friends-bridge.json'),bridge);
    }
    gameProcess = await launchGame(installer, user.nickname, settings.ramMB, sendProgress, code => {
      gameProcess = null;stopMinePass();closeServerBridge();closeDirectPlay().catch(()=>{});
      sendProgress({ phase: code ? 'error' : 'ready', message: code ? 'Minecraft завершился с ошибкой. Откройте logs/latest-launch.log в папке Astral.' : 'Игра закрыта. До следующего приключения!' });
    });
  } catch (error) { await closeDirectPlay().catch(()=>{});stopMinePass();closeServerBridge(); sendProgress({ phase: 'error', message: error.message }); throw error; }
  finally { gamePreparing = false; }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    startupScreen=await require('./startup-screen.cjs').openStartup(BrowserWindow,(await readJSON(settingsFile(),{})).theme);
    const saved = await readJSON(settingsFile(), {});
    settings = {
      directory: typeof saved.directory === 'string' && path.isAbsolute(saved.directory) ? saved.directory : path.join(app.getPath('home'), 'Games', 'Astral'),
      ramMB: Number.isInteger(saved.ramMB) ? Math.min(maxGB * 1024, Math.max(4096, saved.ramMB)) : Math.min(maxGB, 6) * 1024,
      updateChannel:saved.updateChannel==='preview'?'preview':'stable',
      theme: ['light','dark','star'].includes(saved.theme) ? saved.theme : 'star',
      lanLocalProfiles: saved.lanLocalProfiles && typeof saved.lanLocalProfiles==='object' && !Array.isArray(saved.lanLocalProfiles) ? saved.lanLocalProfiles : {},
      favorites:Array.isArray(saved.favorites)?saved.favorites.filter(x=>typeof x==='string'):[],
      lastPlayed:saved.lastPlayed||null,
      selectedPack: typeof saved.selectedPack === 'string' ? saved.selectedPack : 'astral'
    };
    nativeTheme.themeSource=settings.theme==='light'?'light':'dark';
    setupInstaller();
    launcherUpdater = new LauncherUpdater({
      channel:settings.updateChannel,currentVersion: app.getVersion(), directory: path.join(app.getPath('userData'), 'launcher-updates'),
      publicKey: fs.readFileSync(path.join(__dirname, '../assets/launcher-update-public.pem')),
      target: process.env.PORTABLE_EXECUTABLE_FILE,
      supported: app.isPackaged && process.platform === 'win32' && process.arch === 'x64' && !!process.env.PORTABLE_EXECUTABLE_FILE,
      emit: value => { startupScreen?.emit(value); if (window && !window.isDestroyed()) window.webContents.send('astral:launcherUpdate', value); }
    });
    updatingLauncher=launcherUpdater.supported;
    try {
      if(updatingLauncher && await launcherUpdater.startup()){app.quit();return;}
    } catch(error){authNotice='Автообновление не завершилось: '+error.message;}
    finally{updatingLauncher=false;}
    if(launcherUpdater.state.status==='error')authNotice='Обновления недоступны. Открыта установленная версия.';
    startupScreen.emit({message:'Открываем библиотеку миров…',percent:100});
    auth = new AuthService(builtin.firebase, secureTokenStorage(path.join(app.getPath('userData'), 'session.bin'), safeStorage));
    await auth.restore().catch(error => { authNotice = error.message; });
    catalog = new CatalogService(builtin.firebase,auth,app.getPath('userData'),auth.fetcher);
    accountExtras=new (require('./account-extras.cjs').AccountExtras)(catalog);
    analyzer = new PackAnalyzer(path.join(app.getPath('userData'),'catalog-analysis'),sendProgress,builtin);
    content = new ContentService(catalog,path.join(app.getPath('userData'),'content-editor'),sendProgress);
    atmosphereEditor = new (require('./atmosphere-editor.cjs').AtmosphereEditor)(catalog,path.join(app.getPath('userData'),'atmosphere-editor'),async data=>{
      const image=nativeImage.createFromDataURL(data),size=image.getSize();
      if(image.isEmpty()||size.width>1280||size.height>720)throw Error('Повреждён фон оформления.');return image.toPNG();
    });
    await catalog.restore();
    pack = catalog.packs.find(p => p.id === settings.selectedPack && p.published) || mainPack();
    setupInstaller();
    session.defaultSession.setPermissionRequestHandler((_, __, done) => done(false));
    handle('state', getState);
    let reportDraft=null,reportSending=false;
    handle('reportCollect',async()=>{requireIdle();reportDraft=await require('./diagnostics.cjs').collect(installer,app.getVersion(),settings.ramMB);reportDraft.uid=catalog.auth.session?.uid||null;return reportDraft;});
    handle('reportSend',async input=>{if(reportSending)throw Error('Отчёт уже отправляется.');if(!reportDraft||input?.id!==reportDraft.id||typeof input.text!=='string'||input.text.length>24000)throw Error('Сначала соберите и проверьте отчёт.');if(!reportDraft.uid||reportDraft.uid!==catalog.auth.session?.uid)throw Error('Войдите в аккаунт и соберите отчёт заново.');reportSending=true;try{reportDraft.text=require('./diagnostics.cjs').redact(input.text);const result=await require('./diagnostics.cjs').submit(catalog,reportDraft,input.description);reportDraft=null;return result;}finally{reportSending=false;}});
    handle('reportExport',async input=>{if(!reportDraft||input?.id!==reportDraft.id||typeof input.text!=='string'||input.text.length>24000)throw Error('Соберите отчёт заново.');const r=await dialog.showSaveDialog(window,{defaultPath:'Astral-report.txt',filters:[{name:'Отчёт',extensions:['txt']}]});if(!r.canceled)await fsp.writeFile(r.filePath,require('./diagnostics.cjs').redact(input.text),'utf8');return !r.canceled;});
    handle('updateChannel',async channel=>{requireIdle();if(gameProcess||launcherUpdater.job)throw Error('Дождитесь завершения проверки обновления и закройте игру.');if(!['stable','preview'].includes(channel))throw Error('Неизвестный канал.');settings.updateChannel=channel;await atomicJSON(settingsFile(),settings);launcherUpdater.channel=channel;launcherUpdater.pending=null;launcherUpdater.set({status:'idle',message:channel==='preview'?'Выбран тестовый канал. Проверим его при следующем запуске.':'Выбран стабильный канал. Понижение установленной версии не выполняется.'});return getState();});

    const localAction=fn=>async(...args)=>{requireIdle();if(gameProcess)throw Error('Сначала закройте Minecraft.');operation=new AbortController();try{return await fn(...args);}finally{operation=null;}};
    handle('readiness',()=>playerTools.readiness(installer,settings.ramMB));
    handle('worldBackups',()=>playerTools.backups(installer));
    handle('worldBackup',localAction(()=>playerTools.backup(installer)));
    handle('worldRestore',localAction(id=>playerTools.restore(installer,id)));
    handle('favorite',async id=>{if(![mainPack(),...catalog.packs].some(p=>p.id===id))throw Error('Сборка не найдена.');settings.favorites=settings.favorites.includes(id)?settings.favorites.filter(x=>x!==id):[...settings.favorites,id];await atomicJSON(settingsFile(),settings);return getState();});
    handle('lanExport',localAction(async()=>{const report=await playerTools.lanReport(installer),r=await dialog.showSaveDialog(window,{defaultPath:'Astral-LAN.json',filters:[{name:'LAN report',extensions:['json']}]});if(!r.canceled)await atomicJSON(r.filePath,report);return !r.canceled;}));
    handle('lanCompare',localAction(async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'LAN report',extensions:['json']}]});if(r.canceled)return null;const file=r.filePaths[0];if((await fsp.stat(file)).size>1000000)throw Error('Слишком большой отчёт.');return playerTools.compareLan(await playerTools.lanReport(installer),JSON.parse(await fsp.readFile(file,'utf8')));}));
    handle('accountSite',()=>shell.openExternal('https://astral-mine-mirror.onrender.com/account'));
    handle('playerEvents',async()=>{const response=await fetch('https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/realtime/publicGameData/minepass/astral-local.json',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('События временно недоступны.');const d=await response.json();const raw=d?.fields?.config?.stringValue;return raw?(JSON.parse(raw).events||[]).filter(e=>e.runId&&e.endsAt>Date.now()):[];});
    handle('rollbackUpdate',localAction(async()=>{await playerTools.backup(installer);return require('./content-update.cjs').rollbackContent(installer);}));
    handle('resumeUpdates',localAction(async()=>{await repairSelected({resume:true});return true;}));
    handle('updateHistory',()=>readJSON(path.join(installer.instance,'.update-history.json'),[]));

    const cosmetics=new (require('./cosmetics.cjs').Cosmetics)(catalog);
    handle('cosmeticList',()=>cosmetics.list());
    const social=new (require('./social.cjs').Social)(catalog);
    handle('friends',()=>social.friends());handle('friendInvite',nick=>social.invite(nick));handle('friendChange',input=>social.change(input));handle('inbox',()=>social.inbox());
    setInterval(()=>{if(auth.publicUser())social.presence(pack,!!gameProcess).catch(()=>{});},30000).unref();

    const outfitFile=()=>path.join(app.getPath('userData'),'outfits',require('node:crypto').createHash('sha256').update(auth.session.uid).digest('hex')+'.json');
    handle('outfitList',async()=>{await auth.requireAccess();return readJSON(outfitFile(),[]);});
    handle('outfitSave',async name=>{await auth.requireAccess();if(typeof name!=='string'||!name.trim()||name.length>40)throw Error('Название образа: 1–40 символов.');const list=await readJSON(outfitFile(),[]);if(list.length>=20)throw Error('Можно сохранить до 20 образов.');const d=await cosmetics.list(),skin=await accountExtras.skin();list.push({id:require('node:crypto').randomUUID(),name:name.trim(),equipped:d.equipped,skin});await atomicJSON(outfitFile(),list);return list;});
    handle('outfitDelete',async id=>{await auth.requireAccess();const list=await readJSON(outfitFile(),[]);await atomicJSON(outfitFile(),list.filter(x=>x.id!==id));return true;});
    handle('outfitApply',async id=>{await auth.requireAccess();const outfit=(await readJSON(outfitFile(),[])).find(x=>x.id===id);if(!outfit)throw Error('Образ не найден.');const d=await cosmetics.list();for(const kind of ['cape','wings','hat','halo','aura']){const item=outfit.equipped[kind];if(item&&!d.owned.includes(item))throw Error('В коллекции больше нет предмета из этого образа.');}for(const kind of ['cape','wings','hat','halo','aura'])await cosmetics.equip({kind,id:outfit.equipped[kind]||''});await accountExtras.saveSkin(outfit.skin?.png||'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../ui/cosmetic-assets/default-skin.png')).toString('base64'),outfit.skin?.model||'classic');return true;});

    handle('cosmeticBuy',id=>cosmetics.buy(id));
    handle('cosmeticEquip',input=>cosmetics.equip(input));
    handle('accountWallet',()=>accountExtras.wallet());
    handle('accountSkin',()=>accountExtras.skin());
    handle('accountSkinChoose',async()=>{
      requireIdle();await auth.requireAccess();
      const selected=await dialog.showOpenDialog(window,{title:'Выбрать скин Minecraft',properties:['openFile'],filters:[{name:'Скин PNG 64×64',extensions:['png']}]});
      if(selected.canceled)return null;
      const bytes=await fsp.readFile(selected.filePaths[0]);
      if(bytes.length>1024*1024)throw Error('Скин должен быть не больше 1 МБ.');
      const image=nativeImage.createFromBuffer(bytes),size=image.getSize();
      if(image.isEmpty()||size.width!==64||size.height!==64)throw Error('Нужен PNG-скин размером 64×64.');
      return image.toDataURL();
    });
    handle('accountSkinSave',async input=>{
      requireIdle();if(typeof input?.png!=='string'||input.png.length>100000)throw Error('Слишком большой скин.');const image=nativeImage.createFromDataURL(input.png),size=image.getSize();
      if(image.isEmpty()||size.width!==64||size.height!==64)throw Error('Неверный размер скина.');
      return accountExtras.saveSkin(image.toDataURL(),input.model);
    });
    handle('selectPack', selectPack);
    handle('refreshCatalog', async () => {
      await catalog.refresh(); await catalog.checkAdmin();
      if (!operation && !gameProcess && !gamePreparing && !updatingLauncher && !authBusy && !selectingPack) await selectPack(catalog.packs.some(p=>p.id===pack.id && p.published) ? pack.id : 'astral');
      return getState();
    });
    handle('adminPacks', async () => { await catalog.requireAdmin(); await catalog.refresh(); return [builtinEditor(),...catalog.packs.filter(p=>p.id!=='astral')]; });
    handle('deletePack',async input=>{
      requireIdle();if(gameProcess||authBusy)throw Error('Закройте Minecraft и дождитесь завершения входа.');
      operation=new AbortController();
      try{await catalog.requireAdmin();const target=catalog.packs.find(p=>p.id===input?.id);if(!target)throw Error('Обновите каталог и выберите дополнительную сборку.');
        const answer=await dialog.showMessageBox(window,{type:'warning',title:'Удалить из каталога',message:'Удалить «'+target.name+'» из общего каталога?',detail:'Игроки больше не смогут выбрать эту сборку. Установленные файлы и миры на компьютерах сохранятся.',buttons:['Отмена','Удалить из каталога'],defaultId:0,cancelId:0,noLink:true});
        if(answer.response!==1)return false;
        await catalog.remove(target.id,input.updatedAt);
        if(pack.id===target.id){pack=mainPack();settings.selectedPack='astral';setupInstaller();await atomicJSON(settingsFile(),settings);}
        return true;
      }finally{operation=null;}
    });
    handle('uninstallPack',async()=>{
      requireIdle();if(gameProcess||authBusy)throw Error('Закройте Minecraft перед удалением сборки.');
      operation=new AbortController();
      try{const {uninstallTarget}=require('./uninstall.cjs');const target=await uninstallTarget(installer);if(!target)throw Error('Сборка не установлена.');
        const answer=await dialog.showMessageBox(window,{type:'warning',title:'Удалить с компьютера',message:'Удалить «'+publicPack(pack).name+'» с этого компьютера?',detail:'Вся папка сборки, включая сохранённые миры и настройки, будет перемещена в корзину Windows. Её можно восстановить из корзины. Каталог для других игроков не изменится.\n\n'+target,buttons:['Отмена','Переместить в корзину'],defaultId:0,cancelId:0,noLink:true});
        if(answer.response!==1)return false;
        if(await uninstallTarget(installer)!==target)throw Error('Папка сборки изменилась. Повторите удаление.');
        await shell.trashItem(target);sendProgress({phase:'idle',message:'Сборка перемещена в корзину. Её можно установить заново.'});return true;
      }finally{operation=null;}
    });
    const contentAction=fn=>async input=>{
      requireIdle();if(gameProcess||authBusy)throw Error('Закройте игру и дождитесь завершения входа.');
      operation=new AbortController();try{await catalog.requireAdmin();return await fn(input||{},operation.signal);}finally{operation=null;}
    };
    handle('atmosphereOpen',contentAction(input=>atmosphereEditor.open(input.fresh===true)));
    handle('atmosphereSave',contentAction(input=>atmosphereEditor.save(input)));
    handle('atmospherePublish',contentAction(input=>atmosphereEditor.publish(input)));
    handle('atmosphereImage',contentAction(async()=>{
      const result=await dialog.showOpenDialog(window,{title:'Фон главного меню Minecraft',properties:['openFile'],filters:[{name:'Изображение',extensions:['png','jpg','jpeg','webp']}]});
      return result.canceled?null:prepareCover(result.filePaths[0],nativeImage);
    }));
    handle('atmosphereExport',contentAction(async input=>{
      const config=require('./atmosphere-editor.cjs').validate(input.config);
      const result=await dialog.showSaveDialog(window,{title:'Сохранить оформление для другого компьютера',defaultPath:'astral-appearance.json',filters:[{name:'Оформление Astral',extensions:['json']}]});
      if(result.canceled)return false;await fsp.writeFile(result.filePath,JSON.stringify(config,null,2));return true;
    }));
    handle('atmosphereImport',contentAction(async()=>{
      const result=await dialog.showOpenDialog(window,{title:'Импорт оформления Astral',properties:['openFile'],filters:[{name:'Оформление Astral',extensions:['json']}]});
      if(result.canceled)return null;const file=result.filePaths[0];if((await fsp.stat(file)).size>300000)throw Error('Слишком большой файл оформления.');return require('./atmosphere-editor.cjs').validate(JSON.parse(await fsp.readFile(file,'utf8')));
    }));
    const modCatalog=new (require('./modrinth.cjs').Modrinth)(path.join(app.getPath('userData'),'content-editor'),{report:sendProgress});
    handle('modCatalogSearch',contentAction((input,signal)=>modCatalog.search(contentPack(input.id),input,signal)));
    handle('modCatalogVersions',contentAction((input,signal)=>modCatalog.versions(contentPack(input.id),input.project,signal)));
    handle('modCatalogPlan',contentAction((input,signal)=>modCatalog.plan(contentPack(input.id),input.version,signal)));
    handle('modCatalogImport',contentAction((input,signal)=>modCatalog.import(contentPack(input.id),input.plan,signal)));
    handle('contentOpen',contentAction(async (input,signal)=>{
      const p=contentPack(input.id),draft=await content.open(p,input.fresh===true),target=new Installer(settings.directory,p,sendProgress),files=[],metadata={};
      const walk=async(folder,prefix)=>{const entries=await fsp.readdir(folder,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});for(const e of entries){if(e.isSymbolicLink())continue;const name=prefix+'/'+e.name;if(e.isDirectory())await walk(path.join(folder,e.name),name);else if(e.isFile()){if(files.length>=20000)throw Error('Слишком много файлов.');files.push(name);}}};
      for(const root of ROOTS)await walk(path.join(target.gameDirectory,root),root);
      if(await fsp.stat(path.join(target.gameDirectory,'options.txt')).catch(()=>null))files.push('options.txt');
      if(!files.length&&isOriginal(p)){const m=JSON.parse(Buffer.from(require('../assets/pack-manifest.json').payload,'base64'));files.push(...m.files.map(f=>f.path));}
      const baseFiles=isOriginal(p)?JSON.parse(Buffer.from(require('../assets/pack-manifest.json').payload,'base64')).files:await readJSON(path.join(target.instance,'.catalog-files.json'),[]);
      const restorable=(Array.isArray(baseFiles)?baseFiles:[]).map(f=>f.path);
      for(const name of files.filter(n=>/^(mods|resourcepacks|shaderpacks)\/.*\.(jar|zip)$/i.test(n)).slice(0,1000)){signal.throwIfAborted();const file=await require('./content-update.cjs').safeFile(target.gameDirectory,name);metadata[name]=await require('./file-art.cjs').inspect(file).catch(()=>({}));}
      return {draft,files:[...new Set([...files,...restorable])].sort(),metadata,restorable,installed:await target.installed()};
    }));
    handle('contentFolderOpen',contentAction(async input=>{
      if(!['mods','config','logs','resourcepacks','shaderpacks'].includes(input.folder))throw Error('Неизвестная папка.');
      const target=new Installer(settings.directory,contentPack(input.id),sendProgress);await require('./content-update.cjs').safeFile(target.gameDirectory,(input.folder==='logs'?'config':input.folder)+'/__folder_check__');
      const dir=path.join(target.gameDirectory,input.folder),stat=await fsp.lstat(dir).catch(()=>null);if(!stat||!stat.isDirectory()||stat.isSymbolicLink())throw Error('Папка ещё не создана или недоступна.');const error=await shell.openPath(dir);if(error)throw Error('Не удалось открыть папку.');return true;
    }));
    handle('contentExport',contentAction(async input=>{
      const p=contentPack(input.id);if(!Array.isArray(input.rows)||input.rows.length>20000)throw Error('Некорректный список файлов.');
      const lines=input.rows.map(r=>{require('./content-update.cjs').validPath(r.path);if(typeof r.removed!=='boolean')throw Error('Некорректное состояние файла.');return (r.removed?'УБРАТЬ':'ОСТАВИТЬ')+'\t'+r.path;});
      const result=await dialog.showSaveDialog(window,{defaultPath:'Astral-files.txt',filters:[{name:'Список файлов',extensions:['txt']}]});if(result.canceled)return false;await fsp.writeFile(result.filePath,'Astral · '+p.name+'\nЧерновик состава сборки · '+new Date().toISOString()+'\n'+lines.join('\n'),'utf8');return true;
    }));
    handle('contentSave',contentAction(input=>content.save(contentPack(input.id),input.draft)));
    handle('contentImport',contentAction((input,signal)=>content.importFile(input.url,input.target,signal)));
    handle('contentFolder',contentAction(async(input,signal)=>{
      const config=await readJSON(path.join(app.getPath('userData'),'drive-import.json'),{});
      return content.importFolder(input.url,input.target,config.apiKey,signal);
    }));
    handle('contentDriveKey',contentAction(async input=>{
      if(!/^AIza[\w-]{30,60}$/.test(input.apiKey||''))throw Error('Проверьте API-ключ Google Drive.');
      await atomicJSON(path.join(app.getPath('userData'),'drive-import.json'),{apiKey:input.apiKey});return true;
    }));
    handle('contentPublish',contentAction(async(input,signal)=>{const result=await dialog.showMessageBox(window,{type:'question',title:'Публикация обновления',message:'Опубликовать '+input.draft.version+' для игроков?',detail:'Добавить / заменить:\n'+input.draft.files.map(f=>f.path).join('\n')+'\nУдалить:\n'+input.draft.remove.join('\n'),buttons:['Опубликовать','Отмена'],cancelId:1,defaultId:1});if(result.response!==0)throw Error('Публикация отменена. Черновик сохранён в редакторе.');return content.publish(contentPack(input.id),input.draft,signal);}));
    handle('selectPackCover', async () => {
      requireIdle();await catalog.requireAdmin();
      const selected=await dialog.showOpenDialog(window,{title:'Фон сборки',properties:['openFile'],filters:[{name:'Изображения',extensions:['png','jpg','jpeg','webp']}]});
      if(selected.canceled || !selected.filePaths.length)return null;
      return prepareCover(selected.filePaths[0],nativeImage);
    });
    handle('analyzePack', async input => {
      requireIdle();
      if (gameProcess || authBusy) throw Error('Закройте игру и дождитесь завершения входа.');
      operation = new AbortController();
      try { await catalog.requireAdmin(); return await analyzer.analyze(input,operation.signal); }
      finally { operation = null; }
    });
    handle('publishPack', async input => {
      requireIdle();
      if (gameProcess || authBusy) throw Error('Закройте игру и дождитесь завершения входа.');
      operation = new AbortController();
      try {
        await catalog.requireAdmin();
        input={...input,showServer:false,serverAddress:''};
        const old = input.id==='astral'?mainPack():input.id ? catalog.packs.find(p=>p.id === input.id) : null;
        if (input.id && !old) throw Error('Обновите список сборок перед редактированием.');
        const verified = analyzer.resolve(input.analysisId,input,old);
        const published = await catalog.publish(input.id,verified,input.updatedAt);
        if(pack.id===published.id){pack=published;setupInstaller();}
        sendProgress({phase:'idle',message:published.published ? 'Сборка опубликована. Игроки увидят её после обновления каталога.' : 'Сборка скрыта из каталога.'});
        return published;
      } finally { operation = null; }
    });
    handle('checkLauncherUpdate', () => { requireIdle(); return launcherUpdater.check(); });
    handle('installLauncherUpdate', async () => {
      requireIdle();
      if (gameProcess || authBusy) throw Error('Закройте Minecraft и дождитесь завершения входа перед обновлением.');
      updatingLauncher = true;
      try { await launcherUpdater.launchInstaller(); app.quit(); }
      catch (error) { updatingLauncher = false; throw error; }
    });
    handle('serverStatus', () => packServer.supported(pack)?packServer.status():({state:'hidden'}));
    handle('lanLocalProfiles', async value=>{requireIdle();if(gameProcess)throw Error('Закройте Minecraft перед изменением LAN.');if(typeof value!=='boolean'||!require('./lan.cjs').supported(pack))throw Error('Настройка доступна для Minecraft 1.20.1 / Forge 47.x.');settings.lanLocalProfiles[pack.id||'astral']=value;await atomicJSON(settingsFile(),settings);setupInstaller();return getState();});
    handle('copyAddress', () => {});
    handle('theme',async value=>{if(!['light','dark','star'].includes(value))throw Error('Неизвестная тема.');settings.theme=value;nativeTheme.themeSource=value==='light'?'light':'dark';await atomicJSON(settingsFile(),settings);return getState();});
    handle('install', async () => {
      requireIdle();
      if (authBusy) throw new Error('Дождитесь завершения входа.');
      if (gameProcess) throw new Error('Закройте Minecraft перед установкой.');
      operation = new AbortController();
      try { await auth.requireAccess(); operation.signal.throwIfAborted(); await installer.install(settings.ramMB, operation.signal); await repairSelected({ signal: operation.signal }); sendProgress({ phase: 'ready', message: 'Сборка установлена и проверена. Можно играть.' }); return await getState(); }
      finally { operation = null; }
    });
    handle('repair', async () => {
      requireIdle();
      if (gameProcess) throw new Error('Закройте Minecraft перед проверкой файлов.');
      if (!await installer.installed()) throw new Error('Сначала установите сборку.');
      operation = new AbortController();
      try {
        const result = await repairSelected({ signal: operation.signal,resume:true });
        sendProgress({ phase: 'ready', message: `Проверено файлов: ${result.checked}. Восстановлено: ${result.repaired}. ${result.online ? 'Обновления установлены.' : 'Проверена сохранённая версия; сервер обновлений недоступен.'}` });
        return result;
      } catch (e) { sendProgress({ phase: 'error', message: e.message }); throw e; }
      finally { operation = null; }
    });
    // Retry only a transient startup failure. A deliberate logout never schedules login.
    let restoreBusy=false;
    setInterval(async()=>{
      if(!auth.restorePending||Date.now()<auth.restoreAt||authBusy||restoreBusy||gameProcess)return;
      restoreBusy=true;authBusy=true;
      try{await auth.restore();authNotice='';await catalog.checkAdmin();}
      catch(error){authNotice=error.message;}
      finally{authBusy=false;restoreBusy=false;if(window&&!window.isDestroyed())window.webContents.send('astral:catalogChanged');}
    },60000).unref();
    const authAction = fn => async (...args) => {
      requireIdle();
      if (authBusy) throw new Error('Дождитесь завершения предыдущего запроса.');
      if (gameProcess) throw new Error('Сначала закройте Minecraft.');
      authBusy = true;
      try { await fn(...args); authNotice = ''; await catalog.checkAdmin(); return await getState(); }
      finally { authBusy = false; }
    };
    handle('register', authAction(credentials => auth.register(credentials)));
    handle('login', authAction(credentials => auth.login(credentials)));
    handle('completeProfile', authAction(async input=>{if(!auth.session)throw Error('Сначала войдите в аккаунт.');await auth.refresh(true);await auth.ensureMember(input?.nickname);return auth.publicUser();}));
    handle('logout', authAction(() => auth.logout()));
    handle('resetPassword', authAction(email => auth.resetPassword(email)));
    handle('cancel', () => { operation?.abort(); });
    handle('launch', startGame);
    handle('chooseFolder', async () => {
      requireIdle();
      if (gameProcess) throw new Error('Сначала закройте Minecraft.');
      const result = await dialog.showOpenDialog(window, { title: 'Выберите папку — в ней будет создана подпапка Astral', properties: ['openDirectory', 'createDirectory'] });
      if (!result.canceled) {
        settings.directory = path.join(result.filePaths[0], 'Astral');
        await atomicJSON(settingsFile(), settings); setupInstaller();
      }
      return getState();
    });
    handle('memory', async ram => {
      requireIdle();
      if (gameProcess) throw new Error('Закройте Minecraft перед изменением памяти.');
      if (!Number.isInteger(ram) || ram < 4096 || ram > maxGB * 1024) throw new Error('Недопустимое количество памяти.');
      settings.ramMB = ram;
      await atomicJSON(settingsFile(), settings);
      await installer.setMemory(ram);
      return getState();
    });
    handle('openFolder', async () => {
      const folder = await installer.installed() ? path.join(installer.instance, 'minecraft') : settings.directory;
      await fsp.mkdir(folder, { recursive: true });
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
    });
    handle('site', () => shell.openExternal(new URL('quests.html', builtin.website).href));
    handle('drive', () => shell.openExternal(`https://drive.google.com/file/d/${pack.driveFileId}/view`));
    window = new BrowserWindow({ width: 1180, height: 790, minWidth: 920, minHeight: 700, show: false, backgroundColor: '#0d0b15', autoHideMenuBar: true, title: 'Astral Launcher', icon: path.join(__dirname, '..', 'assets', 'favicon.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.once('ready-to-show', () => {window.show();startupScreen?.close();startupScreen=null;});
    window.on('close', event => {
      if (operation || gamePreparing || gameProcess || authBusy) {
        event.preventDefault();
        sendProgress({ ...progress, message: gameProcess ? 'Сначала выйдите из Minecraft, чтобы сохранить мир.' : 'Дождитесь завершения операции. Загрузку сборки можно отменить кнопкой «Отмена».' });
      }
    });
    await window.loadFile(uiPath);
    catalog.refresh().then(()=>catalog.checkAdmin()).then(()=> { if (!window.isDestroyed()) window.webContents.send('astral:catalogChanged'); }).catch(()=>{});

  }).catch(error => { dialog.showErrorBox('Astral Launcher', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
