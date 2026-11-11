import type { Gender, Item } from './types'
import { colorLabel } from './reason'

export const CATEGORY_LABEL: Record<Item['category'], string> = {
  upper: '上装',
  lower: '下装',
  outer: '外套',
  dress: '连衣裙',
  shoes: '鞋',
  bag: '包',
  jewelry: '首饰',
  hat: '帽子',
  scarf: '围巾',
  accessory: '配饰',
}

export const CATEGORY_ORDER: Item['category'][] = [
  'upper',
  'lower',
  'outer',
  'dress',
  'shoes',
  'bag',
  'jewelry',
  'hat',
  'scarf',
  'accessory',
]

/** 所有配饰类，推荐时它们走"可选槽位"而不是主体组合 */
export const ACCESSORY_CATEGORIES: Item['category'][] = [
  'bag',
  'jewelry',
  'hat',
  'scarf',
  'accessory',
]

export function isAccessory(c: Item['category']): boolean {
  return ACCESSORY_CATEGORIES.includes(c)
}

export const GENDER_LABEL: Record<Gender, string> = {
  men: '男装',
  women: '女装',
  unisex: '中性',
}

/** 单品卡片上的一行副标题 */
export function itemMeta(it: Item): string {
  const parts = [
    it.subcategory || CATEGORY_LABEL[it.category],
    it.color_name || colorLabel(it.color_hex),
    it.material,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** 用户能看懂的状态描述 */
export function wearLabel(it: Item): string {
  if (it.times_worn === 0) return '从未穿'
  if (it.times_worn < 3) return `${it.times_worn} 次`
  return ''
}

/** 沉睡天数 */
export function sleepingDays(it: Item, today: string): number | null {
  if (!it.last_worn) return null
  const gap =
    (Date.parse(`${today}T00:00:00`) - Date.parse(`${it.last_worn}T00:00:00`)) / 86_400_000
  return Number.isFinite(gap) ? Math.round(gap) : null
}
