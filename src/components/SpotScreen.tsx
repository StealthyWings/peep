import { useEffect, useRef, useState } from 'react'
import type { Sighting } from '../lib/db'
import { nextGoal, type Stats } from '../lib/stickers'
import { downloadTrailPack, PACK_MB, trailPackReady } from '../lib/offline'
import { loadPhotoModel } from '../lib/photoId'
import { loadSoundModel } from '../lib/soundId'
import type { IdRequest } from './IdentifyFlow'
import { Glyph } from './Icons'
import { canSpeak, speak } from '../lib/speech'
import { Sticker } from './Sticker'

interface Props {
  sightings: Sighting[]
  stats: Stats
  useLocation: boolean
  onToggleLocation: (v: boolean) => void
  handsFree: boolean
  onToggleHandsFree: (v: boolean) => void
  onStart: (r: IdRequest) => void
}

const TIPS = [
  { from: 4, to: 9, text: 'Birds sing most in the first couple of hours after sunrise. Good time to try Listen.' },
  { from: 9, to: 12, text: 'Mid-morning, birds are busy feeding. Have a look along hedges, fruit trees and the edges of parks.' },
  { from: 12, to: 16, text: 'Things go quiet around midday. Water is your best bet: lakes, rivers, even big puddles.' },
  { from: 16, to: 20, text: 'Birds feed again before they settle for the night, and the evening light is kind to photos.' },
  { from: 20, to: 28, text: 'Owls and nightjars call after dark. Stand outside for a minute and listen.' },
]

export function SpotScreen({ sightings, stats, useLocation, onToggleLocation, handsFree, onToggleHandsFree, onStart }: Props) {
  const camRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)
  const [pack, setPack] = useState<'unknown' | 'missing' | 'downloading' | 'ready'>('unknown')
  const [packProgress, setPackProgress] = useState(0)

  const hour = new Date().getHours()
  const tip = TIPS.find((t) => (hour >= t.from && hour < t.to) || (hour + 24 >= t.from && hour + 24 < t.to)) ?? TIPS[0]
  const today = sightings.filter((s) => new Date(s.ts).toDateString() === new Date().toDateString())
  const goal = nextGoal(stats)

  useEffect(() => {
    trailPackReady().then((ok) => setPack(ok ? 'ready' : 'missing'))
    loadPhotoModel().catch(() => {}) // warm up so the first photo is instant
  }, [])

  async function getPack() {
    setPack('downloading')
    try {
      await downloadTrailPack((d, t) => setPackProgress(d / t))
      await loadSoundModel() // also caches the worker code itself
      setPack('ready')
    } catch {
      setPack('missing')
    }
  }

  const pickFile = (kind: 'photo' | 'audio-file') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onStart(kind === 'photo' ? { kind: 'photo', file } : { kind: 'audio-file', file })
  }

  return (
    <div className="screen spot">
      <div className="spot-main">
        <header className="hello">
          <h1>What's that bird?</h1>
          <p className="muted">
            {today.length
              ? `${today.length} logged today, ${stats.species} species so far`
              : 'Step outside, look up, listen.'}
          </p>
        </header>

        <div className="big-actions">
          <button className="action snap" onClick={() => camRef.current?.click()}>
            <span className="action-icon">
              <Glyph name="camera" size={56} strokeWidth={1.2} />
            </span>
            <span className="action-label">Snap</span>
            <span className="action-sub">Photo ID</span>
          </button>
          <button className="action listen" onClick={() => onStart({ kind: 'listen' })}>
            <span className="action-icon">
              <Glyph name="mic" size={56} strokeWidth={1.2} />
            </span>
            <span className="action-label">Listen</span>
            <span className="action-sub">Song ID</span>
          </button>
        </div>
        <p className="alt-inputs">
          <button className="link" onClick={() => galleryRef.current?.click()}>
            Choose a photo
          </button>
          <span aria-hidden className="dot-sep" />
          <button className="link" onClick={() => audioRef.current?.click()}>
            Use a recording
          </button>
        </p>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFile('photo')} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={pickFile('photo')} />
        <input ref={audioRef} type="file" accept="audio/*" hidden onChange={pickFile('audio-file')} />
      </div>

      <aside className="spot-side">
        {goal && (
          <div className="card goal">
            <Sticker sticker={goal.sticker} locked size={68} />
            <div className="grow">
              <p className="eyebrow">Next sticker</p>
              <strong className="goal-name">{goal.sticker.name}</strong>
              <p className="muted small">{goal.sticker.desc}</p>
              <div className="bar">
                <span style={{ width: `${(goal.have / goal.need) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        <div className="card tip">
          <Glyph name={hour >= 20 || hour < 5 ? 'moon' : 'sun'} size={26} className="tip-icon" />
          <p>{tip.text}</p>
        </div>

        <div className="card pack">
          {pack === 'ready' ? (
            <p>
              <strong>Ready for the trail.</strong> Both models are saved on this device, so ID works without signal.
            </p>
          ) : pack === 'downloading' ? (
            <>
              <p>
                <strong>Saving the field guide…</strong>
              </p>
              <progress value={packProgress} max={1} />
            </>
          ) : (
            <>
              <p>
                <strong>Going somewhere without signal?</strong> Save the models to this device first. It's {PACK_MB} MB, once.
              </p>
              <button className="btn small" onClick={getPack}>
                <Glyph name="download" size={18} /> Save for offline
              </button>
            </>
          )}
        </div>

        {canSpeak && (
          <label className="toggle card">
            <input
              type="checkbox"
              checked={handsFree}
              onChange={(e) => {
                onToggleHandsFree(e.target.checked)
                if (e.target.checked) speak('Hands-free is on. I will tell you what I find.')
              }}
            />
            <span>
              <strong>Hands-free</strong>
              <small>Peep says the bird's name and a fact out loud, and buzzes when it's done listening, so you can keep watching the bird.</small>
            </span>
          </label>
        )}

        <label className="toggle card">
          <input type="checkbox" checked={useLocation} onChange={(e) => onToggleLocation(e.target.checked)} />
          <span>
            <strong>Use my location for hints</strong>
            <small>Birds that live near you this time of year get ranked higher. Your location stays on this device.</small>
          </span>
        </label>
      </aside>
    </div>
  )
}
