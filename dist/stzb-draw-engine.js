(function (root) {
  'use strict';

  function createState() {
    return { version: 1, pools: {}, pity: {}, wishes: {}, total: 0, cost: 0, stars: { 3: 0, 4: 0, 5: 0 }, collection: {}, history: [] };
  }

  function context(state, pool) {
    const stats = state.pools[pool.id] ||= { draws: 0, cost: 0, fives: 0 };
    const pity = state.pity[pool.pityGroup || pool.id] ||= { threeStreak: 0, noFive: 0 };
    const wish = state.wishes[pool.wishGroup || pool.id] ||= { id: '', points: 0, hits: 0 };
    return { stats, pity, wish };
  }

  function chooseWish(state, pool, id, eligible) {
    if (!eligible.includes(id)) throw new Error('请选择可选范围内的武将');
    const { wish } = context(state, pool);
    if (wish.id === id) return;
    if (wish.id) wish.points = Math.floor(wish.points / 2);
    wish.id = id;
    wish.hits = 0;
  }

  function costFor(pool, drawn, count) {
    if (!Number.isInteger(count) || count < 1 || count > 5) throw new Error('招募次数无效');
    if (pool.maxDraws && drawn + count > pool.maxDraws) throw new Error('本轮活动招募次数不足');
    if (count === 5 && pool.fiveCost) return pool.fiveCost;
    let cost = 0;
    for (let i = 0; i < count; i++) {
      const n = drawn + i;
      cost += pool.freeFirst && n === 0 ? 0 : pool.halfSecond && n === 1 ? pool.singleCost / 2 : pool.singleCost;
    }
    return cost;
  }

  function draw(state, pool, cards, count, random = Math.random) {
    const { stats, pity, wish } = context(state, pool);
    const cost = costFor(pool, stats.draws, count);
    const batches = [];
    for (let i = 0; i < count; i++) {
      const wishInPool = pool.roster[5].includes(wish.id);
      const wishDue = pool.wishCap && wish.id && wishInPool && wish.points >= pool.wishCap;
      const eventDue = pool.guaranteedAt && stats.draws + 1 === pool.guaranteedAt;
      const fiveDue = pool.fivePity && pity.noFive >= pool.fivePity - 1;
      const fourDue = pool.fourPity && pity.threeStreak >= pool.fourPity - 1;
      let rarity;
      let reason = '';
      if (wishDue || eventDue || fiveDue) {
        rarity = 5;
        reason = wishDue ? '心愿达成' : eventDue ? '活动第十抽' : `${pool.fivePity}抽保底`;
      } else {
        const n = random();
        rarity = n < pool.rates[5] ? 5 : fourDue || n < pool.rates[5] + pool.rates[4] ? 4 : 3;
        if (fourDue && rarity === 4) reason = '四星保底';
      }
      const roster = pool.roster[rarity];
      if (!roster?.length) throw new Error('卡包阵容数据不完整');
      let id;
      if (wishDue) {
        id = wish.id;
      } else if (rarity === 5 && wishInPool && pool.wishCap) {
        const progress = Math.min(1, wish.points / pool.wishCap);
        const chance = 1 / roster.length + (1 - 1 / roster.length) * progress ** 2;
        const roll = random();
        if (roll < chance) id = wish.id;
        else {
          const others = roster.filter(x => x !== wish.id);
          id = others[Math.min(others.length - 1, Math.floor((roll - chance) / (1 - chance) * others.length))];
        }
      } else {
        id = roster[Math.min(roster.length - 1, Math.floor(random() * roster.length))];
      }
      if (!cards[id] || cards[id].rarity !== rarity) throw new Error('武将数据不匹配');
      const isWish = id === wish.id;
      if (isWish) {
        wish.points = 0;
        wish.hits++;
      } else if (pool.wishCap && wish.id) {
        wish.points = Math.min(pool.wishCap, wish.points + ({ 3: 10, 4: 20, 5: 150 })[rarity]);
      }
      pity.threeStreak = rarity >= 4 ? 0 : pity.threeStreak + 1;
      pity.noFive = rarity === 5 ? 0 : pity.noFive + 1;
      stats.draws++;
      if (rarity === 5) stats.fives++;
      state.total++;
      state.stars[rarity]++;
      state.collection[id] = (state.collection[id] || 0) + 1;
      const result = { id, rarity, isWish, reason, poolId: pool.id, number: state.total, poolNumber: stats.draws };
      batches.push(result);
      state.history.unshift(result);
    }
    stats.cost += cost;
    state.cost += cost;
    state.history = state.history.slice(0, 200);
    return batches;
  }

  function restore(raw, pools, cards) {
    if (!raw || raw.version !== 1) return createState();
    const number = v => Number.isSafeInteger(v) && v >= 0;
    if (![raw.total, raw.cost, ...[3, 4, 5].map(r => raw.stars?.[r])].every(number)) return createState();
    if (!raw.pools || !raw.pity || !raw.wishes || !raw.collection || !Array.isArray(raw.history)) return createState();
    for (const [id, p] of Object.entries(raw.pools)) {
      const pool = pools.find(p => p.id === id);
      if (!pool || !p || ![p.draws, p.cost, p.fives].every(number) || (pool.maxDraws && p.draws > pool.maxDraws)) return createState();
    }
    for (const p of Object.values(raw.pity)) if (!p || ![p.threeStreak, p.noFive].every(number)) return createState();
    for (const w of Object.values(raw.wishes)) if (!w || ![w.points, w.hits].every(number) || (w.id !== '' && cards[w.id]?.rarity !== 5)) return createState();
    if (Object.entries(raw.collection).some(([id, n]) => !cards[id] || !number(n))) return createState();
    if (raw.history.some(h => !h || !cards[h.id] || cards[h.id].rarity !== h.rarity || !pools.some(p => p.id === h.poolId && p.roster[h.rarity]?.includes(h.id)) || !number(h.number) || !number(h.poolNumber))) return createState();
    return raw;
  }

  const api = { createState, context, chooseWish, costFor, draw, restore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.STZBDraw = api;
})(globalThis);
