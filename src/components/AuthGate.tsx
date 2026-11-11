'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { sendMagicLink, signInWithPassword } from '@/lib/data'
import type { User } from '@supabase/supabase-js'

const DEMO_KEY = 'wardrobe:demo'

interface AuthState {
  user: User | null
  demo: boolean
  loading: boolean
  enterDemo: () => void
  exitDemo: () => void
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * 登录态必须是全局唯一的一份。
 *
 * 早先 Root 和 AppShell 各自调了一次 useAuth()，于是有了两个互不相干的
 * demo state —— AppShell 里点「退出示例」只改了它自己那份，Root 那份还是
 * true，界面就一直停在 App 上出不去。改成 Context 共享同一个实例。
 */
function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [demo, setDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // ?demo=1 直接进示例模式，方便分享和截图
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      localStorage.setItem(DEMO_KEY, '1')
      setDemo(true)
      setLoading(false)
      return
    }
    if (localStorage.getItem(DEMO_KEY) === '1') {
      setDemo(true)
      setLoading(false)
      return
    }
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    supabase()
      .auth.getUser()
      .then(({ data }) => {
        setUser(data.user ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    const { data: sub } = supabase().auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  function enterDemo() {
    localStorage.setItem(DEMO_KEY, '1')
    setDemo(true)
  }

  function exitDemo() {
    localStorage.removeItem(DEMO_KEY)
    // ?demo=1 还挂在地址栏上，不抹掉的话刷新又会掉回示例模式
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      const url = new URL(window.location.href)
      url.searchParams.delete('demo')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
    setDemo(false)
    setUser(null)
    supabase()
      .auth.signOut()
      .catch(() => {})
  }

  return { user, demo, loading, enterDemo, exitDemo }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useAuthState()
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() 必须放在 <AuthProvider> 里面用')
  return ctx
}

export function LoginScreen({
  onDemo,
  configured,
}: {
  onDemo: () => void
  configured: boolean
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) {
      setError('邮箱格式不对')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signInWithPassword(email, password)
      // 登录成功后 onAuthStateChange 会把 user 填上，界面自动切走
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  async function magicLink() {
    if (!email.includes('@')) {
      setError('邮箱格式不对')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sendMagicLink(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-7 pb-16">
      <div className="mb-10">
        <div className="w-14 h-14 rounded-2xl bg-accent grid place-items-center mb-6">
          <span className="text-2xl text-accentSoft">✦</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight leading-tight">
          衣柜
          <span className="block text-base font-normal text-ink2 mt-2">
            打开就是今天的三套，并且它知道你上周穿过什么
          </span>
        </h1>
      </div>

      {sent ? (
        <div className="rounded-2xl bg-card border border-line p-6">
          <div className="text-lg font-semibold mb-2">验证链接已发送</div>
          <p className="text-sm text-ink2 leading-relaxed">
            去 <b className="text-ink">{email}</b> 收信，
            点链接就会回到这里。没收到就看一眼垃圾箱。
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-4 text-sm text-ink2 underline"
          >
            换一种方式登录
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="你的邮箱"
            disabled={!configured}
            className="w-full rounded-xl border border-line bg-card px-4 py-3.5 text-base
                       outline-none focus:border-accent disabled:opacity-50"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（首次登录即注册）"
            disabled={!configured}
            className="w-full rounded-xl border border-line bg-card px-4 py-3.5 text-base
                       outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !configured}
            className="w-full rounded-xl bg-ink text-white py-3.5 font-semibold
                       disabled:opacity-40 active:scale-[.98] transition"
          >
            {busy ? '登录中…' : '登录 / 注册'}
          </button>
          {error && <p className="text-sm text-warn">{error}</p>}
          <p className="text-xs text-ink2 leading-relaxed">
            第一次用这个邮箱会自动创建账号，密码至少 6 位。
          </p>
          {!configured && (
            <p className="text-xs text-warn leading-relaxed">
              还没配置 Supabase。把 <code>.env.local.example</code> 复制成{' '}
              <code>.env.local</code>，填入 URL 和 anon key 后重启。
            </p>
          )}
          <button
            type="button"
            onClick={magicLink}
            disabled={busy || !configured}
            className="w-full text-xs text-ink2 underline disabled:opacity-40"
          >
            改用邮箱验证链接登录
          </button>
        </form>
      )}

      <button
        onClick={onDemo}
        className="mt-6 w-full rounded-xl border border-line bg-card py-3 text-sm
                   text-ink2 active:scale-[.98] transition"
      >
        先用示例数据看看 →
      </button>
    </div>
  )
}
