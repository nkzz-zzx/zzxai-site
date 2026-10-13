const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
test('server refresh audits missing coverage and excludes conflicting public classifications',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'account-server-source-'));
 try{
 const season=(num,name,type)=>({open_time:'2026-09-17T03:00:00.000Z',name,type,servers:[{server_num:num}]});
 const rows=[season('X5992','百业争鸣','试师'),season('X6014','龙兴之地','征服'),season('X6008','雪戟冰戈','试师')];
 fs.writeFileSync(path.join(tmp,'timeline.json'),JSON.stringify({code:0,data:{seasons:rows}}));fs.writeFileSync(path.join(tmp,'seasons.json'),JSON.stringify({code:0,data:{list:rows.map(s=>s.name==='雪戟冰戈'?{...s,type:'征服'}:s)}}));
 fs.writeFileSync(path.join(tmp,'official.js'),'var server_data = '+JSON.stringify({4:{area_name:'征服赛季',servers:['X5992 百业争鸣(赛季已开启35天)','X6014 龙兴之地(赛季已开启26天)','X6008 雪戟冰戈(赛季已开启28天)','X6081 兵合车错(赛季已开启8天)'].map(server_name=>({server_name}))}})+';');
 const result=spawnSync('python',['scripts/update-account-servers.py','--timeline-file',path.join(tmp,'timeline.json'),'--seasons-file',path.join(tmp,'seasons.json'),'--official-file',path.join(tmp,'official.js'),'--output-dir',path.join(tmp,'out')],{cwd:path.join(__dirname,'..'),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const text=fs.readFileSync(path.join(tmp,'out/account-server-types.js'),'utf8');const table=JSON.parse(text.slice(text.indexOf('=')+1).trim().slice(0,-1));assert.equal(table.servers.find(s=>s.serverNum==='X5992').type,'试师');assert.equal(table.servers.find(s=>s.serverNum==='X6014').type,'征服');assert(!table.servers.some(s=>s.serverNum==='X6008'||s.serverNum==='X6081'));
 const audit=JSON.parse(fs.readFileSync(path.join(tmp,'out/account-assets/server-audit.json')));assert.equal(audit.officialCurrentServerCount,4);assert.equal(audit.coveredCurrentServerCount,2);assert.equal(audit.unverifiedCurrentServerCount,2);assert.equal(audit.conflicts[0].serverNum,'X6008');assert(audit.unverifiedServers.some(s=>s.serverNum==='X6081'));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
