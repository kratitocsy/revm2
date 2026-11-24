/* ============================================================
   pyqStore.ts

   Sets a student imported from their own Eduniti PDFs, kept in this
   browser's IndexedDB (question pictures are Blobs). Nothing leaves the
   device.
   ============================================================ */

import type { PyqQuestion, PyqSet } from './edunitiPyqs'

const DB = 'wynko-pyq'
const STORE = 'sets'

export interface StoredQuestion extends PyqQuestion {
  image: Blob
}

export interface StoredSet {
  id: string
  title: string
  fileName: string
  createdAt: number
  solutionUrl: string | null
  questions: StoredQuestion[]
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser cannot store uploaded sets.')); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open storage.'))
  })
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => { resolve(req.result as T); db.close() }
    tx.onerror = () => { reject(tx.error ?? req.error ?? new Error('Storage failed.')); db.close() }
    tx.onabort = () => { reject(tx.error ?? new Error('Storage was full or blocked.')); db.close() }
  }))
}

export function saveSet(set: StoredSet): Promise<void> {
  return run<void>('readwrite', s => s.put(set)).then(() => undefined)
}

export function listSets(): Promise<StoredSet[]> {
  return run<StoredSet[]>('readonly', s => s.getAll()).then(all => (all ?? []).sort((a, b) => b.createdAt - a.createdAt)).catch(() => [])
}

export function deleteSet(id: string): Promise<void> {
  return run<void>('readwrite', s => s.delete(id)).then(() => undefined)
}

export const UPLOADED_PREFIX = 'upload-'

/** Makes a stored set usable by the pages: picture Blobs become object URLs (call release() when done). */
export function toPyqSet(s: StoredSet): PyqSet & { release: () => void } {
  const images: Record<number, string> = {}
  for (const q of s.questions) images[q.n] = URL.createObjectURL(q.image)
  return {
    id: s.id,
    title: s.title,
    subtitle: `${s.questions.length} questions imported from ${s.fileName}. Stored only on this device.`,
    credit: 'Mohit Goenka, Founder of Eduniti, IIT Kharagpur alumnus',
    solutionUrl: s.solutionUrl,
    imageBase: '',
    images,
    uploaded: true,
    questions: s.questions.map(({ image: _image, ...q }) => q),
    release: () => { for (const u of Object.values(images)) URL.revokeObjectURL(u) },
  }
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/^[0-9a-f]{6,}[-_]/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Uploaded challenge'
}
