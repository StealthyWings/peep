// Everything a user records lives in IndexedDB on their own device.

import { openDB, type DBSchema } from 'idb'

export type Method = 'photo' | 'sound'

export interface Sighting {
  id: string
  sci: string
  common: string
  method: Method
  confidence: number
  ts: number
  isBird: boolean
  /** downscaled JPEG, never leaves the device unless sharePhoto is true */
  photo?: Blob
  /** ~1 km grid cell ("12.97,77.59"); stays on the device, used for the Wanderer sticker */
  cell?: string
  sharePhoto: boolean
  synced: 0 | 1
}

interface PeepDB extends DBSchema {
  sightings: { key: string; value: Sighting; indexes: { ts: number; synced: number } }
  kv: { key: string; value: unknown }
}

const dbp = openDB<PeepDB>('peep', 1, {
  upgrade(db) {
    const s = db.createObjectStore('sightings', { keyPath: 'id' })
    s.createIndex('ts', 'ts')
    s.createIndex('synced', 'synced')
    db.createObjectStore('kv')
  },
})

export async function allSightings(): Promise<Sighting[]> {
  return (await (await dbp).getAllFromIndex('sightings', 'ts')).reverse()
}

export async function putSighting(s: Sighting) {
  await (await dbp).put('sightings', s)
}

export async function deleteSighting(id: string) {
  await (await dbp).delete('sightings', id)
}

export async function unsyncedSightings(): Promise<Sighting[]> {
  return (await dbp).getAllFromIndex('sightings', 'synced', 0)
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await (await dbp).get('kv', key)) as T | undefined
}

export async function setKV(key: string, value: unknown) {
  await (await dbp).put('kv', value, key)
}

export const uid = () => crypto.randomUUID()
