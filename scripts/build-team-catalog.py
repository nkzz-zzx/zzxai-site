"""Build the team browser from reviewed public facts; no network or inference.

Run after editing team-assets/research.json. Source articles and screenshots are
not bundled. Matchup observations retain their original scope and provenance.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
seed = json.loads((ROOT / 'team-assets/research.json').read_text())
account = json.loads((ROOT / 'account-assets/catalog.json').read_text())
heroes = {h['id']: h for h in account['heroes']}
skills = {s['name']: s for s in account['skills']}
aliases = dict(pair.split('=') for pair in '''众谋=众谋不懈 火烧=火烧连营 战必=战必断金 利兵=利兵谋胜 磐阵=磐阵善守 深谋=深谋远虑 三术=三术奇谋 正始=正始之变 三军=三军之众 垒实=垒实迎击 长兵=长兵方阵 远攻=远攻秘策 攻其=攻其不备 单骑=单骑救主 桃园=桃园结义 敛众=敛众定气 无心=无心恋战 百战=百战无怯 一夫=一夫当关 先驱=先驱突击 反计=反计之策 计险=计险远近 神兵=神兵天降 大赏=大赏三军 乘胜=乘胜追击 风声=风声鹤唳 浑水=浑水摸鱼 谋定=谋定后动 全军=全军突击 胜兵=胜兵求战 久战=久战熟谋 擅兵=擅兵不寡 兵无=兵无常势 诱敌=诱敌深入 河内=河内世泽 道行=道行险阻 疾击=疾击其后 飒沓=飒沓如星 勠力=勠力同心 一骑=一骑当千 形兵=形兵之极 合纵=合纵连横 势无=势无虚动 极火=极火佐攻 绝水=绝水遏敌 重整=重整旗鼓 步步=步步为营 健卒=健卒不殆 悬权=悬权而动 及锋=及锋而试 令无=令无空悬 奇正=奇正之势 鼎足=鼎足江东 避其=避其锋芒 避锐=避锐治气 先声=先声夺人 钝兵=钝兵挫锐 怯心=怯心夺志'''.split())

catalog_skills, catalog_heroes, teams, variants, redirects = {}, {}, {}, {}, {}
fingerprints = {}
for record in seed['configurations']:
    assert record['source'] in seed['sources']
    members = []
    for person in record['members']:
        hero = heroes[person['heroId']]
        assert hero['rarity'] == 5 and hero['name'] != '侍卫'
        assert (ROOT / hero['thumbnail']).is_file(), hero['id']
        catalog_heroes[hero['id']] = {k: hero[k] for k in ['id', 'name', 'country', 'troop', 'version', 'thumbnail']}
        skill_ids = []
        for name in person['skills']:
            if name.startswith('@'):
                sid = 'slot-chase' if name == '@追击位' else 'custom-taoyuanming'
                catalog_skills[sid] = {'id': sid, 'name': name[1:], 'kind': 'unspecified' if sid == 'slot-chase' else 'custom'}
            else:
                skill = skills[aliases.get(name, name)]
                sid = skill['id']
                catalog_skills[sid] = {k: skill[k] for k in ['id', 'name', 'type', 'grade']}
            skill_ids.append(sid)
        assert len(skill_ids) == 2 and len(set(skill_ids)) == 2
        members.append({'heroId': hero['id'], 'skills': skill_ids})
    assert len(members) == 3 and len({m['heroId'] for m in members}) == 3
    provenance = {'source': record['source'], 'locator': record['locator']}
    fingerprint = tuple((m['heroId'], *sorted(m['skills'])) for m in members)
    if fingerprint in fingerprints:
        existing = variants[fingerprints[fingerprint]]
        existing['evidence'].append(provenance)
        redirects[record['id']] = existing['id']
        continue
    team = teams.setdefault(record['team'], {'id': record['team'], 'name': record['name'], 'category': record['category'], 'aliases': seed.get('teamAliases', {}).get(record['team'], []), 'variants': []})
    variant = {'id': record['id'], 'teamId': team['id'], 'label': record['label'], 'members': members,
               'evidence': [provenance], 'notes': record.get('notes', [])}
    variants[variant['id']] = variant
    team['variants'].append(variant['id'])
    fingerprints[fingerprint] = variant['id']

observations = []
for i, item in enumerate(seed['observations']):
    observation = dict(item, id=f'observation-{i + 1}')
    for end in ['from', 'to']:
        if end in observation:
            observation[end] = redirects.get(observation[end], observation[end])
            assert observation[end] in variants, observation
        elif end + 'Team' in observation:
            assert observation[end + 'Team'] in teams, observation
        else:
            raise ValueError('Missing matchup endpoint')
    assert observation['result'] in ['advantage', 'balanced', 'disadvantage']
    assert observation['scope'] in ['configuration', 'archetype']
    assert observation['source'] in seed['sources']
    observations.append(observation)

order = {'新核心': 0, '魏智': 1, '法刀': 2, '菜刀': 3, '蜀骑': 4, '肉队': 5, '流氓': 6, '形兵': 7}
data = {'schemaVersion': 1, 'updated': seed['updated'], 'scope': seed['scope'], 'sources': seed['sources'],
        'heroes': catalog_heroes, 'skills': catalog_skills,
        'teams': sorted(teams.values(), key=lambda t: (order[t['category']], t['id'])),
        'variants': variants, 'observations': observations}
output = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
for folder in [ROOT / 'team-assets', ROOT / 'dist/team-assets']:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'catalog.json').write_text(output)
print(f'{len(teams)} teams, {len(variants)} configurations, {len(observations)} observations, {len(catalog_heroes)} local portraits')
