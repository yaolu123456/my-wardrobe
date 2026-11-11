'use client'

import { runRecommend, templateRefiner, type RecommendInput, type RecommendOutput } from './recommendRun'

/**
 * 客户端推荐入口。
 *
 * 三条路，按可用性依次降级：
 *   1. 有网 + 服务端在  → 走 /api/recommend（能用大模型写理由）
 *   2. 有网但服务端挂了 → 本地跑规则（模板理由）
 *   3. 完全离线        → 本地跑规则
 *
 * 规则本身就是纯函数，所以 2 和 3 的结果和服务端"规则部分"完全一致，
 * 差别只在理由的措辞。
 */

/** 精细模式：上次尝试连服务端是否失败过，失败后一段时间内直接走本地 */
let serverDownUntil = 0
const DOWN_COOLDOWN_MS = 60_000

export interface RecommendOptions {
  /** 是否允许尝试服务端（Web 版 true，APK 里也可以 true —— 有网就连） */
  allowServer?: boolean
}

export async function recommendOutfits(
  input: RecommendInput,
  opts: RecommendOptions = {},
): Promise<RecommendOutput> {
  const allowServer = opts.allowServer ?? true
  const canTryServer = allowServer && Date.now() > serverDownUntil

  if (canTryServer) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (res.ok) return (await res.json()) as RecommendOutput
      // 非 2xx 也别急着判死，可能是 400 之类的请求问题
    } catch {
      // 网络不通 / 静态导出后没有这个路由 —— 进入冷却，下次直接用本地
      serverDownUntil = Date.now() + DOWN_COOLDOWN_MS
    }
  }

  return runRecommend(input, templateRefiner)
}

/** 供设置页显示"当前离线推荐"用 */
export function isServerRecommendAvailable(): boolean {
  return Date.now() > serverDownUntil
}
