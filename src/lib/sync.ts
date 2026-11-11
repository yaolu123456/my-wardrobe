'use client'

import { isSupabaseConfigured, supabase } from './supabase'
import {
  clearPending,
  loadPending,
  markSynced,
  type PendingOp,
} from './offlineStore'
import type { Item } from './types'

/**
 * 把本地攒的操作推给 Supabase。
 *
 * 策略：
 *   - 按入队顺序重放，一条失败就停（后面的可能依赖前面，比如先建后改）
 *   - 「已删除」这种失败可以忽略（云端本来就没有）
 *   - 全部成功才清空队列；中途失败保留剩余的，下次再推
 *
 * 返回推成功了几条，调用方据此决定要不要提示用户。
 */
export interface SyncResult {
  ok: boolean
  pushed: number
  remaining: number
  error?: string
}

let syncing = false

export function isSyncing(): boolean {
  return syncing
}

export async function syncPending(): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, pushed: 0, remaining: loadPending().length, error: '未配置 Supabase' }
  }
  if (syncing) {
    return { ok: false, pushed: 0, remaining: loadPending().length, error: '正在同步' }
  }

  const queue = loadPending()
  if (queue.length === 0) {
    markSynced()
    return { ok: true, pushed: 0, remaining: 0 }
  }

  syncing = true
  let pushed = 0
  let failedAt = -1
  let firstError: string | undefined

  try {
    const { data: userData } = await supabase().auth.getUser()
    const user = userData.user
    if (!user) {
      return { ok: false, pushed: 0, remaining: queue.length, error: '未登录' }
    }

    for (let i = 0; i < queue.length; i++) {
      const op = queue[i]
      try {
        await replay(op, user.id)
        pushed++
      } catch (e) {
        // 删除不存在的东西不算错
        if (op.kind === 'deleteItem' && isMissingRow(e)) {
          pushed++
          continue
        }
        failedAt = i
        firstError = e instanceof Error ? e.message : String(e)
        break
      }
    }
  } finally {
    syncing = false
  }

  if (failedAt === -1) {
    clearPending()
    markSynced()
    return { ok: true, pushed, remaining: 0 }
  }

  // 保留失败那条及之后的，下次继续
  const keep = queue.slice(failedAt)
  localStorage.setItem('wardrobe:pending', JSON.stringify(keep))
  return { ok: false, pushed, remaining: keep.length, error: firstError }
}

function isMissingRow(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /0 rows|not found|PGRST116/i.test(msg)
}

async function replay(op: PendingOp, userId: string): Promise<void> {
  switch (op.kind) {
    case 'createItem': {
      const { error } = await supabase()
        .from('items')
        .insert({ ...op.patch, user_id: userId })
      if (error) throw error
      return
    }
    case 'updateItem': {
      const { error } = await supabase().from('items').update(op.patch).eq('id', op.id)
      if (error) throw error
      return
    }
    case 'deleteItem': {
      const { error } = await supabase().from('items').delete().eq('id', op.id)
      if (error) throw error
      return
    }
    case 'logWear': {
      const { error } = await supabase()
        .from('wear_logs')
        .upsert(
          { ...op.row, user_id: userId },
          { onConflict: 'user_id,worn_date,outfit_title' },
        )
      if (error) throw error
      return
    }
    case 'feedback': {
      const { error } = await supabase()
        .from('feedback')
        .insert({
          user_id: userId,
          signal: op.signal,
          outfit_key: op.outfitKey ?? null,
          item_id: op.itemId ?? null,
        })
      if (error) throw error
      return
    }
  }
}

/** 云端拉全量，覆盖本地镜像。同步前先拉一遍，避免本地缓存过期。 */
export async function pullFromCloud(): Promise<{ items: Item[]; error?: string }> {
  if (!isSupabaseConfigured()) return { items: [], error: '未配置 Supabase' }
  try {
    const { data: userData } = await supabase().auth.getUser()
    if (!userData.user) return { items: [], error: '未登录' }
    const { data, error } = await supabase()
      .from('items')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return { items: (data ?? []) as Item[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** 线上是否可达（用一次轻量 HEAD 判断） */
export async function isOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  if (!isSupabaseConfigured()) return false
  try {
    await supabase().auth.getSession()
    return true
  } catch {
    return false
  }
}
