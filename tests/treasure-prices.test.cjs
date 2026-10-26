const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'treasure-assets/prices.json')));
const reference = JSON.parse(fs.readFileSync(path.join(root,'treasure-assets/reference.json')));
const core = import('../treasure-prices-core.js');

test('80% price preserves fractional yuan, cent rounding, and missing prices', async () => {
  const {DISCOUNT_RATE,discountedPrice,formatPrice} = await core;
  assert.equal(DISCOUNT_RATE,0.8);
  assert.equal(DISCOUNT_RATE,catalog.discountRate);
  assert.equal(discountedPrice(650),520);
  assert.equal(discountedPrice(1200),960);
  assert.equal(discountedPrice(400),320);
  assert.equal(discountedPrice(19.99),15.99);
  assert.equal(discountedPrice(650.5),520.4);
  assert.equal(discountedPrice(1.01),0.81);
  for (const price of [null,undefined,NaN,Infinity,-1,'650']) assert.equal(discountedPrice(price),null);
  assert.equal(formatPrice(520.4),'¥520.4');
  assert.equal(formatPrice(null),'暂无报价');
});

test('every rendered reference price is retained and all 38 treasures have three official base features', () => {
  assert.equal(catalog.discountRate,.8);
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
  for (const hero of Object.values(catalog.heroes)) {
    assert(hero.portrait?.startsWith('./account-assets/portrait-thumbs/'));
    assert.deepEqual(fs.readFileSync(path.join(root,hero.portrait)),fs.readFileSync(path.join(root,'dist',hero.portrait)));
  }
  assert.equal(catalog.heroes['100769'].mainSkill.type,'被动');
  assert.equal(catalog.heroes['100769'].mainSkill.name,'舍身卫主');
  assert.equal(catalog.heroes['100496'].mainSkill.type,'指挥');
  assert.equal(catalog.heroes['100496'].version,'S3');
  assert.equal(catalog.heroes['100024'].mainSkill.type,'主动');
  assert.equal(catalog.heroes['100794'].mainSkill.type,'指挥');
});

test('all adapted heroes have complete exact-ID main-skill effects and only valid optional facts', () => {
  assert.equal(Object.keys(catalog.heroes).length,77);
  assert(catalog.officialSources.some(url=>url.includes('/skill_extra.json')));
  for (const hero of Object.values(catalog.heroes)) {
    const skill=hero.mainSkill;
    assert(skill.id && skill.name && skill.type);
    assert.equal(skill.descriptionLevel,10);
    assert(typeof skill.description==='string' && skill.description.length>10,hero.id);
    if (skill.probability) for (const value of skill.probability.match(/\d+(?:\.\d+)?/g)) assert(Number(value)>=0 && Number(value)<=100);
    if (skill.distance!==undefined) assert(Number.isInteger(skill.distance) && skill.distance>0);
  }
  const s3=catalog.heroes['100496'].mainSkill;
  assert.equal(s3.id,'200737');
  assert.match(s3.description,/前3回合/);assert.doesNotMatch(s3.description,/前2回合/);
  const regular=catalog.heroes['100021'].mainSkill,sp=catalog.heroes['102001'].mainSkill;
  assert.equal(regular.name,'银龙冲阵');assert.equal(sp.name,'银龙孤胆');
  assert.notEqual(regular.id,sp.id);assert.notEqual(regular.description,sp.description);
  const dianwei=catalog.heroes['100769'].mainSkill;
  assert.equal(dianwei.id,'200993');assert.equal(dianwei.probability,undefined);
  assert.match(dianwei.description,/攻击伤害由典韦承担/);
  // A repeated paragraph opening can be two legitimate effects; keep both.
  const chengyu=catalog.heroes['100787'].mainSkill;
  assert.match(chengyu.description,/敌军全体被施加特殊负面效果前/);
  assert.match(chengyu.description,/我军全体被施加挑衅、围困以及控制效果时/);
  const reviewed=JSON.parse(fs.readFileSync(path.join(root,'treasure-assets/main-skill-text-reviews.json'))).skills;
  for (const [id,item] of Object.entries(reviewed)) {
    const skill=Object.values(catalog.heroes).map(h=>h.mainSkill).find(s=>s.id===id);
    if (skill) assert.equal(skill.description,item.description,id);
    assert.match(item.sourceDescriptionSha256,/^[a-f0-9]{64}$/);
  }
});

test('global hero and feature search combine with quality, actual hero main type, and discounted budget', async () => {
  const {filterWeapons,discountedPrice} = await core;
  const dianwei = filterWeapons(catalog,{search:'典韦',mainType:'被动',quality:'粉',maxPrice:550});
  const canghai = dianwei.find(item=>item.weapon.name === '沧海');
  assert(canghai);
  assert.deepEqual(canghai.features.map(item=>item.feature.name),['坚忍']);
  assert.equal(canghai.features[0].tiers.length,1);
  assert.equal(discountedPrice(canghai.features[0].tiers[0].referencePrice),520);
  for (const item of dianwei) for (const {heroes,tiers} of item.features) {
    assert(heroes.every(hero=>hero.mainSkill.type === '被动' && hero.name.includes('典韦')));
    assert(tiers.every(tier=>tier.quality === '粉' && discountedPrice(tier.referencePrice)<=550));
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
