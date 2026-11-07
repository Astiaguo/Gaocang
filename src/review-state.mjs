import { normalizeTags } from './tags.mjs';
const validDecisions = new Set(['collect', 'revise', 'reject', 'undecided']);

function cleanDraftName(value) {
  if (typeof value !== 'string' || value.length > 100 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('稿名须为 100 字以内的单行文字');
  return value.trim();
}

export function setDraftName(state, draftId, title) {
  if (typeof draftId !== 'string' || !draftId) throw new Error('请选择一份稿件');
  const name = cleanDraftName(title);
  const next = parseBackup(JSON.stringify(state));
  // An empty name intentionally restores the source title, including on merge.
  next.layout.draftNames[draftId] = name;
  return next;
}

function cleanRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('备份中的选择无效');
  if (!validDecisions.has(record.decision) || typeof record.note !== 'string') throw new Error('备份中的选择无效');
  return { decision: record.decision, note: record.note };
}

export function setDecision(state, draftId, decision, note = '') {
  if (typeof draftId !== 'string' || !draftId || !validDecisions.has(decision) || typeof note !== 'string') {
    throw new Error('选择或备注无效');
  }
  return {
    ...parseBackup(JSON.stringify(state || { version: 1, decisions: {} })),
    version: 2,
    decisions: { ...(state?.decisions || {}), [draftId]: { decision, note } },
  };
}

export function serializeBackup(state) {
  return JSON.stringify(parseBackup(JSON.stringify(state)), null, 2);
}

export function parseBackup(text, knownIds = new Set()) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('无法读取备份文件');
  }
  if (!parsed || typeof parsed !== 'object' || ![1, 2].includes(parsed.version) || !parsed.decisions || typeof parsed.decisions !== 'object' || Array.isArray(parsed.decisions)) {
    throw new Error('备份格式无效');
  }
  if (!(knownIds instanceof Set)) throw new Error('已知稿件列表无效');
  // Keep decisions for drafts absent from the current snapshot so an older
  // catalog import never destroys choices made on another local snapshot.
  const decisions = Object.fromEntries(Object.entries(parsed.decisions).map(([id, record]) => [id, cleanRecord(record)]));
  const layout = parsed.layout || {};
  const record = (value, clean) => {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份中的整理记录无效');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  };
  const string = (value) => {
    if (typeof value !== 'string') throw new Error('备份中的文字无效');
    return value;
  };
  const list = (value) => {
    if (!Array.isArray(value)) throw new Error('备份中的列表无效');
    return value;
  };
  const strings = (value) => [...new Set(list(value).map(string))];
  return {
    version: 2, decisions, ...normalizeTags(parsed),
    layout: {
      groupNames: record(layout.groupNames, string),
      draftNames: record(layout.draftNames, cleanDraftName),
      customGroups: list(layout.customGroups || []).map((group) => ({ id: string(group.id), title: string(group.title) })),
      groupOrder: strings(layout.groupOrder || []),
      draftGroups: record(layout.draftGroups, string),
      draftOrder: record(layout.draftOrder, strings),
    },
    annotations: record(parsed.annotations, (notes) => list(notes).map((note) => {
      if (!Number.isInteger(note.start) || !Number.isInteger(note.end) || note.start < 0 || note.end <= note.start || typeof note.quote !== 'string' || !note.quote) throw new Error('批注位置无效');
      return { id: string(note.id), start: note.start, end: note.end, quote: note.quote, note: string(note.note), createdAt: string(note.createdAt || ''), ...(note.updatedAt ? { updatedAt: string(note.updatedAt) } : {}) };
    })),
    chats: record(parsed.chats, (messages) => list(messages).map((message) => {
      if (!['user', 'assistant'].includes(message.role)) throw new Error('对话角色无效');
      return { id: string(message.id), role: message.role, text: string(message.text), createdAt: string(message.createdAt || '') };
    })),
  };
}

export function mergeStates(preferred, incoming) {
  const a = parseBackup(JSON.stringify(preferred));
  const b = parseBackup(JSON.stringify(incoming));
  return { ...a,
    decisions: { ...b.decisions, ...a.decisions },
    annotations: { ...b.annotations, ...a.annotations },
    chats: { ...b.chats, ...a.chats },
    draftTags: { ...b.draftTags, ...a.draftTags },
    characters: [...new Map([...b.characters,...a.characters].map(person=>[person.id,person])).values()],
    layout: { ...a.layout,
      groupNames: { ...b.layout.groupNames, ...a.layout.groupNames },
      draftNames: { ...b.layout.draftNames, ...a.layout.draftNames },
      draftGroups: { ...b.layout.draftGroups, ...a.layout.draftGroups },
      draftOrder: { ...b.layout.draftOrder, ...a.layout.draftOrder },
      groupOrder: [...new Set([...a.layout.groupOrder, ...b.layout.groupOrder])],
      customGroups: [...new Map([...b.layout.customGroups, ...a.layout.customGroups].map(g => [g.id, g])).values()],
    },
  };
}
