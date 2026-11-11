import { describe, it, expect } from 'vitest'
import { guessOccasion, weekdayIndex, currentSeason, OCCASION_FORMALITY } from './occasion'
import { parseTagJson } from './tagging'
import { parseLlmJson } from './llm'
import { buildReason } from './reason'
import { colorLabel } from './reason'
import type { Item, RecommendContext, ScoreBreakdown } from './types'

describe('weekdayIndex', () => {
  it('周日映射成 7', () => {
    expect(weekdayIndex(new Date('2026-11-08T10:00:00'))).toBe(7) // 周日
    expect(weekdayIndex(new Date('2026-11-02T10:00:00'))).toBe(1) // 周一
    expect(weekdayIndex(new Date('2026-11-07T10:00:00'))).toBe(6) // 周六
  })
})

describe('guessOccasion', () => {
  it('周六周日猜休闲', () => {
    expect(guessOccasion({ date: new Date('2026-11-07T10:00:00') })).toBe('casual')
    expect(guessOccasion({ date: new Date('2026-11-08T10:00:00') })).toBe('casual')
  })

  it('工作日猜上班', () => {
    expect(guessOccasion({ date: new Date('2026-11-02T09:00:00') })).toBe('work')
    expect(guessOccasion({ date: new Date('2026-11-03T09:00:00') })).toBe('work')
  })

  it('周五晚上猜约会', () => {
    expect(guessOccasion({ date: new Date('2026-11-06T19:00:00') })).toBe('date')
    expect(guessOccasion({ date: new Date('2026-11-06T14:00:00') })).toBe('work')
  })

  it('手动覆盖优先于一切', () => {
    expect(
      guessOccasion({
        date: new Date('2026-11-07T10:00:00'), // 周六
        overrides: { 6: 'formal' },
      }),
    ).toBe('formal')
  })

  it('可改默认工作场合', () => {
    expect(
      guessOccasion({ date: new Date('2026-11-02T09:00:00'), defaultWork: 'date' }),
    ).toBe('date')
  })
})

describe('currentSeason', () => {
  it('按月份分季节', () => {
    expect(currentSeason(new Date('2026-04-15'))).toBe('spring')
    expect(currentSeason(new Date('2026-07-15'))).toBe('summer')
    expect(currentSeason(new Date('2026-10-15'))).toBe('autumn')
    expect(currentSeason(new Date('2026-01-15'))).toBe('winter')
    expect(currentSeason(new Date('2026-12-15'))).toBe('winter')
  })
})

describe('OCCASION_FORMALITY', () => {
  it('正式度单调递增', () => {
    const order = ['sport', 'casual', 'date', 'work', 'formal'] as const
    for (let i = 1; i < order.length; i++) {
      expect(OCCASION_FORMALITY[order[i]]).toBeGreaterThan(
        OCCASION_FORMALITY[order[i - 1]],
      )
    }
  })
})

describe('parseTagJson', () => {
  const good = {
    category: 'upper',
    subcategory: '针织衫',
    color_name: '藏青',
    color_hex: '#2c3e50',
    secondary_colors: ['#ffffff'],
    pattern: 'solid',
    material: '羊毛',
    style_tags: ['通勤', '极简'],
    season: ['autumn', 'winter'],
    formality: 4,
    warmth: 3,
    fit: 'regular',
    confidence: 0.9,
  }

  it('正常 JSON 直接解析', () => {
    const t = parseTagJson(JSON.stringify(good))
    expect(t).not.toBeNull()
    expect(t!.category).toBe('upper')
    expect(t!.color_hex).toBe('#2C3E50')
    expect(t!.formality).toBe(4)
  })

  it('剥掉 ```json 代码块', () => {
    const t = parseTagJson('```json\n' + JSON.stringify(good) + '\n```')
    expect(t).not.toBeNull()
    expect(t!.color_name).toBe('藏青')
  })

  it('前面有一句话时也能抠出 JSON', () => {
    const t = parseTagJson('好的，这是结果：' + JSON.stringify(good))
    expect(t).not.toBeNull()
  })

  it('颜色 3 位扩成 6 位', () => {
    const t = parseTagJson(JSON.stringify({ ...good, color_hex: '#abc' }))
    expect(t!.color_hex).toBe('#AABBCC')
  })

  it('非法颜色落兜底', () => {
    const t = parseTagJson(JSON.stringify({ ...good, color_hex: 'navy' }))
    expect(t!.color_hex).toBe('#888888')
  })

  it('越界的 formality / warmth 被夹紧', () => {
    const t = parseTagJson(JSON.stringify({ ...good, formality: 99, warmth: -3 }))
    expect(t!.formality).toBe(5)
    expect(t!.warmth).toBe(1)
  })

  it('非法枚举落默认值', () => {
    const t = parseTagJson(
      JSON.stringify({ ...good, category: 'hat', pattern: 'dot', fit: 'huge' }),
    )
    expect(t!.category).toBe('upper')
    expect(t!.pattern).toBe('solid')
    expect(t!.fit).toBe('regular')
  })

  it('季节为空时给春秋兜底', () => {
    const t = parseTagJson(JSON.stringify({ ...good, season: [] }))
    expect(t!.season).toEqual(['spring', 'autumn'])
  })

  it('完全不是 JSON 时返回 null', () => {
    expect(parseTagJson('抱歉，我无法识别这张图片')).toBeNull()
  })
})

describe('parseLlmJson', () => {
  const payload = {
    outfits: [
      { rank: 1, item_indices: [1, 2, 3], title: '通勤', reason: '藏青配卡其' },
      { rank: 2, item_indices: [4, 5], title: '休闲', reason: '周末感' },
    ],
  }

  it('正常解析', () => {
    const r = parseLlmJson(JSON.stringify(payload))
    expect(r).toHaveLength(2)
    expect(r![0].title).toBe('通勤')
  })

  it('剥掉代码块', () => {
    const r = parseLlmJson('```json\n' + JSON.stringify(payload) + '\n```')
    expect(r).toHaveLength(2)
  })

  it('缺 outfits 字段返回 null', () => {
    expect(parseLlmJson('{"foo":1}')).toBeNull()
  })

  it('乱码返回 null', () => {
    expect(parseLlmJson('今天天气不错')).toBeNull()
  })

  it('过滤掉缺字段的条目', () => {
    const r = parseLlmJson(
      JSON.stringify({ outfits: [{ rank: 1 }, payload.outfits[0]] }),
    )
    expect(r).toHaveLength(1)
  })
})

describe('colorLabel', () => {
  it('给出可读色名', () => {
    expect(colorLabel('#ffffff')).toBe('米白')
    expect(colorLabel('#000000')).toBe('黑')
    expect(colorLabel('#2c3e50')).toBe('藏青')
  })
})

describe('buildReason', () => {
  const item = (p: Partial<Item>): Item => ({
    id: 'x',
    name: '藏青针织衫',
    category: 'upper',
    gender: 'unisex',
    subcategory: null,
    color_name: '藏青',
    color_hex: '#2c3e50',
    secondary_colors: [],
    pattern: 'solid',
    material: '羊毛',
    style_tags: ['通勤'],
    season: [],
    formality: 4,
    warmth: 3,
    fit: 'regular',
    image_url: null,
    cutout_url: null,
    brand: null,
    status: 'active',
    times_worn: 3,
    last_worn: '2026-10-01',
    favorite: false,
    notes: null,
    created_at: '',
    ...p,
  })

  const ctx: RecommendContext = {
    occasion: 'work',
    feelsLike: 18,
    rainChance: 0,
    season: 'autumn',
    today: '2026-11-05',
  }

  const b: ScoreBreakdown = {
    occasion: 0.9,
    color: 0.9,
    warmth: 0.9,
    freshness: 0.5,
    preference: 0.5,
  }

  it('理由非空且说人话', () => {
    const r = buildReason([item({}), item({ id: 'y', category: 'lower', color_name: '卡其' })], ctx, b)
    expect(r.length).toBeGreaterThan(10)
    expect(r).toMatch(/[。]/)
  })

  it('30 天没穿的单品会被点名', () => {
    const r = buildReason([item({ last_worn: '2026-09-01' })], ctx, b)
    expect(r).toContain('30 天')
  })

  it('温度会出现在理由里', () => {
    const r = buildReason([item({})], ctx, b)
    expect(r).toContain('18')
  })
})
