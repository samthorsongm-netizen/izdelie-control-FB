import { useCallback, useEffect, useState } from 'react'
import type { Repo } from '../data/repo'
import type { Product, Profile } from '../model/types'
import { Modal, Confirm } from './Modal'
import { resetDemo } from '../data/local'
import { importDump, exportDump } from '../data/auth'

export function Products({ repo, me, onOpen }: { repo: Repo; me: Profile; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<Product[]>([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<Product | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await repo.listProducts())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [repo])

  useEffect(() => {
    void load()
  }, [load])

  const saveDump = async () => {
    if (!exportDump) return
    const json = await exportDump()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    a.download = `izdelie-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Изделия</h2>
        <div className="grow" />
        {me.role === 'admin' && exportDump && (
          <button className="btn" title="Скачать копию всех данных в JSON" onClick={() => void saveDump()}>
            Экспорт
          </button>
        )}
        {me.role === 'admin' && importDump && (
          <button className="btn" onClick={() => setImporting(true)} title="Загрузить данные из файла">
            Импорт
          </button>
        )}
        {me.role === 'admin' && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            + Изделие
          </button>
        )}
        {repo.mode === 'demo' && (
          <button
            className="btn"
            onClick={() => {
              resetDemo()
              void load()
              location.reload()
            }}
          >
            Сбросить демо-данные
          </button>
        )}
      </div>

      {error && <div className="banner">{error}</div>}

      {items.length === 0 ? (
        <div className="empty-state">Пока ни одного изделия. {me.role === 'admin' && 'Нажмите «+ Изделие».'}</div>
      ) : (
        <div className="products">
          {items.map((p) => (
            <div key={p.id} className="product-card" onClick={() => onOpen(p.id)}>
              <div className="code">{p.code || 'без номера'}</div>
              <h3>{p.name}</h3>
              <div className="row">
                <span className="small muted">Открыть структуру →</span>
                <div className="grow" />
                {me.role === 'admin' && (
                  <button
                    className="btn ghost sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleting(p)
                    }}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onDone={async () => {
            setImporting(false)
            await load()
          }}
        />
      )}

      {creating && (
        <CreateModal
          repo={repo}
          products={items}
          onClose={() => setCreating(false)}
          onDone={async (id) => {
            setCreating(false)
            await load()
            onOpen(id)
          }}
        />
      )}

      {deleting && (
        <Confirm
          title="Удалить изделие?"
          text={
            <>
              <b>{deleting.name}</b> ({deleting.code || 'без номера'}) — удалится вместе со всей структурой, позициями и
              историей. Отменить это нельзя.
            </>
          }
          onClose={() => setDeleting(null)}
          actions={[
            {
              label: 'Удалить навсегда',
              tone: 'danger',
              onClick: async () => {
                await repo.deleteProduct(deleting.id)
                setDeleting(null)
                await load()
              },
            },
          ]}
        />
      )}
    </>
  )
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const run = async (file: File) => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      if (!importDump) throw new Error('Импорт доступен только в облачной версии')
      const text = await file.text()
      const res = await importDump(JSON.parse(text))
      setNote(`Перенесено: изделий ${res.products}, позиций ${res.items}, вхождений ${res.occurrences}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Импорт данных"
      onClose={onClose}
      footer={
        <>
          {note && (
            <button className="btn primary" onClick={onDone}>
              Готово
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Файл формата, который отдаёт кнопка «Экспорт» (или старый дамп из Supabase). Читается в браузере и
        пишется прямо в Firestore — на сервер не уходит. Повторный импорт перезаписывает данные с теми же id.
      </p>
      <div className="field">
        <label>Файл дампа</label>
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void run(f)
          }}
        />
      </div>

      {busy && <div className="hint">Переношу…</div>}
      {error && <div className="banner">{error}</div>}
      {note && <div className="banner">{note}</div>}
    </Modal>
  )
}

function CreateModal({
  repo,
  products,
  onClose,
  onDone,
}: {
  repo: Repo
  products: Product[]
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <Modal
      title="Новое изделие"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={busy || !name.trim()}
            onClick={async () => {
              const id = crypto.randomUUID()
              setBusy(true)
              try {
                await repo.createProduct({ id, code: code.trim() || null, name: name.trim() }, cloneFrom || undefined)
                onDone(id)
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
                setBusy(false)
              }
            }}
          >
            Создать
          </button>
        </>
      }
    >
      <div className="field">
        <label>Обозначение (основной номер)</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="например 6282-2103800-10" />
        <div className="hint">Можно оставить пустым и заполнить позже.</div>
      </div>
      <div className="field">
        <label>Наименование</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="например Электродвигатель тяговый" autoFocus />
      </div>
      <div className="field">
        <label>Скопировать структуру</label>
        <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
          <option value="">Не копировать — пустое изделие</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code || 'без номера'})
            </option>
          ))}
        </select>
        <div className="hint">Скопируются все сборки, детали и связи. Отметки и сроки сбросятся, ответственные останутся.</div>
      </div>
      {error && <div className="banner">{error}</div>}
    </Modal>
  )
}
