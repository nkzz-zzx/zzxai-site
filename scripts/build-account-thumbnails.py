"""Build small, content-addressed official portraits for account cards."""
import hashlib
import json
import pathlib
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'account-assets/catalog.json').read_text())
folder=ROOT/'account-assets/portrait-thumbs'
folder.mkdir(exist_ok=True)
paths=set()
for hero in catalog['heroes']:
    source=ROOT/hero['portrait']
    name='v1-'+hashlib.sha256(source.read_bytes()).hexdigest()[:16]+'.webp'
    target=folder/name
    if not target.exists():
        with Image.open(source) as image:
            image=image.convert('RGB')
            image.thumbnail((112,162),Image.Resampling.LANCZOS)
            image.save(target,'WEBP',quality=72,method=6)
    hero['thumbnail']='./account-assets/portrait-thumbs/'+name
    paths.add(target)
    deployed=ROOT/'dist/account-assets/portrait-thumbs'/name
    deployed.parent.mkdir(parents=True,exist_ok=True)
    deployed.write_bytes(target.read_bytes())
for target in [ROOT/'account-assets/catalog.json',ROOT/'dist/account-assets/catalog.json']:
    target.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print('Built',len(paths),'unique thumbnails;',sum(p.stat().st_size for p in paths)//1024,'KiB total')
