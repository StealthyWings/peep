import { useMemo, useState } from 'react'
import type { Sighting } from '../lib/db'
import { lookup, type Species } from '../lib/species'
import { STICKERS, type Stats } from '../lib/stickers'
import { BirdImage } from './BirdImage'
import { Sticker } from './Sticker'

interface Props {
  sightings: Sighting[]
  stats: Stats
  guide: Map<string, Species> | null
  onOpen: (sci: string) => void
}

interface Entry {
  sci: string
  common: string
  count: number
  last: number
  photo?: Blob
  isBird: boolean
}

function groupBySpecies(sightings: Sighting[]): Entry[] {
  const map = new Map<string, Entry>()
  for (const s of sightings) {
    const e = map.get(s.sci) ?? { sci: s.sci, common: s.common, count: 0, last: 0, isBird: s.isBird }
    e.count++
    if (s.ts > e.last) e.last = s.ts
    if (!e.photo && s.photo) e.photo = s.photo // sightings arrive newest first
    map.set(s.sci, e)
  }
  return [...map.values()].sort((a, b) => b.last - a.last)
}

export function LifeList({ sightings, stats, guide, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => groupBySpecies(sightings), [sightings])
  const q = query.trim().toLowerCase()
  const filtered = entries.filter((e) => !q || e.common.toLowerCase().includes(q) || e.sci.toLowerCase().includes(q))
  const birds = filtered.filter((e) => e.isBird)
  const critters = filtered.filter((e) => !e.isBird)
  const sorted = [...STICKERS].sort((a, b) => {
    const da = a.progress(stats)
    const db = b.progress(stats)
    return Number(db[0] >= db[1]) - Number(da[0] >= da[1])
  })

  return (
    <div className="screen">
      <h1>Life list</h1>
      <div className="stat-row">
        <div className="stat">
          <strong>{stats.species}</strong>
          <span>species</span>
        </div>
        <div className="stat">
          <strong>{stats.sightings}</strong>
          <span>sightings</span>
        </div>
        <div className="stat">
          <strong>{stats.days}</strong>
          <span>days out</span>
        </div>
        <div className="stat">
          <strong>{stats.places}</strong>
          <span>places</span>
        </div>
      </div>

      <h2 className="section">Stickers</h2>
      <div className="sticker-shelf">
        {sorted.map((st) => {
          const [have, need] = st.progress(stats)
          const locked = have < need
          return (
            <div key={st.id} className="shelf-item" title={st.desc}>
              <Sticker sticker={st} locked={locked} size={84} />
              <small>{locked ? (need > 1 ? `${have}/${need}` : st.desc) : st.name}</small>
            </div>
          )
        })}
      </div>

      <h2 className="section">Birds</h2>
      {entries.length > 6 && (
        <input className="search" placeholder="Search your list" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {birds.length === 0 ? (
        <p className="empty">No birds yet. Your first one is probably singing outside right now.</p>
      ) : (
        <div className="species-grid">
          {birds.map((e) => (
            <Tile key={e.sci} entry={e} species={lookup(guide, e.sci, e.common)} onOpen={onOpen} />
          ))}
        </div>
      )}

      {critters.length > 0 && (
        <>
          <h2 className="section">Other critters</h2>
          <div className="species-grid">
            {critters.map((e) => (
              <Tile key={e.sci} entry={e} species={lookup(guide, e.sci, e.common)} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ entry, species, onOpen }: { entry: Entry; species: Species; onOpen: (sci: string) => void }) {
  return (
    <button className="tile" onClick={() => onOpen(entry.sci)}>
      <BirdImage species={species} photo={entry.photo} className="tile-img" />
      <span className="tile-name">{species.c}</span>
      <span className="tile-meta">×{entry.count}</span>
    </button>
  )
}
