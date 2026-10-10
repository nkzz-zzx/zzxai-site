const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const data = require('../stzb-draw-assets/pools.json');
const url = process.env.STZB_DRAW_URL || 'http://127.0.0.1:8777/stzb-draw.html';
const previewDir = process.env.STZB_DRAW_PREVIEWS;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = async () => page.locator('#app').waitFor();
  const stored = async () => page.evaluate(() => JSON.parse(localStorage.getItem('stzb-draw-v1')));
  const shot = async name => { if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250); await page.screenshot({ path: path.join(previewDir, name + '.png'), fullPage: !name.includes('five-star') }); } };
  const setRng = async value => page.evaluate(value => { Math.random = () => value; }, value);
  try {
    await page.goto(url); await ready();
    assert.equal(await page.locator('.pool-option').count(), 5);
    assert.equal(await page.locator('#pool-name').innerText(), '东吴名将');
    await page.locator('#open-method').click();
    assert.match(await page.locator('#method-dialog').innerText(), /30 次内必出五星/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#method-dialog').isVisible(), false);
    assert(await page.locator('#open-method').evaluate(el => document.activeElement === el));

    const badImages = await page.evaluate(async cards => {
      const failed = [];
      for (let i=0;i<cards.length;i+=12) await Promise.all(cards.slice(i,i+12).filter(c=>c.portrait).map(c=>new Promise(resolve=>{
        const img=new Image(); img.onload=()=>{if(!img.naturalWidth)failed.push(c.id);resolve();};img.onerror=()=>{failed.push(c.id);resolve();};img.src=c.portrait;
      })));
      return failed;
    }, Object.values(data.cards));
    assert.deepEqual(badImages, []);
    await shot('draw-desktop');

    await page.locator('#select-wish').click();
    await page.locator('#wish-search').fill('孙权');
    await page.locator('[data-wish="100030"]').click();
    await setRng(.99);
    await page.locator('#draw-five').click();
    assert.equal(await page.locator('#last-results .result-card').count(), 5);
    assert.equal(await page.locator('#stat-draws').innerText(), '5');
    assert.equal((await stored()).state.wishes.factions.points, 60);
    assert.equal((await stored()).state.cost, 950);
    await page.locator('[data-pool="weijin"]').click();
    assert.match(await page.locator('#wish-hint').innerText(), /需切换至目标所属卡包/);
    assert.match(await page.locator('#pity-text').innerText(), /25/);
    await page.locator('#draw-five').click();
    assert.equal((await stored()).state.wishes.factions.points, 120);
    await page.locator('#select-wish').click();
    const wei = data.pools.find(p=>p.id==='weijin');
    await page.locator(`[data-wish="${wei.roster[5][0]}"]`).click();
    assert.match(await page.locator('#confirm-message').innerText(), /120.*60/);
    await page.locator('#confirm-accept').click();
    assert.equal((await stored()).state.wishes.factions.points, 60);

    await setRng(.01);
    await page.locator('#draw-five').click();
    await page.locator('#reveal').waitFor();
    assert.equal((await stored()).state.total, 15, 'batch persisted before animation');
    assert(await page.locator('#draw-five').isDisabled());
    assert.match(await page.locator('#next-reveal').innerText(), /还有 4 位/);
    await page.locator('#next-reveal').click();
    assert.match(await page.locator('#next-reveal').innerText(), /还有 3 位/);
    assert(await page.locator('#reveal-image').evaluate(img => img.complete && img.naturalWidth > 0));
    await page.waitForTimeout(1700);
    await shot('draw-five-star');
    await page.locator('#skip-reveal').click();
    assert.equal(await page.locator('#reveal').isVisible(), false);
    assert.equal((await stored()).state.total, 15);
    await page.reload(); await ready();
    assert.equal(await page.locator('#stat-draws').innerText(), '15');
    assert.equal(await page.locator('#pool-name').innerText(), '魏晋名将');
    await page.locator('#skip-animation').check();
    await setRng(.01); await page.locator('#draw-one').click();
    assert.equal(await page.locator('#reveal').isVisible(), false);

    await page.locator('[data-category="event"]').click();
    assert.equal(await page.locator('.pool-option').count(), 2);
    await page.locator('[data-pool="hongyan"]').click();
    assert.equal(await page.locator('#one-cost').innerText(), '本轮免费');
    assert.match(await page.locator('#five-cost').innerText(), /1,393/);
    assert.equal(await page.locator('#wish-label').innerText(), '收藏目标');
    await page.locator('#open-roster').click();
    assert.match(await page.locator('#roster-note').innerText(), /不是完整卡池/);
    assert.equal(await page.locator('#roster-grid .rarity-5').count(), 13);
    await page.keyboard.press('Escape');
    await setRng(.99); await page.locator('#draw-five').click(); await page.locator('#draw-five').click();
    assert.equal((await stored()).state.pools.hongyan.draws, 10);
    assert.equal((await stored()).state.pools.hongyan.cost, 3383);
    assert.equal((await stored()).state.history[0].rarity, 5);
    assert(await page.locator('#draw-one').isDisabled());
    assert(await page.locator('#draw-five').isDisabled());
    const previousTotal = (await stored()).state.total;
    await page.locator('#restart-event').click();
    await page.locator('#confirm-dialog [data-close]').click();
    assert.equal((await stored()).state.pools.hongyan.draws, 10);
    await page.locator('#restart-event').click(); await page.locator('#confirm-accept').click();
    assert.equal((await stored()).state.pools.hongyan.draws, 0);
    assert.equal((await stored()).state.total, previousTotal);
    assert.equal(await page.locator('#one-cost').innerText(), '本轮免费');

    await page.locator('[data-category="season"]').click();
    assert.equal(await page.locator('.pool-option').count(), 15);
    await page.locator('[data-pool="ex-1"]').click();
    assert.match(await page.locator('#wish-points').innerText(), /8,000/);
    await page.locator('#select-wish').click();
    await page.locator('[data-wish]').first().click();
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('stzb-draw-v1'));
      d.state.wishes['ex-1'].points = 7990;
      localStorage.setItem('stzb-draw-v1', JSON.stringify(d));
    });
    await page.reload(); await ready(); await setRng(.99);
    await page.locator('#draw-one').click();
    assert.match(await page.locator('#wish-hint').innerText(), /下一抽必定/);
    await page.locator('#draw-one').click();
    assert.equal((await stored()).state.wishes['ex-1'].points, 0);
    assert.equal((await stored()).state.history[0].reason, '心愿达成');

    for (const viewport of [{ width:390,height:844 },{width:844,height:390},{width:667,height:375},{width:768,height:1024}]) {
      await page.setViewportSize(viewport);
      await page.evaluate(()=>scrollTo(0,0));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `no overflow at ${viewport.width}`);
      if (viewport.width>viewport.height) {
        const bounds=await page.locator('#draw-five').boundingBox();
        assert(bounds.y+bounds.height <= viewport.height, 'landscape draw controls visible in first screen');
      }
      await shot(viewport.width>viewport.height ? `draw-landscape-${viewport.width}` : `draw-portrait-${viewport.width}`);
    }
    await page.setViewportSize({width:844,height:390});
    await page.locator('#skip-animation').uncheck();
    await setRng(.01); await page.locator('#draw-one').click(); await page.locator('#reveal').waitFor();
    const button=await page.locator('#next-reveal').boundingBox();
    assert(button.y>=0 && button.y+button.height<=390);
    await page.waitForTimeout(1800); await shot('draw-five-star-landscape');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('reveal').open && !document.getElementById('draw-one').disabled, null, { timeout: 1000 });
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#draw-one').click();
    assert.equal(await page.locator('#reveal').isVisible(),false);

    await page.locator('#reset-all').click(); await page.locator('#confirm-accept').click();
    assert.equal((await stored()).state.total,0);
    assert.equal(await page.locator('#collection-count').innerText(),'0');
    await page.evaluate(()=>localStorage.setItem('stzb-draw-v1','broken json'));
    await page.reload();await ready();
    assert.equal(await page.locator('#stat-draws').innerText(),'0');
    const blocked=await browser.newPage();
    await blocked.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('blocked');};});
    await blocked.goto(url);await blocked.locator('#app').waitFor();
    assert.match(await blocked.locator('#storage-status').innerText(),/浏览器未允许保存/);
    await blocked.locator('#skip-animation').check();await blocked.locator('#draw-five').click();
    assert.equal(await blocked.locator('#stat-draws').innerText(),'5');await blocked.close();
    const failed=await browser.newPage();
    await failed.route('**/stzb-draw-assets/pools.json',route=>route.fulfill({status:503,body:'unavailable'}));
    await failed.goto(url);await failed.locator('#load-status a').waitFor();
    assert.equal(await failed.locator('#app').isVisible(),false);await failed.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: portraits, pool lists, wish carry/reset, pity, animation queue/skip, persistence, activity limits, mobile landscape, reduced motion and failure paths');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
