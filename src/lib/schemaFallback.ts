/**
 * 老库兼容。
 *
 * 新版本给 `items` 加了 `gender` 列、给 `category_t` 加了 jewelry/hat/scarf。
 * 用户如果没跑 `supabase/schema.sql` 里的迁移，写库会直接被拒 —— 这时候
 * 与其抛一个英文 Postgres 错误码，不如去掉新字段再试一次，让核心功能照常。
 *
 * 实测 Supabase 有三种报法，都得认：
 *   PGRST204 —— PostgREST 查自己的 schema cache 就没找到列，根本没发到数据库
 *   42703    —— 真的发到 Postgres 后报 column does not exist
 *   22P02    —— 枚举值不存在（jewelry / hat / scarf）
 */

const SCHEMA_BEHIND_CODES = ['PGRST204', '42703', '22P02']

const SCHEMA_BEHIND_PATTERN =
  /could not find the .* column|column .* does not exist|invalid input value for enum/i

/** 这个错误是不是"线上库还没跑迁移"造成的 */
export function isSchemaBehind(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null
  if (!err) return false
  if (err.code && SCHEMA_BEHIND_CODES.includes(err.code)) return true
  const msg =
    e instanceof Error ? e.message : String(err.message ?? (typeof e === 'string' ? e : ''))
  return SCHEMA_BEHIND_PATTERN.test(msg)
}

/**
 * 去掉老库不认识的新字段。
 * 目前只有一个 `gender`，以后加新列时在这里追加即可。
 */
export function stripNewColumns<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const { gender: _gender, ...rest } = patch
  return rest as Partial<T>
}
