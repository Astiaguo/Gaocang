import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from '../src/library.mjs';
test('text import preserves version identity and complete backup restores prose and notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gaocang-public-'));
  const lib = new Library(directory); await lib.load();
  const start = lib.read();
  let doc = await lib.importText({ files: [{ name:'夜航.txt', text:'第一版，船在夜色里靠岸。' }], title:'夜航' }, start.revision);
  const group = doc.snapshot.groups.at(-1), first = group.drafts[0];
  doc = await lib.importText({ files: [{ name:'夜航.md', text:'第二版，灯还亮着。' }], groupId:group.id }, doc.revision);
  assert.equal(doc.snapshot.groups.at(-1).drafts.length, 2);
  assert.equal(doc.snapshot.groups.at(-1).drafts[0].id, first.id);
  const state = structuredClone(doc.state); state.decisions[first.id] = { decision:'collect', note:'保留灯的细节' };
  await lib.save(state, doc.revision);
  const reopened = new Library(directory); await reopened.load();
  assert.equal(reopened.read().state.decisions[first.id].note, '保留灯的细节');
  const other = new Library(await mkdtemp(join(tmpdir(),'gaocang-restore-'))); await other.load();
  await other.importBackup(reopened.export(), 0);
  assert.equal(other.read().snapshot.groups.find(g=>g.id===group.id).drafts[0].body, first.body);
  assert.equal(other.read().state.decisions[first.id].note, '保留灯的细节');
});
test('invalid imports and stale saves never change the stored library', async () => {
  const lib = new Library(await mkdtemp(join(tmpdir(),'gaocang-validation-'))); await lib.load();
  const before = lib.read();
  for (const file of [{name:'bad.exe',text:'内容'},{name:'empty.txt',text:'  '},{name:'huge.txt',text:'字'.repeat(1100000)}]) {
    await assert.rejects(lib.importText({files:[file],title:'测试'},0));
    assert.deepEqual(lib.read(),before);
  }
  const bad = lib.export(); bad.snapshot.groups[0].drafts[0].body = '冒名替换';
  await assert.rejects(lib.importBackup(bad,0), /不同正文/);
  await assert.rejects(lib.save(before.state,7), /另一窗口/);
  assert.deepEqual(lib.read(),before);
});
test('explicit recovery restores pending edits and deletions; ordinary import keeps local decisions',async()=>{
  const lib=new Library(await mkdtemp(join(tmpdir(),'gaocang-recovery-')));await lib.load();
  let d=lib.read();d.state.decisions['demo-a']={decision:'collect',note:'stored'};d=await lib.save(d.state,0);
  const pending=structuredClone(d.state);pending.decisions['demo-a'].note='unsaved-new';
  const imported=await lib.importBackup(pending,d.revision);assert.equal(imported.state.decisions['demo-a'].note,'stored');
  const recovered=await lib.recover(pending,imported.revision);assert.equal(recovered.state.decisions['demo-a'].note,'unsaved-new');
  delete pending.decisions['demo-a'];const deleted=await lib.recover(pending,recovered.revision);assert.equal(deleted.state.decisions['demo-a'],undefined);
});
test('autosaves use one rotating backup and significant imports keep at most ten snapshots',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'gaocang-retention-'));const lib=new Library(directory);await lib.load();
  for(let i=0;i<15;i++)await lib.save(lib.read().state,lib.read().revision);
  const backupDir=join(directory,'backups');assert.equal((await readdir(backupDir)).length,1);
  for(let i=0;i<15;i++)await lib.importText({files:[{name:'part.txt',text:'new prose'}],title:'Part'},lib.read().revision);
  const files=await readdir(backupDir);assert.equal(files.length,11);
  for(const name of files)assert.equal(JSON.parse(await readFile(join(backupDir,name),'utf8')).app,'gaocang-public');
});
