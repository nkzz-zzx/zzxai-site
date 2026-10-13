"""Download verified official hero portraits; keep distinct hero IDs and existing local art."""
import concurrent.futures
import json
import pathlib
import urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'account-assets/catalog.json').read_text())
folder=ROOT/'account-assets/portraits'
folder.mkdir(exist_ok=True)
def download(hero):
    if hero.get('portrait') and (ROOT/hero['portrait']).is_file():return None
    key=hero.get('iconId',hero['id'])
    path=folder/(key+'.jpg')
    if path.is_file():return (hero['id'], './account-assets/portraits/'+key+'.jpg')
    url=f'https://g0.gph.netease.com/ngsocial/community/stzb/cn/cards/cut/card_medium_{key}.jpg?gameid=g10'
    try:
        with urllib.request.urlopen(url,timeout=25) as response:
            body=response.read(2000000)
            if not body.startswith(b'\xff\xd8\xff'):raise ValueError('not a JPEG')
        path.write_bytes(body)
        return (hero['id'], './account-assets/portraits/'+key+'.jpg')
    except Exception as error:
        print('Unavailable portrait:',hero['id'],hero['name'],str(error))
        return None
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    paths=dict(item for item in pool.map(download,catalog['heroes']) if item)
for hero in catalog['heroes']:
    if hero['id'] in paths:hero['portrait']=paths[hero['id']]
for target in [ROOT/'account-assets/catalog.json',ROOT/'dist/account-assets/catalog.json']:
    target.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
for path in folder.glob('*.jpg'):
    target=ROOT/'dist/account-assets/portraits'/path.name
    target.parent.mkdir(exist_ok=True)
    target.write_bytes(path.read_bytes())
print('Hero portraits:',sum(bool(h.get('portrait')) for h in catalog['heroes']), '/',len(catalog['heroes']))
# Gear IDs and names come from the same official CBG configuration used for the catalog.
import re
with urllib.request.urlopen('https://cbg-stzb.res.netease.com/js/game_auto_config.js',timeout=30) as response:
    text=response.read(10000000).decode('utf-8')
match=re.match(r'\s*var\s+CBG_GAME_CONFIG\s*=\s*',text)
if not match:raise ValueError('Unexpected official config')
config,_=json.JSONDecoder().raw_decode(text,match.end())
gear_folder=ROOT/'account-assets/gear-images'
gear_folder.mkdir(exist_ok=True)
def download_gear(gear):
    key=str(gear['gear_id']);path=gear_folder/(key+'.jpg')
    try:
        if not path.is_file():
            url=f'https://g0.gph.netease.com/ngsocial/community/stzb/cn/gears/gear_icon/gear_icon_{key}.jpg?gameid=g10'
            with urllib.request.urlopen(url,timeout=25) as response:body=response.read(2000000)
            if not body.startswith(b'\xff\xd8\xff'):raise ValueError('not a JPEG')
            path.write_bytes(body)
        target=ROOT/'dist/account-assets/gear-images'/path.name
        target.parent.mkdir(exist_ok=True);target.write_bytes(path.read_bytes())
        return key,'./account-assets/gear-images/'+key+'.jpg'
    except Exception as error:
        print('Unavailable treasure image:',key,gear['name'],str(error));return None
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    catalog['gearImages']=dict(item for item in pool.map(download_gear,config['gear']) if item)
for target in [ROOT/'account-assets/catalog.json',ROOT/'dist/account-assets/catalog.json']:
    target.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print('Treasure images:',len(catalog['gearImages']),'/',len(config['gear']))
