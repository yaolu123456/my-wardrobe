/**
 * 天气：Open-Meteo，免费、无需 API Key、支持体感温度。
 * 文档：https://open-meteo.com/en/docs
 */

export interface Weather {
  /** 体感温度 °C */
  feelsLike: number
  /** 实际气温 °C */
  temperature: number
  /** 降水概率 0-1 */
  rainChance: number
  /** 天气码，见 WMO */
  code: number
  city: string
}

const WMO_LABEL: Record<number, string> = {
  0: '晴',
  1: '大部晴',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '毛毛雨',
  53: '小雨',
  55: '中雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '阵雨',
  81: '强阵雨',
  82: '暴雨',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '强雷暴',
}

export function weatherLabel(code: number): string {
  return WMO_LABEL[code] ?? '未知'
}

export function isRainy(code: number): boolean {
  return code >= 51
}

/**
 * 拉当前天气。失败时返回一个温和的兜底值，不让推荐整体挂掉。
 *
 * 注意 `next.revalidate` 是服务端的缓存指令，浏览器里传了会被忽略（也可能报错），
 * 所以只在 Node 环境拼进 fetch 选项 —— 这个函数现在服务端和 APK 客户端共用。
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  city = '当前位置',
): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,precipitation_probability,weather_code` +
    `&timezone=auto`

  const init =
    typeof window === 'undefined' ? { next: { revalidate: 1800 } } : undefined

  try {
    const res = await fetch(url, init as RequestInit | undefined)
    if (!res.ok) throw new Error(`open-meteo ${res.status}`)
    const j = await res.json()
    const c = j.current ?? {}
    return {
      feelsLike: Number(c.apparent_temperature ?? c.temperature_2m ?? 18),
      temperature: Number(c.temperature_2m ?? 18),
      rainChance: Number(c.precipitation_probability ?? 0) / 100,
      code: Number(c.weather_code ?? 0),
      city,
    }
  } catch {
    return { feelsLike: 18, temperature: 18, rainChance: 0, code: 0, city: `${city}(离线兜底)` }
  }
}

/** 上海默认坐标，没有定位权限时使用 */
export const DEFAULT_COORDS = { lat: 31.2304, lon: 121.4737, city: '上海' }
