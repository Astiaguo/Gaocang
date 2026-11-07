import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseBackup, mergeStates } from './review-state.mjs';
const fail = message => { throw new Error(message); };
const emptyState = () => parseBackup('{"version":2,"decisions":{}}');
const clone = value => structuredClone(value);
function snapshot(input) {
  if (!input || !Array.isArray(input.groups) || input.groups.length > 2000) fail('稿件资料库格式无效');
  const groupIds = new Set(), draftIds = new Set(); let total = 0;
  const groups = input.groups.map(g => {
    if (!g || typeof g.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(g.id) || groupIds.has(g.id) || typeof g.title !== 'string' || !g.title.trim() || g.title.length > 100 || !Array.isArray(g.drafts)) fail('主题格式无效');
    groupIds.add(g.id);
    return { id:g.id, title:g.title, description:typeof g.description==='string' ? g.description.slice(0,1000) : '', drafts:g.drafts.map((d,i) => {
      if (!d || typeof d.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(d.id) || draftIds.has(d.id) || typeof d.title !== 'string' || !d.title.trim() || d.title.length > 200 || typeof d.body !== 'string' || !d.body.trim() || Buffer.byteLength(d.body)>2*1024*1024 || d.body.includes('\0')) fail('稿件格式或大小无效');
      total += Buffer.byteLength(d.body); if (total>32*1024*1024 || draftIds.size>=3000) fail('资料库超过首版容量限制');
      draftIds.add(d.id);
      return {id:d.id,title:d.title,body:d.body,version:i+1,kind:'complete',source:{filename:typeof d.source?.filename==='string' ? d.source.filename.slice(0,200) : '导入的文章'}};
    }) };
  });
  return { groups };
}
function demo() { return snapshot({groups:[{id:'demo',title:'示例：旧站台',description:'两份虚构示例，可试着比较稿次、命名和批注。',drafts:[
  {id:'demo-a',title:'旧站台 · 初稿',body:'末班车开走以后，站台安静下来。\n\n林舟在长椅上找到一只手套。她把手套放在售票窗前，给失主留了一张纸条。'},
  {id:'demo-b',title:'旧站台 · 改稿',body:'站台的钟停在十点十七分。末班车已经离开，长椅下却还留着一只手套。\n\n林舟拾起它，走到售票窗前。她想留一张纸条，翻遍口袋，只找到半张没用完的车票。'},
]}]}); }
export class Library {
  constructor(directory) { this.directory=directory; this.path=join(directory,'library.json'); this.queue=Promise.resolve(); this.document={app:'gaocang-public',revision:0,state:emptyState(),snapshot:demo()}; }
  async load() {
    await mkdir(this.directory,{recursive:true});
    try { const d=JSON.parse(await readFile(this.path,'utf8')); if(d.app!=='gaocang-public'||!Number.isSafeInteger(d.revision)||d.revision<0)fail('本机资料库格式无效，请保留文件'); this.document={app:d.app,revision:d.revision,state:parseBackup(JSON.stringify(d.state)),snapshot:snapshot(d.snapshot)}; }
    catch(e) { if(e.code!=='ENOENT')throw e; }
    return this.read();
  }
  read() { return clone(this.document); }
  export() { return {type:'gaocang-library-backup',version:1,state:clone(this.document.state),snapshot:clone(this.document.snapshot)}; }
  async backup(document, label='before-change') {
    const directory=join(this.directory,'backups'); await mkdir(directory,{recursive:true});
    const name=label==='autosave'?'before-autosave.json':`${Date.now()}-${randomUUID()}-${label}.json`;
    const path=join(directory,name);
    await writeFile(path+'.tmp',JSON.stringify(document),{mode:0o600});await rename(path+'.tmp',path);
    const older=(await readdir(directory)).filter(n=>/^\d+-[a-f0-9-]+-before-change\.json$/.test(n)).sort().slice(0,-10);
    await Promise.all(older.map(n=>unlink(join(directory,n))));
  }
  change(expected, reducer, label='before-change') {
    const operation=this.queue.then(async()=>{
      if(expected!==this.document.revision) { const e=new Error('另一窗口已保存，请重新载入后再试');e.status=409;throw e; }
      const next=reducer(clone(this.document));
      const document={app:'gaocang-public',revision:this.document.revision+1,state:parseBackup(JSON.stringify(next.state)),snapshot:snapshot(next.snapshot)};
      await this.backup(this.document,label);
      const temporary=this.path+'.tmp'; await writeFile(temporary,JSON.stringify(document),{mode:0o600}); await rename(temporary,this.path);
      this.document=document;return this.read();
    }); this.queue=operation.catch(()=>{});return operation;
  }
  save(state, expected) { return this.change(expected,d=>({...d,state}),'autosave'); }
  recover(state, expected) { return this.change(expected,d=>({...d,state})); }
  importText({ files, groupId='', title='' }, expected) {
    return this.change(expected,d=>{
      if(!Array.isArray(files)||!files.length||files.length>30)fail('一次请选择1至30份文章');
      let group=d.snapshot.groups.find(g=>g.id===groupId);
      if(groupId&&!group) {
        const custom=d.state.layout.customGroups.find(g=>g.id===groupId); if(!custom)fail('没有找到目标主题');
        group={id:custom.id,title:custom.title,drafts:[]}; d.snapshot.groups.push(group);
      }
      if(!group) { if(typeof title!=='string'||!title.trim()||title.length>100)fail('请填写100字以内的主题名');group={id:randomUUID(),title:title.trim(),drafts:[]};d.snapshot.groups.push(group); }
      for(const f of files) {
        if(!f||typeof f.name!=='string'||f.name.length>200||!/\.(txt|md|markdown)$/i.test(f.name)||typeof f.text!=='string'||!f.text.trim()||f.text.includes('\0')||Buffer.byteLength(f.text)>2*1024*1024)fail('只接受2MB以内、非空的UTF-8 TXT或Markdown文章');
        group.drafts.push({id:randomUUID(),title:f.name.replace(/\.(txt|md|markdown)$/i,'').slice(0,200)||'未命名稿件',body:f.text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),source:{filename:f.name}});
      } return d;
    });
  }
  importBackup(input, expected) {
    return this.change(expected,d=>{
      if(input?.type==='gaocang-library-backup'&&input.version===1) {
        const incoming=snapshot(input.snapshot), existing=new Map(d.snapshot.groups.flatMap(g=>g.drafts).map(x=>[x.id,x]));
        for(const group of incoming.groups) {
          let target=d.snapshot.groups.find(g=>g.id===group.id);
          if(!target){target={...group,drafts:[]};d.snapshot.groups.push(target);}
          for(const draft of group.drafts) {
            const previous=existing.get(draft.id);
            if(previous&&previous.body!==draft.body)fail('同一稿件ID对应不同正文，已停止导入');
            if(!previous) {target.drafts.push(draft);existing.set(draft.id,draft);}
          }
        }
        d.state=mergeStates(d.state,parseBackup(JSON.stringify(input.state)));
      } else d.state=mergeStates(d.state,parseBackup(JSON.stringify(input)));
      return d;
    });
  }
}
