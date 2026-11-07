import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
test('public app imports prose, exports complete library and rejects cross-site writes', async t=>{
  const {server}=await createApp({directory:await mkdtemp(join(tmpdir(),'gaocang-api-'))});
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); t.after(()=>new Promise(r=>server.close(r)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const boot=await (await fetch(origin+'/api/bootstrap')).json();
  const body=JSON.stringify({baseRevision:boot.revision,files:[{name:'notes.md',text:'新的文章正文'}],title:'我的文章'});
  for(const Origin of [undefined,'null','https://example.com']) assert.equal((await fetch(origin+'/api/text',{method:'POST',headers:{'X-Gaocang-Token':boot.token,...(Origin?{Origin}:{})},body})).status,403);
  const imported=await fetch(origin+'/api/text',{method:'POST',headers:{Origin:origin,'X-Gaocang-Token':boot.token},body});
  assert.equal(imported.status,200);
  const backup=await (await fetch(origin+'/api/export',{headers:{'X-Gaocang-Token':boot.token}})).json();
  assert.equal(backup.snapshot.groups.at(-1).drafts[0].body,'新的文章正文');
  for(const path of ['/data/library.json','/src/library.mjs','/desktop/main.mjs','/.private/config.json'])assert.equal((await fetch(origin+path)).status,404);
});
