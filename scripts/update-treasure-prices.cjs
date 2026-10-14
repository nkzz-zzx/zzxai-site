// Read the reference site's public price tables as rendered by its browser UI.
// No account, token, encrypted payload decoding, or private endpoint is used.
const {chromium} = require('playwright');
const {execFile} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = 'https://www.stzb163.online/hongqi#/baowu';
const output = path.join(root, 'treasure-assets/reference.json');
const publicGet = `import sys,json,urllib.request,urllib.error,base64
p=json.load(sys.stdin)
r=urllib.request.Request(p['url'],headers={'User-Agent':'Mozilla/5.0','Accept':'*/*'})
try:
 with urllib.request.urlopen(r,timeout=30) as s:
  print(json.dumps({'status':s.status,'type':s.headers.get('Content-Type','application/octet-stream'),'body':base64.b64encode(s.read(6000001)).decode()}))
except urllib.error.HTTPError as e:
 print(json.dumps({'status':e.code,'type':'text/plain','body':base64.b64encode(e.read(10000)).decode()}))
`;
function trustedGet(url) {
  return new Promise((resolve, reject) => {
    const child = execFile('python3', ['-c', publicGet], {maxBuffer:9000000}, (error, stdout) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify({url}));
  });
}
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',headless:true});
  const page = await browser.newPage();
  // The cloud HTTPS proxy is trusted by Python's system trust store. Forward
  // public requests through it when Chromium cannot use that trust store.
  if (process.argv.includes('--trusted-proxy')) {
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (['image','font','media'].includes(request.resourceType())) return route.abort();
      if (url.origin !== 'https://www.stzb163.online' || request.method() !== 'GET') return route.abort();
      try {
        const response = await trustedGet(url.href);
        await route.fulfill({status:response.status,contentType:response.type,body:Buffer.from(response.body,'base64')});
      } catch (error) { await route.abort(); }
    });
  }
  const adaptations = new Map(), pending = new Set();
  let sourceVersion = null;
  page.on('response', response => {
    const url = new URL(response.url());
    if (!['/api/stzb/arm-adapt-heroes','/api/arm/prices/version'].includes(url.pathname)) return;
    const job = (async () => {
      const result = await response.json();
      if (result.code !== 0) throw new Error('Public reference data failed');
      if (url.pathname.endsWith('/version')) { sourceVersion = result.data; return; }
      const key = `${url.searchParams.get('gearId')}:${url.searchParams.get('featureName')}`;
      if (!Array.isArray(result.data?.list)) throw new Error('Unexpected adaptation response');
      adaptations.set(key, [...new Set(result.data.list.map(item => String(item.heroId)))]);
    })();
    pending.add(job);
    job.catch(() => {}).finally(() => pending.delete(job));
  });
  try {
    const initialPrices = page.waitForResponse(response => new URL(response.url()).pathname === '/api/arm/prices' && response.status() === 200, {timeout:45000});
    initialPrices.catch(() => {});
    await page.goto(source, {waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('.arm-list button').first().waitFor({timeout:45000});
    await (await initialPrices).finished();
    await page.waitForFunction(() => document.querySelector('.value-main b')?.textContent.trim());
    // Allow the initial public price map to finish rendering before collecting.
    await page.waitForTimeout(1000);
    const moduleUrl = await page.evaluate(() => performance.getEntriesByType('resource').find(item => /\/armsdata-[^/]+\.js/.test(item.name))?.name);
    if (!moduleUrl) throw new Error('Public weapon definitions unavailable');
    const arms = await page.evaluate(async url => (await import(url)).a, moduleUrl);
    if (!Array.isArray(arms) || arms.length < 30) throw new Error('Incomplete public weapon definitions');
    const weapons = [];
    for (const [index, arm] of arms.entries()) {
      await page.locator('.arm-list button').filter({hasText:new RegExp('^'+escapeRegex(arm.label)+'(?:\\s|$)')}).click();
      const features = [];
      for (const feature of arm.featureNames) {
        await page.locator('.feature-tabs button').filter({hasText:new RegExp('^'+escapeRegex(feature.name)+'$')}).click();
        await page.waitForFunction(({arm,feature}) => document.querySelector('.selected-arm-heading h2')?.textContent === arm && document.querySelector('.feature-tabs [aria-selected="true"]')?.textContent === feature, {arm:arm.label,feature:feature.name});
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const tiers = await page.locator('.value-option').evaluateAll(rows => rows.map(row => {
          const strong = row.querySelector('.value-main strong');
          const value = [...strong.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
          const quality = strong.querySelector('.quality-tag')?.textContent.trim();
          const description = row.querySelector('.value-main > span > small')?.textContent.trim();
          const priceText = row.querySelector('.value-main > b')?.textContent.trim();
          const referencePrice = /^\d[\d,]*(?:\.\d+)?$/.test(priceText) ? Number(priceText.replaceAll(',','')) : null;
          return {value,quality,description,referencePrice};
        }));
        if (!tiers.length || tiers.some(tier => !tier.description || !['粉','红'].includes(tier.quality))) throw new Error(`Incomplete price tiers: ${arm.label} ${feature.name}`);
        const key = `${arm.value}:${feature.name}`;
        const deadline = Date.now()+30000;
        while (!adaptations.has(key) && Date.now() < deadline) await pause(100);
        if (!adaptations.has(key)) throw new Error(`Public adaptations unavailable: ${key}`);
        features.push({name:feature.name,tiers,heroIds:adaptations.get(key)});
      }
      weapons.push({id:String(arm.value),name:arm.label,pinyin:arm.pinyin,baseFeatures:Object.entries(arm.baseFeature || {}).map(([name,description])=>({name,description})),features});
      console.log(`Collected ${index+1}/${arms.length}: ${arm.label} (${features.length} features)`);
    }
    await Promise.all([...pending]);
    const data = {fetchedAt:new Date().toISOString(),source,sourceVersion,definitionsSource:moduleUrl,weapons};
    await fs.mkdir(path.dirname(output), {recursive:true});
    await fs.writeFile(output+'.tmp', JSON.stringify(data,null,2)+'\n');
    await fs.rename(output+'.tmp',output);
    console.log(`Saved ${weapons.length} weapons and ${weapons.reduce((n,w)=>n+w.features.length,0)} public feature tables`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
