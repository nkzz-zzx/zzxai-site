export const DISCOUNT_RATE = 0.85;

export function discountedPrice(referencePrice) {
  if (typeof referencePrice !== 'number' || !Number.isFinite(referencePrice) || referencePrice < 0) return null;
  return Math.round(Math.round(referencePrice * 100) * 85 / 100) / 100;
}

export function formatPrice(price) {
  return price === null ? '暂无报价' : `¥${price.toLocaleString('zh-CN', {maximumFractionDigits:2})}`;
}

export function heroLabel(hero) {
  return [hero.name, hero.country, hero.troop, hero.version === '常规' ? '' : hero.version].filter(Boolean).join(' · ');
}

// Search and filters work across the full catalog, before selecting a weapon.
export function filterWeapons(catalog, {search='', quality='all', mainType='all', maxPrice=''} = {}) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = text => terms.every(term => text.toLowerCase().includes(term));
  const limit = maxPrice === '' || maxPrice === null ? Infinity : Number(maxPrice);
  const budget = Number.isFinite(limit) && limit >= 0 ? limit : Infinity;
  return catalog.weapons.map(weapon => {
    const weaponText = [weapon.name, weapon.pinyin, ...weapon.baseFeatures.map(item => item.name)].join(' ');
    const features = weapon.features.flatMap(feature => {
      const tiers = feature.tiers.filter(tier => (quality === 'all' || tier.quality === quality) && (discountedPrice(tier.referencePrice) ?? Infinity) <= budget);
      if (!tiers.length) return [];
      const allHeroes = feature.heroIds.map(id => catalog.heroes[id]).filter(Boolean);
      let heroes = allHeroes.filter(hero => mainType === 'all' || hero.mainSkill.type === mainType);
      if (mainType !== 'all' && !heroes.length) return [];
      const featureText = [weaponText, feature.name, ...feature.tiers.map(tier => tier.description)].join(' ');
      if (terms.length && !matches(featureText)) {
        heroes = heroes.filter(hero => matches(`${weaponText} ${feature.name} ${heroLabel(hero)} ${hero.mainSkill.name} ${hero.mainSkill.type}`));
        if (!heroes.length) return [];
      }
      return [{feature,tiers,heroes}];
    });
    return {weapon,features};
  }).filter(item => item.features.length);
}
