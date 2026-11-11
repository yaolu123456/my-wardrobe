import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置。
 *
 * appId 是 Android 的包名，装机后不能再改（改了就是另一个 App）。
 * webDir 指向 `next build` 静态导出的目录 —— 用 `BUILD_STATIC=1 npm run build` 生成。
 */
const config: CapacitorConfig = {
  appId: 'com.yaolu.wardrobe',
  appName: '衣柜',
  webDir: 'out',
  android: {
    // WebView 里混用 http 资源会被拦；Supabase 和 Open-Meteo 都是 https，没问题
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
