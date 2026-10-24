'use strict';
const path = require('node:path');
async function openStartup(BrowserWindow,theme='star') {
  const screen = new BrowserWindow({width:540,height:360,resizable:false,show:false,autoHideMenuBar:true,
    title:'Astral — обновление',backgroundColor:'#100d1b',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'startup-preload.cjs')}});
  screen.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  screen.webContents.on('will-navigate',event=>event.preventDefault());
  screen.once('ready-to-show',()=>screen.show());
  await screen.loadFile(path.join(__dirname,'../ui/startup.html'),{query:{theme:['light','dark','star'].includes(theme)?theme:'star'}});
  return {screen,emit(value){if(!screen.isDestroyed())screen.webContents.send('astral:startup',value);},close(){if(!screen.isDestroyed())screen.destroy();}};
}
module.exports={openStartup};
