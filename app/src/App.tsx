import { useEffect, useState } from 'react'
import { cloudEnabled, cloudRepo, loadProfile, resetPeopleCache, signIn, signOut } from './data/auth'
import { localRepo } from './data/local'
import type { Repo } from './data/repo'
import type { Profile } from './model/types'
import { Products } from './components/Products'
import { ProductPage } from './components/ProductPage'
import { UsersDialog } from './components/UsersDialog'

const repo: Repo = cloudEnabled ? cloudRepo : localRepo

type Theme = 'light' | 'dark'

export default function App() {
  const [me, setMe] = useState<Profile | null>(cloudEnabled ? null : localRepo.me)
  const [booting, setBooting] = useState(cloudEnabled)
  const [productId, setProductId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [users, setUsers] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('ui-theme') === 'dark' ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('ui-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!cloudEnabled) return
    loadProfile()
      .then((p) => setMe(p))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    repo.me = me
  }, [me])

  const themeBtn = (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Переключить тему">
      {theme === 'dark' ? '☀ Светлая' : '☾ Тёмная'}
    </button>
  )

  if (booting) return <div className="empty-state">Загрузка…</div>

  if (!me) {
    return (
      <>
        <div className="topbar">
          <h1>Контроль разработки и выполнения изделия</h1>
          <div className="spacer" />
          {themeBtn}
        </div>
        <Login
          error={error}
          onSubmit={async (email, password) => {
            setError('')
            try {
              await signIn(email, password)
              const p = await loadProfile()
              if (!p) throw new Error('Профиль не найден. Попросите администратора выдать доступ.')
              setMe(p)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        />
      </>
    )
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>Контроль разработки и выполнения изделия</h1>
        <div className="spacer" />
        <span className="who">
          {me.name} · {me.role === 'admin' ? 'полный доступ' : me.role === 'editor' ? 'отметки' : 'просмотр'}
        </span>
        {themeBtn}
        {cloudEnabled && me.role === 'admin' && <button onClick={() => setUsers(true)}>Пользователи</button>}
        {cloudEnabled && (
          <button
            onClick={async () => {
              await signOut()
              resetPeopleCache()
              setMe(null)
              setProductId(null)
            }}
          >
            Выйти
          </button>
        )}
      </div>

      {users && <UsersDialog meId={me.id} onClose={() => setUsers(false)} />}

      {!cloudEnabled && (
        <div className="banner">
          <b>Демо-режим.</b> Данные лежат в этом браузере, совместной работы нет. Чтобы включить общий доступ,
          права и историю — подключите Supabase (см. README) и пересоберите сайт.
        </div>
      )}

      <div className="page">
        {productId ? (
          <ProductPage key={productId} repo={repo} me={me} productId={productId} onBack={() => setProductId(null)} />
        ) : (
          <Products repo={repo} me={me} onOpen={setProductId} />
        )}
      </div>
    </div>
  )
}

function Login({ error, onSubmit }: { error: string; onSubmit: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="login"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        await onSubmit(email.trim(), password)
        setBusy(false)
      }}
    >
      <h1>Вход</h1>
      <p className="muted small">Доступ выдаёт администратор изделия.</p>
      <div className="field">
        <label>Электронная почта</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </div>
      <div className="field">
        <label>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
        {busy ? 'Входим…' : 'Войти'}
      </button>
      {error && <div className="err">{error}</div>}
    </form>
  )
}
