import type { Item, RecommendContext, ScoreBreakdown } from './types'
import { OCCASION_LABEL } from './occasion'
import { buildReason } from './reason'
import type { RankedOutfit } from './recommend'

/**
 * LLM 精排：把规则引擎的 Top N 变成 3 套 + 中文理由。
 *
 * 关键设计：
 * - 服务端调用，密钥不落浏览器
 * - 失败一定降级到 buildReason()，推荐功能不能因为大模型挂了就不可用
 * - 一次约 1500 in / 300 out token，成本约 0.002 元
 */

export interface LlmOutfit {
  rank: number
  item_indices: number[]
  title: string
  reason: string
}

export interface FinalOutfit {
  items: Item[]
  title: string
  reason: string
}

export interface LlmResult {
  outfits: FinalOutfit[]
  source: 'llm' | 'template'
}

const SYSTEM =
  '你是我的私人搭配师。你只输出 JSON，不解释，不寒暄。' +
  '理由必须具体：说清颜色关系、温度、场合，不要用"好看""气质"这类空话。'

export function buildPrompt(candidates: RankedOutfit[], ctx: RecommendContext): string {
  const list = candidates
    .map((c, i) => {
      const desc = c.items
        .map(
          (it) =>
            `[${it.category}]${it.name ?? it.subcategory ?? '未命名'}` +
            `(${it.color_name ?? it.color_hex},正式度${it.formality},保暖${it.warmth}` +
            `${it.material ? ',' + it.material : ''}` +
            `${it.last_worn ? ',' + '上次' + it.last_worn : ',从未穿过'})`,
        )
        .join(' + ')
      return `${i + 1}. ${desc}`
    })
    .join('\n')

  return (
    `今天 ${ctx.today}，体感 ${Math.round(ctx.feelsLike)}°C，` +
    `降水概率 ${Math.round(ctx.rainChance * 100)}%，季节 ${ctx.season}。\n` +
    `场合：${OCCASION_LABEL[ctx.occasion]}。\n\n` +
    `候选搭配（已按规则打分排序，1 最合适）：\n${list}\n\n` +
    `请从中选 3 套，按"今天最合适"排序。每套给一句 30 字以内的中文理由，` +
    `说明为什么适合今天的天气和场合。\n\n` +
    `只输出这个 JSON，不要用 markdown 代码块包裹：\n` +
    `{"outfits":[{"rank":1,"item_indices":[1,2,3,4],` +
    `"title":"通勤 · 藏青针织 + 卡其裤","reason":"..."}]}`
  )
}

/** 从 LLM 返回里抠出 JSON。模型偶尔会套 ```json 或者加一句话。 */
export function parseLlmJson(text: string): LlmOutfit[] | null {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  const tryParse = (s: string): LlmOutfit[] | null => {
    try {
      const j = JSON.parse(s)
      if (!Array.isArray(j?.outfits)) return null
      const ok = j.outfits.filter((o: unknown) => {
        if (typeof o !== 'object' || o === null) return false
        const x = o as LlmOutfit
        return Array.isArray(x.item_indices) && typeof x.reason === 'string'
      }) as LlmOutfit[]
      return ok.length > 0 ? ok : null
    } catch {
      return null
    }
  }

  const direct = tryParse(cleaned)
  if (direct) return direct

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return tryParse(cleaned.slice(start, end + 1))

  return null
}

/** 规则侧兜底标题 */
export function autoTitle(items: Item[], ctx: RecommendContext, i: number): string {
  const upper = items.find((x) => x.category === 'upper' || x.category === 'dress')
  const lower = items.find((x) => x.category === 'lower' && x.id !== upper?.id)
  const parts = [upper, lower]
    .filter((x): x is Item => Boolean(x))
    .map((x) => x.name ?? x.subcategory ?? '')
    .filter(Boolean)
  const suffix = parts.length ? ' · ' + parts.join(' + ') : ` · 方案 ${i + 1}`
  return OCCASION_LABEL[ctx.occasion] + suffix
}

/**
 * 有 key 就调 LLM，没有或失败就用模板。
 * 在 route handler 里调用（服务端）。
 */
export async function refineOutfits(
  candidates: RankedOutfit[],
  ctx: RecommendContext,
): Promise<LlmResult> {
  const fallback = (): LlmResult => ({
    source: 'template',
    outfits: candidates.slice(0, 3).map((c, i) => ({
      items: c.items,
      title: autoTitle(c.items, ctx, i),
      reason: buildReason(c.items, ctx, c.breakdown),
    })),
  })

  const apiKey = process.env.LLM_API_KEY
  if (!apiKey || candidates.length === 0) return fallback()

  const baseUrl =
    process.env.LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const model = process.env.LLM_MODEL ?? 'qwen-plus'

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(candidates, ctx) },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) return fallback()

    const j = await res.json()
    const text: string = j?.choices?.[0]?.message?.content ?? ''
    const parsed = parseLlmJson(text)
    if (!parsed) return fallback()

    const outfits: FinalOutfit[] = []
    for (const o of parsed.slice(0, 3)) {
      // LLM 给的是 1-based 候选序号
      const pick = candidates[o.item_indices[0] - 1]
      if (!pick) continue
      outfits.push({
        items: pick.items,
        title: typeof o.title === 'string' && o.title ? o.title : autoTitle(pick.items, ctx, 0),
        reason: o.reason,
      })
    }

    if (outfits.length === 0) return fallback()
    return { outfits, source: 'llm' }
  } catch {
    return fallback()
  }
}
