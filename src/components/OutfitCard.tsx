'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import type { Item, Occasion } from '@/lib/types'
import { OCCASION_LABEL } from '@/lib/occasion'

export interface RecommendedOutfit {
  title: string
  reason: string
  items: Item[]
  score?: number
}

export function OutfitCard({
  outfit,
  rank,
  onWear,
  onDislike,
  onLike,
  onSwap,
  disliked = false,
  liked = false,
}: {
  outfit: RecommendedOutfit
  rank: number
  onWear: () => void
  /** ✕ 不要这套：降分排后 */
  onDislike: () => void
  /** ♡ 收藏这套：加分排前 */
  onLike: () => void
  onSwap: () => void
  disliked?: boolean
  liked?: boolean
}) {
  const [worn, setWorn] = useState(false)

  const garments = outfit.items
  const dimmed = disliked && !liked

  return (
    <article
      className={`rounded-2xl bg-card border p-4 mb-3.5 transition ${
        rank === 1 ? 'border-accent shadow-[0_6px_20px_rgba(47,93,80,.12)]' : 'border-line'
      } ${dimmed ? 'opacity-60' : ''}`}
    >
      <header className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-md bg-accentSoft text-accent text-[11px] font-bold grid place-items-center shrink-0">
          {rank}
        </span>
        <h3 className="text-sm font-semibold tracking-tight flex-1 truncate">
          {outfit.title}
        </h3>
        {typeof outfit.score === 'number' && (
          <span
            className={`text-[11px] tabular-nums ${
              disliked ? 'text-warn' : liked ? 'text-accent' : 'text-ink3'
            }`}
          >
            {outfit.score.toFixed(2)}
          </span>
        )}
      </header>

      <div className="flex gap-2 mb-3">
        {garments.map((it) => (
          <Thumb key={it.id} item={it} />
        ))}
      </div>

      <p className="text-[12.5px] leading-relaxed text-ink2 bg-[#faf9f7] rounded-xl px-3 py-2.5 border-l-2 border-accentSoft">
        {outfit.reason}
      </p>

      {disliked && (
        <p className="text-[11.5px] text-warn mt-2 leading-relaxed">
          已标记不要这套 —— 下次推荐会往后排
        </p>
      )}
      {liked && (
        <p className="text-[11.5px] text-accent mt-2 leading-relaxed">
          已收藏 —— 这类组合以后会优先给你
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            setWorn(true)
            onWear()
          }}
          className={`flex-1 rounded-[10px] py-2.5 text-[13px] font-semibold transition active:scale-[.97] ${
            worn ? 'bg-accent text-white' : 'bg-ink text-white'
          }`}
        >
          {worn ? '✓ 已记录' : '就这套'}
        </button>
        <button
          onClick={onSwap}
          className="rounded-[10px] px-3 py-2.5 text-[13px] font-semibold bg-[#f2f0ec] text-ink2 active:scale-[.97] transition"
        >
          换一批
        </button>
        <button
          onClick={onDislike}
          aria-label={disliked ? '取消不要这套' : '不要这套'}
          aria-pressed={disliked}
          title="不要这套"
          className={`rounded-[10px] w-10 py-2.5 text-[14px] leading-none active:scale-[.97] transition ${
            disliked ? 'bg-[#f7e8e8] text-warn' : 'bg-[#f2f0ec] text-ink3'
          }`}
        >
          ✕
        </button>
        <button
          onClick={onLike}
          aria-label={liked ? '取消收藏' : '收藏这套'}
          aria-pressed={liked}
          title="收藏这套"
          className={`rounded-[10px] w-10 py-2.5 text-[15px] leading-none active:scale-[.97] transition ${
            liked ? 'bg-accentSoft text-accent' : 'bg-[#f2f0ec] text-ink3'
          }`}
        >
          {liked ? '♥' : '♡'}
        </button>
      </div>
    </article>
  )
}

function Thumb({ item }: { item: Item }) {
  const bg = useMemo(() => tintOf(item.color_hex), [item.color_hex])
  return (
    <div
      className="flex-1 rounded-[11px] border border-black/[.045] flex flex-col items-center justify-center gap-1.5 overflow-hidden py-2"
      style={{ background: bg }}
      title={item.name ?? undefined}
    >
      {item.image_url ? (
        <div className="relative w-full aspect-square">
          <Image
            src={item.image_url}
            alt={item.name ?? '单品'}
            fill
            sizes="80px"
            className="object-cover rounded-lg"
          />
        </div>
      ) : (
        <span
          className="w-6 h-6 rounded-full shadow-[inset_0_-6px_12px_rgba(0,0,0,.14),0_1px_3px_rgba(0,0,0,.12)]"
          style={{ background: item.color_hex }}
        />
      )}
      <span className="text-[10px] text-[#4a453d] text-center leading-tight px-1 line-clamp-2">
        {item.name ?? item.subcategory ?? ''}
      </span>
    </div>
  )
}

/** 用主色生成一个极浅背景，比纯灰卡片有生气 */
export function tintOf(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c * 0.12 + 248 * 0.88)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

export function OccasionChips({
  value,
  onChange,
  autoGuessed,
}: {
  value: Occasion
  onChange: (o: Occasion) => void
  autoGuessed: string
}) {
  const all: Occasion[] = ['work', 'casual', 'date', 'sport', 'formal']
  return (
    <div className="mb-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {all.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] border transition active:scale-95 ${
              value === o
                ? 'bg-ink text-white border-ink'
                : 'bg-card text-ink2 border-line'
            }`}
          >
            {OCCASION_LABEL[o]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink3">{autoGuessed}</p>
    </div>
  )
}
