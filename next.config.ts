import type { NextConfig } from 'next'

/**
 * 两套构建目标：
 *   - Web（默认）：正常 SSR，保留 /api/recommend 等 Route Handler
 *   - APK：`BUILD_STATIC=1` 时输出纯静态站点，供 Capacitor 打进 WebView
 *
 * 静态导出不支持 Route Handler，所以 APK 构建脚本会先把 src/app/api 挪走；
 * 客户端侧的降级在 `recommendClient.ts` / `weatherClient.ts` 里已经处理好了。
 */
const isStatic = process.env.BUILD_STATIC === '1'

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: 'export' as const,
        // 静态导出没有图片优化服务，必须关掉
        images: { unoptimized: true },
        // 生成 /index.html 而不是 /index，WebView 里路径更稳
        trailingSlash: true,
      }
    : {
        images: {
          remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
        },
      }),
  /**
   * 关掉左下角那个悬浮的 Next.js 开发指示器。
   * 它点开是一堆英文菜单，界面全是中文时很突兀；框架不提供本地化，只能不显示。
   */
  devIndicators: false,
}

export default nextConfig
