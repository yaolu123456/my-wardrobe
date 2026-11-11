/**
 * 颜色和谐。这是推荐效果的关键：90% 的观感由这一条决定。
 * 全部用 HSL 计算，不用 RGB —— RGB 上算色差会得到反直觉的结果。
 */

export interface Hsl {
  h: number // 0-360
  s: number // 0-1
  l: number // 0-1
}

export function hexToHsl(hex: string): Hsl {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return { h: 0, s: 0, l }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let hue: number
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6

  return { h: hue * 360, s, l }
}

/**
 * 判断是否"中性色"：黑/白/灰，米/驼/卡其这类低饱和暖色，以及藏青。
 * 藏青在搭配直觉里就是一个"万能深色"，把它当中性色计算，出片率明显更高。
 */
export function isNeutral(hex: string): boolean {
  const { h, s, l } = hexToHsl(hex)
  // 黑白
  if (l <= 0.14 || l >= 0.9) return true
  // 灰阶（真正的灰 s 接近 0）
  if (s <= 0.14) return true
  // 米 / 驼 / 卡其 / 燕麦：低饱和暖色
  if (h >= 20 && h <= 55 && s <= 0.45 && l >= 0.55) return true
  // 藏青 / 墨蓝 / 深牛仔蓝：低饱和深蓝
  if (h >= 195 && h <= 260 && s <= 0.65 && l <= 0.45) return true
  return false
}

/** 色相差，取 0-180 的最短路径 */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

export interface ColorInput {
  hex: string
  /** 用于判断"小面积点缀"：包/鞋/配饰算点缀 */
  role?: 'garment' | 'accent'
}

/**
 * 计算整套搭配的颜色和谐度，返回 0-1。
 * 规则顺序即优先级，先命中先返回。
 */
export function colorHarmony(items: ColorInput[]): number {
  if (items.length === 0) return 0.5
  if (items.length === 1) return 0.85

  const hsl = items.map((i) => hexToHsl(i.hex))
  const chromatic = items.filter((i) => !isNeutral(i.hex))
  const neutralRatio = (items.length - chromatic.length) / items.length

  // 5. 高饱和撞色 ≥ 2 件 → 强制降到 0.4（这条优先级最高，先拦下来）
  const highSat = hsl.filter((c) => c.s > 0.6).length
  if (highSat >= 2) return 0.4

  // 没有彩色，或彩色只有 1 件 —— 基本不会出错
  if (chromatic.length <= 1) return 0.85

  // 1. 中性色占 2/3 以上
  if (neutralRatio >= 2 / 3) return 0.85

  const chromaHsl = chromatic.map((i) => hexToHsl(i.hex))

  // 所有彩色两两之间的最大色相差
  let maxHueDiff = 0
  for (let i = 0; i < chromaHsl.length; i++) {
    for (let j = i + 1; j < chromaHsl.length; j++) {
      maxHueDiff = Math.max(maxHueDiff, hueDistance(chromaHsl[i].h, chromaHsl[j].h))
    }
  }

  // 明度差（取最大跨度）
  const lightness = chromaHsl.map((c) => c.l)
  const lightnessSpan = Math.max(...lightness) - Math.min(...lightness)
  const maxL = Math.max(...lightness)
  const minL = Math.min(...lightness)

  let base: number
  if (maxHueDiff <= 30) {
    // 2. 同色系：同色相 + 有明度差才叫"层次"，没有明度差就是一坨
    base = maxL - minL >= 0.15 || maxL - minL <= 0.0 ? 0.9 : 0.82
  } else if (maxHueDiff <= 60) {
    // 3. 邻近色
    base = 0.8
  } else if (maxHueDiff >= 120) {
    // 4. 互补 / 三角
    const hasAccent = chromatic.some((i) => i.role === 'accent')
    base = hasAccent ? 0.85 : 0.65
  } else {
    // 60-120：中间地带，偏弱
    base = 0.7
  }

  // 6. 花纹冲突：上装和下装都有花纹
  const patterned = items.filter((i) => (i as ColorInput & { pattern?: string }).pattern)
  const garmentPatterns = patterned.filter((i) => i.role !== 'accent')
  if (garmentPatterns.length >= 2 && lightnessSpan < 0.4) base -= 0.25
  else if (garmentPatterns.length >= 2) base -= 0.15

  return clamp(base, 0, 1)
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
