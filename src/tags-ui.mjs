import { makeElement as el } from './editor-ui.mjs';
import { getCharacters, tagKey, tagLabel, matchesTag } from './tags.mjs';

export function tagBadge(tag, state, { compact = false, onClick, selected = false } = {}) {
  const label = tagLabel(tag,state);
  const badge = el(onClick ? 'button' : 'span',`story-tag${compact ? ' compact' : ''}${tag.type === 'cp' ? ' cp-tag' : ''}`);
  badge.title = `${tag.type === 'cp' ? 'CP：' : '人物：'}${label}`;
  badge.setAttribute('aria-label',badge.title);
  badge.dataset.tagKey = tagKey(tag);
  if (onClick) { badge.type = 'button'; badge.setAttribute('aria-pressed',String(selected)); badge.addEventListener('click',onClick); }
  else badge.setAttribute('role','img');
  const dots = el('span','tag-dots'); dots.setAttribute('aria-hidden','true');
  const people = new Map(getCharacters(state).map(person=>[person.id,person]));
  for (const id of tag.characterIds) {
    const dot = el('span','role-orb'); dot.style.setProperty('--role-color',people.get(id)?.color || '#9a9c94'); dots.append(dot);
  }
  badge.append(dots);
  if (!compact) badge.append(el('span','tag-name',label));
  return badge;
}

export function tagBadges(tags, state, limit = 4) {
  const row = el('span','tag-badges');
  for (const tag of tags.slice(0,limit)) row.append(tagBadge(tag,state,{compact:true}));
  if (tags.length>limit) row.append(el('span','extra-tags',`+${tags.length-limit}`));
  return row;
}

export function setupTags({ getState, getDraft, getGroups, update, onFilterChange, getFilter, toast }) {
  const dialog = document.querySelector('#tags-dialog');
  const selected = document.querySelector('#selected-draft-tags');
  const choices = document.querySelector('#character-tag-choices');
  const first = document.querySelector('#cp-first');
  const second = document.querySelector('#cp-second');
  const paletteDialog = document.querySelector('#palette-dialog');
  let draftId = '', pending = [], palette = [];

  function renderSelected() {
    selected.replaceChildren();
    if (!pending.length) selected.append(el('p','tag-empty','这篇还没有标签，可以从下面选择。'));
    for (const tag of pending) {
      const chip = el('span','editable-tag'); chip.append(tagBadge(tag,getState()));
      const remove = el('button','remove-tag','×'); remove.type = 'button'; remove.setAttribute('aria-label',`移除标签 ${tagLabel(tag,getState())}`);
      remove.addEventListener('click',()=>{ pending = pending.filter(item=>tagKey(item)!==tagKey(tag)); renderSelected(); renderChoices(); }); chip.append(remove); selected.append(chip);
    }
  }
  function renderChoices() {
    const state = getState(); choices.replaceChildren();
    for (const person of getCharacters(state)) {
      const tag = {type:'character',characterIds:[person.id]};
      const exists = pending.some(item=>tagKey(item) === tagKey(tag));
      const button = tagBadge(tag,state,{selected:exists,onClick:()=>{ pending = exists ? pending.filter(item=>tagKey(item)!==tagKey(tag)) : [...pending,tag]; renderSelected(); renderChoices(); }});
      choices.append(button);
    }
    const a = first.value, b = second.value;
    first.replaceChildren(); second.replaceChildren();
    for (const person of getCharacters(state)) {
      for (const select of [first,second]) { const option = el('option','',person.name); option.value = person.id; select.append(option); }
    }
    if (getCharacters(state).some(person=>person.id===a)) first.value = a;
    second.value = getCharacters(state).some(person=>person.id===b) ? b : getCharacters(state)[1]?.id || first.value;
    renderPairPreview();
  }
  function renderPairPreview() {
    const preview = document.querySelector('#cp-preview'); preview.replaceChildren();
    if (first.value && second.value && first.value !== second.value) preview.append(tagBadge({type:'cp',characterIds:[first.value,second.value]},getState()));
    document.querySelector('#add-cp-tag').disabled = !first.value || first.value === second.value;
  }
  first.addEventListener('change',renderPairPreview); second.addEventListener('change',renderPairPreview);
  document.querySelector('#add-cp-tag').addEventListener('click',()=>{
    if (!first.value || first.value===second.value) return;
    const tag = {type:'cp',characterIds:[first.value,second.value]};
    if (!pending.some(item=>tagKey(item)===tagKey(tag))) pending.push(tag);
    renderSelected();
  });
  function openEditor() {
    const draft = getDraft(); if (!draft) return;
    draftId = draft.id; pending = structuredClone(getState().draftTags[draftId] || []);
    document.querySelector('#tagged-draft-title').textContent = draft.title;
    renderSelected(); renderChoices(); dialog.showModal();
  }
  document.querySelector('#close-tags').addEventListener('click',()=>dialog.close());
  document.querySelector('#tags-form').addEventListener('submit',event=>{
    event.preventDefault(); const state = getState();
    update({...state,draftTags:{...state.draftTags,[draftId]:pending}});
    dialog.close(); toast('这一稿的标签已更新');
  });

  function renderPalette() {
    const list = document.querySelector('#palette-rows'); list.replaceChildren();
    for (const person of palette) {
      const row = el('div','character-color-row'); row.dataset.characterId = person.id;
      const color = el('input'); color.type = 'color'; color.value = person.color; color.dataset.field = 'color'; color.setAttribute('aria-label',`${person.name}的代表色`);
      const name = el('input'); name.type = 'text'; name.value = person.name; name.maxLength = 40; name.required = true; name.dataset.field = 'name'; name.setAttribute('aria-label',`${person.name}的名字`);
      row.append(color,name,el('span','palette-status',person.provisional ? '暂用色' : '已设定')); list.append(row);
    }
  }
  function readPalette() {
    return [...document.querySelectorAll('.character-color-row')].map(row=>({id:row.dataset.characterId,name:row.querySelector('[data-field="name"]').value.trim(),color:row.querySelector('[data-field="color"]').value,provisional:false}));
  }
  function openPalette() { palette = getCharacters(getState()); renderPalette(); paletteDialog.showModal(); }
  document.querySelector('#manage-character-colors').addEventListener('click',openPalette);
  document.querySelector('#edit-tag-colors').addEventListener('click',openPalette);
  document.querySelector('#close-palette').addEventListener('click',()=>paletteDialog.close());
  document.querySelector('#add-character').addEventListener('click',()=>{
    const name = document.querySelector('#new-character-name').value.trim();
    if (!name) { document.querySelector('#new-character-name').focus(); return; }
    palette = readPalette();
    if (palette.some(person=>person.name===name)) return toast('这个角色已在列表中',true);
    palette.push({id:`character-${crypto.randomUUID()}`,name,color:document.querySelector('#new-character-color').value,provisional:false});
    renderPalette(); document.querySelector('#new-character-name').value = '';
  });
  document.querySelector('#palette-form').addEventListener('submit',event=>{
    event.preventDefault(); const characters = readPalette();
    if (characters.some(person=>!person.name)) return toast('请给每位角色填上名字',true);
    if (new Set(characters.map(person=>person.name)).size!==characters.length) return toast('角色名字重复了，请区分一下',true);
    update({...getState(),characters}); paletteDialog.close();
    if (dialog.open) { renderSelected(); renderChoices(); }
    toast('角色名字与代表色已保存');
  });

  return {
    renderFilters() {
      const state = getState(), filter = getFilter();
      const target = document.querySelector('#tag-filter-options'); target.replaceChildren();
      const basics = el('div','tag-filter-basics');
      for (const [value,label] of [['all','全部'],['untagged','未标注']]) {
        const button = el('button','tag-scope',label); button.type = 'button'; button.setAttribute('aria-pressed',String(filter===value)); button.addEventListener('click',()=>onFilterChange(value)); basics.append(button);
      }
      target.append(basics,el('p','tag-section-label','人物'));
      const people = el('div','tag-options');
      for (const person of getCharacters(state)) {
        const tag = {type:'character',characterIds:[person.id]};
        const button = tagBadge(tag,state,{selected:filter===tagKey(tag),onClick:()=>onFilterChange(filter===tagKey(tag)?'all':tagKey(tag))});
        if (person.provisional) button.title += '（暂用色，可修改）'; people.append(button);
      }
      target.append(people,el('p','tag-section-label','已使用的 CP'));
      const allIds = new Set(getGroups().flatMap(group=>group.drafts.map(draft=>draft.id)));
      const pairs = [...new Map(Object.entries(state.draftTags).filter(([id])=>allIds.has(id)).flatMap(([,tags])=>tags.filter(tag=>tag.type==='cp')).map(tag=>[tagKey(tag),tag])).values()];
      const pairOptions = el('div','tag-options');
      for (const tag of pairs) pairOptions.append(tagBadge(tag,state,{selected:filter===tagKey(tag),onClick:()=>onFilterChange(filter===tagKey(tag)?'all':tagKey(tag))}));
      if (!pairs.length) pairOptions.append(el('p','tag-empty','给文章添加 CP 标签后，会出现在这里。'));
      target.append(pairOptions);
      const chosen = document.querySelector('#active-tag-filter'); chosen.replaceChildren(); chosen.hidden = filter==='all';
      if (filter!=='all') {
        let tag;
        if (filter.startsWith('character:')) tag = {type:'character',characterIds:[filter.slice(10)]}; else tag = pairs.find(tag=>tagKey(tag)===filter);
        if (tag) chosen.append(tagBadge(tag,state)); else chosen.append(el('span','','未标注'));
        const clear = el('button','remove-tag','×'); clear.type = 'button'; clear.setAttribute('aria-label','清除标签筛选'); clear.addEventListener('click',()=>onFilterChange('all')); chosen.append(clear);
      }
      const total = getGroups().reduce((sum,group)=>sum+group.drafts.filter(draft=>matchesTag(draft.id,state,filter)).length,0);
      document.querySelector('#tag-filter-caption').textContent = filter==='all' ? '全部' : `${total} 稿`;
    },
    renderBar(target,draft) {
      const bar = el('section','draft-tags-bar'); bar.setAttribute('aria-label','本稿人物与 CP 标签');
      const tags = getState().draftTags[draft.id] || [];
      const row = el('div','reader-tag-options');
      if (!tags.length) row.append(el('span','tag-empty','还没有人物或 CP 标签'));
      for (const tag of tags) row.append(tagBadge(tag,getState(),{onClick:()=>onFilterChange(tagKey(tag)),selected:getFilter()===tagKey(tag)}));
      const edit = el('button','text-button','＋ 编辑标签'); edit.type = 'button'; edit.addEventListener('click',openEditor);
      bar.append(row,edit); target.append(bar);
    },
  };
}
