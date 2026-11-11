import type { Category, Fit, Pattern, Season } from './types'

/**
 * 视觉打标：照片 → 结构化属性。
 * prompt 与 JSON 清洗都能单测，不依赖网络。
 */

export interface ItemTags {
  category: Category
  subcategory: string
  color_name: string
  color_hex: string
  secondary_colors: string[]
  pattern: Pattern
  material: string
  style_tags: string[]
  season: Season[]
  formality: number
  warmth: number
  fit: Fit
  confidence: number
}

export function buildTagPrompt(): string {
  return (
    '你是一个服装属性标注器。看这张衣服照片，输出严格 JSON，' +
    '不要任何解释，不要 markdown 代码块。\n\n' +
    '{\n' +
    '  "category": "upper|lower|outer|dress|shoes|bag|accessory",\n' +
    '  "subcategory": "中文，如 针织衫/西裤/乐福鞋",\n' +
    '  "color_name": "中文色名，如 藏青/燕麦色",\n' +
    '  "color_hex": "#RRGGBB，取占面积最大的主色",\n' +
    '  "secondary_colors": ["#RRGGBB"],\n' +
    '  "pattern": "solid|stripe|check|floral|graphic|other",\n' +
    '  "material": "棉|羊毛|真丝|牛仔|皮革|化纤|针织",\n' +
    '  "style_tags": ["从 通勤/休闲/运动/复古/极简/法式/街头 中选1-3个"],\n' +
    '  "season": ["spring","summer","autumn","winter"],\n' +
    '  "formality": "1-5 的整数，1=运动居家 2=休闲 3=日常通勤 4=商务 5=正式",\n' +
    '  "warmth": "1-5 的整数，1=极薄 2=薄 3=中等 4=厚 5=极厚",\n' +
    '  "fit": "slim|regular|loose",\n' +
    '  "confidence": "0.0-1.0"\n' +
    '}\n\n' +
    '如果照片里有多件衣服，只标注最显眼的那一件。'
  )
}

const CATEGORIES: Category[] = ['upper', 'lower', 'outer', 'dress', 'shoes', 'bag', 'accessory']
const PATTERNS: Pattern[] = ['solid', 'stripe', 'check', 'floral', 'graphic', 'other']
const FITS: Fit[] = ['slim', 'regular', 'loose']
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * 解析并清洗模型输出。模型最常见的三种坏输出：
 * 套代码块 / 字段越界 / 颜色不是 6 位 hex。
 * 能修的修掉，修不掉的丢字段而不是整条失败。
 */
export function parseTagJson(text: string): ItemTags | null {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  let obj: Record<string, unknown> | null = null
  try {
    obj = JSON.parse(cleaned)
  } catch {
    const s = cleaned.indexOf('{')
    const e = cleaned.lastIndexOf('}')
    if (s >= 0 && e > s) {
      try {
        obj = JSON.parse(cleaned.slice(s, e + 1))
      } catch {
        return null
      }
    }
  }
  if (!obj) return null

  const category = CATEGORIES.includes(obj.category as Category)
    ? (obj.category as Category)
    : 'upper'
  const pattern = PATTERNS.includes(obj.pattern as Pattern)
    ? (obj.pattern as Pattern)
    : 'solid'
  const fit = FITS.includes(obj.fit as Fit) ? (obj.fit as Fit) : 'regular'

  const season = Array.isArray(obj.season)
    ? (obj.season.filter((s) => SEASONS.includes(s as Season)) as Season[])
    : []

  const secondary = Array.isArray(obj.secondary_colors)
    ? (obj.secondary_colors.map(normalizeHex).filter(Boolean) as string[]).slice(0, 2)
    : []

  const styleTags = Array.isArray(obj.style_tags)
    ? obj.style_tags.filter((s): s is string => typeof s === 'string').slice(0, 3)
    : []

  return {
    category,
    subcategory: str(obj.subcategory) ?? '',
    color_name: str(obj.color_name) ?? '',
    color_hex: normalizeHex(obj.color_hex) ?? '#888888',
    secondary_colors: secondary,
    pattern,
    material: str(obj.material) ?? '',
    style_tags: styleTags,
    season: season.length > 0 ? season : ['spring', 'autumn'],
    formality: clampInt(obj.formality, 1, 5, 3),
    warmth: clampInt(obj.warmth, 1, 5, 3),
    fit,
    confidence: clampNum(obj.confidence, 0, 1, 0.5),
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (!s.startsWith('#')) s = '#' + s
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s.slice(1).split('').map((c) => c + c).join('')
  }
  return HEX.test(s) ? s.toUpperCase() : null
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}
