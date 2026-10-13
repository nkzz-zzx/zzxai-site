"""Refresh the public account catalog from CBG's official configuration (no account data)."""
import argparse
import datetime
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = 'https://cbg-stzb.res.netease.com/js/game_auto_config.js'
parser = argparse.ArgumentParser()
parser.add_argument('--source-file', type=pathlib.Path, help='Previously downloaded official JS for offline verification')
args = parser.parse_args()
if args.source_file:
    text = args.source_file.read_text(encoding='utf-8')
else:
    with urllib.request.urlopen(SOURCE, timeout=30) as response:
        text = response.read(10000000).decode('utf-8')
match = re.match(r'\s*var\s+CBG_GAME_CONFIG\s*=\s*', text)
if not match:
    raise SystemExit('Unexpected official configuration format; existing catalog retained')
config, end = json.JSONDecoder().raw_decode(text, match.end())
if not isinstance(config.get('hero'), list) or not isinstance(config.get('display_skill'), list):
    raise SystemExit('Official catalog is incomplete; existing catalog retained')
countries = {1: '汉', 2: '魏', 3: '蜀', 4: '吴', 5: '群', 6: '晋'}
troops = {1: '弓', 2: '步', 3: '骑'}
types = {1: '被动', 2: '指挥', 3: '主动', 4: '追击'}
heroes = {}
for hero in config['hero'] + config.get('special_hero', []):
    if not hero.get('is_release'):
        continue
    key = str(hero['hero_id'])
    heroes[key] = dict(id=key, name=hero['name'], country=countries[int(hero['country'])],
                       troop=troops[int(hero['hero_type'])], rarity=int(hero['quality']),
                       season=hero.get('season', 'N'), iconId=str(hero.get('icon_hero_id', key)),
                       version={'N': '常规', 'SP': 'SP', 'XP': 'XP', 'S2': 'S2', 'S3': 'S3'}.get(hero.get('season'), ''))
# Retain documented old and temporary variants; match by real CBG ID, never by name.
timeline = json.loads((ROOT / 'stzb-assets/timeline.json').read_text())
for hero in timeline['cards']:
    match = re.search(r'/herolist/(\d+)\.html', hero.get('officialPage', ''))
    if not match:
        continue
    key = match[1]
    if key not in heroes:
        heroes[key] = dict(id=key, name=hero['name'], country=hero['country'], troop=hero['troop'],
                           rarity=5, version=hero.get('version', ''), season='')
    heroes[key]['portrait'] = hero['portrait']
    if '旧版' in hero.get('version', ''):
        heroes[key]['version'] = hero['version']
exchange_heroes = {str(hero['hero_id']): '典藏兑换' for hero in config.get('dian_cang', [])}
exchange_heroes.update({str(hero['hero_id']): '典籍兑换' for hero in config.get('dian_ji', [])})
all_hero_names = {key: '·'.join(filter(None, [hero.get('country'), hero['name'], hero.get('troop'), hero.get('version')])) for key, hero in heroes.items()}
all_hero_names.update({str(hero['hero_id']): hero['name'] for hero in config.get('dian_cang', []) + config.get('dian_ji', [])})
skills = []
for skill in config['display_skill']:
    research = [str(key) for key in skill.get('research_hero', [])]
    exchange = [exchange_heroes[key] for key in research if key in exchange_heroes]
    acquisition = exchange[0] if exchange else '武将拆解' if research else ''
    skills.append(dict(id=str(skill['skill_id']), name=skill['name'], type=types.get(skill['skill_type'], '未分类'),
                       grade=skill.get('skill_quality_level', ''), acquisition=acquisition,
                       researchHeroes=[all_hero_names[key] for key in research if key in all_hero_names]))
# Retain verified data for released heroes and researchable skills.
supplements = json.loads((ROOT / 'account-assets/supplements.json').read_text())
for kind, records in [('heroes', heroes), ('skills', {s['id']: s for s in skills})]:
    for addition in supplements.get(kind, []):
        fields = {k: v for k, v in addition.items() if k not in ['evidence']}
        key = str(addition['id'])
        if key in records:
            records[key].update(fields)
        else:
            raise SystemExit(f'Verified item {key} is absent from the official catalog; please verify its ID')
    if kind == 'skills':
        skills = list(records.values())
if len(heroes) < 350 or len(skills) < 200 or len({s['id'] for s in skills}) != len(skills):
    raise SystemExit('Unexpected catalog size or duplicate skill IDs; existing catalog retained')
catalog = dict(asOf=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat(), sourceLabel='藏宝阁官方游戏配置 + 官方更新公告 + 本站历史武将图鉴',
               sources=[SOURCE, './stzb-assets/timeline.json', './account-assets/supplements.json'],
               scope='官方藏宝阁四、五星武将（补充已记录的旧版与临时版）及可研究战法；不含自带战法、外观或百家词条。',
               complete=dict(heroes=True, skills=True), heroes=list(heroes.values()), skills=skills)
path = ROOT / 'account-assets/catalog.json'
path.parent.mkdir(exist_ok=True)
content = json.dumps(catalog, ensure_ascii=False, indent=2) + '\n'
path.write_text(content, encoding='utf-8')
deployment = ROOT / 'dist/account-assets/catalog.json'
deployment.parent.mkdir(parents=True, exist_ok=True)
deployment.write_text(content, encoding='utf-8')
(deployment.parent / 'supplements.json').write_bytes((ROOT / 'account-assets/supplements.json').read_bytes())
print(f'Catalog refreshed: {len(heroes)} heroes, {len(skills)} researchable skills')
