'use client'

import { isSchemaBehind, stripNewColumns } from './schemaFallback'
import { supabase, BUCKET } from './supabase'
import type { Item, WearLog, Feedback, Occasion, ItemStatus } from './types'
import type { RecentWear } from './recommend'

/**
 * 数据访问层。所有函数都假定已登录（RLS 兜底）。
 * 故意不写 ORM，直接走 supabase-js，出错位置一眼可见。
 */

// ---------------- items ----------------

export async function listItems(): Promise<Item[]> {
  const { data, error } = await supabase()
    .from('items')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Item[]
}



export async function createItem(
  patch: Partial<Item> & { category: Item['category'] },
): Promise<Item> {
  const { data: userData, error: userErr } = await supabase().auth.getUser()
  if (userErr) throw userErr
  if (!userData.user) throw new Error('未登录')

  const row = { ...patch, user_id: userData.user.id }
  let { data, error } = await supabase().from('items').insert(row).select().single()

  // 老库没有 gender 列 —— 去掉它重试，别让入库整条挂掉
  if (error && isSchemaBehind(error)) {
    const retry = await supabase()
      .from('items')
      .insert(stripNewColumns(row))
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return normalizeItem(data as Item)
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<Item> {
  let { data, error } = await supabase()
    .from('items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error && isSchemaBehind(error)) {
    const retry = await supabase()
      .from('items')
      .update(stripNewColumns(patch))
      .eq('id', id)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return normalizeItem(data as Item)
}

/** 老数据没有 gender 字段，补齐成 unisex，避免下游到处判空 */
function normalizeItem(it: Item): Item {
  return { ...it, gender: it.gender ?? 'unisex' }
}

export async function setItemStatus(id: string, status: ItemStatus): Promise<void> {
  const { error } = await supabase().from('items').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase().from('items').delete().eq('id', id)
  if (error) throw error
}

// ---------------- 上传 ----------------

/** 客户端压缩：长边 1600px、WebP、质量 0.82。100+ 件照片不上云就爆额度。 */
export async function compressImage(file: File, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
}

export async function uploadImage(file: File): Promise<string> {
  const { data: userData } = await supabase().auth.getUser()
  if (!userData.user) throw new Error('未登录')

  const blob = await compressImage(file)
  const key = `${userData.user.id}/${crypto.randomUUID()}.webp`

  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(key, blob, { contentType: 'image/webp', upsert: false })
  if (error) throw error

  const { data } = supabase().storage.from(BUCKET).getPublicUrl(key)
  return data.publicUrl
}

// ---------------- wear_logs ----------------

export async function listWearLogs(sinceDays = 60): Promise<WearLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  const { data, error } = await supabase()
    .from('wear_logs')
    .select('*')
    .gte('worn_date', since.toISOString().slice(0, 10))
    .order('worn_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as WearLog[]
}

export async function logWear(input: {
  worn_date: string
  item_ids: string[]
  outfit_title?: string
  occasion?: Occasion
  temp?: number
}): Promise<WearLog> {
  const { data: userData, error: userErr } = await supabase().auth.getUser()
  if (userErr) throw userErr
  if (!userData.user) throw new Error('未登录')

  const { data, error } = await supabase()
    .from('wear_logs')
    .upsert(
      { ...input, user_id: userData.user.id },
      { onConflict: 'user_id,worn_date,outfit_title' },
    )
    .select()
    .single()
  if (error) throw error
  return data as WearLog
}

export async function rateWearLog(id: string, rating: number, note?: string): Promise<void> {
  const { error } = await supabase()
    .from('wear_logs')
    .update({ rating, note })
    .eq('id', id)
  if (error) throw error
}

// ---------------- feedback ----------------

export async function sendFeedback(input: {
  item_id?: string
  outfit_key?: string
  signal: 'like' | 'dislike'
  occasion?: Occasion
}): Promise<void> {
  const { data: userData } = await supabase().auth.getUser()
  if (!userData.user) return
  const { error } = await supabase()
    .from('feedback')
    .insert({ ...input, user_id: userData.user.id })
  if (error) throw error
}

/**
 * 撤销对某套搭配的「不喜欢」或「收藏」。
 *
 * 两个按钮都能反悔 —— 只增不减的话，误点一次就永久影响打分了。
 */
export async function clearOutfitFeedback(
  outfitKey: string,
  signal: 'like' | 'dislike',
): Promise<void> {
  const { data: userData } = await supabase().auth.getUser()
  if (!userData.user) return
  const { error } = await supabase()
    .from('feedback')
    .delete()
    .eq('user_id', userData.user.id)
    .eq('outfit_key', outfitKey)
    .eq('signal', signal)
  if (error) throw error
}

// ---------------- 组装推荐上下文 ----------------

export async function loadRecentWear(): Promise<RecentWear> {
  const [logs, fb] = await Promise.all([listWearLogs(30), listFeedback(30)])

  const wornItemDates: Record<string, string[]> = {}
  for (const log of logs) {
    for (const id of log.item_ids) {
      ;(wornItemDates[id] ??= []).push(log.worn_date)
    }
  }

  const likedItemIds = new Set(
    fb.filter((f) => f.signal === 'like' && f.item_id).map((f) => f.item_id as string),
  )

  // 之前只读了 like，dislike 写进库就再没人看 —— 点了✕跟没点一样。
  const dislikedItemIds = new Set(
    fb.filter((f) => f.signal === 'dislike' && f.item_id).map((f) => f.item_id as string),
  )
  const dislikedOutfitKeys = new Set(
    fb.filter((f) => f.signal === 'dislike' && f.outfit_key).map((f) => f.outfit_key as string),
  )
  const likedOutfitKeys = new Set(
    fb.filter((f) => f.signal === 'like' && f.outfit_key).map((f) => f.outfit_key as string),
  )

  return {
    wornItemDates,
    likedItemIds,
    dislikedItemIds,
    dislikedOutfitKeys,
    likedOutfitKeys,
  }
}

export async function listFeedback(sinceDays = 30): Promise<Feedback[]> {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  const { data, error } = await supabase()
    .from('feedback')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Feedback[]
}

// ---------------- 登录 ----------------

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

/**
 * 邮箱 + 密码登录；账号不存在时直接注册。
 *
 * 项目里 Supabase 的 Confirm email 是关的，所以注册后 session 立刻可用，
 * 不需要收验证邮件 —— 这对个人自用够用，也避开了免费额度下的发信限制。
 */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password })
  if (!error) return

  // 凭据错误有两种可能：密码错，或者这个邮箱还没注册过。后者就用注册流程。
  const { data, error: signUpError } = await supabase().auth.signUp({ email, password })
  if (signUpError) {
    // 注册失败说明账号其实存在，那第一次的错误才是真的密码错误
    if (signUpError.message.includes('already registered')) throw error
    throw signUpError
  }
  // 兜底：若项目开了邮件确认，signUp 不返回 session，需要用户去收信
  if (!data.session) {
    throw new Error('账号已创建，但这个项目要求邮件确认。请去邮箱点一下验证链接。')
  }
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut()
}
