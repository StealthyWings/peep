import { useCallback, useEffect, useRef, useState } from 'react'
import { identifyPhoto, type Candidate } from '../lib/photoId'
import { identifySound, loadSoundModel, speciesLikelihood } from '../lib/soundId'
import { decodeTo48kMono, levelMeter, startRecording } from '../lib/audio'
import { bitmapToJpeg, cellOf, fileToBitmap, getPosition, type Position } from '../lib/media'
import { lookup, wikiUrl, type Species } from '../lib/species'
import { uid, type Sighting } from '../lib/db'
import { renderShareCard, shareImage } from '../lib/shareCard'
import type { StickerDef } from '../lib/stickers'
import { BirdImage } from './BirdImage'
import { Glyph } from './Icons'
import { buzz, sayPercent, speak, stopSpeaking } from '../lib/speech'

// "an Owl", but "a Eurasian Jay" / "a Uniform Crake" (they start with a "you" sound).
const withArticle = (name: string) =>
  /^[aeiou]/i.test(name) && !/^(eu|uni|usu|ura)/i.test(name) ? `an ${name}` : `a ${name}`
import { Sticker } from './Sticker'

export type IdRequest =
  | { kind: 'photo'; file: File }
  | { kind: 'listen' }
  | { kind: 'audio-file'; file: File }

interface Props {
  request: IdRequest
  guide: Map<string, Species> | null
  useLocation: boolean
  sharePhotosDefault: boolean
  canShareWithFlock: boolean
  userName?: string
  knownSpecies: Set<string>
  /** read results aloud + buzz, so you can keep looking at the bird */
  handsFree: boolean
  onSave: (s: Sighting) => Promise<{ newStickers: StickerDef[]; speciesCount: number }>
  onUpdate: (s: Sighting) => void
  onClose: () => void
}

interface Ranked extends Candidate {
  species: Species
  likelihood?: number
}

type Phase =
  | { name: 'recording'; secondsLeft: number }
  | { name: 'loading'; progress: number }
  | { name: 'analyzing' }
  | { name: 'results'; candidates: Ranked[] }
  | { name: 'saved'; sighting: Sighting; species: Species; newStickers: StickerDef[]; speciesCount: number; isNew: boolean }
  | { name: 'error'; message: string }

const LISTEN_SECONDS = 12
const UNLIKELY = 0.02 // BirdNET-Analyzer's default location-filter threshold is 0.03

export function IdentifyFlow(props: Props) {
  const { request, guide, useLocation, onClose } = props
  const [phase, setPhase] = useState<Phase>(
    request.kind === 'listen' ? { name: 'recording', secondsLeft: LISTEN_SECONDS } : { name: 'analyzing' },
  )
  const [level, setLevel] = useState(0)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null)
  const position = useRef<Promise<Position | null> | null>(null)
  const likelihood = useRef<Promise<Record<string, number> | null> | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  // Location prior runs in parallel with the main model, all on-device.
  const startLocation = useCallback(() => {
    if (!useLocation || position.current) return
    position.current = getPosition()
    likelihood.current = position.current.then((p) =>
      p ? speciesLikelihood(p.lat, p.lon).catch(() => null) : null,
    )
  }, [useLocation])

  const rank = useCallback(
    async (cands: Candidate[]): Promise<Ranked[]> => {
      // Never let a pending location prompt hold up the answer.
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000))
      const geo = (await Promise.race([likelihood.current, timeout])) ?? null
      return cands
        .map((c) => {
          const l = geo?.[c.sci]
          const adjusted = l !== undefined && l < UNLIKELY ? c.score * 0.35 : c.score
          return { ...c, score: adjusted, likelihood: l, species: lookup(guide, c.sci) }
        })
        .sort((a, b) => b.score - a.score)
    },
    [guide],
  )

  const analyzePhoto = useCallback(
    async (img: ImageBitmap, f?: { x: number; y: number }) => {
      setPhase({ name: 'analyzing' })
      try {
        const cands = await identifyPhoto(img, f)
        setPhase({ name: 'results', candidates: await rank(cands) })
      } catch (err) {
        setPhase({ name: 'error', message: `Photo model failed to load: ${(err as Error).message}` })
      }
    },
    [rank],
  )

  const analyzeAudio = useCallback(
    async (blob: Blob) => {
      try {
        setPhase({ name: 'loading', progress: 0 })
        await loadSoundModel((p) => setPhase({ name: 'loading', progress: p }))
        setPhase({ name: 'analyzing' })
        const pcm = await decodeTo48kMono(blob)
        const cands = await identifySound(pcm)
        setPhase({ name: 'results', candidates: await rank(cands) })
      } catch (err) {
        setPhase({ name: 'error', message: `Sound ID failed: ${(err as Error).message}` })
      }
    },
    [rank],
  )

  // Hands-free: say what we found so your eyes can stay on the bird.
  const handsFree = props.handsFree
  useEffect(() => {
    if (!handsFree) return
    if (phase.name === 'results') {
      buzz([90, 70, 90])
      const top = phase.candidates[0]
      if (!top || top.score < 0.15) {
        speak(
          request.kind === 'photo'
            ? "I couldn't make out a bird. Try tapping it in the photo."
            : "I didn't catch a clear call. Try again when it sings.",
        )
      } else {
        const verb = request.kind === 'photo' ? 'looks like' : 'sounds like'
        speak(`That ${verb} ${withArticle(top.species.c)}. ${sayPercent(top.score)}`)
      }
    } else if (phase.name === 'saved') {
      const parts = [
        phase.isNew && !phase.species.nb ? `New species, number ${phase.speciesCount}.` : 'Logged.',
        phase.newStickers.length
          ? `You earned the ${phase.newStickers.map((s) => s.name).join(' and ')} sticker${phase.newStickers.length > 1 ? 's' : ''}.`
          : '',
        phase.species.f ?? '',
      ]
      speak(parts.filter(Boolean).join(' '))
    }
  }, [phase, handsFree, request.kind])
  useEffect(() => () => stopSpeaking(), [])

  // Kick off the request once.
  useEffect(() => {
    let cancelled = false
    startLocation()
    if (request.kind === 'photo') {
      fileToBitmap(request.file).then((img) => {
        if (cancelled) return
        setBitmap(img)
        analyzePhoto(img)
      })
      const url = URL.createObjectURL(request.file)
      setPhotoUrl(url)
      return () => {
        cancelled = true
        URL.revokeObjectURL(url)
      }
    }
    if (request.kind === 'audio-file') {
      analyzeAudio(request.file)
      return () => {
        cancelled = true
      }
    }
    // Live listening
    loadSoundModel().catch(() => {}) // warm the model while recording
    let timer = 0
    let stopMeter = () => {}
    startRecording()
      .then(({ stop, stream }) => {
        if (cancelled) {
          stop()
          return
        }
        stopMeter = levelMeter(stream, setLevel)
        let left = LISTEN_SECONDS
        const finish = async () => {
          clearInterval(timer)
          stopMeter()
          if (props.handsFree) buzz(60)
          stopRef.current = null
          const blob = await stop()
          if (!cancelled) analyzeAudio(blob)
        }
        stopRef.current = finish
        timer = window.setInterval(() => {
          left -= 1
          if (left <= 0) finish()
          else setPhase({ name: 'recording', secondsLeft: left })
        }, 1000)
      })
      .catch(() =>
        setPhase({ name: 'error', message: 'Microphone permission is needed to listen for birds.' }),
      )
    return () => {
      cancelled = true
      clearInterval(timer)
      stopMeter()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirm(c: Ranked) {
    const pos = await Promise.race([position.current, new Promise<null>((r) => setTimeout(() => r(null), 1500))])
    const photo = bitmap ? await bitmapToJpeg(bitmap, 1280) : undefined
    const sighting: Sighting = {
      id: uid(),
      sci: c.sci,
      common: c.species.c,
      method: request.kind === 'photo' ? 'photo' : 'sound',
      confidence: c.score,
      ts: Date.now(),
      isBird: !c.species.nb,
      photo,
      cell: pos ? cellOf(pos) : undefined,
      sharePhoto: !!photo && props.sharePhotosDefault,
      synced: 0,
    }
    const isNew = !props.knownSpecies.has(c.sci)
    const { newStickers, speciesCount } = await props.onSave(sighting)
    setPhase({ name: 'saved', sighting, species: c.species, newStickers, speciesCount, isNew })
  }

  function onPhotoTap(e: React.MouseEvent<HTMLImageElement>) {
    if (!bitmap || phase.name === 'analyzing') return
    const rect = e.currentTarget.getBoundingClientRect()
    const f = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
    setFocus(f)
    analyzePhoto(bitmap, f)
  }

  return (
    <div className="flow" role="dialog" aria-modal="true">
      <div className="flow-head">
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Glyph name="close" size={20} />
        </button>
        <span className="flow-title">
          {request.kind === 'photo' ? 'Photo ID' : 'Sound ID'} <span className="chip on-device">on-device</span>
        </span>
        <span style={{ width: 40 }} />
      </div>

      {photoUrl && phase.name !== 'saved' && (
        <div className="photo-stage">
          <img src={photoUrl} alt="Your photo" onClick={onPhotoTap} />
          {focus && (
            <span className="focus-ring" style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }} />
          )}
          {phase.name === 'results' && <p className="photo-hint">Bird looks tiny? Tap it to zoom in.</p>}
        </div>
      )}

      <div className="flow-body">
        {phase.name === 'recording' && (
          <div className="listening">
            <div className="pulse" style={{ transform: `scale(${1 + level * 0.6})` }}>
              <Glyph name="mic" size={56} strokeWidth={1.2} />
            </div>
            <h2>Listening… {phase.secondsLeft}s</h2>
            <p className="muted">Point your phone toward the song and stay still. Look up while you wait!</p>
            <button className="btn" onClick={() => stopRef.current?.()}>
              Done listening
            </button>
          </div>
        )}

        {phase.name === 'loading' && (
          <div className="center-msg">
            <h2>Waking up BirdNET…</h2>
            <progress value={phase.progress} max={1} />
            <p className="muted">First time only: the open sound model loads onto your phone, then works offline.</p>
          </div>
        )}

        {phase.name === 'analyzing' && (
          <div className="center-msg">
            <div className="spinner" aria-hidden />
            <h2>{request.kind === 'photo' ? 'Looking closely…' : 'Listening back…'}</h2>
            <p className="muted">Running on your phone. Nothing is uploaded.</p>
          </div>
        )}

        {phase.name === 'error' && (
          <div className="center-msg">
            <h2>Hmm.</h2>
            <p>{phase.message}</p>
            <button className="btn" onClick={onClose}>
              Back
            </button>
          </div>
        )}

        {phase.name === 'results' && <Results candidates={phase.candidates} kind={request.kind} onConfirm={confirm} onClose={onClose} />}

        {phase.name === 'saved' && <Saved phase={phase} {...props} />}
      </div>
    </div>
  )
}

function Results({
  candidates,
  kind,
  onConfirm,
  onClose,
}: {
  candidates: Ranked[]
  kind: IdRequest['kind']
  onConfirm: (c: Ranked) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const shown = candidates.filter((c) => c.score >= 0.08).slice(0, 4)
  const top = shown[0]

  if (!top || top.score < 0.15) {
    return (
      <div className="center-msg">
        <h2>{kind === 'photo' ? "Couldn't make out a bird" : "Didn't catch a clear call"}</h2>
        <p className="muted">
          {kind === 'photo'
            ? 'Try tapping the bird in your photo, or get a little closer. Birds that fill the frame work best.'
            : 'Try again when it sings, a bit closer, away from traffic and wind.'}
        </p>
        <button className="btn" onClick={onClose}>
          Try again
        </button>
      </div>
    )
  }

  const pick = async (c: Ranked) => {
    setBusy(true)
    await onConfirm(c)
  }
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const unusual = (c: Ranked) => c.likelihood !== undefined && c.likelihood < UNLIKELY

  return (
    <div className="results">
      <div className="top-pick">
        <BirdImage species={top.species} className="thumb-lg" />
        <div>
          <p className="eyebrow">{top.score > 0.6 ? (kind === 'photo' ? 'Looks like' : 'Sounds like') : 'Could be'}</p>
          <h2>{top.species.c}</h2>
          <p className="sci">{top.species.s}</p>
          <p className="meta">
            <span className="chip">{pct(top.score)} match</span>
            {top.species.nb && <span className="chip warn">not a bird!</span>}
            {unusual(top) && <span className="chip warn">unusual here</span>}
            {top.likelihood !== undefined && !unusual(top) && <span className="chip ok">expected here</span>}
          </p>
        </div>
      </div>
      <button className="btn primary big" disabled={busy} onClick={() => pick(top)}>
        Yes! Log it
      </button>
      {shown.length > 1 && (
        <>
          <p className="eyebrow">Or was it…</p>
          <ul className="alt-list">
            {shown.slice(1).map((c) => (
              <li key={c.sci}>
                <button className="alt" disabled={busy} onClick={() => pick(c)}>
                  <BirdImage species={c.species} className="thumb-sm" />
                  <span>
                    <strong>{c.species.c}</strong>
                    <small>
                      {pct(c.score)}
                      {unusual(c) ? ' · unusual here' : ''}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button className="btn ghost" onClick={onClose}>
        None of these
      </button>
    </div>
  )
}

function Saved({
  phase,
  canShareWithFlock,
  userName,
  onUpdate,
  onClose,
}: Props & { phase: Extract<Phase, { name: 'saved' }> }) {
  const { sighting, species, newStickers, speciesCount, isNew } = phase
  const [share, setShare] = useState(sighting.sharePhoto)
  const [sharing, setSharing] = useState(false)

  async function shareCard() {
    setSharing(true)
    try {
      const blob = await renderShareCard({
        species,
        method: sighting.method,
        ts: sighting.ts,
        photo: sighting.photo,
        userName,
        speciesCount,
      })
      await shareImage(blob, species.c, `I ${sighting.method === 'sound' ? 'heard' : 'spotted'} a ${species.c} today. #TouchGrass #peep`)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="saved">
      {isNew && !species.nb && <p className="new-species">New to your list. Species number {speciesCount}.</p>}
      <div className="species-card">
        <BirdImage species={species} photo={sighting.photo} className="card-img" />
        <div className="species-card-body">
          <h2>{species.c}</h2>
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
              Text from Wikipedia (CC BY-SA){species.g ? '. Fact condensed by Gemma' : ''}
            </a>
          )}
        </div>
      </div>

      {newStickers.length > 0 && (
        <div className="sticker-unlock">
          <p className="eyebrow">Sticker unlocked!</p>
          <div className="sticker-row">
            {newStickers.map((s) => (
              <div key={s.id} className="sticker-pop">
                <Sticker sticker={s} size={110} />
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {canShareWithFlock && sighting.photo && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={share}
            onChange={(e) => {
              setShare(e.target.checked)
              onUpdate({ ...sighting, sharePhoto: e.target.checked, synced: 0 })
            }}
          />
          <span>Show my photo to my flock</span>
        </label>
      )}

      <div className="row">
        <button className="btn" onClick={shareCard} disabled={sharing}>
          {sharing ? 'Making card…' : 'Share card'}
        </button>
        <button className="btn primary" onClick={onClose}>
          Back outside
        </button>
      </div>
    </div>
  )
}
