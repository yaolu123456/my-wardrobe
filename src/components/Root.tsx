'use client'

import { isSupabaseConfigured } from '@/lib/supabase'
import { AuthProvider, LoginScreen, useAuth } from './AuthGate'
import { AppShell } from './AppShell'

/**
 * 入口：未登录先看登录页，登录后进 App。
 * 没配 Supabase 时也允许进示例模式，方便先看效果。
 *
 * AuthProvider 必须包在读取登录态的外层，否则 Root 和 AppShell
 * 会各自持有一份独立的 demo 状态，「退出示例」就退不出去。
 */
export function Root() {
  return (
    <AuthProvider>
      <RootInner />
    </AuthProvider>
  )
}

function RootInner() {
  const { user, demo, loading, enterDemo } = useAuth()

  if (loading) {
    return <div className="min-h-dvh grid place-items-center text-sm text-ink3">加载中…</div>
  }

  if (!user && !demo) {
    return <LoginScreen onDemo={enterDemo} configured={isSupabaseConfigured()} />
  }

  return <AppShell />
}
