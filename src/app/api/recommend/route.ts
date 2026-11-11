import { NextResponse } from 'next/server'
import { runRecommend, type RecommendInput } from '@/lib/recommendRun'
import { refineOutfits } from '@/lib/llm'

/**
 * POST /api/recommend
 *
 * 薄包装：真正的编排在 `@/lib/recommendRun`，APK 客户端也调同一份。
 * 这里只多做一件事 —— 有 LLM_API_KEY 时用大模型润色理由。
 */
export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: RecommendInput
  try {
    body = (await req.json()) as RecommendInput
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || !body.context) {
    return NextResponse.json({ error: 'missing items or context' }, { status: 400 })
  }

  const result = await runRecommend(body, refineOutfits)
  return NextResponse.json(result)
}
