import type { Weather } from './weather'
import { fetchWeather, DEFAULT_COORDS } from './weather'

/**
 * 客户端天气入口。
 *
 * 和推荐同样的三层降级：
 *   1. 先试服务端代理 /api/weather（有 30 分钟缓存，也能藏住用户 IP）
 *   2. 服务端不可用（静态导出后的 APK）→ 直连 Open-Meteo
 *   3. 都没网 → 温和兜底 18°C，推荐照常出
 *
 * 天气只是推荐的一个输入，它挂了不该让整个页面白掉。
 */

let serverDownUntil = 0
const DOWN_COOLDOWN_MS = 60_000

const CACHE_KEY = 'wardrobe:weather'
const CACHE_TTL_MS = 30 * 60 * 1000

interface Cached {
  at: number
  w: Weather
}

function readCache(): Weather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    if (Date.now() - c.at > CACHE_TTL_MS) return null
    return c.w
  } catch {
    return null
  }
}

function writeCache(w: Weather) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), w }))
  } catch {
    /* 隐私模式/配额满，忽略 */
  }
}

/** 拿坐标：优先浏览器定位，失败退回默认城市 */
async function resolveCoords(): Promise<{ lat: number; lon: number; city: string }> {
  const lat0 = Number(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? DEFAULT_COORDS.lat)
  const lon0 = Number(process.env.NEXT_PUBLIC_DEFAULT_LON ?? DEFAULT_COORDS.lon)
  const city0 = process.env.NEXT_PUBLIC_DEFAULT_CITY ?? DEFAULT_COORDS.city
  return { lat: lat0, lon: lon0, city: city0 }
}

export async function getWeather(): Promise<Weather> {
  const cached = readCache()
  if (cached) return cached

  const { lat, lon, city } = await resolveCoords()

  // 1. 服务端代理
  if (Date.now() > serverDownUntil) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(
        `/api/weather?lat=${lat}&lon=${lon}&city=${encodeURIComponent(city)}`,
        { signal: ctrl.signal },
      )
      clearTimeout(timer)
      if (res.ok) {
        const w = (await res.json()) as Weather
        writeCache(w)
        return w
      }
    } catch {
      serverDownUntil = Date.now() + DOWN_COOLDOWN_MS
    }
  }

  // 2. 直连 Open-Meteo（APK 里没有服务端，走这条）
  const w = await fetchWeather(lat, lon, city)
  // fetchWeather 失败时 city 会带"离线兜底"后缀，那种不写缓存
  if (!w.city.includes('离线兜底')) writeCache(w)
  return w
}
