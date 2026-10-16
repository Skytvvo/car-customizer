import { openDB, type DBSchema } from 'idb'
import type { ModelRecord, StoredFile } from './types'

// Local-first storage. Keep this module the only place that knows about IndexedDB,
// so it can be swapped for a server API later.

interface Schema extends DBSchema {
  models: { key: string; value: ModelRecord; indexes: { 'by-updated': number } }
  files: { key: string; value: { id: string; files: StoredFile[] } }
}

const dbPromise = openDB<Schema>('car-customizer', 1, {
  upgrade(db) {
    const models = db.createObjectStore('models', { keyPath: 'id' })
    models.createIndex('by-updated', 'updatedAt')
    db.createObjectStore('files', { keyPath: 'id' })
  },
})

export async function listModels(): Promise<ModelRecord[]> {
  const db = await dbPromise
  return (await db.getAllFromIndex('models', 'by-updated')).reverse()
}

/** Saves metadata; original files are written only when provided (first save). */
export async function saveModel(record: ModelRecord, files?: StoredFile[]) {
  const db = await dbPromise
  const tx = db.transaction(['models', 'files'], 'readwrite')
  await tx.objectStore('models').put(record)
  if (files) await tx.objectStore('files').put({ id: record.id, files })
  await tx.done
  // Ask the browser not to evict the library under storage pressure.
  navigator.storage?.persist?.().catch(() => {})
}

export async function getModelFiles(id: string): Promise<StoredFile[]> {
  const db = await dbPromise
  const entry = await db.get('files', id)
  if (!entry) throw new Error('Model files are missing from local storage')
  return entry.files
}

export async function deleteModel(id: string) {
  const db = await dbPromise
  const tx = db.transaction(['models', 'files'], 'readwrite')
  await tx.objectStore('models').delete(id)
  await tx.objectStore('files').delete(id)
  await tx.done
}

export async function storageUsage(): Promise<number | undefined> {
  return (await navigator.storage?.estimate?.())?.usage
}
