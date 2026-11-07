export function applyLayout(source, state) {
  const layout = state.layout || {};
  const groups = [...source.map(g => ({ ...g, drafts: [] })), ...(layout.customGroups || []).filter(g => !source.some(s => s.id === g.id)).map(g => ({ ...g, mode: 'manual', drafts: [] }))];
  const byId = new Map(groups.map(g => [g.id, g]));
  for (const original of source) {
    for (const draft of original.drafts) {
      const target = byId.get(layout.draftGroups?.[draft.id]) || byId.get(original.id);
      const userTitle = layout.draftNames?.[draft.id] || '';
      target.drafts.push({ ...draft, title: userTitle || draft.title, userTitle, originalTitle: draft.title, originalGroupId: original.id });
    }
  }
  for (const group of groups) {
    group.title = layout.groupNames?.[group.id] || group.title;
    const order = layout.draftOrder?.[group.id] || [];
    const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
    group.drafts.sort((a, b) => rank(a.id) - rank(b.id));
    group.excerpt = group.drafts[0]?.body.replace(/\s+/gu, ' ').slice(0, 82) || '';
  }
  const order = layout.groupOrder || [];
  const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
  return groups.sort((a, b) => rank(a.id) - rank(b.id));
}

export function moveDraft(state, source, draftId, targetId, beforeId = '') {
  if (draftId === beforeId) return state;
  const groups = applyLayout(source, state);
  const target = groups.find(g => g.id === targetId);
  if (!target || !groups.some(g => g.drafts.some(d => d.id === draftId))) throw new Error('没有找到稿件或主题');
  const layout = { ...state.layout, draftGroups: { ...state.layout.draftGroups, [draftId]: targetId }, draftOrder: { ...state.layout.draftOrder } };
  for (const group of groups) layout.draftOrder[group.id] = group.drafts.filter(d => d.id !== draftId).map(d => d.id);
  const order = layout.draftOrder[targetId];
  const index = beforeId ? order.indexOf(beforeId) : -1;
  order.splice(index < 0 ? order.length : index, 0, draftId);
  return { ...state, layout };
}
