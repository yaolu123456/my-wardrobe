'use client'

import { useMemo, useState } from 'react'
import type { WearLog } from '@/lib/types'
import { OCCASION_LABEL } from '@/lib/occasion'
import { tintOf } from './OutfitCard'

/**
 * 记录页。统计口径：
 * - 本月穿着天数 = 有记录的不同日期数
 * - 沉睡单品 = 30 天以上没穿（含从未穿）
 */
export function LogScreen({
  logs,
  totalItems,
  neverWornCount,
  itemColors,
  onRate,
}: {
  logs: WearLog[]
  totalItems: number
  neverWornCount: number
  itemColors: Record<string, string>
  onRate: (logId: string, rating: number) => void
}) {
  const [range, setRange] = useState<'30' | '90' | 'all'>('30')

  const shown = useMemo(() => {
    if (range === 'all') return logs
    const n = range === '30' ? 30 : 90
    const since = new Date()
    since.setDate(since.getDate() - n)
    const iso = since.toISOString().slice(0, 10)
    return logs.filter((l) => l.worn_date >= iso)
  }, [logs, range])

  const distinctDays = new Set(shown.map((l) => l.worn_date)).size

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
        {(
          [
            ['30', '近 30 天'],
            ['90', '近 90 天'],
            ['all', '全部'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] border transition active:scale-95 ${
              range === k ? 'bg-ink text-white border-ink' : 'bg-card text-ink2 border-line'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-line px-4 py-3.5 mb-4 flex gap-3">
        <Stat label="有记录" value={distinctDays} unit="天" />
        <Stat label="沉睡单品" value={neverWornCount} unit="件" tone="warn" />
        <Stat label="单品总数" value={totalItems} unit="件" />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-card border border-line p-8 text-center">
          <div className="text-2xl mb-2">📓</div>
          <p className="text-sm text-ink2 leading-relaxed">
            还没有记录。
            <br />
            在「今日」点一次「就这套」，这里就会长出来。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((l) => (
            <DayRow key={l.id} log={l} itemColors={itemColors} onRate={onRate} />
          ))}
        </div>
      )}

      <p className="text-[11.5px] text-ink3 text-center leading-relaxed mt-5">
        记录是为了让推荐不再抽奖
        <br />
        <span className="text-[11px]">穿完随手点一下就好，不用填表</span>
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string
  value: number
  unit: string
  tone?: 'warn'
}) {
  return (
    <div className="flex-1">
      <div className="text-[10.5px] text-ink3">{label}</div>
      <div
        className={`text-[22px] font-bold tracking-tight leading-tight ${
          tone === 'warn' ? 'text-warn' : ''
        }`}
      >
        {value}
        <span className="text-[11px] font-medium text-ink3"> {unit}</span>
      </div>
    </div>
  )
}

function DayRow({
  log,
  itemColors,
  onRate,
}: {
  log: WearLog
  itemColors: Record<string, string>
  onRate: (id: string, r: number) => void
}) {
  const d = new Date(`${log.worn_date}T00:00:00`)
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const isToday = log.worn_date === new Date().toISOString().slice(0, 10)

  return (
    <div className="flex gap-3">
      <div className="w-11 shrink-0 text-center pt-0.5">
        <div className="text-[10px] text-ink3 font-semibold">{isToday ? '今天' : wd}</div>
        <div
          className={`text-[17px] font-bold leading-tight tracking-tight ${
            isToday ? 'text-accent' : ''
          }`}
        >
          {d.getDate()}
        </div>
      </div>

      <div className="flex-1 rounded-xl bg-card border border-line px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[12.5px] font-semibold leading-snug">
            {log.outfit_title ?? '未命名搭配'}
          </div>
          <div className="text-[10.5px] text-ink3 shrink-0">
            {log.temp != null ? `${Math.round(log.temp)}°` : ''}
            {log.occasion ? ` · ${OCCASION_LABEL[log.occasion]}` : ''}
          </div>
        </div>

        <div className="flex gap-1 mt-2 flex-wrap">
          {log.item_ids.slice(0, 8).map((id) => (
            <i
              key={id}
              className="w-4 h-4 rounded block shadow-[inset_0_-4px_8px_rgba(0,0,0,.15)]"
              style={{ background: itemColors[id] ?? '#ccc' }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[10px] text-ink3">穿得怎么样</span>
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => onRate(log.id, s)}
              className={`text-[12px] leading-none transition active:scale-90 ${
                (log.rating ?? 0) >= s ? 'text-[#c9932f]' : 'text-line'
              }`}
              aria-label={`${s} 星`}
            >
              ★
            </button>
          ))}
        </div>

        {log.note && <p className="text-[11px] text-ink2 mt-1.5">{log.note}</p>}
      </div>
    </div>
  )
}

export function colorMapOf(items: { id: string; color_hex: string }[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.id, i.color_hex]))
}

export { tintOf }
