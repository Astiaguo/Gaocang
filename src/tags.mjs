export const defaultCharacters = [];

export function getCharacters(state) {
  return [...new Map([...defaultCharacters, ...(state.characters || [])].map(person=>[person.id,{...person}])).values()];
}
export function tagKey(tag) { return `${tag.type}:${[...tag.characterIds].sort().join('+')}`; }
export function tagLabel(tag, state) {
  const people = new Map(getCharacters(state).map(person=>[person.id,person]));
  return tag.characterIds.map(id=>people.get(id)?.name || '未命名角色').join(tag.type === 'cp' ? ' × ' : '');
}
export function matchesTag(draftId, state, filter = 'all') {
  if (!filter || filter === 'all') return true;
  const tags = state.draftTags?.[draftId] || [];
  if (filter === 'untagged') return !tags.length;
  if (filter.startsWith('character:')) return tags.some(tag=>tag.characterIds.includes(filter.slice(10)));
  return tags.some(tag=>tagKey(tag) === filter);
}
export function normalizeTags(parsed) {
  const overrides = parsed.characters || [];
  if (!Array.isArray(overrides)) throw new Error('角色颜色记录无效');
  const ids = new Set();
  const characters = overrides.map(person=>{
    if (!person || typeof person.id !== 'string' || !/^[a-zA-Z0-9_-]+$/u.test(person.id) || ids.has(person.id) || typeof person.name !== 'string' || !person.name.trim() || person.name.length>40 || typeof person.color !== 'string' || !/^#[0-9a-f]{6}$/iu.test(person.color)) throw new Error('角色名称或颜色无效');
    ids.add(person.id);
    return { id:person.id, name:person.name.trim(), color:person.color.toLowerCase(), provisional:Boolean(person.provisional) };
  });
  const known = new Set(getCharacters({characters}).map(person=>person.id));
  const input = parsed.draftTags || {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('标签记录无效');
  const draftTags = Object.fromEntries(Object.entries(input).map(([draftId,tags])=>{
    if (!Array.isArray(tags)) throw new Error('标签列表无效');
    const unique = new Map();
    for (const tag of tags) {
      if (!tag || !['character','cp'].includes(tag.type) || !Array.isArray(tag.characterIds) || tag.characterIds.length !== (tag.type === 'cp' ? 2 : 1) || new Set(tag.characterIds).size !== tag.characterIds.length) throw new Error('单人或 CP 标签无效');
      if (!tag.characterIds.every(id=>known.has(id))) throw new Error('标签引用了未知角色，请一并导入角色颜色');
      const value = {type:tag.type,characterIds:[...tag.characterIds]}; unique.set(tagKey(value),value);
    }
    return [draftId,[...unique.values()]];
  }));
  return { characters,draftTags };
}
