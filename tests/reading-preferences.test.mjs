import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const path = new URL('../src/reading-preferences.mjs',import.meta.url);
// Load dynamically so the first red run reports the missing feature clearly.
const preferences = existsSync(path) ? await import(path.href) : {};

test('font size is remembered across reading sessions and reset restores the default',()=>{
  assert.equal(typeof preferences.ReadingPreferences,'function');
  const values = new Map([['oc-manuscript-pending-v2','未保存的评价']]);
  const storage = {getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value)};
  const first = new preferences.ReadingPreferences(storage);
  assert.equal(first.size,17);
  assert.equal(first.adjust(1),18);
  assert.equal(first.adjust(1),19);
  const reopened = new preferences.ReadingPreferences(storage);
  assert.equal(reopened.size,19);
  assert.equal(reopened.adjust(-1),18);
  assert.equal(reopened.reset(),17);
  assert.equal(new preferences.ReadingPreferences(storage).size,17);
  assert.equal(values.get('oc-manuscript-pending-v2'),'未保存的评价');
});

test('font size stays within readable bounds even after repeated clicks',()=>{
  assert.equal(typeof preferences.ReadingPreferences,'function');
  const setting = new preferences.ReadingPreferences();
  for(let i=0;i<100;i++) setting.adjust(-1);
  assert.equal(setting.size,14);
  assert.equal(setting.canDecrease,false);
  assert.equal(setting.canIncrease,true);
  for(let i=0;i<100;i++) setting.adjust(1);
  assert.equal(setting.size,28);
  assert.equal(setting.canIncrease,false);
  assert.equal(setting.canDecrease,true);
});

test('invalid or unavailable local storage never prevents reading or font adjustment',()=>{
  assert.equal(typeof preferences.ReadingPreferences,'function');
  for(const value of ['bad','null','{}','0','999','17.5','']) {
    const setting = new preferences.ReadingPreferences({getItem:()=>value,setItem:()=>{}});
    assert.equal(setting.size,17);
  }
  const blocked = new preferences.ReadingPreferences({getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('full');}});
  assert.equal(blocked.size,17);
  assert.equal(blocked.adjust(1),18);
  assert.equal(blocked.remembered,false);
  assert.equal(blocked.reset(),17);
});
