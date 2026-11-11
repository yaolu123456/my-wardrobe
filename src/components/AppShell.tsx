'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Item, WearLog, Occasion, Gender } from '@/lib/types'
import { useAuth } from './AuthGate'
import {
  listItems,
  listWearLogs,
  createItem,
  logWear,
  rateWearLog,
  sendFeedback,
  setItemStatus,
  updateItem,
  deleteItem,
  loadRecentWear,
  signOut,
  clearOutfitFeedback,
} from '@/lib/data'
import { DEMO_ITEMS, DEMO_WEAR } from '@/lib/demo'
import { outfitKey } from '@/lib/recommend'
import { loadCachedItems, loadCachedLogs, saveCachedItems, saveCachedLogs, pushPending } from '@/lib/offlineStore'
import { syncPending } from '@/lib/sync'
import { TodayScreen } from './TodayScreen'
import { ClosetScreen } from './ClosetScreen'
import { AddScreen } from './AddScreen'
import { LogScreen } from './LogScreen'
import { ItemSheet } from './ItemSheet'
import type { RecommendedOutfit } from './OutfitCard'
import type { RecentWear } from '@/lib/recommend'

type Tab = 'today' | 'closet' | 'add' | 'log'

/** 性别偏好的存储键 */
const GENDER_KEY = 'wardrobe:gender'

const TITLES: Record<Tab, [string, string]> = {
  today: ['今日', ''],
  closet: ['衣柜', ''],
  add: ['入库', '拍照 → 自动打标 → 确认'],
  log: ['记录', ''],
}

export function AppShell() {
  const { demo, loading: authLoading, exitDemo } = useAuth()
  const [tab, setTab] = useState<Tab>(() => {
    // 支持 #closet / #add / #log 深链，也方便截图与分享
    if (typeof window === 'undefined') return 'today'
    const h = window.location.hash.replace('#', '') as Tab
    return (['today', 'closet', 'add', 'log'] as Tab[]).includes(h) ? h : 'today'
  })
  const [items, setItems] = useState<Item[]>([])
  const [logs, setLogs] = useState<WearLog[]>([])
  const [recent, setRecent] = useState<RecentWear>({
    wornItemDates: {},
    likedItemIds: new Set(),
    dislikedItemIds: new Set(),
    dislikedOutfitKeys: new Set(),
    likedOutfitKeys: new Set(),
  })
  const [open, setOpen] = useState<Item | null>(null)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /**
   * 用户性别偏好。只推荐同性别 + 中性的单品。
   * 存在 localStorage 里就够了：它只是个人偏好，不需要跟着账号走。
   * 不设置（null）时不按性别过滤，全部展示。
   */
  const [gender, setGender] = useState<Gender | null>(() => {
    if (typeof window === 'undefined') return null
    const v = localStorage.getItem(GENDER_KEY)
    return v === 'men' || v === 'women' ? v : null
  })

  useEffect(() => {
    if (gender) localStorage.setItem(GENDER_KEY, gender)
    else localStorage.removeItem(GENDER_KEY)
  }, [gender])

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    let alive = true
    async function boot() {
      setBooting(true)
      setError(null)
      try {
        if (demo) {
          setItems(DEMO_ITEMS)
          setLogs(DEMO_WEAR.map((w, i) => ({ ...w, id: `demo-log-${i}`, created_at: '' })) as WearLog[])
          const wornItemDates: Record<string, string[]> = {}
          for (const w of DEMO_WEAR) {
            for (const id of w.item_ids) {
              ;(wornItemDates[id] ??= []).push(w.worn_date)
            }
          }
          if (alive) setRecent({
            wornItemDates,
            likedItemIds: new Set(),
            dislikedItemIds: new Set(),
            dislikedOutfitKeys: new Set(),
            likedOutfitKeys: new Set(),
          })
        } else {
          // 离线优先：先把本地缓存渲染出来，别让用户对着白屏等网络
          const cachedItems = loadCachedItems()
          const cachedLogs = loadCachedLogs()
          if (cachedItems.length && alive) {
            setItems(cachedItems)
            setBooting(false)
          }
          if (cachedLogs.length && alive) setLogs(cachedLogs)

          try {
            const [its, ls, r] = await Promise.all([
              listItems(),
              listWearLogs(90),
              loadRecentWear(),
            ])
            if (!alive) return
            setItems(its)
            setLogs(ls)
            setRecent(r)
            // 云端拉到了，刷新本地镜像
            saveCachedItems(its)
            saveCachedLogs(ls)
          } catch {
            // 断网 / Supabase 不可达 —— 缓存已经渲染过了，这里静默降级
            if (alive && !cachedItems.length) {
              setError('当前离线，显示的是本地缓存。联网后会自动同步。')
            }
          }

          // 把上次没推成功的操作补推一次（不 await，不挡界面）
          syncPending().then((r) => {
            if (alive && r.ok && r.pushed > 0) {
              setError(null)
            }
          })
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (alive) setBooting(false)
      }
    }
    if (!authLoading) boot()
    return () => {
      alive = false
    }
  }, [demo, authLoading])

  // ---------- 动作 ----------

  /**
   * 网络恢复时自动补推离线期间攒下的操作。
   * 手机在地铁里改了几件衣服，出站连上 WiFi 就自动同步，不用手动点。
   */
  useEffect(() => {
    if (demo) return
    async function flush() {
      const r = await syncPending()
      if (r.ok && r.pushed > 0) {
        setError(null)
        // 补推成功后再拉一次全量，把服务端生成的 id 换回本地
        try {
          const its = await listItems()
          setItems(its)
          saveCachedItems(its)
        } catch {
          /* 还是不行就下次再说 */
        }
      }
    }
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [demo])

  async function handleLogWear(o: RecommendedOutfit, occasion: Occasion, temp: number) {
    const row: WearLog = {
      id: `local-${Date.now()}`,
      worn_date: today,
      item_ids: o.items.map((i) => i.id),
      outfit_title: o.title,
      occasion,
      temp,
      rating: null,
      note: null,
      created_at: new Date().toISOString(),
    }

    setLogs((l) => {
      const rest = l.filter((x) => !(x.worn_date === today && x.outfit_title === o.title))
      return [row, ...rest]
    })
    setItems((its) =>
      its.map((it) =>
        o.items.some((x) => x.id === it.id)
          ? { ...it, times_worn: it.times_worn + 1, last_worn: today }
          : it,
      ),
    )
    setRecent((r) => {
      const m = { ...r.wornItemDates }
      for (const it of o.items) m[it.id] = [today, ...(m[it.id] ?? [])]
      return { ...r, wornItemDates: m }
    })

    if (!demo) {
      try {
        await logWear({
          worn_date: today,
          item_ids: row.item_ids,
          outfit_title: row.outfit_title ?? undefined,
          occasion,
          temp,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存失败')
      }
    }
  }

  /**
   * 退出登录。真实账号之前根本没有这个入口 —— 只有示例模式有「退出示例」，
   * 登录之后就再也回不到登录页，换账号只能清浏览器存储。
   */
  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      // 就算网络失败也要把本地会话清掉，否则界面会卡在 App 里
    }
    setItems([])
    setLogs([])
    setRecent({
      wornItemDates: {},
      likedItemIds: new Set(),
      dislikedItemIds: new Set(),
      dislikedOutfitKeys: new Set(),
      likedOutfitKeys: new Set(),
    })
    // signOut 成功后 onAuthStateChange 会把 user 置空，Root 自动切回登录页
  }

  /**
   * 「不要这套」：打分信号，不是"换一套"的快捷键。
   * 点了只标记 + 降分，卡片留在原地。再点一次可以反悔。
   */
  function handleDislike(o: RecommendedOutfit) {
    const key = outfitKey(o.items)
    const already = recent.dislikedOutfitKeys?.has(key) ?? false

    setRecent((r) => {
      const next = new Set(r.dislikedOutfitKeys ?? [])
      if (already) next.delete(key)
      else next.add(key)
      // 一套不能既收藏又不要，互相排斥
      const nextLiked = new Set(r.likedOutfitKeys ?? [])
      if (!already) nextLiked.delete(key)
      return { ...r, dislikedOutfitKeys: next, likedOutfitKeys: nextLiked }
    })

    if (!demo) {
      clearOutfitFeedback(key, 'like').catch(() => {})
      if (already) clearOutfitFeedback(key, 'dislike').catch(() => {})
      else sendFeedback({ outfit_key: key, signal: 'dislike' }).catch(() => {
        pushPending({ kind: 'feedback', outfitKey: key, signal: 'dislike', at: Date.now() })
      })
    }
  }

  /**
   * 「收藏这套」：正面打分信号，同理只标记不换卡。
   */
  function handleLike(o: RecommendedOutfit) {
    const key = outfitKey(o.items)
    const already = recent.likedOutfitKeys?.has(key) ?? false

    setRecent((r) => {
      const next = new Set(r.likedOutfitKeys ?? [])
      if (already) next.delete(key)
      else next.add(key)
      const nextDisliked = new Set(r.dislikedOutfitKeys ?? [])
      if (!already) nextDisliked.delete(key)
      return { ...r, likedOutfitKeys: next, dislikedOutfitKeys: nextDisliked }
    })

    if (!demo) {
      clearOutfitFeedback(key, 'dislike').catch(() => {})
      if (already) clearOutfitFeedback(key, 'like').catch(() => {})
      else sendFeedback({ outfit_key: key, signal: 'like' }).catch(() => {
        pushPending({ kind: 'feedback', outfitKey: key, signal: 'like', at: Date.now() })
      })
    }
  }

  async function handleCreate(patch: Partial<Item> & { category: Item['category'] }) {
    // 新入库的单品默认跟随用户的性别偏好 —— 大部分时候买的就是自己穿的。
    // 没设偏好就落 unisex，谁都能用。
    const withGender = { ...patch, gender: patch.gender ?? gender ?? 'unisex' }
    if (demo) {
      const created: Item = {
        id: `demo-new-${Date.now()}`,
        name: withGender.name ?? null,
        category: withGender.category,
        gender: withGender.gender,
        subcategory: withGender.subcategory ?? null,
        color_name: withGender.color_name ?? null,
        color_hex: withGender.color_hex ?? '#888888',
        secondary_colors: [],
        pattern: withGender.pattern ?? 'solid',
        material: withGender.material ?? null,
        style_tags: withGender.style_tags ?? [],
        season: withGender.season ?? [],
        formality: withGender.formality ?? 3,
        warmth: withGender.warmth ?? 3,
        fit: withGender.fit ?? 'regular',
        image_url: withGender.image_url ?? null,
        cutout_url: null,
        brand: null,
        status: 'active',
        times_worn: 0,
        last_worn: null,
        favorite: false,
        notes: null,
        created_at: new Date().toISOString(),
      }
      setItems((its) => [created, ...its])
      return
    }
    // 先乐观插一条本地记录，界面立刻有反应
    const tempId = `local-${Date.now()}`
    const optimistic: Item = {
      id: tempId,
      name: withGender.name ?? null,
      category: withGender.category,
      gender: withGender.gender,
      subcategory: withGender.subcategory ?? null,
      color_name: withGender.color_name ?? null,
      color_hex: withGender.color_hex ?? '#888888',
      secondary_colors: withGender.secondary_colors ?? [],
      pattern: withGender.pattern ?? 'solid',
      material: withGender.material ?? null,
      style_tags: withGender.style_tags ?? [],
      season: withGender.season ?? [],
      formality: withGender.formality ?? 3,
      warmth: withGender.warmth ?? 3,
      fit: withGender.fit ?? 'regular',
      image_url: withGender.image_url ?? null,
      cutout_url: null,
      brand: null,
      status: 'active',
      times_worn: 0,
      last_worn: null,
      favorite: false,
      notes: null,
      created_at: new Date().toISOString(),
    }
    setItems((its) => {
      const next = [optimistic, ...its]
      saveCachedItems(next)
      return next
    })

    try {
      const created = await createItem(withGender)
      setItems((its) => {
        const next = its.map((x) => (x.id === tempId ? created : x))
        saveCachedItems(next)
        return next
      })
    } catch {
      // 离线：留在本地并记账，联网后补推
      pushPending({ kind: 'createItem', tempId, patch: withGender, at: Date.now() })
    }
  }

  async function handleRate(logId: string, rating: number) {
    setLogs((ls) => ls.map((l) => (l.id === logId ? { ...l, rating } : l)))
    if (!demo) {
      try {
        await rateWearLog(logId, rating)
      } catch {
        /* 静默失败，下次进来还能改 */
      }
    }
  }

  async function handleStore(it: Item) {
    const next = it.status === 'stored' ? 'active' : 'stored'
    setItems((its) => its.map((x) => (x.id === it.id ? { ...x, status: next } : x)))
    setOpen(null)
    if (!demo) await setItemStatus(it.id, next).catch(() => {})
  }

  async function handleDelete(it: Item) {
    setItems((its) => its.filter((x) => x.id !== it.id))
    setOpen(null)
    if (!demo) {
      setItems((its) => {
        const next = its.filter((x) => x.id !== it.id)
        saveCachedItems(next)
        return next
      })
      try {
        await deleteItem(it.id)
      } catch {
        // 删除失败就排队，联网时再删 —— 本地已经看不到了，体验上是对的
        pushPending({ kind: 'deleteItem', id: it.id, at: Date.now() })
      }
    }
  }

  /**
   * 改单品的字段（材质、保暖、类别…）。
   * 先更新本地状态让界面立刻响应，再落库；示例模式只改内存。
   */
  async function handleUpdateItem(it: Item, patch: Partial<Item>) {
    const next = { ...it, ...patch } as Item
    setItems((its) => its.map((x) => (x.id === it.id ? next : x)))
    // 详情面板还开着，同步一下，否则关掉再开看到的是旧值
    setOpen((cur) => (cur && cur.id === it.id ? next : cur))
    if (demo) return
    try {
      const saved = await updateItem(it.id, patch)
      setItems((its) => its.map((x) => (x.id === it.id ? saved : x)))
      setOpen((cur) => (cur && cur.id === it.id ? saved : cur))
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
  }

  async function handleWearSingle(it: Item) {
    setItems((its) =>
      its.map((x) =>
        x.id === it.id ? { ...x, times_worn: x.times_worn + 1, last_worn: today } : x,
      ),
    )
    setOpen(null)
    const row: WearLog = {
      id: `local-${Date.now()}`,
      worn_date: today,
      item_ids: [it.id],
      outfit_title: `${it.name ?? '单品'} 单穿`,
      occasion: null,
      temp: null,
      rating: null,
      note: null,
      created_at: new Date().toISOString(),
    }
    setLogs((l) => [row, ...l])
    if (!demo) {
      await logWear({
        worn_date: today,
        item_ids: [it.id],
        outfit_title: row.outfit_title ?? undefined,
      }).catch(() => {})
    }
  }

  // ---------- 渲染 ----------

  const neverWornCount = items.filter((i) => i.times_worn === 0).length
  const itemColors = useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, i.color_hex])),
    [items],
  )

  if (booting || authLoading) {
    return (
      <div className="min-h-dvh grid place-items-center text-sm text-ink3">加载中…</div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-[440px] mx-auto bg-bg">
      <header className="px-5 pt-6 pb-3 shrink-0">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {tab === 'today'
                ? OCCASION_HEAD_TITLE(items)
                : TITLES[tab][0]}
            </h1>
            <div className="text-xs text-ink3 mt-1">
              {tab === 'today' && `${fmtCnDate(today)} · ${items.length} 件在衣柜里`}
              {tab === 'closet' && `${items.length} 件 · ${neverWornCount} 件从未穿过`}
              {tab === 'add' && TITLES.add[1]}
              {tab === 'log' && `近 90 天 ${new Set(logs.map((l) => l.worn_date)).size} 天有记录`}
            </div>
          </div>
          <div className="flex items-center gap-2 mb-1">
            {/* 性别偏好：只影响推荐，不改变已有数据 */}
            <button
              onClick={() => setGender(gender === 'men' ? 'women' : gender === 'women' ? null : 'men')}
              title="切换男装/女装（只看自己的 + 中性款）"
              className={`text-[11px] rounded-full px-2 py-0.5 border transition ${
                gender
                  ? 'border-accent text-accent bg-accentSoft'
                  : 'border-line text-ink3'
              }`}
            >
              {gender === 'men' ? '男装' : gender === 'women' ? '女装' : '不限'}
            </button>
            {demo ? (
              <button
                onClick={exitDemo}
                className="text-[11px] text-ink3 underline underline-offset-4"
              >
                退出示例
              </button>
            ) : (
              <button
                onClick={handleSignOut}
                className="text-[11px] text-ink3 underline underline-offset-4"
              >
                退出登录
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-5 mb-2 rounded-lg bg-[#fdf3e7] text-[#a9702a] text-xs px-3 py-2">
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 pb-28 no-scrollbar">
        {tab === 'today' && (
          <TodayScreen
            items={items}
            recent={recent}
            gender={gender}
            onLogWear={handleLogWear}
            onDislike={handleDislike}
            onLike={handleLike}
          />
        )}
        {tab === 'closet' && (
          <ClosetScreen
            items={items}
            today={today}
            onOpen={setOpen}
            onUpload={() => setTab('add')}
          />
        )}
        {tab === 'add' && (
          <AddScreen demo={demo} onCreate={handleCreate} onDone={() => setTab('closet')} />
        )}
        {tab === 'log' && (
          <LogScreen
            logs={logs}
            totalItems={items.length}
            neverWornCount={neverWornCount}
            itemColors={itemColors}
            onRate={handleRate}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/90 backdrop-blur-xl border-t border-line pb-safe z-30">
        <div className="flex px-2 pt-2 pb-2">
          {(
            [
              ['today', '✦', '今日'],
              ['closet', '▦', '衣柜'],
              ['add', '＋', '入库'],
              ['log', '◷', '记录'],
            ] as const
          ).map(([k, icon, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition active:scale-95 ${
                tab === k ? 'text-ink' : 'text-ink3'
              }`}
            >
              <span className="text-[19px] leading-none">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>

      <ItemSheet
        item={open}
        onClose={() => setOpen(null)}
        onWear={handleWearSingle}
        onStore={handleStore}
        onDelete={handleDelete}
        onUpdate={handleUpdateItem}
      />
    </div>
  )
}

function OCCASION_HEAD_TITLE(items: Item[]): string {
  if (items.length === 0) return '先录几件衣服'
  return '今日'
}

function fmtCnDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`
}
