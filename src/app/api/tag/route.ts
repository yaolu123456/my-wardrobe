import { NextResponse } from 'next/server'
import { buildTagPrompt, parseTagJson } from '@/lib/tagging'

export const runtime = 'nodejs'

/**
 * POST /api/tag
 * body: { image: string }  // data URL 或公网 URL
 *
 * 服务端调视觉模型。没配 key 时返回 501，前端要能优雅降级成"手动打标"。
 */
export async function POST(req: Request) {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl =
    process.env.VISION_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const model = process.env.VISION_MODEL ?? 'qwen-vl-max'

  if (!apiKey) {
    return NextResponse.json(
      { error: 'vision_not_configured', message: '未配置视觉模型，先手动打标。' },
      { status: 501 },
    )
  }

  let image: string
  try {
    const body = (await req.json()) as { image?: string }
    if (!body.image) throw new Error('no image')
    image = body.image
  } catch {
    return NextResponse.json({ error: 'missing image' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: image } },
              { type: 'text', text: buildTagPrompt() },
            ],
          },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      return NextResponse.json({ error: `vision ${res.status}` }, { status: 502 })
    }

    const j = await res.json()
    const text: string = j?.choices?.[0]?.message?.content ?? ''
    const tags = parseTagJson(text)
    if (!tags) return NextResponse.json({ error: 'unparsable' }, { status: 502 })

    return NextResponse.json({ tags })
  } catch {
    return NextResponse.json({ error: 'vision failed' }, { status: 502 })
  }
}
