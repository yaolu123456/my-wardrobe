import type { Item, RecommendContext, ScoreBreakdown } from './types'
import { colorHarmony } from './color'
import { OCCASION_FORMALITY } from './occasion'
import { isAccessory } from './display'

/**
 * 推荐引擎。纯函数，不碰网络和 DB，可单测。
 *
 * 三层：
 *   ① 硬过滤（季节 / 温度 / 正式度 / 状态）
 *   ② 组合枚举 + 打分
 *   ③ 返回 Top N（LLM 精排在 llm.ts）
 */

/**
 * 体感温度 → 目标 warmth（见方案 §7.4）
 *
 * 用分段线性插值，不是阶梯。阶梯版本的坑很明显：
 * `>=10 → 3.6` 和 `>=4 → 4.3` 之间是个断崖，9°C 直接按 4.3 算，
 * 保暖过滤变成 |warmth − 4.3| ≤ 2，一大批 warmth=2 的衬衫当场出局。
 * 用户看到的现象是"今天怎么只有两件衣服能穿"，其实是曲线在这里断了一档。
 */
export function warmthTarget(feelsLike: number): number {
  // [温度, 目标保暖]，从暖到冷
  const anchors: readonly (readonly [number, number])[] = [
    [28, 1.5],
    [22, 2.0],
    [16, 2.8],
    [10, 3.6],
    [4, 4.3],
    [0, 5.0],
  ]

  const warmest = anchors[0]
  if (feelsLike >= warmest[0]) return warmest[1]

  for (let i = 0; i < anchors.length - 1; i++) {
    const [tWarm, wWarm] = anchors[i]
    const [tCold, wCold] = anchors[i + 1]
    if (feelsLike >= tCold) {
      // 在 tCold..tWarm 之间按比例过渡
      const ratio = (feelsLike - tCold) / (tWarm - tCold)
      return wCold + ratio * (wWarm - wCold)
    }
  }

  return anchors[anchors.length - 1][1]
}

/**
 * 整套 warmth：外套把整体"拉向"自己的厚度，而不是简单相加。
 * 早先写成相加，结果是"穿薄外套比不穿还冷"——17°C 时算法会拒绝风衣，
 * 这是明显错误的。改成插值后，薄外套几乎不改变体感，厚外套才会显著加热。
 */
export function outfitWarmth(items: Item[]): number {
  const get = (cat: Item['category'], fallback = 0) => {
    const hit = items.find((i) => i.category === cat)
    return hit ? hit.warmth : fallback
  }
  const inner = 0.45 * get('upper') + 0.45 * get('lower') + 0.1 * get('shoes', 2)
  const outer = items.find((i) => i.category === 'outer')
  if (!outer) return inner
  // 0.45 是"外套影响力"：1 表示完全由外套决定，0 表示外套无影响
  return inner + 0.45 * (outer.warmth - inner)
}

const DAY_MS = 86_400_000

function daysSince(dateStr: string | null, today: string): number | null {
  if (!dateStr) return null
  const a = Date.parse(`${dateStr}T00:00:00`)
  const b = Date.parse(`${today}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / DAY_MS)
}

export interface RecentWear {
  /** 单品 id → 最近出现过的日期列表 */
  wornItemDates: Record<string, string[]>
  /** 近期被点赞过的单品 */
  likedItemIds: Set<string>
  /**
   * 被点过「不喜欢」的单品。
   * 卡片上的 ♡ 本来只记到数据库，下次推荐读不回来，等于白点 —— 现在进打分了。
   */
  dislikedItemIds?: Set<string>
  /**
   * 被点过「不喜欢」的整套搭配（见 outfitKey）。
   * 同一套组合不该反复出现在你面前，所以这套会被压分。
   */
  dislikedOutfitKeys?: Set<string>
  /**
   * 被收藏（♡）的整套搭配。
   * 和 dislikedOutfitKeys 对称：一个是扣分，一个是加分。
   */
  likedOutfitKeys?: Set<string>
}

/** ① 硬过滤 */
export function hardFilter(items: Item[], ctx: RecommendContext): Item[] {
  const target = warmthTarget(ctx.feelsLike)
  const targetFormality = OCCASION_FORMALITY[ctx.occasion]

  return items.filter((it) => {
    if (it.status !== 'active') return false
    // 性别：只看自己的 + 中性款。不传 gender 就不过滤（示例模式 / 老数据）
    if (ctx.gender && it.gender && it.gender !== 'unisex' && it.gender !== ctx.gender) {
      return false
    }
    // 季节：允许"四季"单品；season 为空视为通用
    if (it.season.length > 0 && !it.season.includes(ctx.season)) return false
    // 正式度 ±1.2
    if (Math.abs(it.formality - targetFormality) > 1.2) return false
    // 保暖度 ±2（配饰不参与温度筛选）
    if (!isAccessory(it.category)) {
      if (Math.abs(it.warmth - target) > 2) return false
    }
    return true
  })
}

function recentlyWornWithin(
  id: string,
  recent: RecentWear,
  today: string,
  days: number,
): boolean {
  const dates = recent.wornItemDates[id] ?? []
  return dates.some((d) => {
    const gap = daysSince(d, today)
    return gap !== null && gap >= 0 && gap <= days
  })
}

/** ② 打分：五项加权 */
export function scoreOutfit(
  items: Item[],
  ctx: RecommendContext,
  recent: RecentWear,
): ScoreBreakdown {
  const targetFormality = OCCASION_FORMALITY[ctx.occasion]

  // --- 场合匹配 ---
  const avgFormality = items.reduce((s, i) => s + i.formality, 0) / Math.max(items.length, 1)
  const formalityScore = 1 - Math.min(Math.abs(avgFormality - targetFormality) / 4, 1)

  const wantTags = occasionTags(ctx.occasion)
  const tagHits = items.filter((i) => i.style_tags.some((t) => wantTags.includes(t))).length
  const tagScore = tagHits / Math.max(items.length, 1)
  const occasionScore = 0.5 * formalityScore + 0.5 * tagScore

  // --- 颜色和谐（配饰算点缀，不算主色） ---
  const colorScore = colorHarmony(
    items.map((i) => ({
      hex: i.color_hex,
      role: isAccessory(i.category) ? ('accent' as const) : ('garment' as const),
      pattern: i.pattern !== 'solid' ? i.pattern : undefined,
    })),
  )

  // --- 温度匹配 ---
  const w = outfitWarmth(items)
  const warmthScore = 1 - Math.min(Math.abs(w - warmthTarget(ctx.feelsLike)) / 4, 1)

  // --- 新鲜度 ---
  let freshness = 0.75
  if (items.some((i) => recentlyWornWithin(i.id, recent, ctx.today, 3))) {
    freshness -= 0.3
  }
  if (items.every((i) => recentlyWornWithin(i.id, recent, ctx.today, 14))) {
    freshness -= 0.2
  }
  const allSleeping = items.every((i) => {
    const gap = daysSince(i.last_worn, ctx.today)
    return gap === null || gap >= 30
  })
  if (allSleeping) freshness += 0.2
  freshness = Math.max(0, Math.min(1, freshness))

  // --- 个人偏好：点赞加分，点过「不喜欢」的减分 ---
  const likes = items.filter((i) => recent.likedItemIds.has(i.id)).length
  const dislikes = items.filter((i) => recent.dislikedItemIds?.has(i.id)).length
  // 点赞每件 +0.15；不喜欢每件 -0.2 —— 负向比正向重，
  // 因为"点♡"是明确的否定动作，比"没点过赞"信息量大得多。
  let preference = 0.5 + likes * 0.15 - dislikes * 0.2
  // 整套被收藏过：这是比"单品被点赞"更强的正面信号
  if (recent.likedOutfitKeys?.has(outfitKey(items))) preference += 0.25
  preference = Math.max(0, Math.min(1, preference))

  // --- 扣分：明确否决过的整套搭配 ---
  // 不打成"排除"，而是让它分数掉下去：衣橱小的时候仍可能兜底出现，
  // 但只要候选够，它一定排在后面。这比一刀切更符合「打分」的语义，
  // 也避免了"点了几下✕就没衣服可穿"。
  const rejected = recent.dislikedOutfitKeys?.has(outfitKey(items)) ?? false
  const penalty = rejected ? 0.25 : 0

  return {
    occasion: occasionScore,
    color: colorScore,
    warmth: warmthScore,
    freshness,
    preference,
    penalty,
  }
}

export const WEIGHTS = {
  occasion: 0.3,
  color: 0.25,
  warmth: 0.2,
  freshness: 0.15,
  preference: 0.1,
} as const

export function totalScore(b: ScoreBreakdown): number {
  const base =
    b.occasion * WEIGHTS.occasion +
    b.color * WEIGHTS.color +
    b.warmth * WEIGHTS.warmth +
    b.freshness * WEIGHTS.freshness +
    b.preference * WEIGHTS.preference
  // 扣分在加权之后直接减，保证"点了不喜欢"一定反映在总分上
  return base - (b.penalty ?? 0)
}

/** 场合 → 期望的风格标签 */
export function occasionTags(o: string): string[] {
  switch (o) {
    case 'work':
      return ['通勤', '极简', '商务']
    case 'casual':
      return ['休闲', '街头', '运动']
    case 'date':
      return ['约会', '法式', '复古']
    case 'sport':
      return ['运动']
    case 'formal':
      return ['商务', '正式', '通勤']
    default:
      return []
  }
}

export interface RankedOutfit {
  items: Item[]
  score: number
  breakdown: ScoreBreakdown
}

/**
 * ③ 枚举所有可行组合并打分排序。
 * 组合规模：上装 8 × 下装 6 × 外套(含"不穿") 5 × 鞋 4 ≈ 960，毫秒级。
 *
 * `exclude` 收的是"上一批已经展示过的组合 key"（见 outfitKey）。
 * 「换一批」就是靠它拿到与当前三套不同的结果 —— 打分本身是确定性的，
 * 不打这个补丁，同样的输入永远返回同样的三套，按钮看起来像没反应。
 */
export function generateOutfits(
  allItems: Item[],
  ctx: RecommendContext,
  recent: RecentWear,
  topN = 5,
  exclude?: ReadonlySet<string>,
  excludeCores?: ReadonlySet<string>,
): RankedOutfit[] {
  const pool = hardFilter(allItems, ctx)
  const byCat = (c: Item['category']) => pool.filter((i) => i.category === c)

  const uppers = byCat('upper')
  const lowers = byCat('lower')
  const outers = byCat('outer')
  const shoes = byCat('shoes')
  const dresses = byCat('dress')
  const accessories = pool.filter((i) => isAccessory(i.category))

  const results: RankedOutfit[] = []

  const rain = ctx.rainChance > 0.5
  const wetOk = (s: Item) => {
    const hay = `${s.material ?? ''}${s.subcategory ?? ''}${s.name ?? ''}`
    return ['皮革', '防水', '靴', '雨'].some((k) => hay.includes(k))
  }
  const rainShoes = rain ? shoes.filter(wetOk) : shoes
  const usableShoes: (Item | null)[] = rainShoes.length > 0 ? rainShoes : shoes.length > 0 ? shoes : [null]
  const outerOpts: (Item | null)[] = [null, ...outers]

  const push = (items: Item[]) => {
    if (!items.some((i) => i.category === 'upper' || i.category === 'dress')) return
    if (!items.some((i) => i.category === 'lower' || i.category === 'dress')) return
    const breakdown = scoreOutfit(items, ctx, recent)
    results.push({ items, score: totalScore(breakdown), breakdown })
  }

  const acc = bestAccessory(accessories, ctx)

  // 裙装路线
  for (const d of dresses) {
    for (const o of outerOpts) {
      for (const s of usableShoes) {
        push(compact([d, o, s, acc]))
      }
    }
  }

  // 上下装路线
  for (const u of uppers) {
    for (const l of lowers) {
      for (const o of outerOpts) {
        for (const s of usableShoes) {
          push(compact([u, l, o, s, acc]))
        }
      }
    }
  }

  // 被点过「不喜欢」的搭配不剔除，只靠 scoreOutfit 里的 penalty 压分。
  // 这是刻意的：衣橱小的时候硬排除会把候选筛空（页面变白），
  // 而"打分排后"既尊重了用户的选择，又保留了兜底能力。
  results.sort((a, b) => b.score - a.score)
  return diversePick(results, topN, exclude, excludeCores)
}

/** 一套搭配的稳定标识，用于"换一批"时排除已展示过的组合。 */
export function outfitKey(items: Item[]): string {
  return items
    .map((i) => i.id)
    .sort()
    .join('|')
}

/**
 * 搭配的"核心" = 上装 + 下装（或连衣裙）。
 *
 * 只排除整套是不够的：候选里得分最高的往往还是同样三组上装下装、
 * 只是换了双鞋，「换一批」看起来就像没换。用核心 key 才能让每次真的换衣服。
 */
export function outfitCoreKey(items: Item[]): string {
  return items
    .filter((i) => i.category === 'upper' || i.category === 'lower' || i.category === 'dress')
    .map((i) => i.id)
    .sort()
    .join('+')
}

/**
 * 配饰槽位：一套搭配最多带一件配饰，且候选按性别和季节收窄。
 *
 * 规则（都可选，没有就不加）：
 *   - 包：任何场合都可能加
 *   - 首饰、帽子：仅女装
 *   - 围巾：仅冬季
 *   - 其他配饰：任何场合
 *
 * 加不加还看场合：正式/约会才主动加，日常加了反而分散注意力。
 */
export function allowedAccessoryCategories(ctx: RecommendContext): Item['category'][] {
  const out: Item['category'][] = ['bag', 'accessory']
  if (ctx.gender === 'women' || ctx.gender === undefined) {
    // 不传性别时不做限制，方便示例模式展示全部
    out.push('jewelry', 'hat')
  }
  if (ctx.season === 'winter') out.push('scarf')
  return out
}

function bestAccessory(accessories: Item[], ctx: RecommendContext): Item | null {
  if (!accessories.length) return null
  // 只有正式/约会场合才主动加配饰，日常过装饰反而扣分
  if (ctx.occasion !== 'formal' && ctx.occasion !== 'date') return null

  const allowed = allowedAccessoryCategories(ctx)
  const pool = accessories.filter((a) => allowed.includes(a.category))
  if (!pool.length) return null

  // 优先挑没怎么戴过的，其次挑正式度贴合场合的
  return pool.slice().sort((a, b) => {
    const wornDiff = a.times_worn - b.times_worn
    if (wornDiff !== 0) return wornDiff
    const t = OCCASION_FORMALITY[ctx.occasion]
    return Math.abs(a.formality - t) - Math.abs(b.formality - t)
  })[0]
}

function compact<T>(arr: (T | null)[]): T[] {
  return arr.filter((x): x is T => x !== null)
}

/**
 * 多样性：Top3 里如果三套都是"同一件上装 + 同一条裤子，只换了外套"，
 * 用户会觉得它在偷懒。所以按"核心对（上装+下装）"先去重，
 * 凑不满再逐步放宽。
 */
function diversePick(
  list: RankedOutfit[],
  n: number,
  exclude?: ReadonlySet<string>,
  excludeCores?: ReadonlySet<string>,
): RankedOutfit[] {
  const picked: RankedOutfit[] = []
  const seenOutfit = new Set<string>()
  const seenCore = new Set<string>()
  const seenUpper = new Set<string>()
  const seenShoe = new Set<string>()
  const seenLower = new Set<string>()
  const seenOuter = new Set<string>()

  const coreOf = (o: RankedOutfit) => outfitCoreKey(o.items)

  const keyOf = (o: RankedOutfit) => outfitKey(o.items)

  const upperOf = (o: RankedOutfit) =>
    o.items.find((i) => i.category === 'upper' || i.category === 'dress')?.id ?? ''
  const shoeOf = (o: RankedOutfit) => o.items.find((i) => i.category === 'shoes')?.id ?? ''
  const lowerOf = (o: RankedOutfit) => o.items.find((i) => i.category === 'lower')?.id ?? ''

  const take = (
    filter: (o: RankedOutfit) => boolean,
    opts: { ignoreExclude?: boolean; ignoreCore?: boolean } = {},
  ) => {
    for (const cand of list) {
      if (picked.length >= n) return
      const k = keyOf(cand)
      const c = coreOf(cand)
      if (seenOutfit.has(k)) continue
      if (!opts.ignoreExclude && exclude?.has(k)) continue
      // 核心检查管两头：本批内不许重样，历史批次用过的也不许再来
      if (!opts.ignoreCore && (seenCore.has(c) || excludeCores?.has(c))) continue
      if (!filter(cand)) continue

      seenOutfit.add(k)
      seenCore.add(c)
      seenUpper.add(upperOf(cand))
      seenShoe.add(shoeOf(cand))
      seenLower.add(lowerOf(cand))
      seenOuter.add(outerOf(cand))
      picked.push(cand)
    }
  }

  const outerOf = (o: RankedOutfit) => o.items.find((i) => i.category === 'outer')?.id ?? ''

  // 第一轮：上装、下装、外套、鞋全都换 —— 三套只差一件上衣的话，
  // 用户会觉得"还是那几件"，哪怕核心确实不同。
  take(
    (o) =>
      !seenUpper.has(upperOf(o)) &&
      !seenLower.has(lowerOf(o)) &&
      !seenOuter.has(outerOf(o)) &&
      !seenShoe.has(shoeOf(o)),
  )

  // 第二轮：允许外套或鞋复用，但上装下装都换（衣橱里外套/鞋通常就那几件）
  if (picked.length < n) {
    take((o) => !seenUpper.has(upperOf(o)) && !seenLower.has(lowerOf(o)))
  }

  // 第三轮起逐步放宽：衣橱小时（比如上装就 2 件），上面几轮很快就凑不满。
  // 放宽到"上装或下装至少换一个"，但仍然要求核心（上+下）不重复 ——
  // 否则同一条裤子配两件不同上衣会被算作两套，用户看着还是重样。
  if (picked.length < n) {
    take(
      (o) => !seenUpper.has(upperOf(o)) || !seenLower.has(lowerOf(o)),
    )
  }
  if (picked.length < n) take(() => true)

  // 核心候选被历史批次用光了：这时允许复用核心，但至少整套是新的
  if (picked.length < n) {
    take(() => true, { ignoreCore: true })
  }

  // 整套也用光了（衣橱太小 / 已经换了很多轮）。
  // 宁可返回重复的一套，也不能返回空 —— 否则用户点了「换一批」页面直接变白。
  if (picked.length === 0) {
    take(() => true, { ignoreExclude: true, ignoreCore: true })
  }

  return picked
}
