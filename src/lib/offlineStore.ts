'use client'

import type { Item, WearLog } from './types'

/**
 * 离线优先的本地存储 + 待同步队列。
 *
 * 设计取舍：
 *   - 所有写操作**先落本地**，界面立刻响应，不等网络
 *   - 同时把操作压进 pending 队列，联网时按顺序重放
 *   - 读操作永远读本地镜像，Supabase 只在同步时参与
 *
 * 为什么不做真正的双向同步（冲突合并）：
 * 这是单人自用 App，同一个数据不会被两台设备同时改。真正的风险是
 * "手机离线改了，云端还是旧的" —— 用「后写覆盖 + 时间戳」就够了，
 * 上完整的 CRDT/向量时钟属于过度设计。
 */

const K = {
  items: 'wardrobe:cache:items',
  logs: 'wardrobe:cache:logs',
  pending: 'wardrobe:pending',
  syncedAt: 'wardrobe:syncedAt',
} as const

export type PendingOp =
  | { kind: 'createItem'; tempId: string; patch: Partial<Item>; at: number }
  | { kind: 'updateItem'; id: string; patch: Partial<Item>; at: number }
  | { kind: 'deleteItem'; id: string; at: number }
  | { kind: 'logWear'; localId: string; row: Omit<WearLog, 'id' | 'created_at'>; at: number }
  | { kind: 'feedback'; outfitKey?: string; itemId?: string; signal: 'like' | 'dislike'; at: number }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* 配额满或隐私模式，忽略 */
  }
}

// ---------- 本地镜像 ----------

export function loadCachedItems(): Item[] {
  return read<Item[]>(K.items, [])
}

export function saveCachedItems(items: Item[]) {
  write(K.items, items)
}

export function loadCachedLogs(): WearLog[] {
  return read<WearLog[]>(K.logs, [])
}

export function saveCachedLogs(logs: WearLog[]) {
  write(K.logs, logs)
}

export function hasCache(): boolean {
  try {
    return localStorage.getItem(K.items) !== null
  } catch {
    return false
  }
}

// ---------- 待同步队列 ----------

export function loadPending(): PendingOp[] {
  return read<PendingOp[]>(K.pending, [])
}

export function pushPending(op: PendingOp) {
  const q = loadPending()
  q.push(op)
  write(K.pending, q)
}

export function clearPending() {
  write(K.pending, [])
}

export function removePending(predicate: (op: PendingOp) => boolean) {
  write(K.pending, loadPending().filter((op) => !predicate(op)))
}

export function pendingCount(): number {
  return loadPending().length
}

export function markSynced() {
  write(K.syncedAt, Date.now())
}

export function lastSyncedAt(): number | null {
  const v = read<number | null>(K.syncedAt, null)
  return typeof v === 'number' ? v : null
}
