import { describe, it, expect } from 'vitest'
import { hexToHsl, isNeutral, hueDistance, colorHarmony, clamp } from './color'

describe('hexToHsl', () => {
  it('黑 / 白 / 灰', () => {
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 })
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 1 })
    const g = hexToHsl('#808080')
    expect(g.s).toBeCloseTo(0, 5)
    expect(g.l).toBeCloseTo(0.502, 2)
  })

  it('支持 3 位缩写', () => {
    expect(hexToHsl('#fff')).toEqual(hexToHsl('#ffffff'))
  })

  it('藏青是蓝相', () => {
    const { h, s, l } = hexToHsl('#2c3e50')
    expect(h).toBeGreaterThan(190)
    expect(h).toBeLessThan(230)
    expect(s).toBeGreaterThan(0.2)
    expect(l).toBeLessThan(0.4)
  })
})

describe('isNeutral', () => {
  it('黑白灰是中性色', () => {
    expect(isNeutral('#000000')).toBe(true)
    expect(isNeutral('#ffffff')).toBe(true)
    expect(isNeutral('#8a8f94')).toBe(true)
  })

  it('米白 / 驼 / 卡其是中性色', () => {
    expect(isNeutral('#efe7d8')).toBe(true)
    expect(isNeutral('#c8a97e')).toBe(true)
  })

  it('正红不是中性色', () => {
    expect(isNeutral('#cc2222')).toBe(false)
    expect(isNeutral('#e87a3c')).toBe(false)
  })

  it('藏青按"万能深色"处理，算中性色', () => {
    expect(isNeutral('#2c3e50')).toBe(true)
    expect(isNeutral('#1b3a5c')).toBe(true)
  })
})

describe('hueDistance', () => {
  it('取最短路径', () => {
    expect(hueDistance(350, 10)).toBe(20)
    expect(hueDistance(10, 350)).toBe(20)
    expect(hueDistance(0, 180)).toBe(180)
    expect(hueDistance(90, 90)).toBe(0)
  })
})

describe('colorHarmony', () => {
  it('全中性色给 0.85', () => {
    const s = colorHarmony([{ hex: '#ffffff' }, { hex: '#262322' }, { hex: '#8a8f94' }])
    expect(s).toBeCloseTo(0.85, 2)
  })

  it('同色系且明度差够 → 0.9（最高档）', () => {
    // 深蓝 + 浅蓝，同色相、明度差 > 0.15
    const s = colorHarmony([{ hex: '#1b3a5c' }, { hex: '#8fb4d9' }, { hex: '#ffffff' }])
    expect(s).toBeGreaterThanOrEqual(0.8)
  })

  it('两件高饱和 → 强制 0.4', () => {
    const s = colorHarmony([{ hex: '#ee0000' }, { hex: '#00cc00' }])
    expect(s).toBe(0.4)
  })

  it('互补色 + 小面积点缀 → 0.85', () => {
    const s = colorHarmony([
      { hex: '#2c3e50', role: 'garment' },
      { hex: '#e87a3c', role: 'accent' },
    ])
    expect(s).toBeGreaterThanOrEqual(0.8)
  })

  it('单个单品给 0.85', () => {
    expect(colorHarmony([{ hex: '#cc2222' }])).toBe(0.85)
  })

  it('空数组不报错', () => {
    expect(colorHarmony([])).toBe(0.5)
  })

  it('结果永远在 0-1 之间', () => {
    const samples = [
      ['#ff0000', '#00ff00', '#0000ff'],
      ['#ffffff', '#000000', '#808080', '#efe7d8'],
      ['#123456', '#654321'],
    ]
    for (const s of samples) {
      const v = colorHarmony(s.map((hex) => ({ hex })))
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('clamp', () => {
  it('夹在区间内', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})
