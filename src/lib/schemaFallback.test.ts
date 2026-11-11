import { describe, it, expect } from 'vitest'
import { isSchemaBehind, stripNewColumns } from './schemaFallback'

describe('isSchemaBehind', () => {
  it('认得 PostgREST 的 PGRST204', () => {
    // 这是实测 Supabase 真实返回的：列没进 schema cache
    expect(
      isSchemaBehind({
        code: 'PGRST204',
        message: "Could not find the 'gender' column of 'items' in the schema cache",
      }),
    ).toBe(true)
  })

  it('认得 Postgres 的 42703', () => {
    expect(isSchemaBehind({ code: '42703', message: 'column items.gender does not exist' })).toBe(
      true,
    )
  })

  it('认得枚举值不存在（22P02）', () => {
    expect(
      isSchemaBehind({
        code: '22P02',
        message: 'invalid input value for enum category_t: "jewelry"',
      }),
    ).toBe(true)
  })

  it('只有消息没有 code 也认得出来', () => {
    expect(isSchemaBehind(new Error("Could not find the 'gender' column of 'items'"))).toBe(true)
    expect(isSchemaBehind(new Error('invalid input value for enum category_t: "hat"'))).toBe(true)
  })

  it('不误伤无关错误', () => {
    expect(isSchemaBehind({ code: '42501', message: 'row-level security policy' })).toBe(false)
    expect(isSchemaBehind({ code: '23505', message: 'duplicate key value' })).toBe(false)
    expect(isSchemaBehind(new Error('网络超时'))).toBe(false)
    expect(isSchemaBehind(null)).toBe(false)
    expect(isSchemaBehind(undefined)).toBe(false)
  })
})

describe('stripNewColumns', () => {
  it('去掉 gender，其余原样保留', () => {
    const out = stripNewColumns({
      category: 'upper',
      gender: 'men',
      color_hex: '#000000',
      warmth: 3,
    })
    expect(out).toEqual({ category: 'upper', color_hex: '#000000', warmth: 3 })
    expect('gender' in out).toBe(false)
  })

  it('本来就没有 gender 时是幂等的', () => {
    const patch = { category: 'lower', color_hex: '#fff' }
    expect(stripNewColumns(patch)).toEqual(patch)
  })

  it('不修改原对象', () => {
    const patch = { category: 'upper', gender: 'women' }
    stripNewColumns(patch)
    expect(patch.gender).toBe('women')
  })
})
