import type { Occasion, Season } from './types'

/**
 * 场合按"星期几 + 时间"自动猜。
 * 猜错了用户可一键改，所以只做一版优先级链，不做学习。
 */

/** 周一到周日 = 1..7（Date.getDay() 里 0 是周日） */
export function weekdayIndex(d: Date): number {
  const g = d.getDay()
  return g === 0 ? 7 : g
}

export interface GuessInput {
  date?: Date
  /** 逐日覆盖的场合。key 为 1..7 */
  overrides?: Partial<Record<number, Occasion>>
  /** 用户的默认工作场合，默认 work */
  defaultWork?: Occasion
}

/**
 * 猜测顺序：
 * 1. 用户显式覆盖（今天设为"约会"）
 * 2. 周六 → 休闲
 * 3. 周日 → 休闲
 * 4. 周五晚上（18 点后）→ 约会
 * 5. 其余 → 工作
 */
export function guessOccasion(input: GuessInput = {}): Occasion {
  const date = input.date ?? new Date()
  const wd = weekdayIndex(date)

  const override = input.overrides?.[wd]
  if (override) return override

  if (wd === 6 || wd === 7) return 'casual'
  if (wd === 5 && date.getHours() >= 18) return 'date'
  return input.defaultWork ?? 'work'
}

/** 场合 → 目标正式度（1-5） */
export const OCCASION_FORMALITY: Record<Occasion, number> = {
  sport: 1.5,
  casual: 2.2,
  date: 3.2,
  work: 3.8,
  formal: 4.8,
}

export const OCCASION_LABEL: Record<Occasion, string> = {
  work: '上班',
  casual: '休闲',
  date: '约会',
  sport: '运动',
  formal: '正式',
}

/** 当前季节。按月份粗分，符合中国大部分地区体感。 */
export function currentSeason(d: Date = new Date()): Season {
  const m = d.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}
