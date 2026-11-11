import type { Item, RecommendContext, ScoreBreakdown } from './types'
import { hexToHsl, isNeutral } from './color'
import { OCCASION_LABEL } from './occasion'

/**
 * 模板写理由。没接 LLM 也能用 —— 理由比"这套好看"具体一点就够了。
 * 接上 LLM 后，这里作为兜底与降级路径。
 */
export function buildReason(
  items: Item[],
  ctx: RecommendContext,
  b: ScoreBreakdown,
): string {
  const parts: string[] = []

  // 颜色这一句最重要，先说
  const names = items
    .filter((i) => i.category !== 'bag' && i.category !== 'accessory')
    .map((i) => i.color_name ?? colorLabel(i.color_hex))
    .filter(Boolean)

  if (b.color >= 0.85) {
    parts.push(`${names.slice(0, 2).join(' + ')} 是低对比中性配，不会出错`)
  } else if (b.color >= 0.75) {
    parts.push(`${names.slice(0, 2).join(' 配 ')}，同一色系里有明度差`)
  } else if (b.color >= 0.6) {
    parts.push(`${names.slice(0, 2).join(' 和 ')} 撞色但面积克制`)
  } else {
    parts.push('这套颜色偏跳，值得试一次')
  }

  // 温度
  const t = Math.round(ctx.feelsLike)
  if (b.warmth >= 0.8) {
    parts.push(`体感 ${t}°C 穿这套厚度刚好`)
  } else if (b.warmth >= 0.6) {
    parts.push(`体感 ${t}°C，室内外都能扛`)
  } else {
    parts.push(`体感 ${t}°C 可能偏${b.warmth < 0.5 ? '冷' : '热'}`)
  }

  // 新鲜度：唤醒沉睡单品是这句话最值钱的部分
  const sleeping = items.filter((i) => {
    if (!i.last_worn) return true
    const gap =
      (Date.parse(`${ctx.today}T00:00:00`) - Date.parse(`${i.last_worn}T00:00:00`)) /
      86_400_000
    return gap >= 30
  })
  if (sleeping.length > 0) {
    const nm = sleeping[0].name ?? sleeping[0].subcategory ?? '这件'
    parts.push(`${nm} 已经 30 天没穿了，让它出来透气`)
  } else if (b.freshness < 0.5) {
    parts.push('最近刚穿过类似的，今天换换口味')
  }

  parts.push(`${OCCASION_LABEL[ctx.occasion]}场合够用`)

  return `${parts.join('；')}。`
}

/** 没有配色表时的兜底色名。顺序很重要：先判中性，再判彩色。 */
export function colorLabel(hex: string): string {
  const { h, s, l } = hexToHsl(hex)

  // 藏青单独判，别被"深灰"截胡
  if (h >= 195 && h <= 255 && s >= 0.15 && l <= 0.45) return '藏青'

  if (isNeutral(hex)) {
    if (l >= 0.88) return '米白'
    if (l >= 0.7) return '浅灰'
    if (l <= 0.2) return '黑'
    return '灰'
  }

  if (s <= 0.35) return l >= 0.6 ? '浅灰' : '深灰'
  if (h < 15 || h >= 345) return l >= 0.6 ? '粉' : '酒红'
  if (h < 45) return l >= 0.6 ? '驼' : '棕'
  if (h < 70) return l >= 0.6 ? '卡其' : '橄榄'
  if (h < 160) return l >= 0.6 ? '浅绿' : '墨绿'
  if (h < 200) return '青'
  if (h < 250) return l >= 0.6 ? '浅蓝' : '深蓝'
  if (h < 290) return '紫'
  return '玫红'
}
