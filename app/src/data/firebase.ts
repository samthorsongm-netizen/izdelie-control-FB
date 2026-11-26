import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut, createUserWithEmailAndPassword } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  getFirestore,
} from 'firebase/firestore'
import type { EventLog, Item, Occurrence, Product, Profile, Role, Snapshot } from '../model/types'
import type { Repo } from './repo'

/**
 * Хранилище на Firebase: Firestore + Auth.
 *
 * Модель: изделие — это документ со структурой целиком.
 *   products/{id}    { code, name }
 *   snapshots/{id}   { items: [...], occurrences: [...] }
 *   users/{uid}      { email, name, role }
 *   events/{autoId}  { product_id, actor, kind, detail, created_at }
 *
 * Правки идут транзакцией: прочитать структуру, изменить, записать обратно.
 * Изделие ~50 КБ — для документа Firestore (лимит 1 МБ) это нормально.
 */

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const firebaseEnabled = Boolean(cfg.apiKey && cfg.projectId && cfg.appId)

let app: FirebaseApp | null = null
function fapp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(cfg as Record<string, string>)
  return app
}
const db = () => getFirestore(fapp())

interface Data {
  items: Item[]
  occurrences: Occurrence[]
}

async function snapshotOf(id: string): Promise<Data> {
  const s = await getDoc(doc(db(), 'snapshots', id))
  const d = (s.data() ?? {}) as Partial<Data>
  return { items: d.items ?? [], occurrences: d.occurrences ?? [] }
}

/** Прочитать структуру, поменять, записать — в одной транзакции. */
async function mutate(productId: string, fn: (d: Data) => void): Promise<void> {
  const ref = doc(db(), 'snapshots', productId)
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref)
    const cur = (snap.data() ?? {}) as Partial<Data>
    const d: Data = { items: cur.items ?? [], occurrences: cur.occurrences ?? [] }
    fn(d)
    tx.set(ref, d)
  })
}

/**
 * deleteItem/deleteOcc приходят только с id. Интерфейс знает один открытый
 * продукт за раз — запоминаем его при загрузке, без сканирования всех изделий.
 */
let openProductId: string | null = null
function requireProduct(): string {
  if (!openProductId) throw new Error('Изделие не открыто')
  return openProductId
}

// ---------- авторизация ----------

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(getAuth(fapp()), email, password)
}

export async function signOut() {
  await fbSignOut(getAuth(fapp()))
}

export async function currentUid(): Promise<string | null> {
  const a = getAuth(fapp())
  await a.authStateReady()
  return a.currentUser?.uid ?? null
}

export async function loadProfile(): Promise<Profile | null> {
  const uid = await currentUid()
  if (!uid) return null
  const s = await getDoc(doc(db(), 'users', uid))
  const email = getAuth(fapp()).currentUser?.email ?? ''
  if (!s.exists()) return { id: uid, email, name: email, role: 'viewer' }
  const d = s.data() as { email?: string; name?: string; role?: Role }
  return { id: uid, email: d.email ?? email, name: d.name || email, role: d.role ?? 'viewer' }
}

export async function listProfiles(): Promise<Profile[]> {
  const snap = await getDocs(collection(db(), 'users'))
  return snap.docs
    .map((x) => ({ id: x.id, ...(x.data() as { email?: string; name?: string; role?: Role }) }))
    .map((x) => ({ id: x.id, email: x.email ?? '', name: x.name || (x.email ?? ''), role: x.role ?? 'viewer' }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

export async function setRole(id: string, role: Role): Promise<void> {
  await setDoc(doc(db(), 'users', id), { role }, { merge: true })
}

/**
 * Создание пользователя без админского ключа: через второй экземпляр приложения,
 * чтобы не сбить сессию администратора. Роль проставляем сразу после.
 */
export async function createUser(email: string, password: string, name: string, role: Role): Promise<string> {
  const second = initializeApp(cfg as Record<string, string>, `new-user-${Date.now()}`)
  const auth2 = getAuth(second)
  const cred = await createUserWithEmailAndPassword(auth2, email.trim(), password)
  await fbSignOut(auth2)
  const uid = cred.user.uid
  await setDoc(doc(db(), 'users', uid), { email: email.trim(), name: name.trim() || email.split('@')[0], role })
  return uid
}

// ---------- хранилище ----------

export const firebaseRepo: Repo = {
  mode: 'cloud',
  me: null,

  async listProducts() {
    const snap = await getDocs(collection(db(), 'products'))
    return snap.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Product, 'id'>) })) as Product[]
  },

  async listPeople() {
    const st = await getDocs(collection(db(), 'users'))
    const names = st.docs.map((x) => {
      const d = x.data() as { name?: string; email?: string }
      return (d.name || d.email || '').trim()
    })
    return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
  },

  async loadProduct(id): Promise<Snapshot> {
    openProductId = id
    const [p, data] = await Promise.all([getDoc(doc(db(), 'products', id)), snapshotOf(id)])
    if (!p.exists()) throw new Error('Изделие не найдено')
    return { product: { id, ...(p.data() as Omit<Product, 'id'>) }, ...data }
  },

  async findItemByDesignation(productId, designation) {
    const { items } = await snapshotOf(productId)
    const d = designation.trim().toLowerCase()
    return items.find((i) => (i.designation ?? '').trim().toLowerCase() === d) ?? null
  },

  async mergeItems(fromId, toId, patch) {
    await mutate(requireProduct(), (d) => {
      d.occurrences = d.occurrences.map((o) =>
        o.item_id === fromId ? { ...o, item_id: toId } : o.link_item_id === fromId ? { ...o, link_item_id: toId } : o,
      )
      const k = d.items.findIndex((i) => i.id === toId)
      if (k >= 0) d.items[k] = { ...d.items[k], ...patch, id: toId, product_id: d.items[k].product_id }
      d.items = d.items.filter((i) => i.id !== fromId)
    })
  },

  async swapDesignations(aId, bId) {
    const productId = requireProduct()
    const { items } = await snapshotOf(productId)
    const a = items.find((i) => i.id === aId)
    const b = items.find((i) => i.id === bId)
    if (!a || !b) throw new Error('Позиции для обмена не найдены')
    await mutate(productId, (d) => {
      const pa = d.items.find((i) => i.id === aId)
      const pb = d.items.find((i) => i.id === bId)
      if (!pa || !pb) return
      const t = pa.designation
      pa.designation = pb.designation
      pb.designation = t
    })
  },

  async createProduct(p) {
    await setDoc(doc(db(), 'products', p.id), { code: p.code, name: p.name })
    const root: Item = {
      id: crypto.randomUUID(),
      product_id: p.id,
      designation: p.code,
      name: p.name,
      kind: 'assembly',
      bch_ref: null,
      supplier: null,
      manufacturer_part_no: null,
      comment: null,
      responsible_3d: null,
      due_3d: null,
      responsible_dwg: null,
      due_dwg: null,
      stages: {},
    }
    await setDoc(doc(db(), 'snapshots', p.id), {
      items: [root],
      occurrences: [{ id: crypto.randomUUID(), product_id: p.id, parent_id: null, item_id: root.id, qty: 1, sort: 1 }],
    })
  },

  async deleteProduct(id) {
    await deleteDoc(doc(db(), 'snapshots', id))
    await deleteDoc(doc(db(), 'products', id))
  },

  async insertItem(i) {
    await mutate(i.product_id, (d) => {
      d.items.push(i)
    })
  },
  async updateItem(i) {
    await mutate(i.product_id, (d) => {
      const k = d.items.findIndex((x) => x.id === i.id)
      if (k >= 0) d.items[k] = i
    })
  },
  async deleteItem(id) {
    const productId = requireProduct()
    await mutate(productId, (d) => {
      d.items = d.items.filter((x) => x.id !== id)
    })
  },
  async insertOcc(o) {
    await mutate(o.product_id, (d) => {
      d.occurrences.push(o)
    })
  },
  async updateOcc(o) {
    await mutate(o.product_id, (d) => {
      const k = d.occurrences.findIndex((x) => x.id === o.id)
      if (k >= 0) d.occurrences[k] = o
    })
  },
  async deleteOcc(id) {
    const productId = requireProduct()
    await mutate(productId, (d) => {
      d.occurrences = d.occurrences.filter((x) => x.id !== id)
    })
  },

  async log(e) {
    await addDoc(collection(db(), 'events'), { ...e, created_at: new Date().toISOString() })
  },
  async listEvents(productId, count) {
    const q = query(collection(db(), 'events'), orderBy('created_at', 'desc'), qLimit(count))
    const snap = await getDocs(q)
    // id в Firestore строковый, а в модели EventLog числовой (пришёл из Postgres) — не переносим
    return snap.docs.map((x) => x.data() as Omit<EventLog, 'id'>).filter((e) => e.product_id === productId)
  },

  // опрос без наслоения: следующий тик только после завершения предыдущего
  subscribe(_productId, cb) {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (stopped) return
      const startedAt = Date.now()
      let ok = true
      try {
        await cb()
      } catch {
        ok = false
      }
      if (stopped) return
      timer = setTimeout(tick, ok ? Math.max(5000 - (Date.now() - startedAt), 0) : 15000)
    }
    timer = setTimeout(tick, 5000)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  },
}
