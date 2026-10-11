import { useCallback, useEffect, useState } from 'react'
import {
  createGroup,
  groupFeed,
  joinGroup,
  leaveGroup,
  listGroups,
  memberProfile,
  register,
  FLOCK_AVAILABLE,
  type FeedItem,
  type Group,
  type MemberProfile,
  type Profile,
} from '../lib/flock'
import { getKV, setKV } from '../lib/db'
import { lookup, type Species } from '../lib/species'
import { STICKERS } from '../lib/stickers'
import { BirdImage } from './BirdImage'
import { Sheet } from './Sheet'
import { Sticker } from './Sticker'
import { Glyph, type GlyphName } from './Icons'
import { SwipeDeck } from './SwipeDeck'
import { BASE } from '../lib/base'

interface Props {
  profile: Profile | null
  guide: Map<string, Species> | null
  pendingJoin: string | null
  onProfile: (p: Profile) => void
  onGroups: (g: Group[]) => void
  onJoinHandled: () => void
  onGoOutside: () => void
  syncNow: () => Promise<void>
}

// Avatars: a line-drawn bird on a colour from the app palette. The server's
// `emoji` field stores the avatar key.
const AVATARS: Record<string, { bg: string; fg: string; glyph: GlyphName; label: string }> = {
  olive: { bg: '#c5ceb0', fg: '#33352a', glyph: 'bird', label: 'Songbird' },
  sage: { bg: '#959b7f', fg: '#fbf8f0', glyph: 'owl', label: 'Owl' },
  sand: { bg: '#dcd2bf', fg: '#33352a', glyph: 'feather', label: 'Feather' },
  bark: { bg: '#6f6853', fg: '#fbf8f0', glyph: 'gull', label: 'Gull' },
  wood: { bg: '#33352a', fg: '#c5ceb0', glyph: 'nest', label: 'Nest' },
  clay: { bg: '#c9a58c', fg: '#33352a', glyph: 'duck', label: 'Duck' },
}
const AVATAR_KEYS = Object.keys(AVATARS)

function Avatar({ name, avatar, small }: { name: string; avatar: string; small?: boolean }) {
  // Older profiles stored an emoji here; give them a stable pick instead.
  const key = AVATARS[avatar] ? avatar : AVATAR_KEYS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_KEYS.length]
  const { bg, fg, glyph } = AVATARS[key]
  return (
    <span className={small ? 'avatar sm' : 'avatar'} style={{ background: bg, color: fg }} aria-hidden>
      <Glyph name={glyph} size={small ? 17 : 26} strokeWidth={1.5} />
    </span>
  )
}

function timeAgo(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export function FlockScreen(props: Props) {
  const { profile, guide, pendingJoin, onGroups } = props
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feed, setFeed] = useState<{ items: FeedItem[]; now: number } | null>(null)
  const [member, setMember] = useState<MemberProfile | null>(null)
  const [mode, setMode] = useState<'view' | 'new'>('view')

  const refresh = useCallback(async () => {
    if (!profile) return
    try {
      await props.syncNow()
      const gs = await listGroups(profile)
      setGroups(gs)
      onGroups(gs)
      setError(null)
      setActive((a) => (a && gs.some((g) => g.id === a) ? a : (gs[0]?.id ?? null)))
    } catch (err) {
      setError((err as Error).message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Invite links (?join=CODE)
  useEffect(() => {
    if (!profile || !pendingJoin) return
    joinGroup(profile, pendingJoin)
      .then((g) => {
        props.onJoinHandled()
        setActive(g.id)
        refresh()
      })
      .catch((err) => setError((err as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, pendingJoin])

  // New cards since the last visit to this flock.
  useEffect(() => {
    if (!profile || !active) return
    let cancelled = false
    ;(async () => {
      const since = (await getKV<number>(`seen:${active}`)) ?? 0
      try {
        const f = await groupFeed(profile, active, since)
        if (!cancelled) setFeed(f)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile, active])

  if (!FLOCK_AVAILABLE) {
    return (
      <div className="screen flock narrow">
        <h1>Bird with your people</h1>
        <div className="card privacy">
          <strong>Flocks aren't switched on in this demo</strong>
          <p>
            Flocks let family and friends see each other's birds, and they need a small server to share them. This
            copy of peep runs without one, so everything else (photo and song ID, stickers, share cards, offline mode)
            works, but flocks don't. You can run your own flock server from the project's README.
          </p>
        </div>
      </div>
    )
  }

  if (!profile) return <Onboarding onProfile={props.onProfile} pendingJoin={pendingJoin} />

  const group = groups?.find((g) => g.id === active)

  return (
    <div className="screen flock">
      <h1>Your flock</h1>
      {error && <p className="notice">{error}</p>}

      {groups && (
        <div className="chips">
          {groups.map((g) => (
            <button key={g.id} className={g.id === active && mode === 'view' ? 'chip-btn on' : 'chip-btn'} onClick={() => { setActive(g.id); setMode('view') }}>
              {g.name}
            </button>
          ))}
          <button className={mode === 'new' || groups.length === 0 ? 'chip-btn on' : 'chip-btn'} onClick={() => setMode('new')}>
            + New / join
          </button>
        </div>
      )}

      {groups && (mode === 'new' || groups.length === 0) && (
        <NewGroup
          profile={profile}
          onDone={(g) => {
            setMode('view')
            setActive(g.id)
            refresh()
          }}
        />
      )}

      {group && mode === 'view' && (
        <div className="flock-grid">
          <section className="flock-feed">
            <h2 className="section">New since you last looked</h2>
            {feed ? (
              <SwipeDeck
                key={group.id}
                items={feed.items}
                keyOf={(i) => i.id}
                render={(item) => <FeedCard item={item} species={lookup(guide, item.sci, item.common)} />}
                onFinished={() => setKV(`seen:${group.id}`, feed.now)}
                end={
                  <div className="deck-card end-card">
                    <Glyph name="leaf" size={48} strokeWidth={1.1} className="end-icon" />
                    <h3>You're all caught up</h3>
                    <p className="muted">That's everything new. Go and find one nobody in the flock has seen yet.</p>
                    <button className="btn primary" onClick={props.onGoOutside}>
                      Go spot one
                    </button>
                  </div>
                }
              />
            ) : (
              <div className="spinner" aria-hidden />
            )}
          </section>

          <section className="flock-side">
            <Challenge group={group} />

            <h2 className="section">This week</h2>
            <ol className="board">
              {[...group.members]
                .sort((a, b) => b.weekSpecies - a.weekSpecies || b.species - a.species)
                .map((m, i) => (
                  <li key={m.id}>
                    <button
                      className="board-row"
                      onClick={() => memberProfile(profile, m.id).then(setMember).catch((e) => setError(e.message))}
                    >
                      <span className="rank">{i + 1}</span>
                      <Avatar name={m.name} avatar={m.emoji} />
                      <span className="grow">
                        <strong>
                          {m.name}
                          {m.id === profile.id ? ' (you)' : ''}
                        </strong>
                        <small>
                          {m.species} species in total, {m.stickers.length} stickers
                          {m.lastSeen ? `. Last out ${timeAgo(m.lastSeen)}` : ''}
                        </small>
                      </span>
                      <span className="score">{m.weekSpecies}</span>
                    </button>
                  </li>
                ))}
            </ol>

            <Invite group={group} />

            <button
              className="link danger"
              onClick={async () => {
                if (!confirm(`Leave ${group.name}?`)) return
                await leaveGroup(profile, group.id)
                refresh()
              }}
            >
              Leave this flock
            </button>
          </section>
        </div>
      )}

      {member && <MemberSheet data={member} guide={guide} onClose={() => setMember(null)} />}
    </div>
  )
}

function Onboarding({ onProfile, pendingJoin }: { onProfile: (p: Profile) => void; pendingJoin: string | null }) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATAR_KEYS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      onProfile(await register(name, avatar))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen flock narrow">
      <h1>Bird with your people</h1>
      <p className="muted">
        {pendingJoin
          ? "Someone invited you to their flock. Pick a name and you're in."
          : "Start a flock with family or friends. You'll see what everyone has found, and you can work towards a weekly goal together."}
      </p>
      <div className="card privacy">
        <strong>What your flock sees</strong>
        <p>
          The birds you log and when you logged them, plus the stickers you've earned. Your photos stay private
          unless you choose to share one. Where you were and anything you recorded never leaves your phone.
        </p>
      </div>
      <form onSubmit={submit} className="stack">
        <input className="input" placeholder="Your name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
        <p className="eyebrow">Pick your bird</p>
        <div className="avatar-pick" role="radiogroup" aria-label="Pick your bird">
          {AVATAR_KEYS.map((a) => (
            <button
              type="button"
              key={a}
              role="radio"
              aria-checked={a === avatar}
              aria-label={AVATARS[a].label}
              title={AVATARS[a].label}
              className={a === avatar ? 'on' : ''}
              onClick={() => setAvatar(a)}
            >
              <Avatar name={name} avatar={a} />
            </button>
          ))}
        </div>
        {error && <p className="notice">{error}</p>}
        <button className="btn primary" disabled={busy || !name.trim()}>
          {busy ? 'Joining…' : 'Join the flock'}
        </button>
      </form>
    </div>
  )
}

function NewGroup({ profile, onDone }: { profile: Profile; onDone: (g: Group) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const run = (p: Promise<Group>) => p.then(onDone).catch((e) => setError(e.message))

  return (
    <div className="stack">
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); run(createGroup(profile, name)) }}>
        <strong>Start a flock</strong>
        <input className="input" placeholder="e.g. The Sharma Family" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
        <button className="btn primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); run(joinGroup(profile, code)) }}>
        <strong>Got an invite code?</strong>
        <input className="input code" placeholder="ABC123" value={code} maxLength={12} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
        <button className="btn" disabled={!code.trim()}>
          Join
        </button>
      </form>
      {error && <p className="notice">{error}</p>}
    </div>
  )
}

function FeedCard({ item, species }: { item: FeedItem; species: Species }) {
  return (
    <div className="feed-card">
      <BirdImage species={species} photo={item.photo} className="feed-img" />
      <div className="feed-body">
        <p className="feed-who">
          <Avatar name={item.user.name} avatar={item.user.emoji} small />
          <span>
            <strong>{item.user.name}</strong> {item.method === 'sound' ? 'heard' : 'spotted'} this {timeAgo(item.ts)}
          </span>
        </p>
        <h3>{species.c}</h3>
        <p className="sci">{species.s}</p>
        {species.f && <p className="feed-fact">{species.f}</p>}
      </div>
    </div>
  )
}

function Challenge({ group }: { group: Group }) {
  const { goal, count } = group.challenge
  const done = count >= goal
  const daysLeft = Math.max(0, Math.ceil((group.challenge.weekStart + 7 * 864e5 - Date.now()) / 864e5))
  return (
    <div className="card challenge">
      <p className="eyebrow">This week's goal</p>
      <strong>{done ? `${count} species between you. Goal reached.` : `Find ${goal} different species between you`}</strong>
      <div className="bar big">
        <span style={{ width: `${Math.min(100, (count / goal) * 100)}%` }} />
      </div>
      <p className="muted small">
        {count} of {goal} so far, {daysLeft} day{daysLeft === 1 ? '' : 's'} to go. Any new species anyone finds counts.
      </p>
    </div>
  )
}

function Invite({ group }: { group: Group }) {
  const link = `${location.origin}${BASE}?join=${group.code}`
  const [copied, setCopied] = useState(false)
  async function share() {
    const text = `Join "${group.name}" on peep and come birding with us. Code: ${group.code}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my flock', text, url: link })
        return
      } catch {
        /* fall through to copy */
      }
    }
    await navigator.clipboard?.writeText(`${text}\n${link}`)
    setCopied(true)
  }
  return (
    <div className="card invite">
      <p className="eyebrow">Invite family & friends</p>
      <p className="code-big">{group.code}</p>
      <button className="btn" onClick={share}>
        {copied ? 'Link copied!' : 'Share invite'}
      </button>
    </div>
  )
}

function MemberSheet({ data, guide, onClose }: { data: MemberProfile; guide: Map<string, Species> | null; onClose: () => void }) {
  const stickers = STICKERS.filter((s) => data.user.stickers.includes(s.id))
  const birds = data.species.filter((s) => s.isBird)
  return (
    <Sheet title={data.user.name} onClose={onClose}>
      <p className="muted">
        {birds.length} species · {data.species.reduce((n, s) => n + s.count, 0)} sightings
      </p>
      {stickers.length > 0 && (
        <div className="sticker-shelf compact">
          {stickers.map((s) => (
            <Sticker key={s.id} sticker={s} size={64} />
          ))}
        </div>
      )}
      <div className="species-grid">
        {data.species.map((s) => {
          const sp = lookup(guide, s.sci, s.common)
          return (
            <div key={s.sci} className="tile">
              <BirdImage species={sp} photo={s.photo} className="tile-img" />
              <span className="tile-name">{sp.c}</span>
              <span className="tile-meta">{timeAgo(s.last)}</span>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
