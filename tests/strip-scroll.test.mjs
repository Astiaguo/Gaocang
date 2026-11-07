import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const path = new URL('../src/strip-scroll.mjs',import.meta.url);
const feature = existsSync(path) ? await import(path.href) : {};
const strip = (groupId,scrollLeft=0,scrollWidth=2600,clientWidth=480) => ({dataset:{groupId},scrollLeft,scrollWidth,clientWidth});

test('rebuilding a chapter strip keeps its horizontal position, including zero and fractional offsets',()=>{
  assert.equal(typeof feature.VersionStripScroll,'function');
  const memory = new feature.VersionStripScroll();
  memory.capture(strip('long-story',1512.5));
  const replacement = strip('long-story');
  memory.restore(replacement);
  assert.equal(replacement.scrollLeft,1512.5);
  memory.capture(strip('long-story',0));
  memory.restore(replacement);
  assert.equal(replacement.scrollLeft,0);
});

test('different themes retain independent positions and new themes start at the beginning',()=>{
  assert.equal(typeof feature.VersionStripScroll,'function');
  const memory = new feature.VersionStripScroll();
  memory.capture(strip('one',1200));
  memory.capture(strip('two',550));
  const a=strip('one'), b=strip('two'), newTheme=strip('new');
  memory.restore(a); memory.restore(b); memory.restore(newTheme);
  assert.equal(a.scrollLeft,1200);
  assert.equal(b.scrollLeft,550);
  assert.equal(newTheme.scrollLeft,0);
});

test('filtering or resizing clamps a remembered position without replacing the saved progress',()=>{
  assert.equal(typeof feature.VersionStripScroll,'function');
  const memory = new feature.VersionStripScroll();
  memory.capture(strip('story',1600));
  memory.capture(null);
  const filtered = strip('story',0,800,480);
  memory.restore(filtered);
  assert.equal(filtered.scrollLeft,320);
  const noOverflow = strip('story',0,200,480);
  memory.restore(noOverflow);
  assert.equal(noOverflow.scrollLeft,0);
  const full = strip('story'); memory.restore(full);
  assert.equal(full.scrollLeft,1600);
});
