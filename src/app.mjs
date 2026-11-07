import { filterGroups, groupDecisionCounts, matchingDrafts } from './catalog.mjs';
import { parseBackup, setDecision, setDraftName } from './review-state.mjs';
import { applyLayout, moveDraft } from './layout.mjs';
import { renderAnnotated } from './annotations.mjs';
import { Persistence, PENDING_KEY } from './persistence.mjs';
import { makeElement as el, setupEditor } from './editor-ui.mjs';
import { setupTags, tagBadges } from './tags-ui.mjs';
import { tagKey } from './tags.mjs';
import { ReadingPreferences } from './reading-preferences.mjs';
import { VersionStripScroll } from './strip-scroll.mjs';

const ui = Object.fromEntries(['group-list','list-count','reader','review','search-input','status-filter','export-button','import-button','import-file','toast','save-status','new-group'].map(id => [id, document.getElementById(id)]));
let source = [], groups = [], state = parseBackup('{"version":1,"decisions":{}}');
let currentGroupId = '', currentDraftId = '', persistence, editor, tagUI, toastTimer, dragging = null, tagFilter = 'all';
let nameMode = '', nameGroupId = '', nameDraftId = '';
const selectedGroup = () => groups.find(group => group.id === currentGroupId);
const selectedDraft = () => selectedGroup()?.drafts.find(draft => draft.id === currentDraftId);
const decisionOf = draft => state.decisions[draft.id]?.decision || 'undecided';
const statusText = decision => ({ collect:'收录候选', revise:'待修改', reject:'不收录', undecided:'未决定' })[decision] || '未决定';
let readingStorage;
try { readingStorage = window.localStorage; } catch {}
const readingPreferences = new ReadingPreferences(readingStorage);
const versionStripScroll = new VersionStripScroll();

function applyReadingSize() {
  document.documentElement.style.setProperty('--reading-font-size',`${readingPreferences.size}px`);
  document.documentElement.style.setProperty('--reading-offset',`${readingPreferences.size - 17}px`);
  const controls = ui.reader.querySelector('.reading-controls');
  if (!controls) return;
  controls.querySelector('output').textContent = `${readingPreferences.size} px`;
  controls.querySelector('[data-font-step="-1"]').disabled = !readingPreferences.canDecrease;
  controls.querySelector('[data-font-step="1"]').disabled = !readingPreferences.canIncrease;
  const hint = controls.querySelector('.reading-memory');
  hint.textContent = readingPreferences.remembered ? '下次打开沿用' : '仅本次生效';
}
applyReadingSize();

function readingControls() {
  const controls = el('div','reading-controls'); controls.setAttribute('role','group'); controls.setAttribute('aria-label','阅读字号');
  controls.append(el('span','reading-size-label','字号'));
  const smaller = el('button','font-size-button','A−'); smaller.type = 'button'; smaller.dataset.fontStep = '-1'; smaller.setAttribute('aria-label','缩小阅读字号');
  const size = el('output','reading-size-value'); size.setAttribute('aria-label','当前阅读字号'); size.setAttribute('aria-live','polite'); size.setAttribute('aria-atomic','true');
  const larger = el('button','font-size-button','A＋'); larger.type = 'button'; larger.dataset.fontStep = '1'; larger.setAttribute('aria-label','放大阅读字号');
  const reset = el('button','text-button font-size-reset','恢复默认'); reset.type = 'button'; reset.dataset.fontReset = '';
  controls.append(smaller,size,larger,reset,el('span','reading-memory'));
  return controls;
}

function toast(message, error = false) {
  ui.toast.textContent = message; ui.toast.classList.toggle('error', error); ui.toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 5000);
}
function saveStatus(text, status) { ui['save-status'].textContent = text; ui['save-status'].dataset.status = status; }
function rebuild() { groups = applyLayout(source, state); }
function visibleDrafts(group) { return tagFilter==='all' ? group.drafts : matchingDrafts(group,ui['search-input'].value,ui['status-filter'].value,state,tagFilter); }
function reconcileSelection() {
  if (tagFilter==='all') return;
  const shown = filterGroups(groups,ui['search-input'].value,ui['status-filter'].value,state,tagFilter);
  const current = shown.find(group=>group.id===currentGroupId) || shown[0];
  currentGroupId = current?.id || '';
  const drafts = current ? visibleDrafts(current) : [];
  if (!drafts.some(draft=>draft.id===currentDraftId)) currentDraftId = drafts.at(-1)?.id || '';
}
function changeTagFilter(filter) { tagFilter = filter; reconcileSelection(); render(); }
function update(next, rerender = true) {
  state = next; rebuild(); reconcileSelection(); persistence.schedule(state);
  if (rerender) { const scroll = ui.reader.scrollTop; render(); ui.reader.scrollTop = scroll; }
}
function label(group, draft) {
  if (draft.kind === 'fragment') return `修订片段 ${group.drafts.indexOf(draft) + 1}`;
  if (group.mode === 'collection' || group.mode === 'story') {
    const related = group.drafts.filter(item => item.pieceTitle === draft.pieceTitle);
    return related.length > 1 ? `${draft.pieceTitle} · 第 ${related.indexOf(draft) + 1} 稿` : draft.pieceTitle;
  }
  return `第 ${group.drafts.indexOf(draft) + 1} 稿`;
}
function draftTitle(draft) { return draft.userTitle || (draft.title.length <= 34 ? draft.title : draft.pieceTitle || draft.title.slice(0,34)); }
function choose(groupId, draftId) {
  editor?.hide(); currentGroupId = groupId;
  currentDraftId = draftId || [...(selectedGroup() ? visibleDrafts(selectedGroup()) : [])].reverse().find(draft => draft.kind !== 'fragment')?.id || '';
  render(); ui.reader.scrollTop = 0;
}
function renderList() {
  const shown = filterGroups(groups, ui['search-input'].value, ui['status-filter'].value, state,tagFilter);
  ui['list-count'].textContent = `${shown.length} 个主题 · ${tagFilter==='all' ? groups.reduce((sum,g) => sum + g.drafts.length,0) : shown.reduce((sum,g)=>sum+visibleDrafts(g).length,0)} 份原文`;
  tagUI?.renderFilters();
  ui['group-list'].replaceChildren();
  if (!shown.length) ui['group-list'].append(el('p','empty-list','没有找到，试试换个词或选择全部作品。'));
  for (const group of shown) {
    const shownDrafts = visibleDrafts(group);
    const card = el('section','theme-card'); card.dataset.groupCard = group.id;
    const heading = el('div','theme-heading');
    const grip = el('span','theme-grip','⠿'); grip.draggable = true; grip.dataset.dragGroup = group.id; grip.title = '拖动调整主题顺序';
    const button = el('button','group-card'); button.type = 'button'; button.dataset.group = group.id; button.setAttribute('aria-current', String(group.id === currentGroupId));
    const line = el('span','group-card-line'); line.append(el('strong','',group.title), el('span','group-card-count',`${shownDrafts.length} 稿`));
    const counts = groupDecisionCounts({...group,drafts:shownDrafts},state);
    const status = counts.collect ? `${counts.collect} 稿待收录` : counts.revise ? `${counts.revise} 稿待修改` : !shownDrafts.length ? '空主题 · 可拖入文章' : counts.reject === shownDrafts.length ? '均不收录' : '等你翻阅';
    button.append(line, el('span','group-status',status)); heading.append(grip,button); card.append(heading);
    const themeTags = [...new Map(shownDrafts.flatMap(draft=>state.draftTags[draft.id] || []).map(tag=>[tagKey(tag),tag])).values()];
    if (themeTags.length) { const summary = el('div','theme-tag-summary'); summary.append(tagBadges(themeTags,state)); card.append(summary); }
    if (group.id === currentGroupId) {
      const drafts = el('div','theme-drafts');
      for (const draft of shownDrafts) {
        const row = el('button','draft-row'); row.type = 'button'; row.draggable = true;
        row.dataset.dragDraft = draft.id; row.dataset.draftRow = draft.id; row.dataset.groupId = group.id; row.setAttribute('aria-current',String(draft.id === currentDraftId));
        row.append(el('span','draft-grip','⠿'),el('span','draft-row-title',draftTitle(draft)),el('span',`draft-dot ${decisionOf(draft)}`, `${group.drafts.indexOf(draft)+1}`));
        if (state.draftTags[draft.id]?.length) row.append(tagBadges(state.draftTags[draft.id],state,2));
        const notes = (state.annotations[draft.id] || []).length; if (notes) row.append(el('span','note-count',`${notes} 注`));
        row.title = `${draft.title} · ${label(group,draft)} · 拖动可以换主题或调整顺序`; drafts.append(row);
      }
      card.append(drafts);
    }
    ui['group-list'].append(card);
  }
}
function renderReader() {
  versionStripScroll.capture(ui.reader.querySelector('.version-strip'));
  const group = selectedGroup(); ui.reader.replaceChildren();
  if (!group) { ui.reader.append(el('p','reader-empty',tagFilter==='all' ? '从左边选一个主题，开始翻阅。' : '没有符合当前标签和筛选条件的稿件。可以清除标签或调整搜索。')); return; }
  const top = el('div','reader-top'); top.append(el('p','reader-kicker','逐稿翻阅'));
  const title = el('div','title-line'); title.append(el('h2','work-title',group.title));
  const rename = el('button','text-button','改名'); rename.type = 'button'; rename.dataset.rename = group.id; title.append(rename); top.append(title);
  if (group.description) top.append(el('p','work-description',group.description)); ui.reader.append(top);
  if (!group.drafts.length) { ui.reader.append(el('div','missing-copy','这是一个空主题。把文章拖到左边这个主题上，或在文章上方选择“移动到”。')); return; }
  const tabs = el('div','version-strip'); tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','稿件与版本');
  tabs.dataset.groupId = group.id;
  for (const draft of visibleDrafts(group)) {
    const tab = el('button','version-tab'); tab.type = 'button'; tab.dataset.draft = draft.id; tab.draggable = true; tab.dataset.dragDraft = draft.id;
    tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(draft.id === currentDraftId));
    tab.title = draft.title;
    tab.append(el('span','version-number',label(group,draft)),el('span','version-line',draftTitle(draft)));
    if (state.draftTags[draft.id]?.length) tab.append(tagBadges(state.draftTags[draft.id],state));
    if (decisionOf(draft) !== 'undecided') tab.append(el('span',`version-state ${decisionOf(draft)}`,statusText(decisionOf(draft)))); tabs.append(tab);
  }
  ui.reader.append(tabs);
  versionStripScroll.restore(tabs);
  if (tagFilter!=='all') {
    const hint = el('div','filtered-drafts-hint',`此主题显示 ${visibleDrafts(group).length} / ${group.drafts.length} 稿`);
    const clear = el('button','text-button','查看全部稿次'); clear.type = 'button'; clear.addEventListener('click',()=>changeTagFilter('all')); hint.append(clear); ui.reader.append(hint);
  }
  const draft = selectedDraft(); if (!draft) return;
  const tools = el('div','reader-tools'); const moveLabel = el('label','','移动到'); moveLabel.htmlFor = 'move-target'; const move = el('select'); move.id = 'move-target';
  for (const group of groups) { const option = el('option','',group.title); option.value = group.id; option.selected = group.id === currentGroupId; move.append(option); }
  tools.append(moveLabel,move,el('span','selection-hint','选中文字，写下批注')); ui.reader.append(tools);
  ui.reader.append(readingControls()); applyReadingSize();
  tagUI?.renderBar(ui.reader,draft);
  const draftHeading = el('div','draft-heading');
  const draftName = el('h3','draft-title',draft.title);
  const nameButton = el('button','text-button draft-name-button',draft.userTitle ? '修改稿名' : '给本稿命名');
  nameButton.type = 'button'; nameButton.dataset.renameDraft = draft.id;
  draftHeading.append(draftName,nameButton); ui.reader.append(draftHeading);
  const paper = el('div','paper'); const meta = el('div','paper-meta'); meta.append(el('span','',`${group.title} · ${label(group,draft)}`),el('span','',`${[...draft.body].length.toLocaleString('zh-CN')} 字符`));
  const article = el('article','manuscript'); article.setAttribute('aria-label','稿件原文'); renderAnnotated(draft.body,state.annotations[draft.id] || [],article);
  paper.append(meta,article,el('p','paper-end',draft.kind === 'fragment' ? '— 片段至此 —' : '— 本篇至此 —')); ui.reader.append(paper);
}
function renderReview() {
  const draft = selectedDraft(); ui.review.replaceChildren();
  if (!draft) { ui.review.append(el('p','review-placeholder','选择一稿后，可以在这里筛选和回看批注。')); return; }
  const head = el('div','review-head'); head.append(el('p','small-label','读后的判断'),el('h2','','这段文字，要留下吗？'),el('p','review-help','选择、备注和批注会自动保存到本机。')); ui.review.append(head);
  const decisions = el('div','decision-buttons');
  for (const value of ['collect','revise','reject','undecided']) { const button = el('button',`decision-button ${value}`,statusText(value)); button.type = 'button'; button.dataset.decision = value; button.setAttribute('aria-pressed',String(decisionOf(draft) === value)); decisions.append(button); }
  ui.review.append(decisions); editor?.list(ui.review);
  const noteLabel = el('label','input-label note-label','整篇备注'); noteLabel.htmlFor = 'draft-note';
  const note = el('textarea','draft-note'); note.id = 'draft-note'; note.rows = 5; note.value = state.decisions[draft.id]?.note || ''; note.placeholder = '关于整篇文章、人物设定或接下来的修改…';
  ui.review.append(noteLabel,note,el('p','autosave-hint','写到哪，保存到哪。具体用词可直接在原文中批注。'));
  ui.review.append(el('p','autosave-hint',`导入文件：${draft.source?.filename || '本机文章'}`));
}
function render() { renderList(); renderReader(); renderReview(); }
function openName(mode, groupId = '') {
  nameMode = mode; nameGroupId = groupId; nameDraftId = mode === 'draft' ? currentDraftId : '';
  const isDraft = mode === 'draft', draft = selectedDraft();
  document.querySelector('#name-title').textContent = isDraft ? (draft?.userTitle ? '修改这一稿的名字' : '给这一稿起个名字') : mode === 'new' ? '新建一个主题' : '给这一系列文章命名';
  document.querySelector('#name-label').textContent = isDraft ? '稿件名称' : '主题名称';
  const input = document.querySelector('#theme-name'); input.setCustomValidity('');
  input.value = isDraft ? draft?.title || '' : mode === 'new' ? '' : groups.find(group => group.id === groupId)?.title || '';
  const hint = document.querySelector('#name-hint'); hint.hidden = !isDraft; hint.textContent = isDraft ? '只给当前这一稿命名，不改主题名称，也不改正文。' : '';
  document.querySelector('#name-reset').hidden = !isDraft || !draft?.userTitle;
  document.querySelector('#name-dialog').showModal(); input.focus(); input.select();
}
ui['new-group'].addEventListener('click',() => openName('new'));
document.querySelector('#name-cancel').addEventListener('click',() => document.querySelector('#name-dialog').close());
document.querySelector('#theme-name').addEventListener('input',event => event.target.setCustomValidity(''));
document.querySelector('#name-reset').addEventListener('click',() => {
  update(setDraftName(state,nameDraftId,'')); document.querySelector('#name-dialog').close(); toast('已恢复原来的稿件名称');
});
document.querySelector('#name-form').addEventListener('submit',event => {
  event.preventDefault(); const input = document.querySelector('#theme-name'), title = input.value.trim();
  if (!title) { input.setCustomValidity('请填写名称'); input.reportValidity(); return; }
  if (nameMode === 'draft') {
    try {
      const next = setDraftName(state,nameDraftId,title);
      document.querySelector('#name-dialog').close(); update(next); toast('本稿名称已更新');
    } catch (error) { input.setCustomValidity(error.message); input.reportValidity(); }
    return;
  }
  const layout = structuredClone(state.layout);
  if (nameMode === 'new') { const id = `custom-${crypto.randomUUID()}`; layout.customGroups.push({ id,title }); currentGroupId = id; currentDraftId = ''; }
  else layout.groupNames[nameGroupId] = title;
  document.querySelector('#name-dialog').close(); update({ ...state,layout }); toast(nameMode === 'new' ? '新主题已建好，可以拖入文章' : '主题名称已更新');
});
ui['group-list'].addEventListener('click',event => { const draft = event.target.closest('[data-draft-row]'); if (draft) return choose(draft.dataset.groupId,draft.dataset.draftRow); const group = event.target.closest('[data-group]'); if (group) choose(group.dataset.group); });
ui.reader.addEventListener('click',event => {
  const fontStep = event.target.closest('[data-font-step]'), fontReset = event.target.closest('[data-font-reset]');
  if (fontStep || fontReset) {
    if (fontReset) readingPreferences.reset(); else readingPreferences.adjust(Number(fontStep.dataset.fontStep));
    editor?.hide(); applyReadingSize(); return;
  }
  const tab = event.target.closest('[data-draft]'); if (tab) return choose(currentGroupId,tab.dataset.draft);
  if (event.target.closest('[data-rename-draft]')) return openName('draft');
  const rename = event.target.closest('[data-rename]'); if (rename) return openName('rename',rename.dataset.rename);
  const mark = event.target.closest('[data-annotations]'); if (mark) editor.openNote(JSON.parse(mark.dataset.annotations)[0]);
});
ui.reader.addEventListener('keydown',event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('mark[data-annotations]')) { event.preventDefault(); editor.openNote(JSON.parse(event.target.dataset.annotations)[0]); } });
ui.reader.addEventListener('change',event => { if (event.target.id !== 'move-target') return; const target = event.target.value; update(moveDraft(state,source,currentDraftId,target),false); currentGroupId = target; render(); toast('文章已移入新主题，批注与备注一起保留'); });
ui.review.addEventListener('click',event => { const annotation = event.target.closest('[data-note]'); if (annotation) return editor.openNote(annotation.dataset.note); const button = event.target.closest('[data-decision]'); const draft = selectedDraft(); if (button && draft) update(setDecision(state,draft.id,button.dataset.decision,state.decisions[draft.id]?.note || '')); });
ui.review.addEventListener('input',event => { if (event.target.id === 'draft-note' && selectedDraft()) update(setDecision(state,currentDraftId,decisionOf(selectedDraft()),event.target.value),false); });
function refreshSearch() { if (tagFilter!=='all') { reconcileSelection(); render(); } else renderList(); }
ui['search-input'].addEventListener('input',refreshSearch); ui['status-filter'].addEventListener('change',refreshSearch);

document.addEventListener('dragstart',event => {
  const draft = event.target.closest('[data-drag-draft]'), group = event.target.closest('[data-drag-group]'); dragging = draft ? { type:'draft',id:draft.dataset.dragDraft } : group ? { type:'group',id:group.dataset.dragGroup } : null;
  if (dragging) { event.dataTransfer.setData('text/plain',JSON.stringify(dragging)); event.dataTransfer.effectAllowed = 'move'; document.body.classList.add('is-dragging'); }
});
document.addEventListener('dragover',event => { const target = event.target.closest('[data-group-card]'); if (!dragging || !target) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); target.classList.add('drop-target'); });
function endDrag() { dragging = null; document.body.classList.remove('is-dragging'); document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); }
document.addEventListener('dragend',endDrag);
function placeDragged(target, before = '') {
  if (!dragging || !target) return;
  const targetId = target.dataset.groupCard;
  if (dragging.type === 'draft') { const id = dragging.id; update(moveDraft(state,source,id,targetId,before),false); currentGroupId = targetId; currentDraftId = id; render(); toast('文章位置已更新'); }
  else if (targetId !== dragging.id) { const order = groups.filter(group => group.id !== dragging.id).map(group => group.id); order.splice(order.indexOf(targetId),0,dragging.id); update({ ...state,layout:{ ...state.layout,groupOrder:order } }); }
  endDrag();
}
document.addEventListener('drop',event => {
  const target = event.target.closest('[data-group-card]'); if (!dragging || !target) return; event.preventDefault(); placeDragged(target,event.target.closest('[data-draft-row]')?.dataset.draftRow || '');
});
// Pointer handles work in embedded browsers and on touchscreens as well as native HTML drag.
let pointerDrag = null, dragGhost = null, suppressClick = false, dragFrame;
function scrollWhileDragging() {
  if (!pointerDrag?.active) return;
  const library = document.querySelector('.library'), rect = library.getBoundingClientRect();
  if (pointerDrag.lastX >= rect.left && pointerDrag.lastX <= rect.right) {
    if (pointerDrag.lastY > rect.bottom-55) library.scrollTop += 8;
    if (pointerDrag.lastY < rect.top+55) library.scrollTop -= 8;
  }
  dragFrame = requestAnimationFrame(scrollWhileDragging);
}
document.addEventListener('pointerdown',event => {
  const grip = event.target.closest('.draft-grip,.theme-grip');
  if (!grip || event.button !== 0) return;
  const draft = grip.closest('[data-drag-draft]');
  pointerDrag = { x:event.clientX,y:event.clientY,active:false,type:draft ? 'draft' : 'group',id:draft?.dataset.dragDraft || grip.dataset.dragGroup, title:draft?.innerText || grip.parentElement.innerText };
  event.preventDefault();
});
document.addEventListener('pointermove',event => {
  if (!pointerDrag) return;
  if (!pointerDrag.active && Math.hypot(event.clientX-pointerDrag.x,event.clientY-pointerDrag.y)<7) return;
  event.preventDefault();
  pointerDrag.lastX = event.clientX; pointerDrag.lastY = event.clientY;
  if (!pointerDrag.active) { pointerDrag.active = true; dragging = { type:pointerDrag.type,id:pointerDrag.id }; document.body.classList.add('is-dragging'); dragGhost = el('div','drag-ghost',pointerDrag.title.slice(0,42)); document.body.append(dragGhost); dragFrame = requestAnimationFrame(scrollWhileDragging); }
  dragGhost.style.left = `${event.clientX+14}px`; dragGhost.style.top = `${event.clientY+12}px`;
  const target = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-group-card]');
  document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); target?.classList.add('drop-target');
  const library = document.querySelector('.library'), rect = library.getBoundingClientRect();
  if (event.clientX<rect.right && event.clientY>rect.bottom-55) library.scrollTop += 16;
  if (event.clientX<rect.right && event.clientY<rect.top+55) library.scrollTop -= 16;
}, { passive:false });
document.addEventListener('pointerup',event => {
  if (!pointerDrag) return;
  if (pointerDrag.active) { const target = document.elementFromPoint(event.clientX,event.clientY); placeDragged(target?.closest('[data-group-card]'),target?.closest('[data-draft-row]')?.dataset.draftRow || ''); suppressClick = true; setTimeout(()=>{suppressClick=false;},0); }
  pointerDrag = null; cancelAnimationFrame(dragFrame); dragGhost?.remove(); dragGhost = null; endDrag();
});
document.addEventListener('pointercancel',() => { pointerDrag = null; cancelAnimationFrame(dragFrame); dragGhost?.remove(); dragGhost = null; endDrag(); });
document.addEventListener('click',event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } },true);
function download(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{ type:'application/json;charset=utf-8' })); const link = el('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function currentBackup(value=state) {return {type:'gaocang-library-backup',version:1,state:parseBackup(JSON.stringify(value)),snapshot:{groups:structuredClone(source)}};}
async function busyImport(path,data,apply) {
  const busy=document.getElementById('busy-dialog');busy.showModal();
  try {return await persistence.mutate(path,data,apply);} finally {busy.close();}
}
ui['export-button'].addEventListener('click',() => { try { download(currentBackup(),`稿藏-完整备份-${new Date().toISOString().slice(0,10)}.json`);toast('已导出当前页面的正文和整理记录，含尚未保存的改动'); } catch(e) { toast(e.message,true); } });
ui['import-button'].addEventListener('click',() => ui['import-file'].click());
ui['import-file'].addEventListener('change',async () => {
  const file = ui['import-file'].files?.[0]; if (!file) return;
  try { const incoming = JSON.parse(await file.text()); await busyImport('/api/import',{ backup:incoming },result=>{source = result.snapshot.groups; state = result.state; rebuild(); reconcileSelection(); render();}); saveStatus('已保存到本机','saved'); toast('已合并备份；导入前的记录也已留存'); }
  catch (error) { toast(error.message,true); } finally { ui['import-file'].value = ''; }
});
ui['save-status'].addEventListener('click',() => persistence?.flush().catch(error => toast(error.message,true)));
window.addEventListener('beforeunload',event => { if (persistence?.hasPending()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide',() => persistence?.flush().catch(() => {}));
window.gaocangPrepareReload = async () => {
  if(document.querySelector('dialog[open]')) return {ok:false,message:'请先保存或关闭当前编辑框，然后再载入新版或退出。'};
  try { await persistence?.flush(); return {ok:true}; }
  catch(error) { return {ok:false,message:error.message}; }
};

async function init() {
  try {
    if (location.protocol === 'file:') throw new Error('请通过稿藏桌面程序打开');
    const response = await fetch('/api/bootstrap'); if (!response.ok) throw new Error('请重新打开稿藏桌面程序');
    const boot = await response.json();
    if (!boot.features?.includes('tags')) throw new Error('请更新并重新打开稿藏桌面程序');
    source = boot.snapshot.groups; state = parseBackup(JSON.stringify(boot.state)); persistence = new Persistence(boot.token,boot.revision,saveStatus);
    let pending = null; try { const saved = localStorage.getItem(PENDING_KEY); if (saved) pending = parseBackup(saved); } catch {}
    try {
      const legacy = localStorage.getItem('gaocang-public-review-v1');
      if (legacy && legacy !== localStorage.getItem('gaocang-public-migrated-v2')) { const result = await persistence.request('/api/migrate',{ state:parseBackup(legacy),baseRevision:persistence.revision }); state = result.state; persistence.revision = result.revision; localStorage.setItem('gaocang-public-migrated-v2',legacy); toast('已迁入旧浏览器记录；冲突时采用本机文件，旧记录也已另存'); }
    } catch (error) { toast(`旧记录暂未合并：${error.message}`,true); }
    rebuild(); currentGroupId = groups[0]?.id || ''; currentDraftId = selectedGroup()?.drafts.at(-1)?.id || '';
    editor = setupEditor({ getDraft:selectedDraft,getState:() => state,update,reader:ui.reader,toast });
    tagUI = setupTags({getState:()=>state,getDraft:selectedDraft,getGroups:()=>groups,update,onFilterChange:changeTagFilter,getFilter:()=>tagFilter,toast});
    render(); saveStatus('已保存到本机','saved');
    if (pending) {
      const banner = document.querySelector('#recovery-banner'); banner.hidden = false;
      const surfaces=[document.querySelector('.workbench'),document.querySelector('.masthead')];surfaces.forEach(n=>n.inert=true);
      const finishRecovery=()=>{banner.hidden=true;localStorage.removeItem(PENDING_KEY);surfaces.forEach(n=>n.inert=false);};
      document.querySelector('#recover-pending').onclick = async () => { try { await busyImport('/api/recover',{state:pending},result=>{state=result.state;source=result.snapshot.groups;rebuild();reconcileSelection();render();});finishRecovery();toast('已恢复上次未保存的整理记录；恢复前的本机记录已另存'); } catch(error) { toast(error.message,true); } };
      document.querySelector('#download-pending').onclick = () => {download(currentBackup(pending),'稿藏-上次未保存完整备份.json');document.querySelector('#confirm-pending-export').hidden=false;};
      document.querySelector('#confirm-pending-export').onclick = finishRecovery;
    }
  } catch (error) { saveStatus('尚未连接本机服务','error'); ui['list-count'].textContent = '等待启动本机编辑台'; ui.reader.replaceChildren(el('div','load-error',`${error.message}。你的资料保存在当前用户的稿藏数据目录。`)); }
}
init();

const textImportDialog = document.getElementById('text-import-dialog');
document.getElementById('text-import-open').onclick = () => {
  const target = document.getElementById('text-import-target'); target.replaceChildren();
  const fresh = el('option','','＋ 新主题'); fresh.value=''; target.append(fresh);
  for(const group of groups) { const option=el('option','',group.title);option.value=group.id;target.append(option); }
  document.getElementById('text-import-error').textContent='';textImportDialog.showModal();
};
document.getElementById('text-import-cancel').onclick = () => textImportDialog.close();
document.getElementById('text-import-form').onsubmit = async event => {
  event.preventDefault();const submit=event.submitter;submit.disabled=true;
  try {
    const files=Array.from(document.getElementById('text-import-files').files||[]);
    if(!files.length||files.length>30)throw Error('一次请选择1至30份文章');
    const incoming=[];
    for(const file of files){if(file.size>2*1024*1024)throw Error('每份文章不能超过2MB');incoming.push({name:file.name,text:new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())});}
    const selectedTarget=document.getElementById('text-import-target').value;
    await busyImport('/api/text',{files:incoming,groupId:selectedTarget,title:document.getElementById('text-import-title').value},result=>{
    source=result.snapshot.groups;state=result.state;
    const lastId=(selectedTarget?source.find(g=>g.id===selectedTarget):source.at(-1))?.drafts.at(-1)?.id;
    rebuild();const chosen=groups.find(g=>g.drafts.some(d=>d.id===lastId));currentGroupId=chosen?.id||groups[0]?.id||'';currentDraftId=lastId||'';
    render();});textImportDialog.close();document.getElementById('text-import-form').reset();saveStatus('已保存到本机','saved');toast('文章已导入，原文和整理记录保存在本机。');
  }catch(error){document.getElementById('text-import-error').textContent=error.message;}
  finally{submit.disabled=false;}
};
document.getElementById('busy-dialog').addEventListener('cancel',event=>event.preventDefault());
