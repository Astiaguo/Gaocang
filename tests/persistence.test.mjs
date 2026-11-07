import test from 'node:test';
import assert from 'node:assert/strict';
import { Persistence, PENDING_KEY } from '../src/persistence.mjs';
test('failed saves retain a recoverable copy under the public recovery key',async()=>{
  const values=new Map();globalThis.localStorage={setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const p=new Persistence('token',0,()=>{});p.request=async()=>{throw Error('disk unavailable');};
  p.schedule({version:2,decisions:{a:{decision:'revise',note:'new'}}});
  await assert.rejects(p.flush());
  assert.equal(PENDING_KEY,'gaocang-public-pending-v2');
  assert.equal(JSON.parse(values.get(PENDING_KEY)).decisions.a.note,'new');
  assert.equal(p.hasPending(),true);
  p.request=async()=>({revision:1});await p.flush();assert.equal(values.has(PENDING_KEY),false);
});
test('import transaction serializes pending saves and rejects overlapping edits',async()=>{
  const p=new Persistence('token',0,()=>{});let release;
  const gate=new Promise(resolve=>{release=resolve;});const paths=[];
  p.request=async(path,data)=>{paths.push(path);if(path==='/api/import'){assert.equal(data.baseRevision,1);await gate;}return {revision:paths.length};};
  p.schedule({version:2,decisions:{}});
  const operation=p.mutate('/api/import',{backup:{}},()=>{});
  assert.throws(()=>p.schedule({version:2,decisions:{}}),/正在导入/);
  await new Promise(resolve=>setImmediate(resolve));release();await operation;
  assert.deepEqual(paths,['/api/state','/api/import']);assert.equal(p.revision,2);assert.equal(p.mutating,false);
});
