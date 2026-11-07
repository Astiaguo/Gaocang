import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLayout, moveDraft } from '../src/layout.mjs';
import { parseBackup } from '../src/review-state.mjs';
import { annotationSegments } from '../src/annotations.mjs';

const base = [{ id: 'one', title: '甲', drafts: [{ id: 'a', body: '原文甲' }, { id: 'b', body: '原文乙' }] }, { id: 'two', title: '乙', drafts: [{ id: 'c', body: '原文丙' }] }];
test('moving and reordering drafts retains prose, decisions and annotations through backup', () => {
  let state = parseBackup(JSON.stringify({ version: 1, decisions: { a: { decision: 'revise', note: '老备注' } } }));
  state = moveDraft(state, base, 'a', 'two', 'c');
  const groups = applyLayout(base, state);
  assert.deepEqual(groups.map(g => g.drafts.map(d => d.id)), [['b'], ['a', 'c']]);
  assert.equal(groups[1].drafts[0].body, '原文甲');
  assert.equal(state.decisions.a.note, '老备注');
  assert.deepEqual(base[0].drafts.map(d => d.id), ['a', 'b']);
});
test('unknown placement does not hide a draft and custom names apply to empty themes', () => {
  const state = { layout: { draftGroups: { a: 'missing' }, groupNames: { one: '新甲' }, customGroups: [{ id: 'custom', title: '空主题' }] } };
  const groups = applyLayout(base, state);
  assert.equal(groups[0].title, '新甲');
  assert.equal(groups.flatMap(g=>g.drafts).length, 3);
  assert.equal(groups.at(-1).title, '空主题');
});
test('overlapping notes preserve exact source and stale anchors are never highlighted', () => {
  const body = '甲乙\n\n丙丁';
  const notes = [{ id:'n1', start:1, end:5, quote:'乙\n\n丙' }, { id:'n2', start:4, end:6, quote:'丙丁' }, { id:'stale', start:0, end:2, quote:'不符' }];
  const parts = annotationSegments(body, notes);
  assert.equal(parts.map(p => p.text).join(''), body);
  assert.deepEqual(parts.find(p => p.text === '丙').ids, ['n1','n2']);
  assert.ok(parts.every(p => !p.ids.includes('stale')));
});
