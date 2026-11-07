import { app, BrowserWindow, dialog, Menu, session } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
let window, service, allowClose=false;
app.setName('稿藏');
app.setPath('userData',join(app.getPath('appData'),'io.gaocang.desktop'));
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(async()=>{
    const directory=join(app.getPath('userData'),'library');
    service=await createApp({directory});
    const portFile=join(directory,'local-port.json');let port=0;
    try { const value=JSON.parse(await readFile(portFile,'utf8'));if(Number.isInteger(value.port)&&value.port>1024&&value.port<65536)port=value.port; } catch(e) { if(e.code!=='ENOENT')throw e; }
    await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(port,'127.0.0.1',resolve);});
    port=service.server.address().port;await writeFile(portFile,JSON.stringify({port}),{mode:0o600});
    const origin=`http://127.0.0.1:${port}`;
    session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    window=new BrowserWindow({width:1440,height:960,minWidth:960,minHeight:640,title:'稿藏',backgroundColor:'#f4f2eb',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    window.on('close',async event=>{
      if(allowClose)return;
      event.preventDefault();
      try {
        const result=await window.webContents.executeJavaScript('window.gaocangPrepareReload ? window.gaocangPrepareReload() : ({ok:true})');
        if(!result.ok){await dialog.showMessageBox(window,{type:'info',message:result.message,buttons:['返回继续整理']});return;}
        await service.store.queue; allowClose=true;window.close();
      }catch {await dialog.showMessageBox(window,{type:'error',message:'暂时无法确认保存，请先导出备份，再重试退出。',buttons:['返回']});}
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform==='darwin'?[{label:'稿藏',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]}]:[]),
      {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'窗口',submenu:[{role:'minimize'},{role:'togglefullscreen'}]},
    ]));
    await window.loadURL(origin);
  }).catch(async error=>{await dialog.showMessageBox({type:'error',message:'稿藏未能启动',detail:error.code==='EADDRINUSE'?'稿藏上次使用的本机端口被其他程序占用。请关闭该程序后重试；资料仍保存在本机。':error.message});allowClose=true;app.quit();});
  app.on('before-quit',event=>{if(window&&!window.isDestroyed()&&!allowClose){event.preventDefault();window.close();}});
  app.on('window-all-closed',()=>{service?.server.close();app.quit();});
}
