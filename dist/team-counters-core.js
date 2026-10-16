export function heroLabel(hero) {
  return [hero.name, hero.country, hero.troop, hero.version === '常规' ? '' : hero.version].filter(Boolean).join(' · ');
}

export function filterTeams(catalog, {search = '', category = 'all'} = {}) {
  const heroAliases = {'100496':'弓诸葛 弓诸', '100017':'步诸葛 步诸', '100479':'鬼吕', '100814':'刘辉'};
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return catalog.teams.filter(team => {
    if (category !== 'all' && team.category !== category) return false;
    const text = [team.name, team.category, ...(team.aliases || []), ...team.variants.flatMap(id => {
      const variant = catalog.variants[id];
      return [variant.label, variant.members.map(member => catalog.heroes[member.heroId].name).join(''), ...variant.members.flatMap(member => [heroLabel(catalog.heroes[member.heroId]), heroAliases[member.heroId] || '', ...member.skills.map(id => catalog.skills[id].name)])];
    })].join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  });
}

const reverse = result => ({advantage: 'disadvantage', disadvantage: 'advantage', balanced: 'balanced'})[result];

// Only direct observations are used. No transitive inference, variant copying,
// majority vote, or invented win rates. Team-level references stay separate.
export function getMatchups(catalog, variantId) {
  const selected = catalog.variants[variantId];
  if (!selected) return [];
  const grouped = new Map();
  const matches = (observation, end) => observation[end] === variantId || observation[`${end}Team`] === selected.teamId;
  for (const observation of catalog.observations) {
    const outgoing = matches(observation, 'from');
    const incoming = matches(observation, 'to');
    if (!outgoing && !incoming) continue;
    const other = outgoing ? 'to' : 'from';
    const opponentVariantId = observation[other] || null;
    const opponentTeamId = observation[`${other}Team`] || catalog.variants[opponentVariantId]?.teamId;
    if (!opponentTeamId || opponentTeamId === selected.teamId) continue;
    const key = `${opponentTeamId}:${opponentVariantId || 'team'}:${observation.scope}`;
    if (!grouped.has(key)) grouped.set(key, {key, teamId: opponentTeamId, variantId: opponentVariantId, scope: observation.scope, evidence: [], results: new Set()});
    const matchup = grouped.get(key);
    const result = outgoing ? observation.result : reverse(observation.result);
    matchup.results.add(result);
    matchup.evidence.push({...observation, viewedResult: result});
  }
  return [...grouped.values()].map(matchup => ({...matchup, results: [...matchup.results], result: matchup.results.size === 1 ? [...matchup.results][0] : 'disputed'}))
    .sort((a, b) => a.scope.localeCompare(b.scope) * -1 || catalog.teams.find(t => t.id === a.teamId).name.localeCompare(catalog.teams.find(t => t.id === b.teamId).name, 'zh-CN'));
}
