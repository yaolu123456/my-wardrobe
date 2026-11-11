'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Gender, Item, Occasion, Season, RecommendContext } from '@/lib/types'
import {
  guessOccasion,
  currentSeason,
  weekdayIndex,
  OCCASION_LABEL,
} from '@/lib/occasion'
import { weatherLabel } from '@/lib/weather'
import type { Weather } from '@/lib/weather'
import { getWeather } from '@/lib/weatherClient'
import type { RecentWear } from '@/lib/recommend'
import { outfitKey, outfitCoreKey } from '@/lib/recommend'
import { recommendOutfits } from '@/lib/recommendClient'
import { OccasionChips, OutfitCard, type RecommendedOutfit } from './OutfitCard'

const WEEK_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

const GENDER_OPTIONS: { value: Gender | null; label: string }[] = [
  { value: null, label: '不限' },
  { value: 'men', label: '男装' },
  { value: 'women', label: '女装' },
]

interface Props {
  items: Item[]
  recent: RecentWear
  /** 用户性别偏好；传 null 表示不按性别过滤 */
  gender?: Gender | null
  /** 传了才显示性别选择器（今日页要，其他页不要） */
  onGenderChange?: (g: Gender | null) => void
  onLogWear: (outfit: RecommendedOutfit, occasion: Occasion, temp: number) => Promise<void>
  onDislike: (outfit: RecommendedOutfit) => void
  onLike: (outfit: RecommendedOutfit) => void
}

export function TodayScreen({
  items,
  recent,
  gender = null,
  onGenderChange,
  onLogWear,
  onDislike,
  onLike,
}: Props) {  const now = useMemo(() => new Date(), [])

  const [weather, setWeather] = useState<Weather | null>(null)
  const [occasion, setOccasion] = useState<Occasion>(() => guessOccasion({ date: now }))
  const [touched, setTouched] = useState(false)
  const [outfits, setOutfits] = useState<RecommendedOutfit[]>([])
  const [loading, setLoading] = useState(true)
  const [cold, setCold] = useState<string | null>(null)
  const [season, setSeason] = useState<Season>(() => currentSeason(now))
  const [nonce, setNonce] = useState(0)
  /** 连续「换一批」的次数，用来在小衣橱里兜底回到第一轮 */
  const [swapDepth, setSwapDepth] = useState(0)
  /** 已经展示过的搭配，攒着一起排除，避免换出来的还是老面孔 */
  const [seenKeys, setSeenKeys] = useState<Set<string>>(() => new Set())
  /** 已经展示过的核心（上+下），保证每次真的换了衣服而不只是换了鞋 */
  const [seenCores, setSeenCores] = useState<Set<string>>(() => new Set())
  /** 候选搭配已经全部展示过 —— 再怎么换也只能重复了 */
  const [exhausted, setExhausted] = useState(false)

  const today = useMemo(() => fmtDate(now), [now])

  const autoLabel = useMemo(() => {
    const wd = WEEK_LABEL[weekdayIndex(now)]
    const base = `按${wd}${wd === '周五' && now.getHours() >= 18 ? '晚' : ''}自动猜的，不对就点上面改`
    return base
  }, [now])

  // ---- 天气 ----
  useEffect(() => {
    let alive = true
    // getWeather 内部已经做了三层降级：服务端代理 → 直连 Open-Meteo → 18°C 兜底。
    // 它永远不会 reject，所以这里不用 catch。
    getWeather().then((w) => {
      if (alive) setWeather(w)
    })
    return () => {
      alive = false
    }
  }, [])

  // ---- 推荐 ----
  const fetchRecommend = useCallback(
    async (
      occ: Occasion,
      feelsLike: number,
      rain: number,
      excludeKeys?: string[],
      excludeCoreKeys?: string[],
    ) => {
      setLoading(true)
      setCold(null)
      const ctx: RecommendContext = {
        occasion: occ,
        feelsLike,
        rainChance: rain,
        season,
        today,
        // 传了性别就只推同性别 + 中性款
        ...(gender ? { gender } : {}),
      }
      try {
        // recommendOutfits 内部会在"服务端可用"和"本地规则"之间自动选择，
        // 所以 APK 断网时这条路照样通，只是理由换成模板。
        const j = await recommendOutfits({
          items,
          recent: serializeRecent(recent),
          context: ctx,
          exclude: excludeKeys,
          excludeCores: excludeCoreKeys,
        })
        if (j.cold) {
          setCold(j.message ?? '衣橱件数还不够')
          setOutfits([])
        } else if (j.outfits?.length) {
          setOutfits(j.outfits)
          setExhausted(Boolean(j.exhausted))
        } else {
          setCold(j.message ?? '今天凑不出整套，试试换个场合')
          setOutfits([])
        }
      } catch {
        setCold('推荐服务暂时连不上，稍后再试')
        setOutfits([])
      } finally {
        setLoading(false)
      }
    },
    [items, recent, season, today, gender],
  )

  const prevGender = useRef(gender)
  useEffect(() => {
    // 换性别等于换了一整批候选，之前「换一批」攒的排除集合必须清掉，
    // 否则男装推荐会被女装时排除过的组合牵着走。
    if (prevGender.current === gender) return
    prevGender.current = gender
    setSeenKeys(new Set())
    setSeenCores(new Set())
    setSwapDepth(0)
    setExhausted(false)
  }, [gender])

  useEffect(() => {
    if (!weather) return
    fetchRecommend(occasion, weather.feelsLike, weather.rainChance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather, occasion, nonce, gender])

  /**
   * 「换一批」：累积排除已经展示过的所有搭配，让服务端挑没露过面的。
   * 只 +1 nonce 是不够的 —— 打分是确定性的，重新请求会拿回一模一样的结果，
   * 用户看到的就是"点了没反应"。
   */
  const swapAll = useCallback(() => {
    if (!weather) return
    const shownKeys = outfits.map((o) => outfitKey(o.items))
    const shownCores = outfits.map((o) => outfitCoreKey(o.items))
    const nextSeen = new Set([...seenKeys, ...shownKeys])
    const nextSeenCores = new Set([...seenCores, ...shownCores])

    // 换到第 6 轮或者核心快见底了，就重置一轮，免得来回空转
    if (swapDepth >= 6) {
      setSeenKeys(new Set())
      setSeenCores(new Set())
      setSwapDepth(0)
      setExhausted(false)
      fetchRecommend(occasion, weather.feelsLike, weather.rainChance)
      return
    }

    setSeenKeys(nextSeen)
    setSeenCores(nextSeenCores)
    setSwapDepth((d) => d + 1)
    fetchRecommend(
      occasion,
      weather.feelsLike,
      weather.rainChance,
      Array.from(nextSeen),
      Array.from(nextSeenCores),
    )
  }, [outfits, weather, occasion, swapDepth, seenKeys, seenCores, fetchRecommend])

  /** 已经被点过 ✕ 的整套搭配：只用来做视觉标记，不触发重新请求 */
  const dislikedKeys = recent.dislikedOutfitKeys ?? new Set<string>()
  /** 已经被 ♡ 收藏的整套搭配 */
  const likedKeys = recent.likedOutfitKeys ?? new Set<string>()

  const rainy = (weather?.rainChance ?? 0) > 0.4

  return (
    <div className="pb-4">
      {/* 天气条 */}
      <div className="rounded-2xl bg-gradient-to-br from-accent to-[#3d7364] text-[#eaf2ee] px-4 py-3.5 mb-4 shadow-[0_6px_18px_rgba(47,93,80,.22)]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{rainy ? '🌧' : (weather?.code ?? 0) === 0 ? '☀️' : '☁️'}</span>
          <div>
            <div className="text-[28px] font-bold leading-none tracking-tight">
              {weather ? Math.round(weather.feelsLike) : '--'}°
            </div>
            <div className="text-xs opacity-80 mt-1 leading-snug">
              {weather
                ? `${weather.city} · ${weatherLabel(weather.code)} · 降水 ${Math.round(weather.rainChance * 100)}%`
                : '正在取天气…'}
            </div>
          </div>
        </div>
      </div>

      <OccasionChips
        value={occasion}
        onChange={(o) => {
          setOccasion(o)
          setTouched(true)
          // 换场合就是另一套逻辑，之前攒的排除集合要清掉
          setSeenKeys(new Set())
          setSeenCores(new Set())
          setSwapDepth(0)
          setExhausted(false)
        }}
        autoGuessed={touched ? '已手动切换' : autoLabel}
      />

      {/*
        性别筛选放在这里，而不是挤在右上角做个小标签。
        原来那个 11px 的小胶囊看起来像个状态标记，用户根本不知道能点。
      */}
      {onGenderChange && (
        <div className="flex items-center gap-2 mb-3 -mt-1">
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
          {gender && (
            <span className="text-[11px] text-ink3">· 中性款也包含</span>
          )}
        </div>
      )}

      {loading && <SkeletonList />}

      {!loading && cold && (
        <div className="rounded-2xl bg-card border border-line p-5 text-center">
          <div className="text-2xl mb-2">🧺</div>
          <p className="text-sm text-ink2 leading-relaxed">{cold}</p>
        </div>
      )}

      {!loading &&
        outfits.map((o, i) => {
          const key = outfitKey(o.items)
          return (
            <OutfitCard
              key={`${nonce}-${i}-${key}`}
              outfit={o}
              rank={i + 1}
              disliked={dislikedKeys.has(key)}
              liked={likedKeys.has(key)}
              onWear={() => onLogWear(o, occasion, weather?.feelsLike ?? 18)}
              // ✕ / ♡ 都只记录、不换卡 —— 它们是打分信号。
              // 换衣服是「换一批」的职责，两件事不该混在一起。
              onDislike={() => onDislike(o)}
              onLike={() => onLike(o)}
              onSwap={swapAll}
            />
          )
        })}

      {!loading && outfits.length > 0 && (
        <p className="text-[11.5px] text-ink3 text-center leading-relaxed mt-1">
          规则筛 → 打分排序 → 大模型挑 3 套并写理由
        </p>
      )}

      {!loading && exhausted && outfits.length > 0 && (
        <p className="text-[11.5px] text-warn text-center leading-relaxed mt-2 px-4">
          这个温度口味下的搭配都看完了。换换场合、或再录几件衣服会有新组合。
        </p>
      )}
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-line p-4 animate-pulse">
          <div className="h-4 w-2/3 bg-line rounded mb-3" />
          <div className="flex gap-2 mb-3">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex-1 aspect-[1/1.18] bg-line rounded-[11px]" />
            ))}
          </div>
          <div className="h-8 bg-line rounded-xl" />
        </div>
      ))}
    </div>
  )
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function serializeRecent(r: RecentWear) {
  return {
    wornItemDates: r.wornItemDates,
    likedItemIds: Array.from(r.likedItemIds),
    // Set 过不了 JSON，必须转数组；服务端会重建
    dislikedItemIds: Array.from(r.dislikedItemIds ?? []),
    dislikedOutfitKeys: Array.from(r.dislikedOutfitKeys ?? []),
    likedOutfitKeys: Array.from(r.likedOutfitKeys ?? []),
  }
}

export { OCCASION_LABEL }
