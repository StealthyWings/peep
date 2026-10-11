// Flock server: the tiny, self-hostable backend that lets friends and family
// see each other's finds. Zero dependencies — Node 22.13+ ships SQLite.
//
//   node server/index.mjs            # serves the API + the built app (dist/)
//   PORT=8787 PEEP_DB=./peep.db node server/index.mjs
//
// Privacy by design: the server never receives locations or audio. It only
// stores species names, timestamps and — when the user opts in per sighting —
// a small photo.

import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const portArg = process.argv.indexOf('--port')
const PORT = Number(portArg > 0 ? process.argv[portArg + 1] : (process.env.PORT ?? 8787))
const DB_PATH = process.env.PEEP_DB ?? join(ROOT, 'server/peep.db')
const MAX_BODY = 8 * 1024 * 1024
const MAX_PHOTO = 400 * 1024

const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    emoji TEXT NOT NULL, stickers TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL, created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    group_id TEXT NOT NULL, user_id TEXT NOT NULL, joined INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS sightings (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sci TEXT NOT NULL, common TEXT NOT NULL,
    method TEXT NOT NULL, is_bird INTEGER NOT NULL, ts INTEGER NOT NULL,
    photo TEXT, created INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sightings_user ON sightings(user_id, created);
`)

// ---- helpers ---------------------------------------------------------------

const id = () => randomBytes(9).toString('base64url')
const hash = (t) => createHash('sha256').update(t).digest('hex')
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () =>
  Array.from(randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function str(v, max, field) {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required`)
  return v.trim().slice(0, max)
}

function weekStart(now = new Date()) {
  // Monday 00:00 UTC
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.getTime()
}

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'Body too large')
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

function auth(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Missing token')
  const user = db.prepare('SELECT * FROM users WHERE token_hash = ?').get(hash(token))
  if (!user) throw new HttpError(401, 'Unknown token')
  return user
}

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  emoji: u.emoji,
  stickers: JSON.parse(u.stickers),
})

function requireMember(groupId, userId) {
  const row = db
    .prepare('SELECT 1 FROM members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId)
  if (!row) throw new HttpError(404, 'Group not found')
}

function groupSummary(group) {
  const since = weekStart()
  const members = db
    .prepare(
      `SELECT u.*,
         (SELECT COUNT(DISTINCT sci) FROM sightings s WHERE s.user_id = u.id AND s.is_bird = 1) AS species,
         (SELECT COUNT(DISTINCT sci) FROM sightings s WHERE s.user_id = u.id AND s.is_bird = 1 AND s.ts >= ?) AS week_species,
         (SELECT COUNT(*) FROM sightings s WHERE s.user_id = u.id) AS sightings,
         (SELECT MAX(ts) FROM sightings s WHERE s.user_id = u.id) AS last_seen
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?`,
    )
    .all(since, group.id)
  const together = db
    .prepare(
      `SELECT COUNT(DISTINCT s.sci) AS n FROM sightings s
       JOIN members m ON m.user_id = s.user_id
       WHERE m.group_id = ? AND s.is_bird = 1 AND s.ts >= ?`,
    )
    .get(group.id, since).n
  return {
    id: group.id,
    name: group.name,
    code: group.code,
    members: members.map((m) => ({
      ...publicUser(m),
      species: m.species,
      weekSpecies: m.week_species,
      sightings: m.sightings,
      lastSeen: m.last_seen,
    })),
    challenge: {
      weekStart: since,
      goal: Math.min(60, Math.max(10, members.length * 5)),
      count: together,
    },
  }
}

// ---- routes ----------------------------------------------------------------

const routes = []
const route = (method, pattern, handler) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler })

route('GET', '/api/health', () => ({ ok: true }))

route('POST', '/api/register', async (req) => {
  const body = await readBody(req)
  const token = randomBytes(24).toString('base64url')
  const user = {
    id: id(),
    name: str(body.name, 40, 'name'),
    emoji: str(body.emoji ?? '🐦', 8, 'emoji'),
  }
  db.prepare(
    'INSERT INTO users (id, token_hash, name, emoji, created) VALUES (?, ?, ?, ?, ?)',
  ).run(user.id, hash(token), user.name, user.emoji, Date.now())
  return { user: { ...user, stickers: [] }, token }
})

route('PATCH', '/api/me', async (req) => {
  const me = auth(req)
  const body = await readBody(req)
  const name = body.name !== undefined ? str(body.name, 40, 'name') : me.name
  const emoji = body.emoji !== undefined ? str(body.emoji, 8, 'emoji') : me.emoji
  const stickers = Array.isArray(body.stickers)
    ? JSON.stringify(body.stickers.filter((s) => typeof s === 'string').slice(0, 100))
    : me.stickers
  db.prepare('UPDATE users SET name = ?, emoji = ?, stickers = ? WHERE id = ?').run(
    name, emoji, stickers, me.id,
  )
  return publicUser({ ...me, name, emoji, stickers })
})

route('GET', '/api/groups', (req) => {
  const me = auth(req)
  const groups = db
    .prepare('SELECT g.* FROM groups g JOIN members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY m.joined')
    .all(me.id)
  return groups.map(groupSummary)
})

route('POST', '/api/groups', async (req) => {
  const me = auth(req)
  const body = await readBody(req)
  const group = { id: id(), name: str(body.name, 40, 'name'), code: newCode() }
  db.prepare('INSERT INTO groups (id, name, code, created_by, created) VALUES (?, ?, ?, ?, ?)').run(
    group.id, group.name, group.code, me.id, Date.now(),
  )
  db.prepare('INSERT INTO members (group_id, user_id, joined) VALUES (?, ?, ?)').run(group.id, me.id, Date.now())
  return groupSummary(group)
})

route('POST', '/api/groups/join', async (req) => {
  const me = auth(req)
  const body = await readBody(req)
  const code = str(body.code, 12, 'code').toUpperCase()
  const group = db.prepare('SELECT * FROM groups WHERE code = ?').get(code)
  if (!group) throw new HttpError(404, 'No flock with that code')
  db.prepare('INSERT OR IGNORE INTO members (group_id, user_id, joined) VALUES (?, ?, ?)').run(
    group.id, me.id, Date.now(),
  )
  return groupSummary(group)
})

route('POST', '/api/groups/:id/leave', (req, { id: groupId }) => {
  const me = auth(req)
  db.prepare('DELETE FROM members WHERE group_id = ? AND user_id = ?').run(groupId, me.id)
  return { ok: true }
})

route('GET', '/api/groups/:id/feed', (req, { id: groupId }, url) => {
  const me = auth(req)
  requireMember(groupId, me.id)
  const since = Number(url.searchParams.get('since') ?? 0) || 0
  const rows = db
    .prepare(
      `SELECT s.*, u.name, u.emoji FROM sightings s
       JOIN members m ON m.user_id = s.user_id AND m.group_id = ?
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id != ? AND s.created > ?
       ORDER BY s.created DESC LIMIT 40`,
    )
    .all(groupId, me.id, since)
  return {
    now: Date.now(),
    items: rows.map((r) => ({
      id: r.id,
      sci: r.sci,
      common: r.common,
      method: r.method,
      isBird: !!r.is_bird,
      ts: r.ts,
      photo: r.photo,
      user: { id: r.user_id, name: r.name, emoji: r.emoji },
    })),
  }
})

route('GET', '/api/users/:id', (req, { id: userId }) => {
  const me = auth(req)
  const shared = db
    .prepare(
      `SELECT 1 FROM members a JOIN members b ON a.group_id = b.group_id
       WHERE a.user_id = ? AND b.user_id = ?`,
    )
    .get(me.id, userId)
  if (!shared && userId !== me.id) throw new HttpError(404, 'User not found')
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!user) throw new HttpError(404, 'User not found')
  const species = db
    .prepare(
      `SELECT sci, common, is_bird, COUNT(*) AS count, MIN(ts) AS first, MAX(ts) AS last,
         (SELECT photo FROM sightings p WHERE p.user_id = s.user_id AND p.sci = s.sci AND p.photo IS NOT NULL
          ORDER BY p.ts DESC LIMIT 1) AS photo
       FROM sightings s WHERE user_id = ? GROUP BY sci ORDER BY first DESC`,
    )
    .all(userId)
  return {
    user: publicUser(user),
    species: species.map((s) => ({
      sci: s.sci,
      common: s.common,
      isBird: !!s.is_bird,
      count: s.count,
      first: s.first,
      last: s.last,
      photo: s.photo,
    })),
  }
})

route('POST', '/api/sightings', async (req) => {
  const me = auth(req)
  const body = await readBody(req)
  if (!Array.isArray(body.sightings)) throw new HttpError(400, 'sightings must be an array')
  const upsert = db.prepare(
    `INSERT INTO sightings (id, user_id, sci, common, method, is_bird, ts, photo, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET photo = excluded.photo WHERE sightings.user_id = excluded.user_id`,
  )
  const saved = []
  for (const s of body.sightings.slice(0, 100)) {
    const method = s.method === 'sound' ? 'sound' : 'photo'
    const ts = Number(s.ts)
    if (!Number.isFinite(ts)) continue
    let photo = null
    if (typeof s.photo === 'string' && s.photo.startsWith('data:image/jpeg;base64,') && s.photo.length <= MAX_PHOTO) {
      photo = s.photo
    }
    upsert.run(
      str(s.id, 64, 'id'), me.id, str(s.sci, 120, 'sci'), str(s.common, 120, 'common'),
      method, s.isBird === false ? 0 : 1, ts, photo, Date.now(),
    )
    saved.push(s.id)
  }
  return { saved }
})

route('DELETE', '/api/sightings/:id', (req, { id: sightingId }) => {
  const me = auth(req)
  db.prepare('DELETE FROM sightings WHERE id = ? AND user_id = ?').run(sightingId, me.id)
  return { ok: true }
})

// ---- static files (the built PWA) -------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
}

async function serveStatic(res, pathname) {
  let file = normalize(join(DIST, decodeURIComponent(pathname)))
  if (!file.startsWith(DIST)) throw new HttpError(403, 'Forbidden')
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
  } catch {
    // SPA fallback for app routes only; a missing file (e.g. a model) must 404
    // so it never gets cached as HTML.
    if (extname(pathname)) throw new HttpError(404, 'Not found')
    file = join(DIST, 'index.html')
  }
  const data = await readFile(file).catch(() => null)
  if (!data) throw new HttpError(404, 'Run `npm run build` first')
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  res.end(data)
}

// ---- server ----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  // Bearer tokens (no cookies), so any origin may call the API.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re)
        if (m) {
          const out = await r.handler(req, m.groups ?? {}, url)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify(out))
        }
      }
      throw new HttpError(404, 'Not found')
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed')
    await serveStatic(res, url.pathname)
  } catch (err) {
    const status = err.status ?? 500
    if (status === 500) console.error(err)
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: status === 500 ? 'Server error' : err.message }))
  }
})

server.listen(PORT, () => console.log(`🐦 Flock server on http://localhost:${PORT}`))
