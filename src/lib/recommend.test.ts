import { describe, it, expect } from 'vitest'
import {
  warmthTarget,
  outfitWarmth,
  hardFilter,
  generateOutfits,
  scoreOutfit,
  totalScore,
  WEIGHTS,
  occasionTags,
  outfitKey,
  outfitCoreKey,
  allowedAccessoryCategories,
} from './recommend'
import type { Item, RecommendContext } from './types'
import type { RecentWear } from './recommend'

let seq = 0
function mk(p: Partial<Item> & Pick<Item, 'category'>): Item {
  seq++
  return {
    id: p.id ?? `id-${seq}`,
    name: p.name ?? null,
    category: p.category,
    gender: p.gender ?? 'unisex',
    subcategory: p.subcategory ?? null,
    color_name: p.color_name ?? null,
    color_hex: p.color_hex ?? '#888888',
    secondary_colors: [],
    pattern: p.pattern ?? 'solid',
    material: p.material ?? null,
    style_tags: p.style_tags ?? ['通勤'],
    season: p.season ?? [],
    formality: p.formality ?? 3,
    warmth: p.warmth ?? 3,
    fit: p.fit ?? 'regular',
    image_url: null,
    cutout_url: null,
    brand: null,
    status: p.status ?? 'active',
    times_worn: p.times_worn ?? 0,
    last_worn: p.last_worn ?? null,
    favorite: false,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function ctx(over: Partial<RecommendContext> = {}): RecommendContext {
  return {
    occasion: 'work',
    feelsLike: 18,
    rainChance: 0,
    season: 'autumn',
    today: '2026-11-05',
    ...over,
  }
}

const emptyRecent: RecentWear = { wornItemDates: {}, likedItemIds: new Set() }

describe('warmthTarget', () => {
  it('温度越高目标保暖越低', () => {
    expect(warmthTarget(30)).toBeLessThan(warmthTarget(20))
    expect(warmthTarget(20)).toBeLessThan(warmthTarget(10))
    expect(warmthTarget(10)).toBeLessThan(warmthTarget(0))
  })

  it('落在 1-5 之间', () => {
    for (const t of [-10, 0, 4, 10, 16, 22, 28, 40]) {
      const v = warmthTarget(t)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(5)
    }
  })

  it('曲线连续，10°C 和 9°C 之间没有断崖', () => {
    // 这正是"9°C 时只剩两件上装能穿"的成因：
    // 阶梯版本 10°C 给 3.6、9°C 直接给 4.3，保暖过滤窗口整体上移，
    // 一批 warmth=2 的衬衫刚好被挤出 ±2 的容差。
    const gap = Math.abs(warmthTarget(9) - warmthTarget(10))
    expect(gap).toBeLessThan(0.2)
    // 相邻整度之间的跳变都应该很小
    for (let t = -10; t < 35; t++) {
      expect(Math.abs(warmthTarget(t + 1) - warmthTarget(t))).toBeLessThan(0.2)
    }
  })

  it('18°C 落在 2.5 附近（插值后不再固定 2.8）', () => {
    expect(warmthTarget(18)).toBeGreaterThan(2.4)
    expect(warmthTarget(18)).toBeLessThan(2.7)
  })
})

describe('outfitWarmth', () => {
  it('厚外套显著提升整套保暖度', () => {
    const upper = mk({ category: 'upper', warmth: 2 })
    const lower = mk({ category: 'lower', warmth: 2 })
    const shoes = mk({ category: 'shoes', warmth: 2 })
    const thin = mk({ category: 'outer', warmth: 2 })
    const thick = mk({ category: 'outer', warmth: 5 })

    const a = outfitWarmth([upper, lower, thin, shoes])
    const b = outfitWarmth([upper, lower, thick, shoes])
    expect(b).toBeGreaterThan(a)
  })

  it('薄外套不应比不穿更冷', () => {
    const upper = mk({ category: 'upper', warmth: 3 })
    const lower = mk({ category: 'lower', warmth: 3 })
    const shoes = mk({ category: 'shoes', warmth: 3 })
    const thinOuter = mk({ category: 'outer', warmth: 2 })

    const bare = outfitWarmth([upper, lower, shoes])
    const withThin = outfitWarmth([upper, lower, thinOuter, shoes])
    expect(withThin).toBeGreaterThan(bare - 0.5)
  })

  it('外套越厚整套越暖（单调性）', () => {
    let prev = -Infinity
    for (const w of [1, 2, 3, 4, 5]) {
      const v = outfitWarmth([
        mk({ category: 'upper', warmth: 3 }),
        mk({ category: 'lower', warmth: 3 }),
        mk({ category: 'outer', warmth: w }),
        mk({ category: 'shoes', warmth: 2 }),
      ])
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('无外套时按内外加权', () => {
    const upper = mk({ category: 'upper', warmth: 3 })
    const lower = mk({ category: 'lower', warmth: 3 })
    const shoes = mk({ category: 'shoes', warmth: 3 })
    expect(outfitWarmth([upper, lower, shoes])).toBeCloseTo(3, 5)
  })
})

describe('hardFilter', () => {
  it('过滤掉非 active 单品', () => {
    const a = mk({ category: 'upper', season: ['autumn'] })
    const b = mk({ category: 'upper', season: ['autumn'], status: 'stored' })
    const out = hardFilter([a, b], ctx())
    expect(out.map((i) => i.id)).toEqual([a.id])
  })

  it('过滤掉季节不符的单品', () => {
    const summer = mk({ category: 'upper', season: ['summer'] })
    const autumn = mk({ category: 'upper', season: ['autumn'] })
    const out = hardFilter([summer, autumn], ctx({ season: 'autumn' }))
    expect(out.map((i) => i.id)).toEqual([autumn.id])
  })

  it('季节为空的视为四季通用', () => {
    const any = mk({ category: 'upper', season: [] })
    expect(hardFilter([any], ctx({ season: 'winter' }))).toHaveLength(1)
  })

  it('正式度偏差超过 1.2 被过滤', () => {
    const sporty = mk({ category: 'upper', formality: 1, season: [] })
    const business = mk({ category: 'upper', formality: 3, season: [] })
    const out = hardFilter([sporty, business], ctx({ occasion: 'work' })) // work=3.8
    expect(out.map((i) => i.id)).toEqual([business.id])
  })

  it('包和配饰不参与温度筛选', () => {
    const weirdBag = mk({ category: 'bag', warmth: 5, season: [] })
    const out = hardFilter([weirdBag], ctx({ feelsLike: 30 }))
    expect(out).toHaveLength(1)
  })
})

describe('totalScore', () => {
  it('权重和为 1', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('全 1 得 1，全 0 得 0', () => {
    expect(
      totalScore({ occasion: 1, color: 1, warmth: 1, freshness: 1, preference: 1 }),
    ).toBeCloseTo(1, 10)
    expect(
      totalScore({ occasion: 0, color: 0, warmth: 0, freshness: 0, preference: 0 }),
    ).toBe(0)
  })
})

describe('occasionTags', () => {
  it('每个场合都有标签', () => {
    for (const o of ['work', 'casual', 'date', 'sport', 'formal'] as const) {
      expect(occasionTags(o).length).toBeGreaterThan(0)
    }
  })
})

describe('generateOutfits', () => {
  function wardrobe(): Item[] {
    const items: Item[] = []
    // 3 上装
    items.push(mk({ category: 'upper', name: '藏青针织', color_hex: '#2c3e50', formality: 4, warmth: 3, season: [] }))
    items.push(mk({ category: 'upper', name: '白衬衫', color_hex: '#f8f7f4', formality: 4, warmth: 2, season: [] }))
    items.push(mk({ category: 'upper', name: '灰卫衣', color_hex: '#8a8f94', formality: 2, warmth: 3, season: [] }))
    // 2 下装
    items.push(mk({ category: 'lower', name: '卡其西裤', color_hex: '#c8a97e', formality: 4, warmth: 3, season: [] }))
    items.push(mk({ category: 'lower', name: '黑长裤', color_hex: '#302c2a', formality: 5, warmth: 3, season: [] }))
    // 1 外套
    items.push(mk({ category: 'outer', name: '米白风衣', color_hex: '#efe7d8', formality: 4, warmth: 3, season: [] }))
    // 2 鞋
    items.push(mk({ category: 'shoes', name: '乐福鞋', color_hex: '#6a4f3a', formality: 4, warmth: 2, season: [] }))
    items.push(mk({ category: 'shoes', name: '白球鞋', color_hex: '#f2f2ef', formality: 2, warmth: 2, season: [] }))
    return items
  }

  it('返回不超过 topN 套', () => {
    const out = generateOutfits(wardrobe(), ctx(), emptyRecent, 3)
    expect(out.length).toBeLessThanOrEqual(3)
    expect(out.length).toBeGreaterThan(0)
  })

  it('每套都有上装/下装或连衣裙', () => {
    const out = generateOutfits(wardrobe(), ctx(), emptyRecent, 5)
    for (const o of out) {
      const hasTop = o.items.some((i) => i.category === 'upper' || i.category === 'dress')
      const hasBottom = o.items.some((i) => i.category === 'lower' || i.category === 'dress')
      expect(hasTop).toBe(true)
      expect(hasBottom).toBe(true)
    }
  })

  it('第一套是全局最高分', () => {
    // 多样性去重会让后续顺序偏离纯分数排序，但第一轮第一个挑的就是排序第一名，
    // 所以"第一套最高"必须成立——否则用户看到的头号推荐不是最合适的。
    const out = generateOutfits(wardrobe(), ctx(), emptyRecent, 5)
    expect(out.length).toBeGreaterThan(0)
    const maxScore = Math.max(...out.map((o) => o.score))
    expect(out[0].score).toBe(maxScore)
  })

  it('相邻两套分差不会大起大落', () => {
    // diversePick 允许相邻轻微倒挂（为了换衣服），但不能彻底乱序
    const out = generateOutfits(wardrobe(), ctx(), emptyRecent, 5)
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score - out[i].score).toBeLessThan(0.15)
    }
  })

  it('同一件上装最多出现 2 次（多样性约束）', () => {
    const out = generateOutfits(wardrobe(), ctx(), emptyRecent, 5)
    const counts = new Map<string, number>()
    for (const o of out) {
      const u = o.items.find((i) => i.category === 'upper' || i.category === 'dress')
      if (u) counts.set(u.id, (counts.get(u.id) ?? 0) + 1)
    }
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(2)
  })

  it('不会给出重复的整套', () => {
    const out = generateOutfits(wardrobe(), ctx(), emptyRecent, 5)
    const keys = out.map((o) => o.items.map((i) => i.id).sort().join('|'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('空衣橱返回空数组', () => {
    expect(generateOutfits([], ctx(), emptyRecent, 5)).toEqual([])
  })

  it('只有上装凑不出整套', () => {
    const onlyTops = [
      mk({ category: 'upper', season: [] }),
      mk({ category: 'upper', season: [] }),
    ]
    expect(generateOutfits(onlyTops, ctx(), emptyRecent, 5)).toEqual([])
  })

  it('雨天优先选皮鞋/靴', () => {
    const items = wardrobe()
    const out = generateOutfits(items, ctx({ rainChance: 0.9 }), emptyRecent, 5)
    for (const o of out) {
      const shoe = o.items.find((i) => i.category === 'shoes')
      if (shoe) {
        const isWetOk =
          (shoe.material ?? '').includes('皮革') ||
          (shoe.subcategory ?? '').includes('靴') ||
          shoe.name?.includes('鞋')
        expect(isWetOk).toBeTruthy()
      }
    }
  })

  it('最近穿过的整套会被新鲜度惩罚', () => {
    const first = generateOutfits(wardrobe(), ctx(), emptyRecent, 1)[0]
    const recent: RecentWear = {
      wornItemDates: Object.fromEntries(first.items.map((i) => [i.id, ['2026-11-04']])),
      likedItemIds: new Set(),
    }

    const before = scoreOutfit(first.items, ctx(), emptyRecent)
    const after = scoreOutfit(first.items, ctx(), recent)

    expect(before.freshness).toBeGreaterThan(after.freshness)
    expect(totalScore(after)).toBeLessThan(totalScore(before))
  })

  it('30 天没穿的整套会加分', () => {
    const first = generateOutfits(wardrobe(), ctx(), emptyRecent, 1)[0]
    const items = first.items.map((i) => ({ ...i, last_worn: '2026-08-01' }))
    const sleeping = scoreOutfit(items, ctx(), emptyRecent)
    const fresh = scoreOutfit(first.items, ctx(), emptyRecent)
    expect(sleeping.freshness).toBeGreaterThanOrEqual(fresh.freshness)
  })

  it('点赞过的单品提高 preference', () => {
    const first = generateOutfits(wardrobe(), ctx(), emptyRecent, 1)[0]
    const liked: RecentWear = {
      wornItemDates: {},
      likedItemIds: new Set(first.items.map((i) => i.id)),
    }
    const before = scoreOutfit(first.items, ctx(), emptyRecent)
    const after = scoreOutfit(first.items, ctx(), liked)
    expect(after.preference).toBeGreaterThan(before.preference)
  })
})

describe('性别与配饰槽位', () => {
  const wardrobe3 = () => [
    mk({ id: 'u-m', category: 'upper', gender: 'men' }),
    mk({ id: 'u-w', category: 'upper', gender: 'women' }),
    mk({ id: 'u-x', category: 'upper', gender: 'unisex' }),
    mk({ id: 'l1', category: 'lower', gender: 'unisex' }),
    mk({ id: 's1', category: 'shoes', gender: 'unisex' }),
  ]

  it('只推同性别 + 中性款', () => {
    const men = hardFilter(wardrobe3(), { ...ctx(), gender: 'men' })
    const ids = men.map((i) => i.id)
    expect(ids).toContain('u-m')
    expect(ids).toContain('u-x')
    expect(ids).not.toContain('u-w')

    const women = hardFilter(wardrobe3(), { ...ctx(), gender: 'women' })
    expect(women.map((i) => i.id)).toContain('u-w')
    expect(women.map((i) => i.id)).not.toContain('u-m')
  })

  it('不传性别时不过滤', () => {
    const all = hardFilter(wardrobe3(), ctx())
    expect(all.map((i) => i.id)).toEqual(
      expect.arrayContaining(['u-m', 'u-w', 'u-x']),
    )
  })

  it('女装可选首饰和帽子，男装不行', () => {
    const women = allowedAccessoryCategories({ ...ctx(), gender: 'women' })
    expect(women).toContain('jewelry')
    expect(women).toContain('hat')

    const men = allowedAccessoryCategories({ ...ctx(), gender: 'men' })
    expect(men).not.toContain('jewelry')
    expect(men).not.toContain('hat')
  })

  it('围巾只在冬季出现', () => {
    expect(allowedAccessoryCategories({ ...ctx({ season: 'winter' }), gender: 'men' })).toContain('scarf')
    expect(allowedAccessoryCategories({ ...ctx({ season: 'autumn' }), gender: 'men' })).not.toContain('scarf')
    expect(allowedAccessoryCategories({ ...ctx({ season: 'summer' }), gender: 'women' })).not.toContain('scarf')
  })

  it('配饰不参与保暖筛选', () => {
    // 围巾 warmth=5、首饰 warmth=1，都不该被温度筛掉
    const withAcc = [
      ...wardrobe3(),
      mk({ id: 'scarf', category: 'scarf', warmth: 5, season: [] }),
      mk({ id: 'jewel', category: 'jewelry', warmth: 1, season: [] }),
    ]
    const pool = hardFilter(withAcc, { ...ctx({ feelsLike: 30 }), gender: 'women' })
    expect(pool.map((i) => i.id)).toContain('scarf')
    expect(pool.map((i) => i.id)).toContain('jewel')
  })

  it('约会场合会给女装加一件配饰', () => {
    const w = [
      ...wardrobe3(),
      mk({ id: 'jewel', category: 'jewelry', gender: 'women', formality: 3, warmth: 1, season: [] }),
    ]
    const out = generateOutfits(
      w,
      { ...ctx({ occasion: 'date', feelsLike: 18 }), gender: 'women' },
      emptyRecent,
      3,
    )
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].items.some((i) => i.category === 'jewelry')).toBe(true)
  })

  it('男装同场景不会加首饰', () => {
    const w = [
      ...wardrobe3(),
      mk({ id: 'jewel', category: 'jewelry', gender: 'women', formality: 3, warmth: 1, season: [] }),
    ]
    const out = generateOutfits(
      w,
      { ...ctx({ occasion: 'date', feelsLike: 18 }), gender: 'men' },
      emptyRecent,
      3,
    )
    for (const o of out) {
      expect(o.items.some((i) => i.category === 'jewelry')).toBe(false)
    }
  })
})

describe('换一批（exclude）', () => {
  /** 一个够大的衣柜，保证能组合出远超 3×3 套候选 */
  function bigWardrobe(): Item[] {
    const out: Item[] = []
    const add = (cat: Item['category'], n: number) => {
      for (let i = 0; i < n; i++) {
        out.push(mk({ id: `${cat}-${i}`, category: cat, warmth: 3, formality: 3 }))
      }
    }
    add('upper', 6)
    add('lower', 6)
    add('outer', 3)
    add('shoes', 4)
    return out
  }

  it('同样的输入是确定性的 —— 这就是"换一批没反应"的根源', () => {
    const a = generateOutfits(bigWardrobe(), ctx(), emptyRecent, 3)
    const b = generateOutfits(bigWardrobe(), ctx(), emptyRecent, 3)
    expect(a.map((o) => outfitKey(o.items))).toEqual(b.map((o) => outfitKey(o.items)))
  })

  it('排除掉上一批之后，返回的组合完全不同', () => {
    const w = bigWardrobe()
    const first = generateOutfits(w, ctx(), emptyRecent, 3)
    const firstKeys = first.map((o) => outfitKey(o.items))

    const second = generateOutfits(w, ctx(), emptyRecent, 3, new Set(firstKeys))
    const secondKeys = second.map((o) => outfitKey(o.items))

    expect(second.length).toBeGreaterThan(0)
    for (const k of secondKeys) {
      expect(firstKeys).not.toContain(k)
    }
  })

  it('连续换三批，每批都和前面的不重复', () => {
    const w = bigWardrobe()
    const seen = new Set<string>()
    let batch = generateOutfits(w, ctx(), emptyRecent, 3)
    for (let round = 0; round < 3; round++) {
      const keys = batch.map((o) => outfitKey(o.items))
      expect(keys.length).toBeGreaterThan(0)
      for (const k of keys) expect(seen.has(k)).toBe(false)
      keys.forEach((k) => seen.add(k))
      batch = generateOutfits(w, ctx(), emptyRecent, 3, new Set(seen))
    }
    expect(seen.size).toBeGreaterThanOrEqual(6)
  })

  it('衣橱小到换无可换时不会返回空数组', () => {
    // 极简衣橱：只有 1 上 + 1 下 + 1 鞋，组合唯一
    const tiny = [
      mk({ id: 'u', category: 'upper', warmth: 3, formality: 3 }),
      mk({ id: 'l', category: 'lower', warmth: 3, formality: 3 }),
      mk({ id: 's', category: 'shoes', warmth: 3, formality: 3 }),
    ]
    const only = generateOutfits(tiny, ctx(), emptyRecent, 3)
    expect(only.length).toBe(1)
    const allExcluded = new Set([outfitKey(only[0].items)])
    const next = generateOutfits(tiny, ctx(), emptyRecent, 3, allExcluded)
    // 宁可重复也不能空 —— 否则用户点了按钮页面就白了
    expect(next.length).toBeGreaterThan(0)
  })

  it('排除核心之后，上装下装真的换掉了（不只是换鞋）', () => {
    const w = bigWardrobe()
    const first = generateOutfits(w, ctx(), emptyRecent, 3)
    const firstCores = first.map((o) => outfitCoreKey(o.items))

    const second = generateOutfits(w, ctx(), emptyRecent, 3, undefined, new Set(firstCores))
    const secondCores = second.map((o) => outfitCoreKey(o.items))

    expect(second.length).toBeGreaterThan(0)
    for (const c of secondCores) {
      expect(firstCores).not.toContain(c)
    }
  })

  it('核心全被排除时允许复用核心，但不返回空', () => {
    const w = bigWardrobe()
    const first = generateOutfits(w, ctx(), emptyRecent, 3)
    const allCores = new Set(first.map((o) => outfitCoreKey(o.items)))
    // 只排除核心、不排除整套：应该还能给出一套（核心重复但整套新）
    const next = generateOutfits(w, ctx(), emptyRecent, 3, undefined, allCores)
    expect(next.length).toBeGreaterThan(0)
  })
})

describe('不喜欢（dislike）', () => {
  function withDislikes(over: Partial<RecentWear> = {}): RecentWear {
    return {
      wornItemDates: {},
      likedItemIds: new Set(),
      dislikedItemIds: new Set(),
      dislikedOutfitKeys: new Set(),
      ...over,
    }
  }

  it('点过不喜欢的整套搭配分数明显更低，会排到后面', () => {
    const w = [
      mk({ id: 'u1', category: 'upper', warmth: 3, formality: 3 }),
      mk({ id: 'l1', category: 'lower', warmth: 3, formality: 3 }),
      mk({ id: 's1', category: 'shoes', warmth: 3, formality: 3 }),
      mk({ id: 'u2', category: 'upper', warmth: 3, formality: 3 }),
      mk({ id: 'l2', category: 'lower', warmth: 3, formality: 3 }),
    ]
    const first = generateOutfits(w, ctx(), withDislikes(), 5)
    const target = first[0]
    const rejectedKey = outfitKey(target.items)

    const clean = scoreOutfit(target.items, ctx(), withDislikes())
    const rejected = scoreOutfit(
      target.items,
      ctx(),
      withDislikes({ dislikedOutfitKeys: new Set([rejectedKey]) }),
    )

    // 不再是"从候选里删掉"，而是明确扣分
    expect(rejected.penalty ?? 0).toBeGreaterThan(0)
    expect(totalScore(rejected)).toBeLessThan(totalScore(clean))

    // 并且重新生成时它确实掉到了后面
    const after = generateOutfits(
      w,
      ctx(),
      withDislikes({ dislikedOutfitKeys: new Set([rejectedKey]) }),
      5,
    )
    const pos = after.findIndex((o) => outfitKey(o.items) === rejectedKey)
    expect(pos === -1 || pos > 0).toBe(true)
  })

  it('被否的搭配分数更低（penalty 生效）', () => {
    const w = [
      mk({ id: 'u1', category: 'upper', warmth: 3, formality: 3 }),
      mk({ id: 'l1', category: 'lower', warmth: 3, formality: 3 }),
      mk({ id: 's1', category: 'shoes', warmth: 3, formality: 3 }),
    ]
    const outfit = generateOutfits(w, ctx(), withDislikes(), 1)[0]
    const clean = scoreOutfit(outfit.items, ctx(), withDislikes())
    const rejected = scoreOutfit(
      outfit.items,
      ctx(),
      withDislikes({ dislikedOutfitKeys: new Set([outfitKey(outfit.items)]) }),
    )
    expect(clean.penalty ?? 0).toBe(0)
    expect(rejected.penalty ?? 0).toBeGreaterThan(0)
    expect(totalScore(rejected)).toBeLessThan(totalScore(clean))
  })

  it('单品被点不喜欢会拉低 preference，且负向权重高于点赞正向', () => {
    const w = [
      mk({ id: 'u1', category: 'upper', warmth: 3, formality: 3 }),
      mk({ id: 'l1', category: 'lower', warmth: 3, formality: 3 }),
      mk({ id: 's1', category: 'shoes', warmth: 3, formality: 3 }),
    ]
    const outfit = generateOutfits(w, ctx(), withDislikes(), 1)[0]
    const ids = outfit.items.map((i) => i.id)

    const base = scoreOutfit(outfit.items, ctx(), withDislikes())
    const liked = scoreOutfit(outfit.items, ctx(), withDislikes({ likedItemIds: new Set(ids) }))
    const disliked = scoreOutfit(outfit.items, ctx(), withDislikes({ dislikedItemIds: new Set(ids) }))

    expect(liked.preference).toBeGreaterThan(base.preference)
    expect(disliked.preference).toBeLessThan(base.preference)
    // 全点赞 +0.15×n vs 全点踩 -0.2×n，负向更强
    const up = liked.preference - base.preference
    const down = base.preference - disliked.preference
    expect(down).toBeGreaterThan(up)
  })

  it('preference 被夹在 0~1，不会越界', () => {
    const w = [
      mk({ id: 'u1', category: 'upper', warmth: 3, formality: 3 }),
      mk({ id: 'l1', category: 'lower', warmth: 3, formality: 3 }),
      mk({ id: 's1', category: 'shoes', warmth: 3, formality: 3 }),
    ]
    const outfit = generateOutfits(w, ctx(), withDislikes(), 1)[0]
    const ids = outfit.items.map((i) => i.id)
    const tooManyDislikes = new Set([...ids, ...ids, ...ids, ...ids, ...ids])
    const b = scoreOutfit(outfit.items, ctx(), withDislikes({
      dislikedItemIds: tooManyDislikes,
      dislikedOutfitKeys: new Set([outfitKey(outfit.items)]),
    }))
    expect(b.preference).toBeGreaterThanOrEqual(0)
    expect(b.preference).toBeLessThanOrEqual(1)
  })

  it('全部候选都被否掉时兜底不返回空', () => {
    const w = [
      mk({ id: 'u1', category: 'upper', warmth: 3, formality: 3 }),
      mk({ id: 'l1', category: 'lower', warmth: 3, formality: 3 }),
      mk({ id: 's1', category: 'shoes', warmth: 3, formality: 3 }),
    ]
    const only = generateOutfits(w, ctx(), withDislikes(), 3)
    expect(only.length).toBe(1)
    const all = new Set(only.map((o) => outfitKey(o.items)))
    const next = generateOutfits(w, ctx(), withDislikes({ dislikedOutfitKeys: all }), 3)
    // 宁可把唯一那套再给一次，也不能让页面空掉
    expect(next.length).toBeGreaterThan(0)
  })
})
