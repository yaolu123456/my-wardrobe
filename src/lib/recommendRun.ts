import { generateOutfits, warmthTarget, type RankedOutfit, type RecentWear } from './recommend'
import { autoTitle } from './llm'
import { buildReason } from './reason'
import type { Item, Occasion, RecommendContext, Season } from './types'

/**
 * 推荐流程的编排层 —— 不含任何环境依赖，Web API 路由和 APK 客户端共用同一份。
 *
 * 之所以抽出来：原来这套逻辑写在 `src/app/api/recommend/route.ts` 里，
 * 打包成 APK 时静态导出不支持 Route Handler，逻辑就跟着丢了。
 * 抽到这里之后，两边的行为完全一致，只有"谁来润色理由"不一样：
 *   - 服务端：调大模型（有 API key）
 *   - 客户端：用模板（没 key，也不该把 key 打进 APK）
 */

export interface RecommendInput {
  items: Item[]
  recent: {
    wornItemDates: Record<string, string[]>
    likedItemIds: string[] | Set<string>
    dislikedItemIds?: string[] | Set<string>
    dislikedOutfitKeys?: string[] | Set<string>
    likedOutfitKeys?: string[] | Set<string>
  }
  context: RecommendContext
  /** 「换一批」时回传已展示过的整套 key */
  exclude?: string[]
  /** 已展示过的核心（上+下）key，避免只换了双鞋 */
  excludeCores?: string[]
}

export interface RecommendOutput {
  cold: boolean
  message?: string
  source: 'llm' | 'template'
  warmthTarget: number
  exhausted: boolean
  outfits: {
    title: string
    reason: string
    items: Item[]
    score: number
  }[]
}

/** 润色器：把规则排序结果变成最终 3 套 + 理由 */
export type Refiner = (
  ranked: RankedOutfit[],
  ctx: RecommendContext,
) => Promise<{ outfits: { items: Item[]; title: string; reason: string }[]; source: 'llm' | 'template' }>

/** 默认润色：纯模板，不联网。APK 离线时走这条。 */
export const templateRefiner: Refiner = async (ranked, ctx) => ({
  source: 'template',
  outfits: ranked.slice(0, 3).map((c, i) => ({
    items: c.items,
    title: autoTitle(c.items, ctx, i),
    reason: buildReason(c.items, ctx, c.breakdown),
  })),
})

const toSet = (v: string[] | Set<string> | undefined): Set<string> =>
  new Set(Array.isArray(v) ? v : Array.from(v ?? []))

export async function runRecommend(
  input: RecommendInput,
  refine: Refiner = templateRefiner,
): Promise<RecommendOutput> {
  const { items, context } = input
  const wt = warmthTarget(context.feelsLike)

  const recent: RecentWear = {
    wornItemDates: input.recent?.wornItemDates ?? {},
    likedItemIds: toSet(input.recent?.likedItemIds),
    dislikedItemIds: toSet(input.recent?.dislikedItemIds),
    dislikedOutfitKeys: toSet(input.recent?.dislikedOutfitKeys),
    likedOutfitKeys: toSet(input.recent?.likedOutfitKeys),
  }

  // 冷启动保护：少于 15 件时不要硬凑整套
  const active = items.filter((i) => i.status === 'active')
  if (active.length < 15) {
    return {
      cold: true,
      message: `衣橱只有 ${active.length} 件，先录到 15 件再给你整套搭配会更靠谱。`,
      source: 'template',
      warmthTarget: wt,
      exhausted: false,
      outfits: [],
    }
  }

  const ctx: RecommendContext = { ...context }
  const exclude = input.exclude?.length ? new Set(input.exclude) : undefined
  const excludeCores = input.excludeCores?.length ? new Set(input.excludeCores) : undefined
  const ranked = generateOutfits(items, ctx, recent, 5, exclude, excludeCores)

  // 有排除条件时算一遍总候选量，让前端知道"换一批"还能换几轮
  const totalCandidates = exclude
    ? generateOutfits(items, ctx, recent, 1000).length
    : undefined

  if (ranked.length === 0) {
    return {
      cold: false,
      message: '今天这个温度/场合下没有能凑成整套的单品，试试放宽场合或补几件基础款。',
      source: 'template',
      warmthTarget: wt,
      exhausted: false,
      outfits: [],
    }
  }

  let result: Awaited<ReturnType<Refiner>>
  try {
    result = await refine(ranked, ctx)
  } catch {
    // 润色挂了也得出结果，推荐功能不能因为大模型不可用就整条断掉
    result = await templateRefiner(ranked, ctx)
  }

  return {
    cold: false,
    source: result.source,
    warmthTarget: wt,
    exhausted: typeof totalCandidates === 'number' && exclude
      ? exclude.size >= totalCandidates
      : false,
    outfits: result.outfits.map((o, i) => ({
      title: o.title,
      reason: o.reason,
      items: o.items,
      score: ranked[i]?.score ?? ranked[0].score,
    })),
  }
}

/** 从 URL query 里解析推荐上下文，客户端和 API 都用得着 */
export function buildContext(p: {
  occasion: Occasion
  feelsLike: number
  rainChance: number
  season: Season
  today: string
  gender?: RecommendContext['gender']
}): RecommendContext {
  return {
    occasion: p.occasion,
    feelsLike: p.feelsLike,
    rainChance: p.rainChance,
    season: p.season,
    today: p.today,
    ...(p.gender ? { gender: p.gender } : {}),
  }
}
