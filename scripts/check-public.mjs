import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const roots=new Set(['src','desktop','scripts','tests','.github','build-resources','LICENSE','README.md','RELEASE-CHECKLIST.md','package.json','package-lock.json','.gitignore','server.mjs','index.html','styles.css','favicon.svg']);
const reviewedAssets=new Map([['build-resources/icon.icns','80a531fd613bc018ad51e36dc6fe6cdb637094d708b2b95c4b74bfda5b9f57f2'],['build-resources/icon.ico','5800a4e2126e8d0f7e0c1a52d966d7bf0ae8dc7fe0ead42676ebaade891675a5']]);
const blocked=/(?:client_secret|BEGIN (?:RSA |EC )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}|\/Users\/|[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12})/;
const published=[];
async function walk(directory){for(const item of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,item.name), name=relative(root,path).split(sep).join('/');
  if(directory===root&&['node_modules','dist','.git'].includes(item.name))continue;
  if(directory===root&&!roots.has(item.name))throw Error(`文件不在公开白名单：${name}`);
  if((await lstat(path)).isSymbolicLink())throw Error(`不发布符号链接：${name}`);
  if(item.isDirectory())await walk(path);else{
    if(reviewedAssets.has(name)) {
      if(createHash('sha256').update(await readFile(path)).digest('hex')!==reviewedAssets.get(name))throw Error(`图标需重新审阅：${name}`);
      published.push(name);continue;
    }
    if(/\.(?:apk|keystore|pem|sqlite|jpg|png|zip|dmg|exe)$/i.test(name))throw Error(`不应进入源码的文件：${name}`);
    // The scanner necessarily contains the blocked signatures themselves.
    if(name!=='scripts/check-public.mjs'&&blocked.test(await readFile(path,'utf8')))throw Error(`需人工核对公开内容：${name}`);
    published.push(name);
  }
}}
await walk(root);console.log(`公开源文件检查通过：${published.length}份白名单文件；打包时仍需核对制品内容。`);
