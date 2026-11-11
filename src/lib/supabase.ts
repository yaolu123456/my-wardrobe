import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * 浏览器端 Supabase 客户端（anon key + RLS）。
 * 所有表都开了 RLS，anon key 暴露在客户端是安全的。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let cached: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon)
}

export function supabase(): SupabaseClient {
  if (!url || !anon) {
    throw new Error(
      '缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。' +
        '请复制 .env.local.example 为 .env.local 并填入 Supabase 项目信息。',
    )
  }
  if (!cached) {
    cached = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return cached
}

export const BUCKET = 'wardrobe'
