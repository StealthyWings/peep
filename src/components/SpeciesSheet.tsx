import { useState } from 'react'
import type { Sighting } from '../lib/db'
import { wikiUrl, type Species } from '../lib/species'
import { renderShareCard, shareImage } from '../lib/shareCard'
import { BirdImage } from './BirdImage'
import { Sheet } from './Sheet'
import { Glyph } from './Icons'

interface Props {
  species: Species
  sightings: Sighting[]
  speciesIndex: number
  userName?: string
  onDelete: (s: Sighting) => void
  onClose: () => void
}

export function SpeciesSheet({ species, sightings, speciesIndex, userName, onDelete, onClose }: Props) {
  const photos = sightings.filter((s) => s.photo)
  const [shown, setShown] = useState(0)
  const first = sightings[sightings.length - 1]
  const current = photos[shown]

  async function share() {
    const s = current ?? sightings[0]
    const blob = await renderShareCard({
      species,
      method: s.method,
      ts: s.ts,
      photo: s.photo,
      userName,
      speciesCount: speciesIndex,
    })
    await shareImage(blob, species.c, `My ${species.c}. #TouchGrass #peep`)
  }

  return (
    <Sheet title={species.c} onClose={onClose}>
      <BirdImage species={species} photo={current?.photo} className="card-img" />
      {photos.length > 1 && (
        <div className="dots">
          {photos.map((p, i) => (
            <button key={p.id} className={i === shown ? 'dot on' : 'dot'} onClick={() => setShown(i)} aria-label={`Photo ${i + 1}`} />
          ))}
        </div>
      )}
      <p className="sci">{species.s}</p>
      {species.f && (
        <div className="fact">
          <span className="fact-label">Cool fact</span>
          <p>{species.f}</p>
        </div>
      )}
      {species.t && <p className="summary">{species.t}</p>}
      {species.w && (
        <a className="source" href={wikiUrl(species)} target="_blank" rel="noreferrer">
          Read more on Wikipedia (text CC BY-SA){species.g ? '. Fact condensed by Gemma' : ''}
        </a>
      )}
      {first && (
        <p className="muted">
          First logged {new Date(first.ts).toLocaleDateString()} · seen {sightings.length}×
        </p>
      )}
      <button className="btn primary" onClick={share}>
        Share card
      </button>

      <h3 className="section">Your log</h3>
      <ul className="log">
        {sightings.map((s) => (
          <li key={s.id}>
            <Glyph name={s.method === 'sound' ? 'mic' : 'camera'} size={20} />
            <span className="grow">
              {new Date(s.ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              <small> · {Math.round(s.confidence * 100)}%</small>
            </span>
            <button
              className="link danger"
              onClick={() => confirm('Remove this sighting?') && onDelete(s)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
