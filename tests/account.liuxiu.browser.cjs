const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const url = process.env.ACCOUNT_URL || 'http://127.0.0.1:8030/account.html';
(async () => {
  const {normalizeAccount} = await import('../account-core.js');
  const response = owned => normalizeAccount({equip:{status_desc:'上架中',server_name:'X6080 兵合车错',price:420000,equip_desc:{
    card: owned ? [{hero_id:100841,icon_hero_id:100841,name:'刘秀',country:1,hero_type:3,quality:5,season:'N',advance_num:2}] : [], skill:[],gear:[]
  }}});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844}}), errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.route('**/api/account?*',route => {
    const owned = new URL(route.request().url()).searchParams.get('url').endsWith('/with-liuxiu');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response(owned))});
  });
  const expand = async () => {if (await page.locator('#query-controls').isHidden()) await page.locator('#query-toggle').click();};
  const query = async link => {
    await expand();await page.locator('#account-url').fill('https://stzb.cbg.163.com/cgi/mweb/equip/1/'+link);
    await page.locator('#query-button').click();await page.locator('#query-button:enabled').waitFor({state:'attached'});
  };
  try {
    await page.goto(url);await page.locator('#query-button:enabled').waitFor();
    await page.locator('#search').fill('刘秀');
    assert.equal(await page.locator('.hero-entry').count(),1);
    assert.match(await page.locator('#results').innerText(),/刘秀/);
    assert.match(await page.locator('.hero-entry').getAttribute('title'),/汉/);
    await query('with-liuxiu');
    assert.equal(await page.locator('.owned.hero-entry').count(),1);
    assert.equal(await page.locator('.missing.hero-entry').count(),0);
    assert.equal(await page.locator('.owned .star').count(),5);
    assert.equal(await page.locator('.owned .red-star').count(),2);
    await page.locator('.hero-art').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {const image=document.querySelector('.hero-art img');return image?.complete && image.naturalWidth>0;});
    assert.match(await page.locator('.hero-art img').getAttribute('src'),/account-assets\/portrait-thumbs\/v1-1ccb7138cab79f8c\.webp/);
    await page.locator('#ownership').selectOption('owned');assert.equal(await page.locator('.hero-entry').count(),1);
    await page.locator('#ownership').selectOption('all');
    await query('without-liuxiu');
    assert.equal(await page.locator('.missing.hero-entry').count(),1);
    assert.equal(await page.locator('.owned.hero-entry').count(),0);
    await expand();await page.locator('#account-url').fill('https://stzb.cbg.163.com/cgi/mweb/equip/1/with-liuxiu');
    await page.locator('#compare-url').fill('https://stzb.cbg.163.com/cgi/mweb/equip/1/without-liuxiu');
    await page.locator('#query-button').click();await page.locator('.comparison-table').waitFor();
    assert.equal(await page.locator('.comparison-row').count(),1);
    assert.equal(await page.locator('.comparison-row').getAttribute('data-id'),'100841');
    assert.match(await page.locator('.compare-missing').innerText(),/未拥有/);
    assert.equal(await page.locator('.comparison-row .red-star').count(),2);
    assert.equal(await page.locator('#results img').count(),0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS Liu Xiu catalog/search, base-ID query, owned and missing states, local WebP portrait, five stars/two reds, and text-only comparison on mobile');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
