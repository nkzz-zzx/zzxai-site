"""Refresh the public season/server mapping; no account or authentication data is stored."""
import datetime
import json
import pathlib
import re
import urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE='https://www.stzb163.online/api/kaiqu/timeline?limit=80'
with urllib.request.urlopen(SOURCE,timeout=25) as response:raw=json.load(response)
if raw.get('code') not in [0,200] or not isinstance(raw.get('data',{}).get('seasons'),list):raise ValueError('Unexpected season table; existing file retained')
rows={}
for season in raw['data']['seasons']:
    if season.get('type') not in ['试师','征服']:continue
    for server in season.get('servers',[]):
        key=str(server.get('server_num','')).upper().strip()
        if not re.fullmatch(r'X\d+',key):raise ValueError('Invalid server number')
        row=dict(serverNum=key,type=season['type'],season=season.get('name',''),openedAt=season.get('open_time',''))
        if key not in rows or row['openedAt']>rows[key]['openedAt']:rows[key]=row
if not rows or not any(row['type']=='试师' for row in rows.values()):raise ValueError('Empty or incomplete season table; existing file retained')
text='// Generated from the public season/server table. Refresh with scripts/update-account-servers.py.\n'
text+='export const serverTable = '+json.dumps(dict(source=SOURCE,updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),servers=list(rows.values())),ensure_ascii=False,indent=2)+';\n'
for path in [ROOT/'account-server-types.mjs',ROOT/'dist/account-server-types.mjs']:path.write_text(text)
print('Server mapping refreshed:',len(rows),'servers;',sum(row['type']=='试师' for row in rows.values()),'trial servers')
