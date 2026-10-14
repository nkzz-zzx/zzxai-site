"""Join rendered public prices with official treasure and main-skill definitions."""
import argparse
import datetime
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
    'combat': 'https://cbg-stzb.res.netease.com/js/game_auto_config.js',
    'heroes': 'https://g0.gph.netease.com/ngsocial/community/stzb/cfg/hero_extra.json?gameid=g10',
    'gear-bases': 'https://g0.gph.netease.com/ngsocial/community/stzb/cfg/gear_id.json?gameid=g10',
}
parser = argparse.ArgumentParser()
parser.add_argument('--official-cache-dir', type=pathlib.Path,
                    help='Read treasure-official-*.json downloaded from the official sources')
args = parser.parse_args()


def read_official(name):
    if args.official_cache_dir:
        return json.loads((args.official_cache_dir / f'treasure-official-{name}.json').read_text())
    with urllib.request.urlopen(SOURCES[name], timeout=30) as response:
        text = response.read(10000000).decode('utf-8')
    if name == 'combat':
        match = re.match(r'\s*var\s+CBG_GAME_CONFIG\s*=\s*', text)
        if not match:
            raise ValueError('Unexpected official game configuration')
        return json.JSONDecoder().raw_decode(text, match.end())[0]
    return json.loads(text)


reference = json.loads((ROOT / 'treasure-assets/reference.json').read_text())
combat = read_official('combat')
extra = {str(hero['id']): hero for hero in read_official('heroes')}
bases = {str(gear['id']): gear for gear in read_official('gear-bases')}
official_heroes = {str(hero['hero_id']): hero for hero in combat['hero'] + combat.get('special_hero', [])}
skills = {str(skill['skill_id']): skill for skill in combat['skill']}
types = {1: '被动', 2: '指挥', 3: '主动', 4: '追击'}
versions = {'N': '常规', 'SP': 'SP', 'XP': 'XP', 'S2': 'S2', 'S3': 'S3'}
notes = {
    '英勇': '只提高造成攻击伤害的主战法发动率，不提高携带战法。',
    '筹算': '只提高造成策略伤害的主战法发动率，对指挥主战法及携带战法不生效。',
    '机敏': '提高可发动主战法的发动率，不提高指挥或被动主战法。',
    '熟虑': '只适用于需要准备的主动主战法；无需准备的主战法不适用。',
    '济世': '需要主战法产生恢复效果；仅携带恢复战法不能触发。',
    '惑言': '延长主战法成功施加的控制效果，不延长携带战法的控制。',
    '奔袭': '提高追击战法发动率，携带追击战法也可受益。',
    '艮止': '会失去普通攻击，依赖普攻或追击的武将需谨慎选择。',
    '威势': '比较的是武将初始统率值（COST），并非防御属性。',
    '天资': '谋略加成可服务策略输出、恢复及受谋略影响的辅助战法。',
    '坚忍': '只减免主动战法伤害，不减免普攻、追击、指挥或被动伤害。',
}
hero_ids = {hero_id for weapon in reference['weapons'] for feature in weapon['features'] for hero_id in feature['heroIds']}
heroes = {}
for hero_id in sorted(hero_ids):
    if hero_id not in official_heroes or hero_id not in extra:
        raise ValueError(f'Unresolved official hero ID: {hero_id}; existing catalog retained')
    hero = official_heroes[hero_id]
    details = extra[hero_id]
    skill = skills.get(str(hero['skill_init']))
    if not skill or skill['skill_type'] not in types or str(details['methodId']) != str(hero['skill_init']):
        raise ValueError(f'Unresolved or inconsistent main skill: {hero_id}; existing catalog retained')
    heroes[hero_id] = dict(id=hero_id, name=hero['name'], country=details['country'], troop=details['type'],
                           version=versions.get(hero.get('season'), ''), rarity=hero.get('star', hero['quality']),
                           mainSkill=dict(id=str(skill['skill_id']), name=skill['name'], type=types[skill['skill_type']]))

weapons = []
for weapon in reference['weapons']:
    base = bases.get(weapon['id'])
    if not base or base['name'] != weapon['name']:
        raise ValueError(f'Missing official treasure definition: {weapon["name"]}')
    policy = not base['skillName'] and bool(base['policyName'])
    names = (base['policyName'] if policy else base['skillName']).split('；')
    descriptions = (base['policyDesc'] if policy else base['skillDesc']).split('；')
    if len(names) != 3 or len(descriptions) != 3:
        raise ValueError(f'Treasure must have three official base features: {weapon["name"]}')
    weapon = dict(weapon, category='文臣宝物' if policy else base['type'],
                  baseFeatures=[dict(name=name, description=description) for name, description in zip(names, descriptions)])
    for feature in weapon['features']:
        feature['note'] = notes.get(feature['name'], '')
        for tier in feature['tiers']:
            price = tier['referencePrice']
            if price is not None and (not isinstance(price, (int, float)) or price < 0):
                raise ValueError('Invalid reference price')
    weapons.append(weapon)

if len(weapons) < 30 or len({w['id'] for w in weapons}) != len(weapons):
    raise ValueError('Incomplete or duplicate treasure catalog')
data = dict(asOf=datetime.datetime.fromisoformat(reference['fetchedAt'].replace('Z', '+00:00'))
            .astimezone(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat(),
            fetchedAt=reference['fetchedAt'], discountRate=0.85,
            referenceSource=reference['source'], referenceVersion=reference.get('sourceVersion'),
            officialSources=list(SOURCES.values()), heroes=heroes, weapons=weapons)
content = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
for target in [ROOT / 'treasure-assets/prices.json', ROOT / 'dist/treasure-assets/prices.json']:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(content)
    temporary.replace(target)
print(f'Built {len(weapons)} treasures, {sum(len(w["features"]) for w in weapons)} features, '
      f'{sum(len(f["tiers"]) for w in weapons for f in w["features"])} price tiers and {len(heroes)} verified heroes')
