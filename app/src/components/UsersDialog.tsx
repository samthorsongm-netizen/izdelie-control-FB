import { useCallback, useEffect, useState } from 'react'
import type { Profile, Role } from '../model/types'
import { ROLE_LABEL } from '../model/types'
import { createUser, listProfiles, setRole } from '../data/auth'
import { Modal } from './Modal'

const ROLES: Role[] = ['admin', 'editor', 'viewer']

const ROLE_HINT: Record<Role, string> = {
  admin: 'всё: структура, добавление и удаление позиций, пользователи',
  editor: 'галки, ответственные, сроки, комментарии. Структуру не меняет',
  viewer: 'только смотреть',
}

export function UsersDialog({ meId, onClose }: { meId: string; onClose: () => void }) {
  const [list, setList] = useState<Profile[] | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole2] = useState<Role>('editor')

  const load = useCallback(async () => {
    try {
      setList(await listProfiles())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      await createUser(email, password, name, role)
      setNote(`Пользователь ${email} добавлен с ролью «${ROLE_LABEL[role]}».`)
      setEmail('')
      setName('')
      setPassword('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const change = async (p: Profile, next: Role) => {
    setError('')
    try {
      await setRole(p.id, next)
      setList((l) => (l ? l.map((x) => (x.id === p.id ? { ...x, role: next } : x)) : l))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await load()
    }
  }

  return (
    <Modal
      title="Пользователи и роли"
      onClose={onClose}
      wide
      footer={
        <button className="btn" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      <div className="hint" style={{ marginBottom: 10 }}>
        {ROLES.map((r) => (
          <div key={r}>
            <b>{ROLE_LABEL[r]}</b> — {ROLE_HINT[r]}
          </div>
        ))}
      </div>

      {error && <div className="banner" style={{ borderRadius: 8, marginBottom: 10 }}>{error}</div>}
      {note && <div className="banner" style={{ borderRadius: 8, marginBottom: 10, background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: '#b7e0c3' }}>{note}</div>}

      <div style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 16 }}>
        {!list && <div className="opt muted">Загрузка…</div>}
        {list?.length === 0 && <div className="opt muted">Пока никого.</div>}
        {list?.map((p) => (
          <div className="ev" key={p.id} style={{ padding: '8px 10px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div>{p.name || p.email}</div>
              <div className="small muted">{p.email}</div>
            </div>
            <select
              value={p.role}
              disabled={p.id === meId}
              title={p.id === meId ? 'Свою роль изменить нельзя — иначе можно остаться без администратора' : undefined}
              onChange={(e) => void change(p, e.target.value as Role)}
              style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', background: '#fff' }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Добавить пользователя</h4>
      <div className="grid2">
        <div className="field">
          <label>Электронная почта</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivanov@example.com" />
        </div>
        <div className="field">
          <label>Имя (как в ответственных)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов" />
        </div>
        <div className="field">
          <label>Пароль</label>
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="не короче 6 символов" />
        </div>
        <div className="field">
          <label>Роль</label>
          <select value={role} onChange={(e) => setRole2(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        className="btn primary"
        disabled={busy || !email.trim() || password.length < 6}
        onClick={() => void add()}
      >
        {busy ? 'Добавляем…' : 'Добавить'}
      </button>
      <div className="hint" style={{ marginTop: 6 }}>
        Пароль сообщите человеку сами. В Firebase: Authentication → Sign-in method → Email/Password должно быть включено.
      </div>
    </Modal>
  )
}
