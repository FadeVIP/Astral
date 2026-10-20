const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('startup',{listen(callback){ipcRenderer.on('astral:startup',(_,value)=>callback(value));}});
