// Client for the self-hostable Flock server (server/index.mjs).
// Sync is best-effort: everything works offline and catches up later.

import { getKV, setKV, unsyncedSightings, putSighting } from './db'
import { shareablePhoto } from './media'

export interface Profile {
  id: string
  name: string
  emoji: string
  token: string
}

export interface Member {
  id: string
  name: string
  emoji: string
  stickers: string[]
  species: number
  weekSpecies: number
  sightings: number
  lastSeen: number | null
}

export interface Group {
  id: string
  name: string
  code: string
  members: Member[]
  challenge: { weekStart: number; goal: number; count: number }
}

export interface FeedItem {
  id: string
  sci: string
  common: string
  method: 'photo' | 'sound'
  isBird: boolean
  ts: number
  photo: string | null
  user: { id: string; name: string; emoji: string }
}

export interface MemberProfile {
  user: { id: string; name: string; emoji: string; stickers: string[] }
  species: { sci: string; common: string; isBird: boolean; count: number; first: number; last: number; photo: string | null }[]
}

const SERVER = (import.meta.env.VITE_FLOCK_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/** False for static-only builds (e.g. GitHub Pages without a flock server). */
export const FLOCK_AVAILABLE = import.meta.env.VITE_FLOCK_OFF !== '1'

export class FlockError extends Error {}

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVER}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw new FlockError("Can't reach the flock right now — you're probably outside. Nice.")
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new FlockError(body.error ?? `Flock server error (${res.status})`)
  return body as T
}

export const getProfile = () => getKV<Profile>('profile')

export async function register(name: string, emoji: string): Promise<Profile> {
  const { user, token } = await api<{ user: Profile; token: string }>('/register', {
    method: 'POST',
    body: JSON.stringify({ name, emoji }),
  })
  const profile = { id: user.id, name: user.name, emoji: user.emoji, token }
  await setKV('profile', profile)
  return profile
}

export async function updateMe(p: Profile, patch: { name?: string; emoji?: string; stickers?: string[] }) {
  await api('/me', { method: 'PATCH', body: JSON.stringify(patch) }, p.token)
  const next = { ...p, ...('name' in patch ? { name: patch.name! } : {}), ...('emoji' in patch ? { emoji: patch.emoji! } : {}) }
  await setKV('profile', next)
  return next
}

export const listGroups = (p: Profile) => api<Group[]>('/groups', {}, p.token)

export const createGroup = (p: Profile, name: string) =>
  api<Group>('/groups', { method: 'POST', body: JSON.stringify({ name }) }, p.token)

export const joinGroup = (p: Profile, code: string) =>
  api<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ code }) }, p.token)

export const leaveGroup = (p: Profile, id: string) =>
  api(`/groups/${id}/leave`, { method: 'POST' }, p.token)

export const groupFeed = (p: Profile, id: string, since: number) =>
  api<{ now: number; items: FeedItem[] }>(`/groups/${id}/feed?since=${since}`, {}, p.token)

export const memberProfile = (p: Profile, userId: string) =>
  api<MemberProfile>(`/users/${userId}`, {}, p.token)

export const deleteRemoteSighting = (p: Profile, id: string) =>
  api(`/sightings/${id}`, { method: 'DELETE' }, p.token)

/** Push sightings recorded offline. Returns how many were sent. */
export async function syncSightings(p: Profile): Promise<number> {
  const pending = await unsyncedSightings()
  if (!pending.length) return 0
  const payload = await Promise.all(
    pending.map(async (s) => ({
      id: s.id,
      sci: s.sci,
      common: s.common,
      method: s.method,
      isBird: s.isBird,
      ts: s.ts,
      photo: s.sharePhoto && s.photo ? await shareablePhoto(s.photo) : undefined,
    })),
  )
  await api('/sightings', { method: 'POST', body: JSON.stringify({ sightings: payload }) }, p.token)
  await Promise.all(pending.map((s) => putSighting({ ...s, synced: 1 })))
  return pending.length
}
