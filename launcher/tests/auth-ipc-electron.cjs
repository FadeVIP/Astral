'use strict';
// Runs the production main process and preload. Only remote services are faked;
// test accounts never leave this process and the real user profile is untouched.
const { app } = require('electron');
app.disableHardwareAcceleration();
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.ASTRAL_SMOKE_APP || path.join(__dirname, '..')).replace(/^[A-Z]:/, x => x.toLowerCase());
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'Astral auth regression '));
app.setPath('userData', profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ directory: path.join(profile, 'game'), ramMB: 4096 }));
let memberExists = false, signupCount = 0, offline = false,guestPhase=false,networkCalls=0,launchedNick,gameClose;
const installerModule=require(path.join(root,'src/install.cjs')),originalInstalled=installerModule.Installer.prototype.installed;
installerModule.Installer.prototype.installed=async function(){return guestPhase?true:originalInstalled.call(this);};
require(path.join(root,'src/game.cjs')).launchGame=async(i,n,r,p,closed)=>{launchedNick=n;gameClose=closed;return {};};
require(path.join(root,'src/player-tools.cjs')).readiness=async()=>[];
const authModule = require(path.join(root, 'src/auth.cjs'));
const RealAuthService = authModule.AuthService;
const fakeFirebase = async url => {
  networkCalls++;
  if (offline) throw Error('Simulated offline');
  if(url.includes('securetoken.googleapis.com'))return Response.json({user_id:'test-uid',id_token:'test-token',refresh_token:'test-refresh',expires_in:'3600'});
  if(url.includes('accounts:lookup'))return Response.json({users:[{localId:'test-uid',email:'test@example.invalid'}]});
  if (url.includes('accounts:signUp')) signupCount++;
  if (/accounts:signUp|accounts:signInWithPassword/.test(url)) return Response.json({ localId: 'test-uid', email: 'test@example.invalid', idToken: 'test-token', refreshToken: 'test-refresh', expiresIn: '3600', displayName: memberExists ? 'TestPlayer' : undefined });
  if (url.includes('accounts:update')) return Response.json({});
  if (url.endsWith('documents:commit')) { memberExists = true; return Response.json({ writeResults: [] }); }
  if (url.endsWith('/members/test-uid')) return memberExists
    ? Response.json({ fields: { nickname: { stringValue: 'TestPlayer' }, status: { stringValue: 'active' } } })
    : Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
  throw Error('Unexpected test request');
};
authModule.AuthService = class extends RealAuthService {
  constructor(config, storage) { super(config, storage, fakeFirebase); }
};
require(path.join(root, 'src/server-connection.cjs')).serverConnection = () => ({ status: async () => ({ state: 'offline', checkedAt: Date.now() }) });
const deadline = setTimeout(() => { console.error('AUTH_IPC_TIMEOUT'); app.exit(1); }, 40000);
app.on('browser-window-created', (_, win) => {
  win.show = () => {};
  win.webContents.once('did-finish-load', async () => {
    if(win.webContents.getURL().includes('/startup.html'))return;
    try {
      const call = (name, value) => win.webContents.executeJavaScript(`window.astral[${JSON.stringify(name)}](${JSON.stringify(value)})`);
      const initial = await call('state');
      await win.webContents.executeJavaScript("setAuthMode('login')");
      assert.equal(await win.webContents.executeJavaScript("document.getElementById('nicknameField').hidden && document.getElementById('nicknameInput').disabled"),true);
      await win.webContents.executeJavaScript("setAuthMode('register')");
      assert.equal(await win.webContents.executeJavaScript("!document.getElementById('nicknameField').hidden && document.getElementById('nicknameInput').required"),true);
      await win.webContents.executeJavaScript("setAuthMode('completeProfile')");
      assert.equal(await win.webContents.executeJavaScript("document.getElementById('passwordInput').disabled && !document.getElementById('nicknameField').hidden"),true);
      await win.webContents.executeJavaScript("setAuthMode('login')");
      assert.equal((await call('completeProfile',{nickname:'TestPlayer'})).ok,false);
      assert.equal(initial.ok, true); assert.equal(initial.value.user, null);
      assert.equal((await call('checkLauncherUpdate')).value.status, 'unsupported');
      assert.equal((await call('installLauncherUpdate')).ok, false);
      assert.equal((await call('state')).value.busy, false);
      const invalid = await call('register', { nickname: 'bad nick' });
      assert.equal(invalid.ok, false); assert.match(invalid.error, /Ник:/); assert.equal(signupCount, 0);
      const credentials = { email: 'test@example.invalid', password: 'OnlyInTest123!', nickname: 'TestPlayer', remember: false };
      const registered = await call('register', credentials);
      assert.equal(registered.ok, true); assert.equal(registered.value.user.nickname, 'TestPlayer'); assert.equal(signupCount, 1);
      assert.equal(JSON.stringify(registered).includes('test-token'), false);
      assert.equal((await call('logout')).value.user, null);
      const loggedIn = await call('login', {email:credentials.email,password:credentials.password,remember:false});
      assert.equal(loggedIn.ok, true); assert.equal(loggedIn.value.user.nickname, 'TestPlayer');
      await call('logout');memberExists=false;
      assert.equal((await call('login',{email:credentials.email,password:credentials.password,remember:false})).ok,false);
      assert.equal((await call('state')).value.user.status,'pending');
      const completed=await call('completeProfile',{nickname:'TestPlayer'});
      assert.equal(completed.ok,true);assert.equal(completed.value.user.nickname,'TestPlayer');assert.equal(signupCount,1);
      await call('logout'); offline = true;
      const failed = await call('login', credentials);
      assert.equal(failed.ok, false); assert.match(failed.error, /интернет/);
      guestPhase=true;const beforeGuest=networkCalls;
      assert.equal((await call('guest',{nickname:'Bad name'})).ok,false);
      const guest=await call('guest',{nickname:'LocalPlayer'});assert.equal(guest.ok,true);assert.equal(guest.value.user.guest,true);assert.equal(guest.value.admin,false);
      const guestSettings=JSON.parse(fs.readFileSync(path.join(profile,'settings.json')));assert.equal(guestSettings.guestMode,true);assert.equal(guestSettings.guestNickname,'LocalPlayer');
      await win.webContents.executeJavaScript("(async()=>{state=(await window.astral.state()).value;setAuthMode('guest')})()");
      assert.equal(await win.webContents.executeJavaScript("document.getElementById('emailInput').disabled && document.getElementById('passwordInput').disabled && !document.getElementById('nicknameInput').disabled"),true);
      await win.webContents.executeJavaScript("document.getElementById('authDialog').showModal()");
      await new Promise(resolve=>setTimeout(resolve,200));
      await fs.promises.mkdir(path.resolve(__dirname,'../artifacts'),{recursive:true});
      fs.writeFileSync(path.resolve(__dirname,'../artifacts/guest-mode.png'),(await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.getElementById('authDialog').close()");
      assert.equal((await call('accountWallet')).ok,false);
      const launched=await call('launch');assert.equal(launched.ok,true,launched.error);assert.equal(launchedNick,'LocalPlayer');assert.equal(networkCalls,beforeGuest);
      gameClose(0);guestPhase=false;await call('logout');
      offline = false;
      assert.equal((await call('login', credentials)).ok, true);
      await call('logout');
      assert.equal(fs.existsSync(path.join(profile, 'session.bin')), false);
      win.webContents.send('astral:launcherUpdate', { status: 'ready', version: '0.3.5', message: 'Версия 0.3.5 готова к установке.' });
      // Allow the renderer event handler to run before inspecting its output.
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await win.webContents.executeJavaScript("document.getElementById('launcherUpdateBanner').hidden"), false);
      assert.equal(await win.webContents.executeJavaScript("document.getElementById('installLauncherUpdate').hidden"), false);
      assert.equal(await win.webContents.executeJavaScript("document.getElementById('installLauncherUpdate').textContent"), 'Обновить и перезапустить');
      await fs.promises.mkdir(path.resolve(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.resolve(__dirname, '../artifacts/launcher-update-ready.png'), (await win.webContents.capturePage()).toPNG());
      clearTimeout(deadline); console.log('AUTH_IPC_PASS'); app.exit(0);
    } catch (error) { clearTimeout(deadline); console.error(error); app.exit(1); }
  });
});
require(path.join(root, 'src/main.cjs'));
