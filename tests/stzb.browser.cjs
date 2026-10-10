const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'stzb-assets/timeline.json')));
const url = process.env.STZB_URL || 'http://127.0.0.1:8776/stzb.html';
const previewDir = process.env.STZB_PREVIEWS;

(async () => {
  assert.equal(data.cards.length, 191);
  assert.equal(new Set(data.cards.map(c => c.id)).size, 191);
  for (const card of data.cards) {
    assert(fs.existsSync(path.join(root, card.portrait)), `${card.name}: missing portrait`);
    assert(card.sources.length && card.portraitSource.startsWith('https://'));
  }
  for (const file of ['index.html', 'stzb.html', 'stzb.js', 'stzb-assets/timeline.json', 'stzb-assets/武将上架时间.xlsx']) {
    assert(fs.readFileSync(path.join(root, file)).equals(fs.readFileSync(path.join(root, 'dist', file))), `${file}: deployment copy differs`);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
  const page = await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  const count = async n => assert.equal(await page.locator('.general').count(),n);
  try {
    await page.goto(url);
    await page.locator('#results[aria-busy="false"]').waitFor();
    await count(191);
    assert.equal(await page.locator('.year-heading h2').first().textContent(),'2026');
    const imageFailures=await page.evaluate(async cards=>{
      const failures=[];
      for(let i=0;i<cards.length;i+=12)await Promise.all(cards.slice(i,i+12).map(c=>new Promise(resolve=>{
        const image=new Image();image.onload=()=>{if(!image.naturalWidth)failures.push(c.id);resolve();};
        image.onerror=()=>{failures.push(c.id);resolve();};image.src=c.portrait;
      })));
      return failures;
    },data.cards);
    assert.deepEqual(imageFailures,[],'all official portraits must decode');
    if(previewDir){fs.mkdirSync(previewDir,{recursive:true});await page.screenshot({path:path.join(previewDir,'stzb-desktop.png')});}

    await page.locator('#search').fill('孟获');await count(2);
    await page.locator('[data-card="H17"]').click();
    assert(await page.locator('#detail').isVisible());
    assert.match(await page.locator('#detail-content').innerText(),/2016\.04\.06[\s\S]*2025\.04\.02[\s\S]*2026\.07\.08/);
    await page.locator('[data-related="100815"]').click();
    assert.match(await page.locator('#detail-content').innerText(),/XP新版[\s\S]*2026\.07\.08/);
    if(previewDir)await page.screenshot({path:path.join(previewDir,'stzb-detail.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#detail').isVisible(),false);
    assert.equal(await page.locator('[data-card="H17"]').evaluate(el=>el===document.activeElement),true);

    await page.locator('#reset').click();
    await page.locator('[data-year="2026"]').click();
    await page.locator('[data-country="魏"]').click();
    await count(data.cards.filter(c=>c.first.startsWith('2026')&&c.country==='魏').length);
    await page.locator('#search').fill('不存在的武将');await count(0);
    assert(await page.locator('.empty').isVisible());
    await page.locator('[data-reset]').click();await count(191);
    await page.locator('#status').selectOption('inferred');await count(16);
    assert.equal(await page.locator('.uncertain').count(),16,'inferences visibly labelled');
    await page.locator('#status').selectOption('pending');await count(54);
    assert.equal(await page.locator('.date-line time').count(),0,'unknown dates are never filled with bounds');
    await page.locator('#reset').click();
    await page.locator('#has-changes').check();
    await count(data.cards.filter(c=>c.events.length).length);
    await page.locator('#reset').click();

    for(const width of [390,768]){
      await page.setViewportSize({width,height:844});
      await page.evaluate(()=>scrollTo(0,0));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px horizontal overflow`);
      if(previewDir)await page.screenshot({path:path.join(previewDir,`stzb-${width}.png`)});
    }
    await page.locator('#search').fill('邓艾');
    await page.locator('[data-card="100310"]').click();
    assert.match(await page.locator('#detail-content').innerText(),/调整后重新上架/);
    assert(await page.evaluate(()=>document.querySelector('#detail').scrollWidth<=document.querySelector('#detail').clientWidth));
    await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);

    const failed=await browser.newPage();
    await failed.route('**/stzb-assets/timeline.json',route=>route.fulfill({status:503,body:'unavailable'}));
    await failed.goto(url);await failed.locator('#results[aria-busy="false"]').waitFor();
    assert(await failed.locator('.error').isVisible(),'data loading failure remains visible');
    assert(await failed.locator('#search').isDisabled());
    await failed.close();
    console.log('PASS: 191 portraits, data/deployment parity, combined filters, evidence labels, old/new details, keyboard focus, mobile layout and load failure.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
