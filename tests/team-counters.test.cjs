const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'team-assets/catalog.json')));
const account = JSON.parse(fs.readFileSync(path.join(root, 'account-assets/catalog.json')));
const core = import('../team-counters-core.js');

test('all configurations have distinct positions, valid official IDs, six skills and local portraits', () => {
  assert(data.teams.length >= 70);
  assert(Object.keys(data.variants).length >= 90);
  assert(data.observations.length >= 500);
  const seen = new Set();
  for (const team of data.teams) {
    assert(team.variants.length > 0);
    for (const id of team.variants) {
      const variant = data.variants[id];
      assert.equal(variant.teamId, team.id);
      assert.equal(variant.members.length, 3);
      assert.equal(new Set(variant.members.map(m => m.heroId)).size, 3);
      const fingerprint = JSON.stringify(variant.members.map(m => [m.heroId, ...m.skills.toSorted()]));
      assert(!seen.has(fingerprint), 'duplicate configuration ' + id); seen.add(fingerprint);
      const carried = [];
      for (const member of variant.members) {
        const hero = data.heroes[member.heroId];
        assert(hero, id);
        assert.equal(account.heroes.find(h => h.id === member.heroId).name, hero.name);
        assert.deepEqual(fs.readFileSync(path.join(root, hero.thumbnail)), fs.readFileSync(path.join(root, 'dist', hero.thumbnail)));
        assert.equal(member.skills.length, 2);
        for (const sid of member.skills) {
          const skill = data.skills[sid];
          assert(skill);
          if (skill.kind) assert(['unspecified', 'custom'].includes(skill.kind));
          else {
            assert.equal(account.skills.find(s => s.id === sid).name, skill.name);
            carried.push(sid);
          }
        }
      }
      assert.equal(new Set(carried).size, carried.length, id + ' duplicate learned skill');
      assert(variant.evidence.length);
      for (const evidence of variant.evidence) assert(data.sources[evidence.source] && evidence.locator);
    }
  }
});

test('sources, scopes and matchup endpoints resolve; broad source labels were not auto-expanded', () => {
  const ids = new Set();
  for (const observation of data.observations) {
    assert(!ids.has(observation.id)); ids.add(observation.id);
    assert(['advantage', 'balanced', 'disadvantage'].includes(observation.result));
    assert(data.sources[observation.source]); assert(observation.locator);
    assert(['configuration', 'archetype'].includes(observation.scope));
    for (const end of ['from', 'to']) {
      if (observation[end]) assert(data.variants[observation[end]]);
      else assert(data.teams.some(t => t.id === observation[end + 'Team']));
    }
    if (observation.scope === 'configuration') assert(observation.from && observation.to);
  }
  assert.equal(data.skills['slot-chase'].kind, 'unspecified');
  assert.equal(data.skills['slot-chase'].name, '追击位');
  assert(!data.variants['table-a-5'].members[0].skills.includes('200206'));
  assert.equal(data.variants['lineups-53-12'].members[0].heroId, '100003');
  assert.equal(data.variants['lineups-53-30'].members[0].heroId, '100478');
  assert(!data.variants['lineups-53-6'], 'unresolved screenshot skill must not be guessed');
});

test('direct matchups reverse correctly, with disagreement preserved and no phantom self-matchups', async () => {
  const {getMatchups} = await core;
  const invert = {advantage: 'disadvantage', disadvantage: 'advantage', balanced: 'balanced', disputed: 'disputed'};
  let conflicts = 0;
  for (const variant of Object.values(data.variants)) {
    for (const matchup of getMatchups(data, variant.id)) {
      assert.notEqual(matchup.teamId, variant.teamId);
      assert(matchup.evidence.length);
      if (matchup.result === 'disputed') {conflicts++; assert(new Set(matchup.evidence.map(e => e.viewedResult)).size > 1);}
      if (matchup.scope !== 'configuration') continue;
      const reciprocal = getMatchups(data, matchup.variantId).find(m => m.variantId === variant.id && m.scope === 'configuration');
      assert(reciprocal, `${variant.id} -> ${matchup.variantId}`);
      assert.equal(reciprocal.result, invert[matchup.result]);
    }
  }
  assert(conflicts > 0);
});

test('changing six-skill configurations does not inherit another version’s relations', async () => {
  const {getMatchups} = await core;
  const low = getMatchups(data, 'liu-huang-1');
  assert(low.some(m => m.teamId === 'wangyi' && m.scope === 'archetype' && m.result === 'disadvantage'));
  assert.equal(getMatchups(data, 'liu-huang-2').length, 0);
  assert.equal(getMatchups(data, 'liu-huang-3').length, 0);
  assert(getMatchups(data, 'table-a-1').some(m => m.scope === 'configuration'));
  assert(!getMatchups(data, 'lineups-53-13').some(m => m.scope === 'configuration'));
  const fixture = {
    variants: {a: {teamId:'a'}, b: {teamId:'b'}, c: {teamId:'c'}},
    teams: ['a', 'b', 'c'].map(id => ({id, name:id})),
    observations: [{from:'a',to:'b',scope:'configuration',result:'advantage'},{from:'b',to:'c',scope:'configuration',result:'advantage'}]
  };
  assert.deepEqual(getMatchups(fixture, 'a').map(m => m.teamId), ['b']);
});

test('team search covers actual versions and learned skills, combined with categories', async () => {
  const {filterTeams, heroLabel} = await core;
  const find = options => filterTeams(data, options).map(t => t.id);
  assert(find({search:'诸葛亮 S3'}).includes('zhangfei'));
  assert(find({search:'弓诸葛'}).includes('zhangfei'));
  assert(find({search:'骨乔'}).includes('qiao-liumang'));
  assert(find({search:'牛皇刀'}).includes('liu-huang'));
  assert(find({search:'钱步'}).includes('jin-infantry'));
  assert(find({search:'刘徽 神兵'}).includes('liu-huang'));
  assert(find({search:'定军山'}).includes('cao-zhuge'));
  assert(!find({search:'定军山',category:'蜀骑'}).includes('cao-zhuge'));
  assert.equal(find({search:'没有这个队伍'}).length, 0);
  assert.match(heroLabel(data.heroes['100496']), /诸葛亮 · 蜀 · 弓 · S3/);
});

test('deployment has identical standalone assets and homepage entry', () => {
  for (const name of ['team-counters.html','team-counters.css','team-counters.js','team-counters-core.js','team-assets/catalog.json','index.html','treasure-prices.html'])
    assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), fs.readFileSync(path.join(root, 'dist', name), 'utf8'), name);
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /href="\.\/team-counters.html"/);
});
