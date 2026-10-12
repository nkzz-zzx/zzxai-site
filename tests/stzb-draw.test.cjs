const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../stzb-draw-engine.js');
const data = require('../stzb-draw-assets/pools.json');
const pool = id => data.pools.find(p => p.id === id);
const draw = (state, p, count = 1, rng = () => .99) => engine.draw(state, p, data.cards, count, rng);

test('22 sourced pools have unique, valid rosters, local portraits and deployment copies', () => {
  assert.equal(data.pools.length, 22);
  assert.equal(data.cards['100619'].variant, '', 'released Da Qiao is no longer XP');
  assert.equal(data.cards['100808'].variant, 'XP', 'XP Sun Quan remains distinct');
  assert.equal(new Set(data.pools.map(p => p.id)).size, 22);
  for (const p of data.pools) {
    assert(p.sources.length && p.rosterNote);
    assert(p.roster[5].includes(p.cover));
    assert(Math.abs(Object.values(p.rates).reduce((a,b) => a+b, 0) - 1) < 1e-10);
    for (const [rarity, ids] of Object.entries(p.roster)) {
      assert.equal(ids.length, new Set(ids).size);
      for (const id of ids) assert.equal(data.cards[id].rarity, Number(rarity));
    }
  }
  for (const c of Object.values(data.cards)) {
    if (c.rarity === 5) assert(c.portrait && c.portraitSource);
    if (c.portrait) assert(fs.existsSync(path.join(__dirname, '..', c.portrait)));
  }
  for (const file of ['index.html','stzb.html','stzb-draw.html','stzb-draw.css','stzb-draw.js','stzb-draw-engine.js','stzb-draw-assets/pools.json','stzb-draw-assets/recruit-intro-landscape.mp4']) {
    assert(fs.readFileSync(path.join(__dirname,'..',file)).equals(fs.readFileSync(path.join(__dirname,'..','dist',file))), file);
  }
});

test('published 30 draw guarantee and simulated shared counters survive faction switches', () => {
  const s = engine.createState(), wu = pool('dongwu'), wei = pool('weijin');
  for (let i = 0; i < 29; i++) {
    const result = draw(s, i % 2 ? wei : wu)[0];
    assert.notEqual(result.rarity, 5);
    assert.equal(result.rarity, (i + 1) % 5 === 0 ? 4 : 3);
  }
  assert.equal(draw(s, wei)[0].rarity, 5);
  assert.deepEqual(s.pity.factions, { threeStreak: 0, noFive: 0 });
  assert.equal(engine.context(s, pool('kaiguo')).pity.noFive, 0);
  draw(s, wu, 1, () => .01);
  assert.equal(s.pity.factions.noFive, 0);
});

test('supplemental low-star rosters draw real same-rarity cards and retain legacy records', () => {
  const regular = data.pools.filter(p => p.category === 'regular');
  for (const p of data.pools.filter(p => p.borrowedRarities)) {
    for (const rarity of p.borrowedRarities) {
      const expected = [...new Set(regular.flatMap(p => p.roster[rarity]))];
      assert.deepEqual(p.roster[rarity], expected);
      for (const [index, id] of expected.entries()) {
        const rolls = [rarity === 3 ? .99 : .2, (index + .5) / expected.length];
        const result = draw(engine.createState(), p, 1, () => rolls.shift())[0];
        assert.equal(result.id, id);
        assert.equal(result.rarity, rarity);
        assert(data.cards[id].portrait);
      }
    }
  }
  const p = pool('ex-1');
  const legacyPool = { ...p, roster: { ...p.roster, 3: ['rarity-3'], 4: ['rarity-4'] } };
  const legacy = engine.createState();
  engine.chooseWish(legacy, p, p.roster[5][0], p.roster[5]);
  draw(legacy, legacyPool, 1, () => .99);
  draw(legacy, legacyPool, 1, () => .2);
  draw(legacy, pool('dongwu'), 1, () => .01);
  const restored = engine.restore(JSON.parse(JSON.stringify(legacy)), data.pools, data.cards);
  assert.deepEqual(restored, legacy, 'old placeholders retain totals, collection, wishes and history');
  assert(!draw(restored, p)[0].id.startsWith('rarity-'), 'new draws use real cards');
  assert.deepEqual(engine.restore(JSON.parse(JSON.stringify(restored)), data.pools, data.cards), restored);
  const invalid = structuredClone(legacy);
  invalid.history[1].poolId = 'dongwu';
  assert.deepEqual(engine.restore(invalid, data.pools, data.cards), engine.createState(), 'placeholder compatibility is limited to supplemented pools');
});

test('wish becomes due on the following draw, resets on acquisition and retains half on switching', () => {
  const s = engine.createState(), p = pool('ex-1');
  const first = p.roster[5][0], second = p.roster[5][1];
  engine.chooseWish(s, p, first, p.roster[5]);
  const { wish } = engine.context(s,p);
  wish.points = p.wishCap - 10;
  assert.equal(draw(s,p)[0].rarity,3);
  assert.equal(wish.points,p.wishCap);
  const due = draw(s,p)[0];
  assert.equal(due.id,first);
  assert.equal(due.reason,'心愿达成');
  assert.equal(wish.points,0);
  assert.equal(wish.hits,1);
  wish.points = 151;
  engine.chooseWish(s,p,first,p.roster[5]);
  assert.equal(wish.points,151);
  engine.chooseWish(s,p,second,p.roster[5]);
  assert.equal(wish.points,75);
  assert.equal(wish.hits,0);
  assert.throws(() => engine.chooseWish(s,p,'not-in-pool',p.roster[5]));
});

test('faction wish cannot be drawn or redeemed outside its matching pool', () => {
  const s = engine.createState(), wu = pool('dongwu'), wei = pool('weijin');
  const id = wu.roster[5].find(id => !wei.roster[5].includes(id));
  const candidates = data.pools.filter(p => p.wishGroup === 'factions').flatMap(p => p.roster[5]);
  engine.chooseWish(s,wei,id,candidates);
  const { wish } = engine.context(s,wei);
  wish.points = wei.wishCap;
  assert.notEqual(draw(s,wei,1,() => .01)[0].id,id);
  assert.equal(wish.points,wei.wishCap);
  assert.equal(draw(s,wu)[0].id,id);
  assert.equal(wish.points,0);
});

test('activity free/half prices, tenth draw and hard cap; target does not change odds', () => {
  for (const id of ['hongyan','zhuzi']) {
    const s = engine.createState(), p = pool(id);
    engine.chooseWish(s,p,p.roster[5][0],p.roster[5]);
    const first = draw(s,p,1,() => .01)[0];
    assert.equal(first.rarity,5);
    assert.equal(s.cost,0);
    draw(s,p);
    assert.equal(s.cost,199);
    draw(s,p,5);
    draw(s,p,3);
    assert.equal(s.history[0].rarity,5,'10th draw still guaranteed after an early 5-star');
    assert.equal(s.history[0].poolNumber,10);
    assert.equal(s.cost,3383);
    const before = structuredClone(s);
    assert.throws(() => draw(s,p));
    assert.deepEqual(s,before);
    assert.equal(engine.context(s,p).wish.points,0);
    const fresh = engine.createState();
    draw(fresh,p,5);draw(fresh,p,5);
    assert.equal(fresh.cost,3383);
  }
});

test('rarity thresholds, membership, cost and capped history across every pool', () => {
  for (const p of data.pools) {
    const s = engine.createState();
    const upper = p.maxDraws ? 10 : 40;
    for (let i=0;i<upper;i++) {
      const r=draw(s,p)[0];
      assert(p.roster[r.rarity].includes(r.id));
    }
    assert.equal(s.total,upper);
    assert.equal(Object.values(s.stars).reduce((a,b)=>a+b,0),upper);
  }
  const p = pool('kaiguo');
  for (const [roll,rarity] of [[0,5],[.04999,5],[.05,4],[.34999,4],[.35,3],[.999,3]]) {
    assert.equal(draw(engine.createState(),p,1,()=>roll)[0].rarity,rarity);
  }
  const s=engine.createState();
  for(let i=0;i<45;i++)draw(s,p,5);
  assert.equal(s.history.length,200);
  assert.equal(s.total,225);
  assert.equal(s.cost,45*950);
});

test('storage round-trip preserves state and malformed records reset safely', () => {
  const s=engine.createState();draw(s,pool('dongwu'),5);
  assert.deepEqual(engine.restore(JSON.parse(JSON.stringify(s)),data.pools,data.cards),s);
  for(const broken of [null,{}, {...s,total:-1}, {...s,stars:null}, {...s,history:[{}]}, {...s,wishes:{x:{}}}]) {
    assert.deepEqual(engine.restore(broken,data.pools,data.cards),engine.createState());
  }
});
