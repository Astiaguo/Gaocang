import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Library } from './src/library.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const browserFiles=['app.mjs','catalog.mjs','review-state.mjs','layout.mjs','annotations.mjs','persistence.mjs','editor-ui.mjs','tags.mjs','tags-ui.mjs','reading-preferences.mjs','strip-scroll.mjs'];
const allowed=new Map([['/index.html','text/html'],['/styles.css','text/css'],['/favicon.svg','image/svg+xml'],...browserFiles.map(f=>['/src/'+f,'text/javascript'])]);
export async function createApp({directory}={}) {
  if(!directory)throw Error('需要指定用户资料目录');
  const store=new Library(directory); await store.load(); const token=randomUUID();
  const server=http.createServer(async(req,res)=>{
    const send=(status,data,mime='application/json')=>{res.writeHead(status,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"});res.end(mime==='application/json'?JSON.stringify(data):data);};
    try {
      const origin=`http://127.0.0.1:${server.address().port}`;
      if(req.headers.host!==new URL(origin).host || (req.headers.origin&&req.headers.origin!==origin))return send(403,{error:'只接受本机编辑台请求'});
      const path=new URL(req.url,origin).pathname;
      if(req.method==='GET'&&path==='/api/health')return send(200,{app:'gaocang-public',version:1});
      if(req.method==='GET'&&path==='/api/bootstrap')return send(200,{...store.read(),token,features:['tags'],build:'0.1.0'});
      if(path.startsWith('/api/')) {
        if(req.headers['x-gaocang-token']!==token)return send(403,{error:'请重新打开稿藏'});
        if(req.method==='GET'&&path==='/api/export')return send(200,store.export());
        if(req.method!=='POST')return send(405,{error:'不支持的操作'});
        if(req.headers.origin!==origin)return send(403,{error:'请求来源不匹配'});
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>128*1024*1024)return send(413,{error:'导入资料过大'});chunks.push(chunk);}
        const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(path==='/api/state')return send(200,await store.save(data.state,data.baseRevision));
        if(path==='/api/recover')return send(200,await store.recover(data.state,data.baseRevision));
        if(path==='/api/text')return send(200,await store.importText(data,data.baseRevision));
        if(path==='/api/import'||path==='/api/migrate')return send(200,await store.importBackup(data.backup??data.state,data.baseRevision));
        return send(404,{error:'没有找到此功能'});
      }
      const file=path==='/'?'/index.html':path;
      if(req.method!=='GET'||!allowed.has(file))return send(404,{error:'没有此文件'});
      send(200,await readFile(join(root,file)),allowed.get(file));
    }catch(e){send(e.status??400,{error:e.message??'本机保存失败，请保留输入'});}
  });
  return {server,store};
}
