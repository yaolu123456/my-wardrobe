'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import type { Gender, Item } from '@/lib/types'
import { CATEGORY_LABEL, CATEGORY_ORDER, itemMeta, wearLabel, sleepingDays } from '@/lib/display'
import { tintOf } from './OutfitCard'

const GENDER_OPTIONS: { value: Gender | null; label: string }[] = [
  { value: null, label: '不限' },
  { value: 'men', label: '男装' },
  { value: 'women', label: '女装' },
]

export function ClosetScreen({
  items,
  today,
  gender,
  onGenderChange,
  onOpen,
  onUpload,
}: {
  items: Item[]
  today: string
  /** 性别筛选。和今日页共用同一个偏好，切了那边这边也跟着变 */
  gender?: Gender | null
  onGenderChange?: (g: Gender | null) => void
  onOpen: (item: Item) => void
  onUpload: () => void
}) {
  const [cat, setCat] = useState<Item['category'] | 'all'>('all')

  /**
   * 先按性别筛一遍，后面的类目计数和列表都基于这批。
   * 不这么做的话会出现「全部 50」但列表只有 15 件的矛盾。
   * 中性款两种视角都算 —— 它们本来就是谁都能穿。
   */
  const byGender = useMemo(
    () =>
      gender ? items.filter((i) => i.gender === gender || i.gender === 'unisex') : items,
    [items, gender],
  )

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of byGender) m.set(i.category, (m.get(i.category) ?? 0) + 1)
    return m
  }, [byGender])

  const shown = useMemo(
    () => (cat === 'all' ? byGender : byGender.filter((i) => i.category === cat)),
    [byGender, cat],
  )

  const shownNeverWorn = shown.filter((i) => i.times_worn === 0).length
  /** 有筛选时才显示筛选结果，否则放任和顶部重复的件数没意义 */
  const filtering = (gender ?? null) !== null || cat !== 'all'

  return (
    <div>
      {filtering && (
        <p className="text-[12px] text-ink3 mb-2.5">
          筛出 {shown.length} 件
          {shownNeverWorn > 0 && ` · ${shownNeverWorn} 件从未穿过`}
        </p>
      )}

      {onGenderChange && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] text-ink3 shrink-0">看</span>
          <div className="flex gap-1.5">
            {GENDER_OPTIONS.map((opt) => {
              const active = (gender ?? null) === opt.value
              return (
                <button
                  key={opt.label}
                  onClick={() => onGenderChange(opt.value)}
                  className={`rounded-pill px-3 py-1 text-[12px] border transition active:scale-95 ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-card text-ink2 border-line'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {gender && <span className="text-[11px] text-ink3">· 含中性款</span>}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
        <Chip active={cat === 'all'} onClick={() => setCat('all')}>
          全部 {byGender.length}
        </Chip>
        {CATEGORY_ORDER.map((c) => {
          const n = counts.get(c) ?? 0
          if (n === 0) return null
          return (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {CATEGORY_LABEL[c]} {n}
            </Chip>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-card border border-line p-8 text-center">
          <div className="text-2xl mb-2">🧺</div>
          <p className="text-sm text-ink2 mb-4">这里还是空的</p>
          <button
            onClick={onUpload}
            className="rounded-xl bg-ink text-white px-5 py-2.5 text-sm font-semibold active:scale-[.98] transition"
          >
            去录第一件
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((it) => {
            const sleep = sleepingDays(it, today)
            const badge = wearLabel(it)
            return (
              <button
                key={it.id}
                onClick={() => onOpen(it)}
                className="text-left rounded-xl bg-card border border-line overflow-hidden active:scale-[.96] transition"
              >
                <div
                  className="aspect-[1/1.1] grid place-items-center relative"
                  style={{ background: tintOf(it.color_hex) }}
                >
                  {it.image_url ? (
                    <Image
                      src={it.image_url}
                      alt={it.name ?? '单品'}
                      fill
                      sizes="120px"
                      className="object-cover"
                    />
                  ) : (
                    <span
                      className="w-9 h-9 rounded-[9px] shadow-[inset_0_-8px_16px_rgba(0,0,0,.16),0_2px_5px_rgba(0,0,0,.1)]"
                      style={{ background: it.color_hex }}
                    />
                  )}
                  {badge && (
                    <span
                      className={`absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-semibold text-white backdrop-blur ${
                        it.times_worn === 0 ? 'bg-warn/90' : 'bg-ink/70'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                  {sleep !== null && sleep >= 30 && it.times_worn > 0 && (
                    <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-ink/50 text-white">
                      {sleep} 天
                    </span>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-[11px] font-semibold leading-tight truncate">
                    {it.name ?? it.subcategory ?? '未命名'}
                  </div>
                  <div className="text-[9.5px] text-ink3 mt-0.5 truncate">{itemMeta(it)}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] border transition active:scale-95 ${
        active ? 'bg-ink text-white border-ink' : 'bg-card text-ink2 border-line'
      }`}
    >
      {children}
    </button>
  )
}
