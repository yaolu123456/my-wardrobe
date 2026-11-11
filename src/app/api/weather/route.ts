import { NextResponse } from 'next/server'
import { fetchWeather } from '@/lib/weather'

/**
 * 天气代理。放服务端是为了：
 * 1. 统一缓存（30 分钟），不把浏览器 IP 直接暴露给第三方
 * 2. 换数据源时只改这一处
 */
export const runtime = 'nodejs'
export const revalidate = 1800

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat') ?? process.env.NEXT_PUBLIC_DEFAULT_LAT ?? 31.2304)
  const lon = Number(searchParams.get('lon') ?? process.env.NEXT_PUBLIC_DEFAULT_LON ?? 121.4737)
  const city = searchParams.get('city') ?? process.env.NEXT_PUBLIC_DEFAULT_CITY ?? '上海'

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'bad coords' }, { status: 400 })
  }

  const w = await fetchWeather(lat, lon, city)
  return NextResponse.json(w, {
    headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
  })
}
