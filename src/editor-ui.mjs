import { isAnchored, selectionAnchor } from './annotations.mjs';

export function makeElement(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function setupEditor({ getDraft, getState, update, reader, toast }) {
  const dialog = document.querySelector('#annotation-dialog');
  const quote = document.querySelector('#annotation-quote');
  const input = document.querySelector('#annotation-text');
  const remove = document.querySelector('#delete-annotation');
  const action = document.querySelector('#selection-action');
  let anchor = null, editingId = '', editingDraft = '', selectionDraft = '';

  function open(note, rect) {
    const draft = getDraft();
    if (!draft) return;
    anchor = note; editingId = note.id || ''; editingDraft = draft.id;
    quote.textContent = note.quote;
    input.value = note.note || '';
    remove.hidden = !editingId;
    document.querySelector('#annotation-title').textContent = editingId ? '这段文字的批注' : '写一条批注';
    dialog.style.top = `${Math.max(12, Math.min(rect?.bottom + 10 || 150, window.innerHeight - 400))}px`;
    dialog.style.left = `${Math.max(12, Math.min(rect?.left || window.innerWidth / 2 - 190, window.innerWidth - 410))}px`;
    action.hidden = true;
    if (!dialog.open) dialog.showModal();
    input.focus();
  }
  function capture() {
    if (dialog.open) return;
    const article = reader.querySelector('.manuscript');
    const draft = getDraft();
    const selection = window.getSelection();
    if (!article || !draft) return;
    const picked = selectionAnchor(article, selection, draft.body);
    if (!picked || !picked.quote.trim()) { action.hidden = true; return; }
    anchor = picked; selectionDraft = draft.id;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    action.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 190))}px`;
    action.style.top = `${Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - 56))}px`;
    action.hidden = false;
  }
  reader.addEventListener('pointerup', () => setTimeout(capture, 0));
  reader.addEventListener('keyup', capture);
  action.addEventListener('pointerdown', event => event.preventDefault());
  action.addEventListener('click', () => {
    if (anchor && getDraft()?.id === selectionDraft) open(anchor, action.getBoundingClientRect());
  });
  document.addEventListener('keydown', event => {
    if (event.altKey && event.key === 'Enter') { capture(); if (anchor && !action.hidden) { event.preventDefault(); open(anchor, action.getBoundingClientRect()); } }
    if (event.key === 'Escape') action.hidden = true;
  });
  document.querySelector('#annotation-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!input.value.trim()) { input.focus(); return; }
    const state = getState();
    const notes = [...(state.annotations[editingDraft] || [])];
    const item = { ...anchor, id: editingId || crypto.randomUUID(), note: input.value, createdAt: anchor.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = notes.findIndex(note => note.id === item.id);
    if (index >= 0) notes[index] = item; else notes.push(item);
    dialog.close(); window.getSelection()?.removeAllRanges();
    update({ ...state, annotations: { ...state.annotations, [editingDraft]: notes } });
    toast('批注已记录');
  });
  remove.addEventListener('click', () => {
    const state = getState();
    dialog.close();
    update({ ...state, annotations: { ...state.annotations, [editingDraft]: (state.annotations[editingDraft] || []).filter(note => note.id !== editingId) } });
    toast('批注已移除；此前记录可在本机恢复副本中找回');
  });
  document.querySelector('#close-annotation').addEventListener('click', () => dialog.close());
  reader.addEventListener('scroll', () => { action.hidden = true; });
  return {
    openNote(id) {
      const draft = getDraft();
      const note = getState().annotations[draft?.id]?.find(note => note.id === id);
      if (!note) return;
      const mark = [...reader.querySelectorAll('mark[data-annotations]')].find(node => JSON.parse(node.dataset.annotations).includes(id));
      mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      open(note, mark?.getBoundingClientRect());
    },
    list(target) {
      const draft = getDraft();
      const notes = getState().annotations[draft?.id] || [];
      const section = makeElement('section', 'annotation-list');
      section.append(makeElement('h3', '', `原文批注 · ${notes.length}`));
      if (!notes.length) section.append(makeElement('p', 'feedback-hint', '在正文里选中一个词、一句话或几段文字，就可以写批注。也可按 ⌥ Enter。'));
      for (const note of notes) {
        const button = makeElement('button', 'annotation-card');
        button.type = 'button'; button.dataset.note = note.id;
        button.append(makeElement('span', 'annotation-quote', note.quote), makeElement('span', 'annotation-comment', note.note));
        if (!isAnchored(draft.body, note)) button.append(makeElement('span', 'anchor-warning', '原文位置需要重新核对'));
        section.append(button);
      }
      target.append(section);
    },
    hide() { action.hidden = true; },
    selectionQuote() {
      const draft = getDraft(), article = reader.querySelector('.manuscript');
      return draft && article ? selectionAnchor(article, window.getSelection(), draft.body)?.quote || '' : '';
    },
  };
}
