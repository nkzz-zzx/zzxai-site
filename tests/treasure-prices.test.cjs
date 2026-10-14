const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'treasure-assets/prices.json')));
const reference = JSON.parse(fs.readFileSync(path.join(root,'treasure-assets/reference.json')));
const core = import('../treasure-prices-core.js');

test('85% price preserves half-yuan values, cent rounding, and missing prices', async () => {
  const {discountedPrice,formatPrice} = await core;
  assert.equal(discountedPrice(650),552.5);
  assert.equal(discountedPrice(1200),1020);
  assert.equal(discountedPrice(400),340);
  assert.equal(discountedPrice(19.99),16.99);
  for (const price of [null,undefined,NaN,Infinity,-1,'650']) assert.equal(discountedPrice(price),null);
  assert.equal(formatPrice(552.5),'¥552.5');
  assert.equal(formatPrice(null),'暂无报价');
});

test('every rendered reference price is retained and all 38 treasures have three official base features', () => {
  assert.equal(catalog.discountRate,.85);
  assert.equal(catalog.weapons.length,38);
  assert.equal(catalog.weapons.reduce((n,w)=>n+w.features.length,0),237);
  assert.equal(catalog.weapons.reduce((n,w)=>n+w.features.reduce((n,f)=>n+f.tiers.length,0),0),683);
  for (const weapon of catalog.weapons) {
    const source = reference.weapons.find(item=>item.id === weapon.id);
    assert.equal(weapon.baseFeatures.length,3);
    assert(weapon.baseFeatures.every(item=>item.name && item.description));
    assert.equal(new Set(weapon.features.map(item=>item.name)).size,weapon.features.length);
    weapon.features.forEach(feature=>{
      assert.deepEqual(feature.tiers,source.features.find(item=>item.name === feature.name).tiers);
      feature.heroIds.forEach(id=>assert(catalog.heroes[id]?.mainSkill.type));
    });
  }
  const canghai = catalog.weapons.find(w=>w.name==='沧海');
  assert.deepEqual(canghai.baseFeatures.map(f=>f.name),['稳固','坚忍','破浪']);
  assert.match(canghai.baseFeatures[2].description,/最多可叠加10次/);
  assert.equal(catalog.weapons.find(w=>w.name==='大吉').baseFeatures[2].name,'繁荣');
  assert.equal(catalog.weapons.find(w=>w.name==='金鸠').baseFeatures[2].name,'鸠佑');
});

test('official main-skill types distinguish variants and the passive new Dian Wei', () => {
  assert.equal(catalog.heroes['100769'].mainSkill.type,'被动');
  assert.equal(catalog.heroes['100769'].mainSkill.name,'舍身卫主');
  assert.equal(catalog.heroes['100496'].mainSkill.type,'指挥');
  assert.equal(catalog.heroes['100496'].version,'S3');
  assert.equal(catalog.heroes['100024'].mainSkill.type,'主动');
  assert.equal(catalog.heroes['100794'].mainSkill.type,'指挥');
});

test('global hero and feature search combine with quality, actual hero main type, and discounted budget', async () => {
  const {filterWeapons,discountedPrice} = await core;
  const dianwei = filterWeapons(catalog,{search:'典韦',mainType:'被动',quality:'粉',maxPrice:600});
  const canghai = dianwei.find(item=>item.weapon.name === '沧海');
  assert(canghai);
  assert.deepEqual(canghai.features.map(item=>item.feature.name),['坚忍']);
  assert.equal(canghai.features[0].tiers.length,1);
  assert.equal(discountedPrice(canghai.features[0].tiers[0].referencePrice),552.5);
  for (const item of dianwei) for (const {heroes,tiers} of item.features) {
    assert(heroes.every(hero=>hero.mainSkill.type === '被动' && hero.name.includes('典韦')));
    assert(tiers.every(tier=>tier.quality === '粉' && discountedPrice(tier.referencePrice)<=600));
  }
  const zhuge = filterWeapons(catalog,{search:'诸葛亮 S3',mainType:'指挥'});
  assert(zhuge.length);
  assert(zhuge.every(item=>item.features.every(({heroes})=>heroes.every(h=>h.id === '100496'))));
  const yingyong = filterWeapons(catalog,{search:'英勇'});
  assert(yingyong.length);
  assert(yingyong.every(item=>item.features.every(item=>item.feature.name==='英勇')));
  assert.equal(filterWeapons(catalog,{search:'不存在的宝物武将'}).length,0);
  assert.equal(filterWeapons(catalog,{maxPrice:0}).length,0);
});

test('source and deployment copies contain identical standalone page assets', () => {
  for (const file of ['treasure-prices.html','treasure-prices.css','treasure-prices.js','treasure-prices-core.js','treasure-assets/prices.json','index.html','account.html']) {
    assert.equal(fs.readFileSync(path.join(root,file),'utf8'),fs.readFileSync(path.join(root,'dist',file),'utf8'),file);
  }
});
