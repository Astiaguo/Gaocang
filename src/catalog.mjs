import { matchesTag } from './tags.mjs';

export function groupDecisionCounts(group, state) {
  const counts = { collect: 0, revise: 0, reject: 0, undecided: 0 };
  for (const draft of group.drafts) {
    const decision = state?.decisions?.[draft.id]?.decision || 'undecided';
    counts[decision] += 1;
  }
  return counts;
}

export function matchingDrafts(group, query, status, state, tagFilter = 'all') {
  const needle = (query || '').trim().normalize('NFKC').toLocaleLowerCase();
  const includes = value => (value || '').normalize('NFKC').toLocaleLowerCase().includes(needle);
  return group.drafts.filter(draft => (!needle || [group.title,group.description,draft.title,draft.body].some(includes)) && (status === 'all' || (state.decisions?.[draft.id]?.decision || 'undecided') === status) && matchesTag(draft.id,state,tagFilter));
}

export function filterGroups(groups, query, status, state, tagFilter = 'all') {
  if (tagFilter !== 'all') return groups.filter(group=>matchingDrafts(group,query,status,state,tagFilter).length);
  const needle = (query || '').trim().normalize('NFKC').toLocaleLowerCase();
  return groups.filter((group) => {
    const matchesText = !needle || [group.title, group.description, ...group.drafts.flatMap((draft) => [draft.title, draft.body])]
      .some((value) => (value || '').normalize('NFKC').toLocaleLowerCase().includes(needle));
    const counts = groupDecisionCounts(group, state);
    return matchesText && (status === 'all' || counts[status] > 0);
  });
}
